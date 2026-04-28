"""Posts router — fan-out a finished video to all CONNECTED platforms.

החדש: ה-publisher לא מקבל רשימת platforms בקלט. הוא קורא את
``platform_tokens`` של האווטאר ומפרסם רק לפלטפורמות שיש להן
טוקן פעיל (``is_active=true``). פלטפורמות שלא מחוברות יוחזרו
כ-``{"status": "skipped", "reason": "not connected"}``.

שלבי ה-flow:

1. אימות שורת הווידאו וודא ``status == "ready"``.
2. שליפת platform_tokens של האווטאר.
3. העלאה ל-R2 רק אם אינסטגרם מחוברת (אינסטגרם דורש URL ציבורי).
4. ריצה במקביל על כל הפלטפורמות המחוברות (``asyncio.gather``).
5. שמירת רשומת ``posts`` לכל פלטפורמה.

``GET /posts/{video_id}/status`` מחזיר את הרשומות לכל פלטפורמה.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.schemas.models import (
    PostPlatformResult,
    PostPublishRequest,
    PostPublishResponse,
    PostStatusItem,
    PostStatusResponse,
)
from core.logging import get_logger
from core.notify import notify_post_published, notify_publish_failed, notify_video_failure
from core.supabase_client import get_row, insert_row, select_rows
from services.publisher import (
    InstagramPublisher,
    PublisherError,
    PublisherUnavailable,
    get_publisher,
)
from services.r2_uploader import R2Unavailable, upload_file, upload_remote_url
from services.rate_limiter import RateLimitExceeded

logger = get_logger(__name__)

router = APIRouter(prefix="/posts", tags=["posts"])

ALL_PLATFORMS = ("youtube", "tiktok", "instagram")


# =====================================================================
# Helpers
# =====================================================================

def _build_caption(base: str, hashtags: list[str]) -> str:
    """Combine caption + #hashtags. Strips empty bits and dedups whitespace."""
    tags = " ".join(
        h if h.startswith("#") else f"#{h}" for h in hashtags if h.strip()
    )
    parts = [p for p in (base.strip(), tags.strip()) if p]
    return "\n\n".join(parts)


async def _connected_tokens_for_avatar(avatar_id: str) -> dict[str, dict[str, Any]]:
    """שליפת כל הטוקנים הפעילים של אווטאר.

    מחזיר dict: ``{platform: {access_token, refresh_token, account_id}}``.
    אם אין שורה / is_active=false — הפלטפורמה לא תופיע בתוצאה.
    """
    rows = await select_rows(
        "platform_tokens",
        filters={"avatar_id": avatar_id, "is_active": True},
    )
    out: dict[str, dict[str, Any]] = {}
    for r in rows:
        platform = (r.get("platform") or "").lower()
        if platform in ALL_PLATFORMS:
            out[platform] = {
                "access_token": r.get("access_token"),
                "refresh_token": r.get("refresh_token"),
                "account_id": r.get("account_id"),
            }
    return out


async def _stage_to_r2(video_row: dict[str, Any]) -> str:
    """Return a public URL for the finished video, uploading to R2 if needed."""
    video_id = video_row.get("id") or "unknown"
    object_key = f"videos/{video_id}.mp4"

    final_path = video_row.get("final_path")
    if final_path and Path(final_path).exists():
        return await upload_file(final_path, key=object_key)

    video_url = video_row.get("video_url")
    if not video_url:
        raise PublisherError("video has neither final_path nor video_url to stage")
    return await upload_remote_url(video_url, key=object_key)


async def _download_thumbnail_to_tmp(url: str) -> str | None:
    """Download a thumbnail URL to a temp file. Returns path or None on failure."""
    try:
        import tempfile

        import httpx

        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            tmp_path = tmp.name
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as http:
            resp = await http.get(url)
            if resp.status_code >= 400:
                return None
            with open(tmp_path, "wb") as fh:
                fh.write(resp.content)
        return tmp_path
    except Exception as exc:
        logger.warning("posts.thumbnail_download_failed", url=url, error=str(exc))
        return None


async def _publish_to_platform(
    platform: str,
    *,
    avatar_id: str | None,
    tokens: dict[str, Any],
    video_row: dict[str, Any],
    public_url: str,
    local_path: str | None,
    caption: str,
    thumbnail_url: str | None = None,
) -> PostPlatformResult:
    """Run a single publisher and translate exceptions into a uniform result."""
    try:
        pub = get_publisher(platform, avatar_id=avatar_id, tokens=tokens)
    except KeyError as exc:
        return PostPlatformResult(status="failed", reason=str(exc))

    try:
        if isinstance(pub, InstagramPublisher):
            # אינסטגרם דורש URL ציבורי; לא מעלה קובץ binary
            post_id = await pub.upload(video_url=public_url, caption=caption)
        elif platform == "youtube":
            # ל-YouTube עדיף קובץ מקומי (resumable upload בלי לעבור דרך R2 פעמיים)
            path = local_path or public_url
            thumb_tmp: str | None = None
            if thumbnail_url:
                thumb_tmp = await _download_thumbnail_to_tmp(thumbnail_url)
            try:
                post_id = await pub.upload(
                    video_path=path,
                    title=caption[:90] or "viral video",
                    description=caption,
                    tags=[],
                    thumbnail_path=thumb_tmp,
                )
            finally:
                if thumb_tmp:
                    import os
                    try:
                        os.unlink(thumb_tmp)
                    except OSError:
                        pass
        else:  # tiktok
            path = local_path
            if not path or not Path(path).exists():
                # נוריד את הסרטון הציבורי לקובץ זמני כי TikTok דורש העלאה ישירה
                import tempfile

                import httpx

                with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
                    tmp_path = tmp.name
                async with httpx.AsyncClient(timeout=600, follow_redirects=True) as http:
                    async with http.stream("GET", public_url) as resp:
                        if resp.status_code >= 400:
                            raise PublisherError(
                                f"failed to fetch {public_url} for tiktok: {resp.status_code}"
                            )
                        with open(tmp_path, "wb") as fh:
                            async for chunk in resp.aiter_bytes(1 << 20):
                                fh.write(chunk)
                path = tmp_path
            post_id = await pub.upload(video_path=path, caption=caption)

        return PostPlatformResult(status="posted", post_id=post_id)
    except RateLimitExceeded as exc:
        logger.warning(
            "posts.rate_limited",
            platform=platform, avatar_id=avatar_id,
            retry=exc.retry_after_seconds,
        )
        return PostPlatformResult(
            status="rate_limited",
            reason=str(exc),
            retry_after_seconds=exc.retry_after_seconds,
        )
    except PublisherUnavailable as exc:
        return PostPlatformResult(status="skipped", reason=str(exc))
    except PublisherError as exc:
        logger.error("posts.publisher_error", platform=platform, error=str(exc))
        return PostPlatformResult(status="failed", reason=str(exc))
    except Exception as exc:
        logger.exception("posts.publisher_crashed", platform=platform)
        return PostPlatformResult(status="failed", reason=str(exc))


async def _persist_post_row(
    *,
    video_row: dict[str, Any],
    platform: str,
    caption: str,
    hashtags: list[str],
    result: PostPlatformResult,
    scheduled_for: datetime | None,
) -> dict[str, Any]:
    """Write one ``posts`` row reflecting the publish outcome."""
    now_iso = datetime.now(timezone.utc).isoformat()
    db_status_map = {
        "posted": "posted",
        "skipped": "skipped",
        "failed": "failed",
        "rate_limited": "rate_limited",
        "scheduled": "scheduled",
    }
    db_status = db_status_map.get(result.status, "failed")

    row = {
        "video_id": video_row.get("id"),
        "avatar_id": video_row.get("avatar_id"),
        "platform": platform,
        "platform_post_id": result.post_id,
        "caption": caption,
        "hashtags": hashtags,
        "status": db_status,
        "scheduled_for": scheduled_for.isoformat() if scheduled_for else None,
        "posted_at": now_iso if result.status == "posted" else None,
        "publish_error": result.reason if result.status not in ("posted", "skipped") else None,
        "retry_count": 0,
    }
    try:
        return await insert_row("posts", row)
    except Exception as exc:
        logger.exception("posts.persist_failed", platform=platform)
        return {**row, "_persist_error": str(exc)}


# =====================================================================
# Endpoints
# =====================================================================

@router.post("/publish", response_model=PostPublishResponse)
async def publish(req: PostPublishRequest) -> PostPublishResponse:
    """פרסום וידאו לכל הפלטפורמות המחוברות לאווטאר.

    אין שדה ``platforms`` ב-request — הוא נגזר אוטומטית מ-platform_tokens.
    """
    # ---- שלב 1: שליפה של רשומת הווידאו וודא שהוא מוכן לפרסום ----
    video_row = await get_row("videos", req.video_id)
    if not video_row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"video {req.video_id} not found")
    if (video_row.get("status") or "").lower() != "ready":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"video status is {video_row.get('status')!r}, expected 'ready'",
        )

    avatar_id = video_row.get("avatar_id")
    caption = _build_caption(req.caption, req.hashtags)

    # ---- שלב 2: שליפת הפלטפורמות המחוברות לאווטאר ----
    tokens_by_platform: dict[str, dict[str, Any]] = {}
    if avatar_id:
        try:
            tokens_by_platform = await _connected_tokens_for_avatar(avatar_id)
        except Exception as exc:
            logger.exception("posts.tokens_fetch_failed", avatar_id=avatar_id)
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                f"could not load platform tokens: {exc}",
            ) from exc

    connected = sorted(tokens_by_platform.keys())
    skipped = [p for p in ALL_PLATFORMS if p not in tokens_by_platform]

    # ---- שלב 3: scheduled? נשמור רשומות "scheduled" ולא נריץ עכשיו ----
    if req.schedule_at is not None and req.schedule_at > datetime.now(timezone.utc):
        results: dict[str, PostPlatformResult] = {}
        for platform in connected:
            r = PostPlatformResult(status="scheduled")
            await _persist_post_row(
                video_row=video_row,
                platform=platform,
                caption=caption,
                hashtags=req.hashtags,
                result=r,
                scheduled_for=req.schedule_at,
            )
            results[platform] = r
        for platform in skipped:
            results[platform] = PostPlatformResult(
                status="skipped", reason="not connected",
            )
        return PostPublishResponse(video_id=req.video_id, results=results)

    if not connected:
        # אין אפילו פלטפורמה אחת מחוברת — נחזיר תגובה עם הכל skipped
        results = {
            p: PostPlatformResult(status="skipped", reason="not connected")
            for p in ALL_PLATFORMS
        }
        await notify_video_failure(
            video_id=req.video_id,
            stage="publish",
            reason="no platforms connected",
            avatar_id=avatar_id,
        )
        return PostPublishResponse(video_id=req.video_id, results=results)

    # ---- שלב 4: העלאה ל-R2 רק אם אינסטגרם מחוברת ----
    public_url: str | None = None
    if "instagram" in tokens_by_platform:
        try:
            public_url = await _stage_to_r2(video_row)
        except R2Unavailable as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
        except PublisherError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    else:
        # YouTube/TikTok יודעים לעבוד עם הקובץ המקומי או video_url קיים
        public_url = video_row.get("video_url")

    local_path = video_row.get("final_path")

    # ---- שלב 5: ריצה במקביל על כל הפלטפורמות המחוברות ----
    thumbnail_url = video_row.get("thumbnail_url")
    tasks = [
        _publish_to_platform(
            platform,
            avatar_id=avatar_id,
            tokens=tokens_by_platform[platform],
            video_row=video_row,
            public_url=public_url or "",
            local_path=local_path,
            caption=caption,
            thumbnail_url=thumbnail_url,
        )
        for platform in connected
    ]
    platform_results: list[PostPlatformResult] = await asyncio.gather(*tasks)

    results = dict(zip(connected, platform_results))
    for platform in skipped:
        results[platform] = PostPlatformResult(
            status="skipped", reason="not connected",
        )

    # ---- שלב 6: שמירה ב-DB של כל תוצאה (כולל ה-skipped כדי שיהיה היסטוריה) ----
    for platform, result in results.items():
        if result.status == "skipped":
            # לא שומרים skipped כדי לא לזהם את טבלת posts — רק logging
            continue
        await _persist_post_row(
            video_row=video_row,
            platform=platform,
            caption=caption,
            hashtags=req.hashtags,
            result=result,
            scheduled_for=None,
        )
        logger.info(
            "posts.publish_result",
            video_id=req.video_id,
            avatar_id=avatar_id,
            platform=platform,
            status=result.status,
            post_id=result.post_id,
        )
        if result.status == "posted":
            await notify_post_published(
                video_id=req.video_id,
                platform=platform,
                post_id=result.post_id,
                avatar_id=avatar_id,
            )
        elif result.status == "failed":
            await notify_publish_failed(
                video_id=req.video_id,
                platform=platform,
                reason=result.reason or "unknown",
                avatar_id=avatar_id,
            )

    return PostPublishResponse(video_id=req.video_id, results=results)


@router.get("/{video_id}/status", response_model=PostStatusResponse)
async def post_status(video_id: str) -> PostStatusResponse:
    """Return all posts rows for a given video, one per platform."""
    rows = await select_rows(
        "posts",
        filters={"video_id": video_id},
        order_by="created_at",
        desc=False,
    )
    items = [
        PostStatusItem(
            id=r.get("id"),
            platform=r.get("platform") or "",
            status=r.get("status") or "",
            platform_post_id=r.get("platform_post_id"),
            publish_error=r.get("publish_error"),
            retry_count=r.get("retry_count"),
            posted_at=r.get("posted_at"),
            scheduled_for=r.get("scheduled_for"),
            created_at=r.get("created_at"),
        )
        for r in rows
    ]
    return PostStatusResponse(video_id=video_id, posts=items)
