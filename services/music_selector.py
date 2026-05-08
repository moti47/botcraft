"""Music Selector — picks a royalty-free music track for a video.

Decision flow:
  1. Inspect the video's plan (visual_director_plan.music_genre)
     OR fall back to avatar.brand_identity.music_genre
     OR fall back to avatar.music_genre column.
  2. Check ``music_tracks`` cache for a recently-used-NOT-just-used track
     in that genre — encourages variety while reusing downloads.
  3. If cache is thin (<5 tracks), call Pixabay (or Pexels Music) to
     refresh the pool, persist new tracks to ``music_tracks``.
  4. Pick a track whose duration >= video duration. Optionally trim.
  5. Return ``{url, title, source, mood, bpm}`` for the assembler.

The selector NEVER blocks the pipeline — if all music providers fail, it
returns ``None`` and the assembler proceeds without background music.
"""
from __future__ import annotations

import random
from datetime import datetime, timezone
from typing import Any

from core.logging import get_logger
from core.supabase_client import insert_row, select_rows, update_row

from services.providers import pixabay_music
from services.providers.base import ProviderError, ProviderUnavailable

logger = get_logger(__name__)


def _resolve_genre(video: dict[str, Any], avatar: dict[str, Any]) -> str:
    """Walk the priority chain to pick which genre to look for."""
    plan = video.get("visual_director_plan") or {}
    if plan.get("music_genre"):
        return str(plan["music_genre"]).lower()
    brand = avatar.get("brand_identity") or {}
    if brand.get("music_genre"):
        return str(brand["music_genre"]).lower()
    if avatar.get("music_genre"):
        return str(avatar["music_genre"]).lower()
    return "upbeat"


async def _from_cache(genre: str, min_duration: int) -> dict[str, Any] | None:
    """Pull a track from our DB cache, preferring less-recently-used."""
    try:
        rows = await select_rows(
            "music_tracks",
            filters={"genre": genre},
            order_by="last_used_at",
            desc=False,  # prefer the LRU
            limit=20,
        )
    except Exception:
        return None
    eligible = [r for r in rows if (r.get("duration_sec") or 0) >= min_duration]
    if not eligible:
        return None
    return random.choice(eligible[:8])  # randomize among LRU top-8


async def _refresh_pool(genre: str, *, min_duration: int) -> list[dict[str, Any]]:
    """Hit Pixabay, persist new tracks to cache, return newly added rows."""
    try:
        result = await pixabay_music.search(genre, min_duration=min_duration)
    except ProviderUnavailable as e:
        logger.warning("music_selector.refresh.unavailable", genre=genre, error=str(e))
        return []
    except ProviderError as e:
        logger.warning("music_selector.refresh.error", genre=genre, error=str(e))
        return []

    added: list[dict[str, Any]] = []
    for t in result.raw.get("tracks", []):
        try:
            row = await insert_row(
                "music_tracks",
                {
                    "source": "pixabay",
                    "source_id": str(t["id"]),
                    "title": t.get("title"),
                    "artist": t.get("user"),
                    "genre": genre,
                    "duration_sec": t.get("duration"),
                    "download_url": t.get("url"),
                    "raw": t,
                },
            )
            added.append(row)
        except Exception as e:
            # Most likely a unique-constraint violation on (source, source_id) — fine.
            logger.debug("music_selector.cache.skip", err=str(e), id=t.get("id"))
    logger.info("music_selector.refresh.ok", genre=genre, added=len(added))
    return added


async def select_for_video(
    video: dict[str, Any],
    avatar: dict[str, Any],
    *,
    min_duration_sec: int | None = None,
) -> dict[str, Any] | None:
    """Return a chosen track (or None to use no music)."""
    genre = _resolve_genre(video, avatar)
    plan = video.get("visual_director_plan") or {}
    needed = int(min_duration_sec or plan.get("total_duration_sec") or 30)

    track = await _from_cache(genre, needed)
    if not track:
        await _refresh_pool(genre, min_duration=max(needed, 30))
        track = await _from_cache(genre, needed)
    if not track:
        # last try: refresh with looser duration
        await _refresh_pool(genre, min_duration=15)
        track = await _from_cache(genre, 15)
    if not track:
        logger.warning("music_selector.no_track", genre=genre)
        return None

    # Mark as just-used so the LRU rotates
    try:
        await update_row(
            "music_tracks",
            track["id"],
            {
                "last_used_at": datetime.now(timezone.utc).isoformat(),
                "use_count": (track.get("use_count") or 0) + 1,
            },
        )
    except Exception:
        pass

    return {
        "url": track.get("r2_url") or track.get("download_url"),
        "title": track.get("title"),
        "source": track.get("source"),
        "genre": genre,
        "duration_sec": track.get("duration_sec"),
        "track_id": track.get("id"),
    }
