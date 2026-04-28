"""מתזמן per-avatar — מבוסס APScheduler.

לכל אווטאר יש 3 לוחות זמנים נפרדים שנשמרים ב-DB:
  • short_video_schedule  → סרטונים קצרים
  • long_video_schedule   → סרטונים ארוכים
  • post_schedule         → פרסום אוטומטי של סרטונים מוכנים

מבנה JSONB של כל schedule:
  {
    "enabled": bool,
    "times": [
      {"day": "mon"|"tue"|...|"daily", "hour": 9, "minute": 0},
      ...
    ]
  }

ה-scheduler:
  • טוען את כל האווטארים בהפעלה ומוסיף job לכל time-slot.
  • משתמש ב-timezone="Asia/Jerusalem" עבור CronTrigger.
  • חושף reload_avatar(avatar_id) כדי שהדשבורד יוכל לרענן ללא restart.
  • חושף status() שמחזיר מבנה לתצוגה ב-/scheduler/status.

הוסר:
  • cron גלובלי 09:00 הקודם.
  • כל לוגיקת scheduling שלא קשורה לאווטאר ספציפי.
"""
from __future__ import annotations

import asyncio
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from pytz import timezone as pytz_timezone

from core.logging import get_logger
from core.supabase_client import select_rows

logger = get_logger(__name__)

# Asia/Jerusalem הוא ה-tz שהמשתמש ביקש בכל המערכת (תואם n8n.GENERIC_TIMEZONE)
JERUSALEM = pytz_timezone("Asia/Jerusalem")

# מיפוי "day" → CronTrigger.day_of_week
_DAY_MAP = {
    "sun": "sun", "mon": "mon", "tue": "tue", "wed": "wed",
    "thu": "thu", "fri": "fri", "sat": "sat",
    "daily": "*",
}


# =====================================================================
# פונקציה שה-scheduler קורא לה — שלב הייצור עצמו
# =====================================================================

async def produce_video_for_avatar(avatar_id: str, video_type: str) -> None:
    """ה-callback שהמתזמן קורא לו ב-time-slot.

    video_type ∈ {"short", "long", "post"}:
      • short / long → מפעילים את VideoOrchestrator עם נושא דיפולטי
        (לקוח מ-trends אם יש; אחרת persona_dna.content_pillars[0]).
      • post         → לוקחים את הסרטון האחרון שעוד לא פורסם
        ומכניסים אותו ל-publisher.
    """
    from core.supabase_client import get_row
    from services.video_orchestrator import VideoOrchestrator

    logger.info(
        "scheduler.fire", avatar_id=avatar_id, video_type=video_type,
    )

    avatar = await get_row("avatars", avatar_id)
    if not avatar:
        logger.warning("scheduler.avatar_missing", avatar_id=avatar_id)
        return

    # Vacation mode or manually paused — skip this fire
    if avatar.get("is_paused") or avatar.get("status") == "paused":
        logger.info("scheduler.skipped_paused", avatar_id=avatar_id, video_type=video_type)
        return

    if video_type in ("short", "long"):
        # נושא ברירת מחדל: pillar הראשון של האווטאר
        pillars = (avatar.get("persona_dna") or {}).get("content_pillars") or []
        topic = pillars[0] if pillars else "today's trending topic"
        try:
            orch = VideoOrchestrator()
            await orch.produce(avatar_id, topic, voice="af_bella")
        except Exception as exc:
            logger.exception(
                "scheduler.produce_failed",
                avatar_id=avatar_id, video_type=video_type,
            )

    elif video_type == "post":
        # publish רק אם יש סרטון מוכן שלא פורסם
        try:
            from services.publisher import publish_latest_for_avatar
            await publish_latest_for_avatar(avatar_id)
        except ImportError:
            logger.warning(
                "scheduler.publisher_helper_missing",
                avatar_id=avatar_id,
            )
        except Exception:
            logger.exception(
                "scheduler.publish_failed", avatar_id=avatar_id,
            )


# =====================================================================
# AvatarScheduler — wrapper מסביב ל-APScheduler
# =====================================================================

class AvatarScheduler:
    """ניהול job-ים פר-אווטאר על-גבי APScheduler."""

    def __init__(self) -> None:
        self._sched = AsyncIOScheduler(timezone=JERUSALEM)
        self._started = False
        # מעקב אחר כל ה-job_ids לכל אווטאר כדי שנוכל להסיר אותם בעת reload
        self._jobs_by_avatar: dict[str, list[str]] = {}

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """הפעלה ראשונית: טוענים אווטארים ומוסיפים job-ים."""
        if self._started:
            return
        self._sched.start()
        self._started = True
        logger.info("scheduler.started", tz="Asia/Jerusalem")

        await self.reload_all()

    async def shutdown(self) -> None:
        if not self._started:
            return
        self._sched.shutdown(wait=False)
        self._started = False
        self._jobs_by_avatar.clear()
        logger.info("scheduler.shutdown")

    # ------------------------------------------------------------------
    # reload (כל המערכת או אווטאר ספציפי)
    # ------------------------------------------------------------------

    async def reload_all(self) -> None:
        """טוען את כל האווטארים מה-DB ומגדיר מחדש את כל ה-jobs."""
        try:
            avatars = await select_rows("avatars", limit=1000)
        except Exception:
            logger.exception("scheduler.reload_all_failed_to_load")
            return

        for av in avatars:
            self._configure_avatar(av)
        logger.info("scheduler.reload_all", count=len(avatars))

    async def reload_avatar(self, avatar_id: str) -> None:
        """טוען מחדש את ה-jobs של אווטאר אחד — מסיר ישנים ומוסיף חדשים.

        נקרא מה-API כל פעם שהמשתמש משנה schedule בדשבורד.
        """
        from core.supabase_client import get_row

        avatar = await get_row("avatars", avatar_id)
        if not avatar:
            self._remove_avatar_jobs(avatar_id)
            logger.warning("scheduler.reload_avatar_not_found", avatar_id=avatar_id)
            return

        self._configure_avatar(avatar)
        logger.info("scheduler.reload_avatar", avatar_id=avatar_id)

    # ------------------------------------------------------------------
    # core: building jobs from a single avatar row
    # ------------------------------------------------------------------

    def _configure_avatar(self, avatar: dict[str, Any]) -> None:
        avatar_id = avatar.get("id")
        if not avatar_id:
            return

        # מסיר את ה-jobs הישנים של האווטאר לפני שמכניס חדשים — מונע כפילויות
        self._remove_avatar_jobs(avatar_id)

        schedules = [
            ("short", avatar.get("short_video_schedule") or {}),
            ("long", avatar.get("long_video_schedule") or {}),
            ("post", avatar.get("post_schedule") or {}),
        ]
        added: list[str] = []

        for video_type, sched in schedules:
            if not sched.get("enabled"):
                continue
            for idx, slot in enumerate(sched.get("times") or []):
                trigger = self._build_trigger(slot)
                if trigger is None:
                    continue
                job_id = f"{avatar_id}:{video_type}:{idx}"
                self._sched.add_job(
                    produce_video_for_avatar,
                    trigger=trigger,
                    args=[avatar_id, video_type],
                    id=job_id,
                    replace_existing=True,
                    coalesce=True,
                    max_instances=1,
                )
                added.append(job_id)
        if added:
            self._jobs_by_avatar[avatar_id] = added

    def _build_trigger(self, slot: dict[str, Any]) -> CronTrigger | None:
        """ממיר slot לתבנית CronTrigger; מחזיר None אם לא תקין."""
        try:
            hour = int(slot.get("hour", 9))
            minute = int(slot.get("minute", 0))
            day_key = (slot.get("day") or "daily").lower()
            day_of_week = _DAY_MAP.get(day_key, "*")
        except (TypeError, ValueError):
            logger.warning("scheduler.invalid_slot", slot=slot)
            return None

        return CronTrigger(
            day_of_week=day_of_week,
            hour=hour,
            minute=minute,
            timezone=JERUSALEM,
        )

    def _remove_avatar_jobs(self, avatar_id: str) -> None:
        for job_id in self._jobs_by_avatar.get(avatar_id, []):
            try:
                self._sched.remove_job(job_id)
            except Exception:
                # אם ה-job כבר לא קיים — ממשיכים
                pass
        self._jobs_by_avatar.pop(avatar_id, None)

    # ------------------------------------------------------------------
    # status — לתצוגה ב-/scheduler/status
    # ------------------------------------------------------------------

    def status(self) -> dict[str, Any]:
        """מחזיר תמונת מצב של כל ה-jobs הפעילים, מסודרים לפי avatar."""
        jobs = self._sched.get_jobs() if self._started else []
        by_avatar: dict[str, list[dict[str, Any]]] = {}
        for j in jobs:
            # job_id format: {avatar_id}:{video_type}:{idx}
            parts = j.id.split(":")
            avatar_id = parts[0] if parts else "unknown"
            by_avatar.setdefault(avatar_id, []).append({
                "job_id": j.id,
                "video_type": parts[1] if len(parts) > 1 else "?",
                "next_run": j.next_run_time.isoformat() if j.next_run_time else None,
                "trigger": str(j.trigger),
            })
        return {
            "running": self._started,
            "tz": "Asia/Jerusalem",
            "total_jobs": len(jobs),
            "by_avatar": by_avatar,
        }


# =====================================================================
# Singleton — נטען ב-FastAPI lifespan
# =====================================================================

_scheduler: AvatarScheduler | None = None
_lock = asyncio.Lock()


async def get_scheduler() -> AvatarScheduler:
    global _scheduler
    async with _lock:
        if _scheduler is None:
            _scheduler = AvatarScheduler()
    return _scheduler
