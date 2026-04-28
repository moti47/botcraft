"""מערכת התראות in-app מרכזית.

מחליף את core/notifier.py ואת services/notifications.py (Discord).
כל קריאה ל-notify() כותבת שורה לטבלת notifications ב-Supabase
ומשדרת אירוע SSE לכל הלקוחות המחוברים.

API ציבורי:
    await notify(title, message, level, avatar_id, type_, payload)
    await notify_video_failure(video_id, stage, reason)

שתי הפונקציות בטוחות לקריאה מכל מקום — אף פעם לא זורקות.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from core.logging import get_logger

logger = get_logger(__name__)


async def _send_web_push(title: str, message: str, level: str) -> None:
    """שלח Web Push לכל ה-subscriptions הרשומות.

    Non-blocking best-effort — לא זורק אפילו אם VAPID לא מוגדר.
    נקרא רק כאשר level הוא 'error' או 'warning' (לא מציפים ב-info).
    """
    if level not in ("error", "warning"):
        return
    try:
        from core.config import get_settings
        s = get_settings()
        if not s.vapid_private_key or not s.vapid_public_key:
            return

        from core.supabase_client import select_rows
        subs = await select_rows("push_subscriptions", limit=500)
        if not subs:
            return

        from pywebpush import webpush, WebPushException

        data = json.dumps({"title": title, "message": message, "level": level}, ensure_ascii=False)

        async def _push_one(sub: dict) -> None:
            try:
                await asyncio.to_thread(
                    webpush,
                    subscription_info={"endpoint": sub["endpoint"], "keys": sub.get("keys") or {}},
                    data=data,
                    vapid_private_key=s.vapid_private_key,
                    vapid_claims={"sub": s.vapid_subject},
                )
            except WebPushException as exc:
                if "410" in str(exc) or "404" in str(exc):
                    # Subscription expired — delete it silently
                    try:
                        from core.supabase_client import get_supabase
                        await asyncio.to_thread(
                            lambda: get_supabase()
                            .table("push_subscriptions")
                            .delete()
                            .eq("endpoint", sub["endpoint"])
                            .execute()
                        )
                    except Exception:
                        pass
            except Exception as exc:
                logger.warning("push.send_failed", error=str(exc))

        await asyncio.gather(*[_push_one(s) for s in subs], return_exceptions=True)
        logger.info("push.sent", count=len(subs), level=level)

    except Exception as exc:
        logger.warning("push.dispatch_error", error=str(exc))

# SSE — רשימת queues, אחד לכל חיבור פתוח
_sse_listeners: list[asyncio.Queue] = []


def register_sse_listener() -> asyncio.Queue:
    """רשום listener חדש ל-SSE. מחזיר Queue שמקבל events."""
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _sse_listeners.append(q)
    return q


def unregister_sse_listener(q: asyncio.Queue) -> None:
    """נתק listener — נקרא כשהלקוח מתנתק."""
    try:
        _sse_listeners.remove(q)
    except ValueError:
        pass


async def _broadcast_sse(event: dict[str, Any]) -> None:
    """שדר event לכל ה-listeners הפעילים."""
    dead: list[asyncio.Queue] = []
    for q in list(_sse_listeners):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        unregister_sse_listener(q)


async def notify(
    title: str,
    message: str = "",
    *,
    level: str = "info",
    avatar_id: str | None = None,
    type_: str = "system",
    payload: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """כתוב notification לטבלה ושדר SSE. בטוח — אף פעם לא זורק."""
    try:
        from core.supabase_client import insert_row

        row = {
            "avatar_id": avatar_id,
            "type": type_,
            "title": title[:255],
            "message": (message or "")[:2000],
            "level": level,
            "is_read": False,
            "payload": payload or {},
        }
        saved = await insert_row("notifications", row)
        await _broadcast_sse({"event": "notification", "data": saved})
        # Fire-and-forget Web Push — errors are swallowed inside _send_web_push
        asyncio.ensure_future(_send_web_push(title, message or "", level))
        logger.info("notify.sent", title=title, level=level, avatar_id=avatar_id)
        return saved
    except Exception as exc:
        logger.warning("notify.failed", title=title, error=str(exc))
        return None


async def notify_video_failure(
    *,
    video_id: str,
    stage: str,
    reason: str,
    avatar_id: str | None = None,
) -> None:
    """שלח notification על כשל בפייפליין — wrapper נוח."""
    await notify(
        title=f"Video pipeline failed at {stage}",
        message=f"video_id={video_id}\nreason: {reason[:400]}",
        level="error",
        type_="pipeline_failure",
        avatar_id=avatar_id,
        payload={"video_id": video_id, "stage": stage, "reason": reason},
    )


async def notify_video_ready(
    *,
    video_id: str,
    avatar_id: str | None = None,
    avatar_name: str | None = None,
) -> None:
    """שלח notification כשסרטון מוכן."""
    name = avatar_name or "Avatar"
    await notify(
        title=f"Video ready — {name}",
        message=f"video_id={video_id}",
        level="success",
        type_="video_ready",
        avatar_id=avatar_id,
        payload={"video_id": video_id},
    )


async def notify_post_published(
    *,
    video_id: str,
    platform: str,
    post_id: str | None = None,
    avatar_id: str | None = None,
) -> None:
    """שלח notification על פרסום מוצלח."""
    await notify(
        title=f"Published to {platform}",
        message=f"video_id={video_id}" + (f"\npost_id={post_id}" if post_id else ""),
        level="success",
        type_="post_published",
        avatar_id=avatar_id,
        payload={"video_id": video_id, "platform": platform, "post_id": post_id},
    )


async def notify_publish_failed(
    *,
    video_id: str,
    platform: str,
    reason: str,
    avatar_id: str | None = None,
) -> None:
    """שלח notification על כשל פרסום."""
    await notify(
        title=f"Publish failed on {platform}",
        message=reason[:400],
        level="error",
        type_="publish_failed",
        avatar_id=avatar_id,
        payload={"video_id": video_id, "platform": platform, "reason": reason},
    )
