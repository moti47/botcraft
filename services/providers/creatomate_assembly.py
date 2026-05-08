"""Creatomate video assembly provider — turns the Visual Director's JSON
plan into a finished MP4 entirely in the cloud (no local FFmpeg needed).

Free tier: limited credits per month. After that we fall through to local
FFmpeg via ``ffmpeg_assembly``.

Why Creatomate is great here:
- We pass it a JSON template that maps 1:1 to the Visual Director plan:
  scenes, durations, zooms, transitions, music, captions, animated text.
- It returns a hosted MP4 URL — no temp file management on our side.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from core.config import get_settings
from core.logging import get_logger

from .base import ProviderError, ProviderResult, ProviderUnavailable

logger = get_logger(__name__)

BASE_URL = "https://api.creatomate.com/v1"


async def render(
    template: dict[str, Any],
    *,
    output_format: str = "mp4",
    width: int = 1080,
    height: int = 1920,
    timeout: float = 30.0,
) -> ProviderResult:
    """Submit a Creatomate render job and poll until done.

    ``template`` follows Creatomate's "source" schema — a list of elements
    (video/audio/text/image/composition) with timing & effects.
    """
    settings = get_settings()
    api_key = getattr(settings, "creatomate_api_key", None)
    if not api_key:
        raise ProviderUnavailable("CREATOMATE_API_KEY not set")

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {
        "source": {
            "output_format": output_format,
            "width": width,
            "height": height,
            "frame_rate": 30,
            "elements": template.get("elements", []),
        },
    }

    started = time.monotonic()
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            r = await client.post(f"{BASE_URL}/renders", json=body, headers=headers)
            if r.status_code not in (200, 201, 202):
                raise ProviderError(f"Creatomate submit {r.status_code}: {r.text[:200]}")
            jobs = r.json()
            if not isinstance(jobs, list) or not jobs:
                raise ProviderError("Creatomate response is not a job list")
            job_id = jobs[0].get("id")
            if not job_id:
                raise ProviderError("Creatomate missing job id")

            # Poll
            for _ in range(90):
                await asyncio.sleep(4.0)
                pr = await client.get(f"{BASE_URL}/renders/{job_id}", headers=headers)
                if pr.status_code != 200:
                    raise ProviderError(f"Creatomate poll {pr.status_code}")
                payload = pr.json()
                status = payload.get("status")
                if status == "succeeded":
                    url = payload.get("url")
                    if not url:
                        raise ProviderError("Creatomate succeeded but no url")
                    elapsed_ms = int((time.monotonic() - started) * 1000)
                    logger.info(
                        "creatomate.render.ok", job_id=job_id, elapsed_ms=elapsed_ms
                    )
                    return ProviderResult(
                        url=url,
                        duration_ms=elapsed_ms,
                        provider="creatomate",
                        cost_credits=payload.get("credits_used", 0),
                        raw={"job_id": job_id, "duration": payload.get("duration")},
                    )
                if status in ("failed", "cancelled"):
                    raise ProviderError(f"Creatomate {status}: {payload.get('error_message')}")
            raise ProviderError("Creatomate polling timeout")
        except httpx.HTTPError as e:
            raise ProviderError(f"Creatomate HTTP error: {e}") from e
