"""YouTube Data API v3 — viral videos & search per niche.

We use the ``mostPopular`` chart for daily-trending and ``search.list``
with ``order=viewCount`` and a recent ``publishedAfter`` for niche-specific
viral hunting.

Free quota: 10,000 units/day. Each search is ~100 units, each chart fetch
is ~1 unit. We can comfortably make 50-80 niche searches per day.
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from core.config import get_settings
from core.logging import get_logger

from .base import ProviderError, ProviderResult, ProviderUnavailable

logger = get_logger(__name__)

API_BASE = "https://www.googleapis.com/youtube/v3"


def _api_key() -> str:
    settings = get_settings()
    key = (
        getattr(settings, "youtube_api_key", None)
        or getattr(settings, "google_api_key", None)
    )
    if not key:
        raise ProviderUnavailable("YOUTUBE_API_KEY not set")
    return key


async def trending(region_code: str = "US", *, max_results: int = 25) -> ProviderResult:
    """Most-popular videos in a region (today)."""
    key = _api_key()
    params = {
        "part": "snippet,statistics",
        "chart": "mostPopular",
        "regionCode": region_code,
        "maxResults": max_results,
        "key": key,
    }
    started = time.monotonic()
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            r = await client.get(f"{API_BASE}/videos", params=params)
            if r.status_code != 200:
                raise ProviderError(f"YouTube {r.status_code}: {r.text[:200]}")
            payload = r.json()
        except httpx.HTTPError as e:
            raise ProviderError(f"YouTube HTTP error: {e}") from e

    videos = []
    for v in payload.get("items", []):
        snip = v.get("snippet", {})
        stats = v.get("statistics", {})
        videos.append({
            "id": v.get("id"),
            "title": snip.get("title"),
            "channel": snip.get("channelTitle"),
            "tags": snip.get("tags", []),
            "category_id": snip.get("categoryId"),
            "views": int(stats.get("viewCount", 0)),
            "likes": int(stats.get("likeCount", 0)),
            "comments": int(stats.get("commentCount", 0)),
            "published_at": snip.get("publishedAt"),
            "thumbnail": (snip.get("thumbnails") or {}).get("high", {}).get("url"),
        })

    elapsed_ms = int((time.monotonic() - started) * 1000)
    logger.info("youtube.trending.ok", count=len(videos), elapsed_ms=elapsed_ms)
    return ProviderResult(
        duration_ms=elapsed_ms,
        provider="youtube",
        cost_credits=1.0,
        raw={"videos": videos, "region_code": region_code},
    )


async def search_niche(
    niche_query: str,
    *,
    days_lookback: int = 7,
    max_results: int = 20,
) -> ProviderResult:
    """Find recent high-view videos for a niche query."""
    key = _api_key()
    after = (datetime.now(timezone.utc) - timedelta(days=days_lookback)).strftime("%Y-%m-%dT%H:%M:%SZ")
    params = {
        "part": "snippet",
        "q": niche_query,
        "type": "video",
        "order": "viewCount",
        "publishedAfter": after,
        "maxResults": max_results,
        "key": key,
    }
    started = time.monotonic()
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            r = await client.get(f"{API_BASE}/search", params=params)
            if r.status_code != 200:
                raise ProviderError(f"YouTube search {r.status_code}: {r.text[:200]}")
            search_payload = r.json()

            ids = ",".join(
                item["id"]["videoId"] for item in search_payload.get("items", [])
                if item.get("id", {}).get("videoId")
            )
            if not ids:
                return ProviderResult(provider="youtube", raw={"videos": []})

            r2 = await client.get(
                f"{API_BASE}/videos",
                params={"part": "snippet,statistics", "id": ids, "key": key},
            )
            if r2.status_code != 200:
                raise ProviderError(f"YouTube videos {r2.status_code}")
            videos_payload = r2.json()
        except httpx.HTTPError as e:
            raise ProviderError(f"YouTube HTTP error: {e}") from e

    videos = []
    for v in videos_payload.get("items", []):
        snip = v.get("snippet", {})
        stats = v.get("statistics", {})
        videos.append({
            "id": v.get("id"),
            "title": snip.get("title"),
            "description": (snip.get("description") or "")[:300],
            "channel": snip.get("channelTitle"),
            "tags": snip.get("tags", []),
            "views": int(stats.get("viewCount", 0)),
            "likes": int(stats.get("likeCount", 0)),
            "published_at": snip.get("publishedAt"),
        })
    videos.sort(key=lambda x: x["views"], reverse=True)

    elapsed_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "youtube.search_niche.ok",
        query=niche_query,
        count=len(videos),
        elapsed_ms=elapsed_ms,
    )
    return ProviderResult(
        duration_ms=elapsed_ms,
        provider="youtube",
        cost_credits=101.0,  # 100 (search) + 1 (videos)
        raw={"videos": videos, "query": niche_query},
    )
