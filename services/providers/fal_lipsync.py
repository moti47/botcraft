"""Fal.ai lipsync provider — fallback when D-ID's monthly free quota is gone.

Fal.ai is an aggregator that exposes many open-source models behind a single
API. For lipsync we use the SadTalker model which produces decent-quality
talking-head animations.

Free tier: monthly free credits (~$1) — enough for ~5 short videos.
After that, $0.05-0.10 per second of generated video.

Why we use it: pure backup for when D-ID is exhausted; Fal also hosts
``video/sadtalker``, ``video/musetalk``, and ``video/wav2lip`` so we can
A/B test which gives us best results per niche.
"""
from __future__ import annotations

import asyncio
import time

import httpx

from core.config import get_settings
from core.logging import get_logger

from .base import ProviderError, ProviderResult, ProviderUnavailable

logger = get_logger(__name__)

QUEUE_BASE = "https://queue.fal.run"
DEFAULT_MODEL = "fal-ai/sadtalker"  # also: "fal-ai/musetalk", "fal-ai/wav2lip"


async def animate(
    face_url: str,
    audio_url: str,
    *,
    model: str = DEFAULT_MODEL,
    timeout: float = 30.0,
) -> ProviderResult:
    """Driver face image with audio via Fal.ai async queue API."""
    settings = get_settings()
    api_key = getattr(settings, "fal_api_key", None)
    if not api_key:
        raise ProviderUnavailable("FAL_API_KEY not set")

    headers = {"Authorization": f"Key {api_key}", "Content-Type": "application/json"}
    body = {
        "source_image_url": face_url,
        "driven_audio_url": audio_url,
        "still_mode": False,
        "preprocess": "full",
    }

    started = time.monotonic()
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            # Submit
            r = await client.post(f"{QUEUE_BASE}/{model}", json=body, headers=headers)
            if r.status_code not in (200, 201):
                raise ProviderError(f"Fal submit failed {r.status_code}: {r.text[:200]}")
            request_id = r.json().get("request_id")
            if not request_id:
                raise ProviderError("Fal response missing request_id")

            # Poll
            for _ in range(80):
                await asyncio.sleep(3.0)
                pr = await client.get(
                    f"{QUEUE_BASE}/{model}/requests/{request_id}/status", headers=headers
                )
                if pr.status_code != 200:
                    raise ProviderError(f"Fal status {pr.status_code}")
                status = pr.json().get("status")
                if status == "COMPLETED":
                    rr = await client.get(
                        f"{QUEUE_BASE}/{model}/requests/{request_id}", headers=headers
                    )
                    if rr.status_code != 200:
                        raise ProviderError(f"Fal result {rr.status_code}")
                    payload = rr.json()
                    video = payload.get("video") or {}
                    url = video.get("url")
                    if not url:
                        raise ProviderError("Fal completed but no video.url")
                    elapsed_ms = int((time.monotonic() - started) * 1000)
                    logger.info(
                        "fal_lipsync.animate.ok",
                        request_id=request_id,
                        model=model,
                        elapsed_ms=elapsed_ms,
                    )
                    return ProviderResult(
                        url=url,
                        duration_ms=elapsed_ms,
                        provider="fal_lipsync",
                        cost_credits=0.0,
                        raw={"request_id": request_id, "model": model},
                    )
                if status in ("FAILED", "ERROR"):
                    raise ProviderError(f"Fal status={status}")
            raise ProviderError("Fal polling timeout")
        except httpx.HTTPError as e:
            raise ProviderError(f"Fal HTTP error: {e}") from e
