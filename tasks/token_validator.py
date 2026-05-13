"""משימת רקע — בדיקת תוקף של platform_tokens כל 6 שעות.

לכל token פעיל אנו עושים test API call לפלטפורמה המתאימה. אם מקבלים
401/403 — נסמן is_active=false ונשלח התראה ב-app (SSE + push).

ה-task מותקן ב-FastAPI lifespan ורץ ברקע.
"""
from __future__ import annotations

import asyncio
from typing import Any

import httpx

from core.logging import get_logger
from core.notify import notify  # in-app notify (SSE + push)
from core.supabase_client import get_supabase, select_rows, update_row

logger = get_logger(__name__)

# 6 שעות = 21600 שניות
VALIDATION_INTERVAL_SECONDS = 6 * 60 * 60


async def _validate_youtube(access_token: str) -> bool:
    """test call ל-YouTube — channels.list של המשתמש מאומת."""
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get(
            "https://www.googleapis.com/youtube/v3/channels",
            params={"part": "id", "mine": "true"},
            headers=headers,
        )
    if r.status_code in (401, 403):
        return False
    return r.status_code < 400


async def _validate_tiktok(access_token: str) -> bool:
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get(
            "https://open.tiktokapis.com/v2/user/info/",
            params={"fields": "open_id"},
            headers=headers,
        )
    if r.status_code in (401, 403):
        return False
    return r.status_code < 400


async def _validate_instagram(access_token: str) -> bool:
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get(
            "https://graph.facebook.com/v17.0/me",
            params={"access_token": access_token, "fields": "id"},
        )
    if r.status_code in (401, 403):
        return False
    return r.status_code < 400


VALIDATORS = {
    "youtube": _validate_youtube,
    "tiktok": _validate_tiktok,
    "instagram": _validate_instagram,
}


async def validate_all_tokens() -> dict[str, int]:
    """ריצה אחת — בדיקה של כל הטוקנים הפעילים. מחזיר ספירה לפי תוצאה."""
    try:
        rows = await select_rows(
            "platform_tokens",
            filters={"is_active": True},
            limit=1000,
        )
    except Exception:
        logger.exception("token_validator.fetch_failed")
        return {"checked": 0, "invalid": 0, "errors": 0}

    checked = 0
    invalid = 0
    errors = 0

    for row in rows:
        platform = (row.get("platform") or "").lower()
        token = row.get("access_token") or ""
        validator = VALIDATORS.get(platform)
        if not validator or not token:
            continue
        checked += 1
        try:
            ok = await validator(token)
        except Exception as exc:
            logger.warning(
                "token_validator.error",
                platform=platform, token_id=row.get("id"), error=str(exc),
            )
            errors += 1
            continue

        if not ok:
            # ----- מסומן כלא פעיל ושולחים התראה -----
            invalid += 1
            try:
                await update_row(
                    "platform_tokens", row["id"], {"is_active": False},
                )
            except Exception:
                logger.exception("token_validator.update_failed", token_id=row.get("id"))
            try:
                await notify(
                    title=f"{platform} token expired",
                    message=f"Token {row['id']} on avatar {row.get('avatar_id') or '?'} is invalid; please reconnect.",
                    level="error",
                )
            except Exception:
                pass

    logger.info(
        "token_validator.cycle_done",
        checked=checked, invalid=invalid, errors=errors,
    )
    return {"checked": checked, "invalid": invalid, "errors": errors}


async def run_token_validator_loop(stop_event: asyncio.Event) -> None:
    """לולאה שרצה כל 6 שעות עד ש-stop_event מקבל set."""
    logger.info("token_validator.loop_started", interval_sec=VALIDATION_INTERVAL_SECONDS)
    while not stop_event.is_set():
        try:
            await validate_all_tokens()
        except Exception:
            logger.exception("token_validator.cycle_crashed")
        try:
            await asyncio.wait_for(
                stop_event.wait(),
                timeout=VALIDATION_INTERVAL_SECONDS,
            )
        except asyncio.TimeoutError:
            continue
    logger.info("token_validator.loop_stopped")
