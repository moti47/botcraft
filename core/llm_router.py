from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx

from core.config import get_settings
from core.logging import get_logger
from core.redis_client import get_counter, increment_daily_counter

logger = get_logger(__name__)


class LLMRateLimit(Exception):
    pass


class LLMError(Exception):
    pass


class AllProvidersFailed(Exception):
    pass


def _today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


class BaseProvider:
    name: str = "base"
    daily_limit: int = 0

    async def complete(self, system: str, user: str, *, temperature: float, max_tokens: int) -> str:
        raise NotImplementedError


class GroqProvider(BaseProvider):
    name = "groq"
    model = "llama-3.3-70b-versatile"
    endpoint = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(self, api_key: str, daily_limit: int) -> None:
        self.api_key = api_key
        self.daily_limit = daily_limit

    async def complete(self, system: str, user: str, *, temperature: float, max_tokens: int) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        async with httpx.AsyncClient(timeout=60) as http:
            resp = await http.post(self.endpoint, headers=headers, json=payload)
        if resp.status_code == 429:
            raise LLMRateLimit(f"groq 429: {resp.text[:200]}")
        if resp.status_code >= 400:
            raise LLMError(f"groq {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        return data["choices"][0]["message"]["content"]


class GeminiProvider(BaseProvider):
    name = "gemini"
    model = "gemini-2.5-flash-lite"

    def __init__(self, api_key: str, daily_limit: int) -> None:
        self.api_key = api_key
        self.daily_limit = daily_limit
        self.endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent"
        )

    async def complete(self, system: str, user: str, *, temperature: float, max_tokens: int) -> str:
        payload = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        params = {"key": self.api_key}
        async with httpx.AsyncClient(timeout=60) as http:
            resp = await http.post(self.endpoint, params=params, json=payload)
        if resp.status_code == 429:
            raise LLMRateLimit(f"gemini 429: {resp.text[:200]}")
        if resp.status_code >= 400:
            raise LLMError(f"gemini {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError) as exc:
            raise LLMError(f"gemini unexpected response: {data}") from exc


class CerebrasProvider(BaseProvider):
    name = "cerebras"
    model = "llama3.3-70b"
    endpoint = "https://api.cerebras.ai/v1/chat/completions"

    def __init__(self, api_key: str, daily_limit: int) -> None:
        self.api_key = api_key
        self.daily_limit = daily_limit

    async def complete(self, system: str, user: str, *, temperature: float, max_tokens: int) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        async with httpx.AsyncClient(timeout=60) as http:
            resp = await http.post(self.endpoint, headers=headers, json=payload)
        if resp.status_code == 429:
            raise LLMRateLimit(f"cerebras 429: {resp.text[:200]}")
        if resp.status_code >= 400:
            raise LLMError(f"cerebras {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        return data["choices"][0]["message"]["content"]


class LLMRouter:
    """Rotates between Groq (primary) → Gemini → Cerebras.

    - Tracks per-provider per-day usage in Redis (incr + 24h TTL).
    - Skips a provider if its daily counter is over the configured limit.
    - Auto-switches on 429 (rate limit) or transient errors.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self.providers: list[BaseProvider] = [
            GroqProvider(settings.groq_api_key, settings.groq_daily_limit),
            GeminiProvider(settings.gemini_api_key, settings.gemini_daily_limit),
            CerebrasProvider(settings.cerebras_api_key, settings.cerebras_daily_limit),
        ]

    @staticmethod
    def _counter_key(provider: str) -> str:
        return f"llm:usage:{provider}:{_today_key()}"

    async def _quota_available(self, provider: BaseProvider) -> bool:
        used = await get_counter(self._counter_key(provider.name))
        return used < provider.daily_limit

    async def usage_snapshot(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for p in self.providers:
            used = await get_counter(self._counter_key(p.name))
            out[p.name] = {
                "used_today": used,
                "daily_limit": p.daily_limit,
                "remaining": max(0, p.daily_limit - used),
            }
        return out

    async def complete(
        self,
        system: str,
        user: str,
        *,
        temperature: float = 0.8,
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        errors: list[str] = []
        for provider in self.providers:
            if not await self._quota_available(provider):
                logger.warning("llm.quota_exceeded", provider=provider.name)
                errors.append(f"{provider.name}: quota exceeded")
                continue
            try:
                logger.info("llm.attempt", provider=provider.name, model=provider.model)
                text = await provider.complete(
                    system, user, temperature=temperature, max_tokens=max_tokens
                )
                await increment_daily_counter(self._counter_key(provider.name))
                logger.info("llm.success", provider=provider.name)
                return {
                    "provider": provider.name,
                    "model": provider.model,
                    "text": text,
                }
            except LLMRateLimit as exc:
                logger.warning("llm.rate_limited", provider=provider.name, error=str(exc))
                errors.append(f"{provider.name}: 429")
                continue
            except LLMError as exc:
                logger.error("llm.error", provider=provider.name, error=str(exc))
                errors.append(f"{provider.name}: {exc}")
                continue
            except (httpx.HTTPError, asyncio.TimeoutError) as exc:
                logger.error("llm.transient", provider=provider.name, error=str(exc))
                errors.append(f"{provider.name}: transient {exc}")
                continue

        raise AllProvidersFailed("all providers failed: " + " | ".join(errors))


_router: LLMRouter | None = None


def get_router() -> LLMRouter:
    global _router
    if _router is None:
        _router = LLMRouter()
    return _router
