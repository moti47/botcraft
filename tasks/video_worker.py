"""Standalone Redis worker — drains ``viral:videos:queue`` and runs
``services.video_pipeline.run_pipeline`` for each job.

Runs as its own process (``python -m tasks.video_worker``) so heavy video
jobs never block the FastAPI event loop. The docker-compose ``worker``
service starts this module.

Job payload shape:

    {"video_id": "uuid"}

Missing ``video_id`` → the job is logged and dropped.
Pipeline failures → row is marked status=failed; a notification is fired
via core/notify.py (no Discord — central notify system handles SSE + push).
"""
from __future__ import annotations

import asyncio
import json
import signal
from typing import Any

from core.config import get_settings
from core.logging import configure_logging, get_logger
from core.notify import notify  # type: ignore[attr-defined]
from core.redis_client import close_redis, get_redis
from core.supabase_client import update_row
from services.video_pipeline import run_pipeline

logger = get_logger(__name__)


async def _mark_failed(video_id: str, reason: str) -> None:
    try:
        await update_row("videos", video_id, {"status": "failed", "error_message": reason})
    except Exception as exc:
        logger.error("worker.mark_failed_db_error", video_id=video_id, error=str(exc))


async def _process_job(payload: dict[str, Any]) -> None:
    video_id = payload.get("video_id")
    if not video_id:
        reason = "payload missing video_id"
        logger.error("worker.bad_payload", reason=reason, payload=payload)
        return

    try:
        result = await run_pipeline(video_id)
        logger.info("worker.job_done", video_id=video_id, status=result.get("status"))
        try:
            await notify(
                title="Video ready",
                message=f"Video {video_id} finished",
                level="info",
            )
        except Exception:
            pass
    except Exception as exc:
        logger.exception("worker.job_failed", video_id=video_id)
        await _mark_failed(video_id, str(exc))
        try:
            await notify(
                title="Video failed",
                message=f"Video {video_id}: {exc}",
                level="error",
            )
        except Exception:
            pass


async def run_worker(stop_event: asyncio.Event) -> None:
    settings = get_settings()
    queue = settings.video_queue_name
    logger.info("tasks.worker.starting", queue=queue, redis_url=settings.redis_url)

    r = await get_redis()
    logger.info("Worker connected to Redis", queue=queue, redis_url=settings.redis_url)

    while not stop_event.is_set():
        try:
            item = await r.brpop(queue, timeout=5)
        except Exception as exc:
            logger.error("tasks.worker.brpop_error", error=str(exc))
            await asyncio.sleep(2)
            continue

        if not item:
            continue

        _queue_name, raw = item
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            logger.error("tasks.worker.bad_json", raw=str(raw)[:200])
            continue

        logger.info("tasks.worker.job_received", video_id=payload.get("video_id"))
        try:
            await _process_job(payload)
        except Exception:
            logger.exception("tasks.worker.unexpected_loop_error")

    logger.info("tasks.worker.stopped")


def main() -> None:
    configure_logging()
    stop_event = asyncio.Event()

    def _handle_signal(*_: Any) -> None:
        logger.info("tasks.worker.signal_stop")
        stop_event.set()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, _handle_signal)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler — fall back to signal.signal
            signal.signal(sig, _handle_signal)

    try:
        loop.run_until_complete(run_worker(stop_event))
    finally:
        loop.run_until_complete(close_redis())
        loop.close()


if __name__ == "__main__":
    main()
