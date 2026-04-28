"""Compatibility shim — מפנה לmcore/notify.py החדש.

כל הקריאות הישנות ל-notify_discord_failure מועברות למערכת ה-in-app.
"""
from __future__ import annotations

from core.notify import notify_video_failure


async def notify_discord_failure(
    *,
    video_id: str,
    stage: str,
    reason: str,
    avatar_id: str | None = None,
) -> None:
    """Backwards-compat: הפנה לmnotify_video_failure החדש."""
    await notify_video_failure(
        video_id=video_id,
        stage=stage,
        reason=reason,
        avatar_id=avatar_id,
    )
