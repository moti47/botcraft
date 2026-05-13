"""Pixabay music provider — free royalty-free music API.

Pixabay exposes a free API for both stock photos/videos and royalty-free
music. The free tier allows 100 requests/60s with proper attribution.

Tags we map our internal ``music_genre`` to:
  chill        -> 'chill,ambient,calm'
  energetic    -> 'energetic,upbeat,electronic'
  cinematic    -> 'cinematic,epic,dramatic'
  upbeat       -> 'happy,upbeat,pop'
  hip_hop      -> 'hip-hop,trap,lofi'
  corporate    -> 'corporate,motivational,inspiring'
  acoustic     -> 'acoustic,folk,guitar'
  electronic   -> 'electronic,edm,synth'
"""
from __future__ import annotations

import time

import httpx

from core.config import get_settings
from core.logging import get_logger

from .base import ProviderError, ProviderResult, ProviderUnavailable

logger = get_logger(__name__)

# Pixabay's music API uses the same /api/ endpoint with q=&category=music
ENDPOINT = "https://pixabay.com/api/"

GENRE_TAGS = {
    "chill": "chill ambient calm",
    "energetic": "energetic upbeat electronic",
    "cinematic": "cinematic epic dramatic",
    "upbeat": "happy upbeat pop",
    "hip_hop": "hip-hop trap lofi",
    "corporate": "corporate motivational inspiring",
    "acoustic": "acoustic folk guitar",
    "electronic": "electronic edm synth",
    "rock": "rock guitar drums",
    "jazz": "jazz smooth saxophone",
    "lofi": "lofi study chill",
}


async def search(
    genre: str,
    *,
    min_duration: int = 15,
    max_duration: int = 180,
    per_page: int = 10,
    timeout: float = 20.0,
) -> ProviderResult:
    """Search Pixabay's music library by genre keywords."""
    settings = get_settings()
    key = getattr(settings, "pixabay_api_key", None)
    if not key:
        raise ProviderUnavailable("PIXABAY_API_KEY not set")

    tags = GENRE_TAGS.get(genre.lower(), genre)
    params = {
        "key": key,
        "q": tags,
        "category": "music",
        "per_page": min(max(per_page, 3), 200),
        "safesearch": "true",
    }

    started = time.monotonic()
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            r = await client.get(ENDPOINT, params=params)
            if r.status_code != 200:
                raise ProviderError(f"Pixabay {r.status_code}: {r.text[:200]}")
            payload = r.json()
        except httpx.HTTPError as e:
            raise ProviderError(f"Pixabay HTTP error: {e}") from e

    tracks = []
    for hit in payload.get("hits", []):
        duration = hit.get("duration") or 0
        if duration < min_duration or duration > max_duration:
            continue
        # Pixabay music uses different field names than photos
        url = hit.get("audio") or hit.get("preview")
        if not url:
            continue
        tracks.append({
            "id": hit.get("id"),
            "title": hit.get("title") or hit.get("tags"),
            "user": hit.get("user"),
            "duration": duration,
            "url": url,
            "tags": hit.get("tags"),
        })

    elapsed_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "pixabay.search_music.ok",
        genre=genre,
        count=len(tracks),
        elapsed_ms=elapsed_ms,
    )
    return ProviderResult(
        duration_ms=elapsed_ms,
        provider="pixabay",
        cost_credits=0.0,
        raw={"tracks": tracks, "genre": genre, "tags": tags},
    )
