"""Compatibility shim — core/notifier.py מפנה ל-core/notify.py החדש.

notify() מחזיר None כמו שתמיד עשה.
"""
from __future__ import annotations

from core.notify import notify as _notify


async def notify(title: str, message: str, level: str = "info") -> None:
    """Backwards-compat wrapper — מפנה לmnotify החדש."""
    await _notify(title=title, message=message, level=level)
