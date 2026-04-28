"""Standalone Redis worker — drains ``viral:videos:queue`` and runs the
new :class:`VideoOrchestrator` for each job.

Runs as its own process (``python tasks/video_worker.py``) so heavy video
jobs never block the FastAPI event loop. The docker-compose ``worker``
service starts this module.

Expected job payload shape (enqueued by callers who prefer Redis over
BackgroundTasks for durability):

    {
        "video_id": "uuid (optional — if set, the row is updated in place)",
        "avatar_id": "uuid",
        "topic": "string",
        "voice": "af_bella",
        "auto_post": false
    }

Missing ``avatar_id`` / ``topic`` → the job is logged and dropped.
Any Colab server being offline → orchestrator stamps status=failed and
fires a Discord webhook via ``services.notifications``.
"""
from __future__ import annotations

import asyncio
import json
import signal
from typing import Any

from core.config import get_settings
from core.logging import configure_logging, get_logger
from core.notifier import notify
from core.redis_client import close_redis, get_redis
from services.notifications import notify_discord_failure
from services.video_orchestrator import (
    OrchestratorError,
    VideoOrchestrator,
)

logger = get_logger(__name__)


async def _process_job(payload: dict[str, Any]) -> None:
    """Validate the payload and hand it off to the orchestrator."""
    # ---- ולידציה בסיסית — avatar_id ו-topic הם חובה ----
    avatar_id = payload.get("avatar_id")
    topic = payload.get("topic")
    if not avatar_id or not topic:
        reason = "payload missing avatar_id or topic"
        logger.error("worker.bad_payload", reason=reason, payload=payload)
        await notify_discord_failure(
            video_id=str(payload.get("video_id") or "unknown"),
            stage="worker_validation",
            reason=reason,
        )
        return

    voice = payload.get("voice", "af_bella")
    auto_post = bool(payload.get("auto_post", False))
    existing_video_id = payload.get("video_id")

    orchestrator = VideoOrchestrator()
    try:
        result = await orchestrator.produce(
            avatar_id=avatar_id,
            topic=topic,
            voice=voice,
            auto_post=auto_post,
            existing_video_id=existing_video_id,
        )
        logger.info("worker.job_done", video_id=result.get("id"))
        # התראה ל-Discord על סיום מוצלח של job
        await notify(
            ":white_check_mark: Video job completed",
            f"video `{result.get('id')}` for avatar `{avatar_id}` is ready",
            level="info",
        )
    except OrchestratorError as exc:
        # הארגומנט כבר הוחתם failed בתוך VideoOrchestrator.produce
        logger.error("worker.job_failed", error=str(exc))
        await notify(
            ":x: Video job failed",
            f"avatar `{avatar_id}` topic `{topic[:60]}`: {exc}",
            level="error",
        )
    except Exception as exc:
        logger.exception("worker.job_crashed")
        await notify(
            ":boom: Video worker crashed",
            f"video `{existing_video_id or 'unknown'}`: {exc}",
            level="error",
        )
        await notify_discord_failure(
            video_id=str(existing_video_id or "unknown"),
            stage="worker_crash",
            reason=str(exc),
        )


async def run_worker(stop_event: asyncio.Event) -> None:
    """Main loop. BRPOPs from the queue; exits when stop_event is set."""
    settings = get_settings()
    queue = settings.video_queue_name
    logger.info("tasks.worker.starting", queue=queue, redis_url=settings.redis_url)

    r = await get_redis()
    # Bug-fix #2 — log מפורש שה-worker התחבר לתור (תאימות למפרט)
    logger.info("Worker connected to Redis", queue=queue, redis_url=settings.redis_url)

    while not stop_event.is_set():
        try:
            # BRPOP עם timeout כדי שנוכל לבדוק stop_event מדי פעם
            item = await r.brpop(queue, timeout=5)
        except Exception as exc:
            logger.error("tasks.worker.brpop_error", error=str(exc))
            await asyncio.sleep(2)
            continue

        if not item:
            continue  # timeout — נחזור ללולאה ונבדוק stop_event

        _queue_name, raw = item
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            logger.error("tasks.worker.bad_json", raw=str(raw)[:200])
            continue

        logger.info(
            "tasks.worker.job_received",
            video_id=payload.get("video_id"),
            avatar_id=payload.get("avatar_id"),
        )
        try:
            await _process_job(payload)
        except Exception:
            logger.exception("tasks.worker.unexpected_loop_error")

    logger.info("tasks.worker.stopped")


def _install_signal_handlers(loop: asyncio.AbstractEventLoop, stop_event: asyncio.Event) -> None:
    def _handler() -> None:
        logger.info("tasks.worker.signal_received")
        stop_event.set()

    for sig_name in ("SIGTERM", "SIGINT"):
        sig = getattr(signal, sig_name, None)
        if sig is None:
            continue
        try:
            loop.add_signal_handler(sig, _handler)
        except NotImplementedError:
            # Windows + ProactorEventLoop — add_signal_handler is unsupported
            signal.signal(sig, lambda *_: _handler())


async def main() -> None:
    configure_logging()
    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()
    _install_signal_handlers(loop, stop_event)
    try:
        await run_worker(stop_event)
    finally:
        await close_redis()


if __name__ == "__main__":
    asyncio.run(main())
