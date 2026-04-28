"""Notifications router — in-app notifications + SSE stream + Web Push.

Endpoints:
  GET  /notifications           → רשימת התראות (עם פילטר unread_only)
  POST /notifications/{id}/read → סמן כנקרא
  POST /notifications/read-all  → סמן הכל כנקרא
  GET  /notifications/stream    → SSE stream
  POST /notifications/push/subscribe   → רשום Web Push subscription
  POST /notifications/push/unsubscribe → בטל subscription
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.schemas.models import NotificationOut, PushSubscriptionCreate


class PushUnsubscribeRequest(BaseModel):
    endpoint: str
from core.logging import get_logger
from core.notify import register_sse_listener, unregister_sse_listener
from core.supabase_client import get_supabase, insert_row, select_rows, update_row

logger = get_logger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])


# =====================================================================
# REST endpoints
# =====================================================================

@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    unread_only: bool = False,
    limit: int = 50,
    avatar_id: str | None = None,
) -> list[NotificationOut]:
    filters: dict[str, Any] = {}
    if unread_only:
        filters["is_read"] = False
    if avatar_id:
        filters["avatar_id"] = avatar_id
    rows = await select_rows(
        "notifications", filters=filters or None,
        order_by="created_at", desc=True, limit=limit,
    )
    return [NotificationOut(**r) for r in rows]


@router.get("/unread-count")
async def unread_count() -> dict[str, int]:
    rows = await select_rows("notifications", filters={"is_read": False}, limit=500)
    return {"count": len(rows)}


@router.post("/{notification_id}/read", response_model=NotificationOut)
async def mark_read(notification_id: str) -> NotificationOut:
    try:
        saved = await update_row("notifications", notification_id, {"is_read": True})
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return NotificationOut(**saved)


@router.post("/read-all")
async def mark_all_read() -> dict[str, str]:
    def _do() -> None:
        get_supabase().table("notifications").update({"is_read": True}).eq("is_read", False).execute()
    try:
        await asyncio.to_thread(_do)
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return {"status": "ok"}


@router.delete("/{notification_id}")
async def delete_notification(notification_id: str) -> Response:
    def _do() -> None:
        get_supabase().table("notifications").delete().eq("id", notification_id).execute()
    try:
        await asyncio.to_thread(_do)
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return Response(status_code=204)


# =====================================================================
# SSE stream — /notifications/stream
# =====================================================================

@router.get("/stream")
async def sse_stream(request: Request) -> StreamingResponse:
    """Server-Sent Events — שולח notification events בזמן-אמת."""

    async def event_generator():
        q = register_sse_listener()
        try:
            # ping ראשוני לאישור חיבור
            yield "data: {\"event\": \"connected\"}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(q.get(), timeout=30)
                    payload = json.dumps(event, ensure_ascii=False, default=str)
                    yield f"data: {payload}\n\n"
                except asyncio.TimeoutError:
                    # keepalive ping
                    yield ": ping\n\n"
        finally:
            unregister_sse_listener(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# =====================================================================
# Web Push subscriptions
# =====================================================================

@router.post("/push/subscribe", status_code=status.HTTP_201_CREATED)
async def push_subscribe(req: PushSubscriptionCreate) -> dict[str, str]:
    """שמור Web Push subscription."""
    row = {
        "endpoint": req.endpoint,
        "keys": req.keys,
        "user_agent": req.user_agent,
    }
    try:
        # upsert לפי endpoint
        existing = await select_rows(
            "push_subscriptions", filters={"endpoint": req.endpoint}, limit=1,
        )
        if not existing:
            await insert_row("push_subscriptions", row)
    except Exception as exc:
        logger.warning("push.subscribe_failed", error=str(exc))
    return {"status": "subscribed"}


@router.post("/push/unsubscribe")
async def push_unsubscribe(req: PushUnsubscribeRequest) -> dict[str, str]:
    endpoint = req.endpoint
    """הסר Web Push subscription לפי endpoint."""
    def _do() -> None:
        get_supabase().table("push_subscriptions").delete().eq("endpoint", endpoint).execute()
    try:
        await asyncio.to_thread(_do)
    except Exception as exc:
        logger.warning("push.unsubscribe_failed", error=str(exc))
    return {"status": "unsubscribed"}
