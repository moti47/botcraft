"""Pollinations.ai image provider — completely free, no API key, no auth.

Pollinations exposes a public ``image.pollinations.ai/prompt/<text>`` endpoint
that returns a generated PNG. Used as the primary image provider for:

- Avatar face generation (one-time, at avatar create)
- Per-video B-roll images when the visual director picks ``ai_image``
- Thumbnail variations

Free tier: no published rate limit, but be polite (~1 request/sec).
"""
from __future__ import annotations

import time
from urllib.parse import quote_plus

import httpx

from core.logging import get_logger

from .base import ProviderError, ProviderResult

logger = get_logger(__name__)

ENDPOINT = "https://image.pollinations.ai/prompt/{prompt}"


async def generate(
    prompt: str,
    *,
    width: int = 1024,
    height: int = 1024,
    seed: int | None = None,
    model: str = "flux",
    nologo: bool = True,
    enhance: bool = True,
    timeout: float = 90.0,
) -> ProviderResult:
    """Generate an image. Returns PNG bytes inline.

    Pollinations sometimes returns a "loading" placeholder if the model is
    cold. We retry once with a longer timeout if the response is suspiciously
    small (<5 KB).
    """
    encoded = quote_plus(prompt)
    params = {
        "width": width,
        "height": height,
        "model": model,
    }
    if seed is not None:
        params["seed"] = seed
    if nologo:
        params["nologo"] = "true"
    if enhance:
        params["enhance"] = "true"

    url = ENDPOINT.format(prompt=encoded)
    started = time.monotonic()
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for attempt in (1, 2):
            try:
                r = await client.get(url, params=params)
            except httpx.HTTPError as e:
                if attempt == 2:
                    raise ProviderError(f"Pollinations HTTP error: {e}") from e
                continue
            if r.status_code != 200:
                if attempt == 2:
                    raise ProviderError(f"Pollinations returned {r.status_code}")
                continue
            if len(r.content) < 5_000 and attempt == 1:
                # likely a placeholder — retry
                continue
            break
        else:
            raise ProviderError("Pollinations: empty response after 2 attempts")

    elapsed_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "pollinations.generate.ok",
        prompt_chars=len(prompt),
        bytes=len(r.content),
        elapsed_ms=elapsed_ms,
    )
    return ProviderResult(
        bytes_inline=r.content,
        duration_ms=elapsed_ms,
        provider="pollinations",
        cost_credits=0.0,
        raw={"width": width, "height": height, "model": model, "seed": seed},
    )
