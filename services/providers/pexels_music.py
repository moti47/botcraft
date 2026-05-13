"""Pexels music provider — free royalty-free music API.

NOTE: Pexels' main API is for stock photos/videos. Music is exposed via
their Pexels Music API which is currently in limited preview. If your
account doesn't have Music API access, ``pixabay_music`` is the better
default. We keep both wired up so the orchestrator can fall through.

For now this module also doubles as a Pexels VIDEO B-roll fetcher (used by
the Visual Director when it picks ``stock_video`` for a scene).
"""
from __future__ import annotations

import time

import httpx

from core.config import get_settings
from core.logging import get_logger

from .base import ProviderError, ProviderResult, ProviderUnavailable

logger = get_logger(__name__)

VIDEO_SEARCH = "https://api.pexels.com/videos/search"


async def search_video(
    query: str,
    *,
    per_page: int = 5,
    orientation: str = "portrait",  # 'landscape','portrait','square'
    timeout: float = 20.0,
) -> ProviderResult:
    """Search Pexels for stock video clips matching the query.

    Returns ProviderResult.raw['videos'] = list of clip metadata dicts:
        {url, width, height, duration, thumbnail, src_mp4}
    """
    settings = get_settings()
    key = settings.pexels_api_key
    if not key:
        raise ProviderUnavailable("PEXELS_API_KEY not set")

    started = time.monotonic()
    headers = {"Authorization": key}
    params = {
        "query": query,
        "per_page": per_page,
        "orientation": orientation,
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            r = await client.get(VIDEO_SEARCH, params=params, headers=headers)
            if r.status_code != 200:
                raise ProviderError(f"Pexels {r.status_code}: {r.text[:200]}")
            payload = r.json()
        except httpx.HTTPError as e:
            raise ProviderError(f"Pexels HTTP error: {e}") from e

    videos = []
    for v in payload.get("videos", []):
        # Pick the best mp4 file at <= 1080p portrait
        files = v.get("video_files", [])
        chosen = None
        for f in files:
            if f.get("file_type") != "video/mp4":
                continue
            if not chosen or (f.get("height") or 0) > (chosen.get("height") or 0):
                if (f.get("height") or 0) <= 1280:
                    chosen = f
        if not chosen and files:
            chosen = files[0]
        if not chosen:
            continue
        videos.append({
            "id": v.get("id"),
            "duration": v.get("duration"),
            "width": chosen.get("width"),
            "height": chosen.get("height"),
            "src_mp4": chosen.get("link"),
            "thumbnail": v.get("image"),
            "user": (v.get("user") or {}).get("name"),
        })

    elapsed_ms = int((time.monotonic() - started) * 1000)
    logger.info("pexels.search_video.ok", query=query, count=len(videos), elapsed_ms=elapsed_ms)
    return ProviderResult(
        duration_ms=elapsed_ms,
        provider="pexels",
        cost_credits=0.0,
        raw={"videos": videos, "total_results": payload.get("total_results", 0)},
    )
