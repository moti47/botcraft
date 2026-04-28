"""Per-avatar+platform posting rate limiter backed by Redis.

המפתח החדש: ``rate:{avatar_id}:{platform}:daily_count``
איפוס בחצות UTC. ברירת מחדל: 15 פוסטים ליום לכל זוג avatar+platform.

בנוסף נשמר marker של cool-down כדי למנוע פרסום צפוף מדי על אותה
פלטפורמה (PUBLISH_MIN_GAP_SECONDS, ברירת מחדל 1800s).

API:
* ``check_or_raise(avatar_id, platform)`` — לפני כל ניסיון פרסום.
* ``record_success(avatar_id, platform)`` — אחרי פרסום מוצלח.
* ``usage_snapshot(avatar_id=None)`` — לדשבורד.
"""
from __future__ import annotations

from datetime import datetime, timezone

from core.config import get_settings
from core.logging import get_logger
from core.redis_client import get_redis

logger = get_logger(__name__)

# מזהה ברירת מחדל ליצירת מפתחות גם כשלא הועבר avatar_id
# (תאימות אחורה למצב single-tenant מבוסס env בלבד).
_GLOBAL_AVATAR_ID = "global"


class RateLimitExceeded(Exception):
    def __init__(
        self,
        platform: str,
        reason: str,
        retry_after_seconds: int,
        avatar_id: str | None = None,
    ) -> None:
        super().__init__(f"{platform}/{avatar_id or '-'}: {reason} (retry in {retry_after_seconds}s)")
        self.platform = platform
        self.avatar_id = avatar_id
        self.reason = reason
        self.retry_after_seconds = retry_after_seconds


def _today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


def _avatar_key(avatar_id: str | None) -> str:
    return avatar_id or _GLOBAL_AVATAR_ID


def _count_key(avatar_id: str | None, platform: str) -> str:
    """rate:{avatar_id}:{platform}:daily_count — לפי המפרט החדש."""
    return f"rate:{_avatar_key(avatar_id)}:{platform}:daily_count"


def _last_key(avatar_id: str | None, platform: str) -> str:
    """marker של cool-down — TTL == זמן ההמתנה הנותר."""
    return f"rate:{_avatar_key(avatar_id)}:{platform}:cooldown"


def _seconds_until_midnight_utc() -> int:
    """כמה שניות נותרו עד חצות UTC הבא — לקביעת TTL וגם retry hint."""
    now = datetime.now(timezone.utc)
    end = now.replace(hour=23, minute=59, second=59, microsecond=0)
    return max(60, int((end - now).total_seconds()))


async def check_or_raise(avatar_id: str | None, platform: str) -> None:
    """Raise ``RateLimitExceeded`` if over daily quota or in cool-down."""
    settings = get_settings()
    r = await get_redis()

    # ---- בדיקה 1: מגבלת פוסטים יומית per avatar+platform ----
    count_key = _count_key(avatar_id, platform)
    raw_count = await r.get(count_key)
    today_count = int(raw_count) if raw_count else 0
    if today_count >= settings.publish_max_per_day:
        retry_in = _seconds_until_midnight_utc()
        raise RateLimitExceeded(
            platform,
            f"daily cap reached ({today_count}/{settings.publish_max_per_day})",
            retry_in,
            avatar_id=avatar_id,
        )

    # ---- בדיקה 2: פער מינימלי בין פוסטים על אותה פלטפורמה (per avatar) ----
    last_key = _last_key(avatar_id, platform)
    if await r.get(last_key):
        ttl = await r.ttl(last_key)
        if ttl and ttl > 0:
            raise RateLimitExceeded(
                platform,
                f"cool-down ({settings.publish_min_gap_seconds}s between posts)",
                int(ttl),
                avatar_id=avatar_id,
            )


async def record_success(avatar_id: str | None, platform: str) -> int:
    """Increment the daily counter and stamp the cool-down marker."""
    settings = get_settings()
    r = await get_redis()
    count_key = _count_key(avatar_id, platform)
    last_key = _last_key(avatar_id, platform)

    pipe = r.pipeline()
    pipe.incr(count_key)
    # TTL = שעות עד חצות UTC + שעה buffer — תמיד מתאפס באותו "יום" UTC
    pipe.expire(count_key, _seconds_until_midnight_utc() + 3600)
    pipe.set(last_key, "1", ex=settings.publish_min_gap_seconds)
    res = await pipe.execute()
    new_count = int(res[0])
    logger.info(
        "publish.rate.recorded",
        avatar_id=avatar_id, platform=platform, count=new_count,
    )
    return new_count


async def usage_snapshot(avatar_id: str | None = None) -> dict[str, dict[str, int]]:
    """Return current usage per known platform — for the GET status endpoint."""
    settings = get_settings()
    r = await get_redis()
    out: dict[str, dict[str, int]] = {}
    for platform in ("youtube", "tiktok", "instagram"):
        raw = await r.get(_count_key(avatar_id, platform))
        ttl = await r.ttl(_last_key(avatar_id, platform))
        out[platform] = {
            "today": int(raw) if raw else 0,
            "daily_cap": settings.publish_max_per_day,
            "cool_down_remaining_sec": max(0, int(ttl)) if ttl and ttl > 0 else 0,
        }
    return out
