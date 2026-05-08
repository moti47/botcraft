"""D-ID lipsync provider — animates a static avatar face to spoken audio.

Free tier: 5 minutes of generated video / month, then pay-per-minute.
Plenty for ~15-20 short videos at 15-20s each.

Flow:
1. POST /talks with face image URL + audio URL.
2. Poll GET /talks/{id} until ``status='done'`` or ``status='error'``.
3. Return the result video URL.

We pass the face/audio as URLs (uploaded to R2 first) rather than base64
to keep request bodies small.
"""
from __future__ import annotations

import asyncio
import time

import httpx

from core.config import get_settings
from core.logging import get_logger

from .base import ProviderError, ProviderResult, ProviderUnavailable

logger = get_logger(__name__)

BASE_URL = "https://api.d-id.com"
POLL_INTERVAL = 3.0
MAX_POLL_ATTEMPTS = 80  # 4 minutes


async def animate(
    face_url: str,
    audio_url: str,
    *,
    expressions: list[dict] | None = None,
    timeout: float = 30.0,
) -> ProviderResult:
    """Drive face_url with audio_url. Returns hosted MP4 URL."""
    settings = get_settings()
    api_key = getattr(settings, "did_api_key", None)
    if not api_key:
        raise ProviderUnavailable("DID_API_KEY not set")

    started = time.monotonic()
    body = {
        "source_url": face_url,
        "script": {
            "type": "audio",
            "audio_url": audio_url,
        },
        "config": {
            "stitch": True,
            "result_format": "mp4",
        },
    }
    if expressions:
        body["config"]["driver_expressions"] = {"expressions": expressions}

    headers = {"Authorization": f"Basic {api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            r = await client.post(f"{BASE_URL}/talks", json=body, headers=headers)
            if r.status_code not in (200, 201):
                raise ProviderError(f"D-ID create failed {r.status_code}: {r.text[:200]}")
            talk_id = r.json().get("id")
            if not talk_id:
                raise ProviderError("D-ID response missing id")

            # Poll until done
            for attempt in range(MAX_POLL_ATTEMPTS):
                await asyncio.sleep(POLL_INTERVAL)
                pr = await client.get(f"{BASE_URL}/talks/{talk_id}", headers=headers)
                if pr.status_code != 200:
                    raise ProviderError(f"D-ID poll failed {pr.status_code}")
                payload = pr.json()
                status = payload.get("status")
                if status == "done":
                    result_url = payload.get("result_url")
                    if not result_url:
                        raise ProviderError("D-ID done but no result_url")
                    elapsed_ms = int((time.monotonic() - started) * 1000)
                    logger.info("did.animate.ok", talk_id=talk_id, elapsed_ms=elapsed_ms)
                    return ProviderResult(
                        url=result_url,
                        duration_ms=elapsed_ms,
                        provider="d_id",
                        cost_credits=payload.get("duration", 0),
                        raw={"talk_id": talk_id, "status": status},
                    )
                if status == "error":
                    raise ProviderError(f"D-ID processing error: {payload.get('error')}")
                if status == "rejected":
                    raise ProviderError(f"D-ID rejected: {payload.get('error')}")
            raise ProviderError("D-ID polling timeout")
        except httpx.HTTPError as e:
            raise ProviderError(f"D-ID HTTP error: {e}") from e
