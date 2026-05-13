"""Background worker that drains ``viral:videos:queue`` and runs the new
free-API video pipeline (services.video_pipeline).

Started as a FastAPI lifespan background task (see app/main.py). Uses Redis
BRPOP to block on the queue and releases back to the event loop between jobs.

Job payload shape (produced by POST /videos/produce or the chat agent):
    {
        "video_id": "uuid",       # required — the row already exists
        "avatar_id": "uuid",      # informational; pipeline reads it from the row
    }

Jobs missing ``video_id`` are marked failed without retry.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from core.config import get_settings
from core.logging import get_logger
from core.redis_client import get_redis
from core.supabase_client import update_row
from services.video_pipeline import run_pipeline

logger = get_logger(__name__)


async def _mark_failed(video_id: str, reason: str) -> None:
    try:
        await update_row("videos", video_id, {
            "status": "failed",
            "error_message": reason,
        })
    except Exception as exc:
        logger.error("worker.mark_failed_db_error", video_id=video_id, error=str(exc))


async def _process_job(payload: dict[str, Any]) -> None:
    video_id = payload.get("video_id")
    if not video_id:
        logger.error("worker.bad_payload_no_video_id", payload=payload)
        return

    try:
        result = await run_pipeline(video_id)
        logger.info("worker.job_done", video_id=video_id, status=result.get("status"))
    except Exception as exc:
        logger.exception("worker.job_failed", video_id=video_id)
        await _mark_failed(video_id, str(exc))


async def run_worker(stop_event: asyncio.Event) -> None:
    """Main worker loop. Blocks on BRPOP; exits when stop_event is set."""
    settings = get_settings()
    queue = settings.video_queue_name
    logger.info("worker.starting", queue=queue)

    r = await get_redis()

    while not stop_event.is_set():
        try:
            item = await r.brpop(queue, timeout=5)
        except Exception as exc:
            logger.error("worker.brpop_error", error=str(exc))
            await asyncio.sleep(2)
            continue

        if not item:
            continue

        _queue, raw = item
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            logger.error("worker.bad_json", raw=raw[:200])
            continue

        logger.info("worker.job_received", video_id=payload.get("video_id"))
        try:
            await _process_job(payload)
        except Exception:
            logger.exception("worker.unexpected_loop_error")

    logger.info("worker.stopped")
