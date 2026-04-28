"""בדיקות יחידה ל-AvatarScheduler.

לא מפעילים כאן את ה-scheduler האמיתי (אסור loop). בודקים את הלוגיקה
הסינכרונית: בניית triggers, פירוק job_id, ו-status() כשעוד לא הופעל.
"""
from __future__ import annotations

import pytest
from apscheduler.triggers.cron import CronTrigger

from services.scheduler import AvatarScheduler, _DAY_MAP


def test_day_map_covers_all_weekdays():
    """day_map חייב לכסות שבעת ימי השבוע + daily — אחרת slots עם
    "thu" / "fri" וכו' ייפלו ל-fallback ולא יבנו cron נכון."""
    for day in ("sun", "mon", "tue", "wed", "thu", "fri", "sat", "daily"):
        assert day in _DAY_MAP


def test_build_trigger_valid_slot():
    s = AvatarScheduler()
    trigger = s._build_trigger({"day": "mon", "hour": 14, "minute": 30})
    assert isinstance(trigger, CronTrigger)
    # ה-trigger חייב להחזיק את המידע ב-fields של CronTrigger
    fields = {f.name: str(f) for f in trigger.fields}
    assert fields.get("day_of_week") == "mon"
    assert fields.get("hour") == "14"
    assert fields.get("minute") == "30"


def test_build_trigger_daily_means_every_day():
    s = AvatarScheduler()
    trigger = s._build_trigger({"day": "daily", "hour": 9, "minute": 0})
    fields = {f.name: str(f) for f in trigger.fields}
    assert fields.get("day_of_week") == "*"


def test_build_trigger_unknown_day_falls_back_to_every_day():
    """day לא חוקי → fallback ל-* (לא None — לא רוצים לבטל את ה-job בשתיקה
    כי המשתמש אולי הקליד 'monday' במקום 'mon')."""
    s = AvatarScheduler()
    trigger = s._build_trigger({"day": "monday", "hour": 9, "minute": 0})
    fields = {f.name: str(f) for f in trigger.fields}
    assert fields.get("day_of_week") == "*"


def test_build_trigger_invalid_returns_none():
    """hour לא ניתן להמרה → מחזיר None ולא קורס."""
    s = AvatarScheduler()
    assert s._build_trigger({"hour": "noon"}) is None


def test_status_before_start_returns_empty():
    """status() לפני start() — running=False, אין jobs."""
    s = AvatarScheduler()
    st = s.status()
    assert st["running"] is False
    assert st["total_jobs"] == 0
    assert st["tz"] == "Asia/Jerusalem"
    assert st["by_avatar"] == {}
