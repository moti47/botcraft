"""Background worker that drains `viral:videos:queue` and runs the orchestrator.

Started as a FastAPI lifespan background task (see app/main.py). Uses Redis
BRPOP to block on the queue and releases back to the event loop between jobs.

Job payload shape (produced by POST /videos/queue):
    {
        "job_id": "uuid",
        "script_id": "uuid",
        "avatar_id": "uuid | null",
        "priority": 1..10,
        "render_options": {
            "voice_ref_filename": "nova.wav",   # REQUIRED for TTS
            ...
        }
    }

Jobs missing `voice_ref_filename` are marked failed without being retried.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from core.config import get_settings
from core.logging import get_logger
from core.redis_client import get_redis
from core.supabase_client import update_row, select_rows
from services.video_orchestrator import OrchestratorError, produce_video

logger = get_logger(__name__)


async def _mark_failed_by_job_id(job_id: str, reason: str) -> None:
    """Find the videos row by job_id and set status=failed."""
    try:
        rows = await select_rows("videos", filters={"job_id": job_id}, limit=1)
        if rows:
            await update_row("videos", rows[0]["id"], {
                "status": "failed",
                "error_message": reason,
            })
    except Exception as exc:
        logger.error("worker.mark_failed_db_error", job_id=job_id, error=str(exc))


async def _process_job(payload: dict[str, Any]) -> None:
    job_id = payload.get("job_id", "unknown")
    script_id = payload.get("script_id")
    if not script_id:
        logger.error("worker.bad_payload_no_script", payload=payload)
        await _mark_failed_by_job_id(job_id, "missing script_id")
        return

    render_options = payload.get("render_options") or {}
    voice_ref = render_options.get("voice_ref_filename")
    if not voice_ref:
        logger.error("worker.bad_payload_no_voice_ref", job_id=job_id)
        await _mark_failed_by_job_id(
            job_id,
            "render_options.voice_ref_filename is required (e.g. 'nova.wav')",
        )
        return

    try:
        result = await produce_video(
            script_id=script_id,
            voice_ref_filename=voice_ref,
            avatar_id=payload.get("avatar_id"),
            priority=payload.get("priority", 5),
            render_options=render_options,
            existing_job_id=job_id,
        )
        logger.info("worker.job_done", job_id=job_id, video=result.get("id"))
    except OrchestratorError as exc:
        logger.error("worker.job_failed", job_id=job_id, error=str(exc))
        await _mark_failed_by_job_id(job_id, str(exc))
    except Exception as exc:
        logger.exception("worker.job_crashed", job_id=job_id)
        await _mark_failed_by_job_id(job_id, f"crash: {exc}")


async def run_worker(stop_event: asyncio.Event) -> None:
    """Main worker loop. Blocks on BRPOP; exits when stop_event is set."""
    settings = get_settings()
    queue = settings.video_queue_name
    logger.info("worker.starting", queue=queue)

    r = await get_redis()

    while not stop_event.is_set():
        try:
            # BRPOP with a 5s timeout so we can check stop_event periodically
            item = await r.brpop(queue, timeout=5)
        except Exception as exc:
            logger.error("worker.brpop_error", error=str(exc))
            await asyncio.sleep(2)
            continue

        if not item:
            continue  # timeout — loop back and check stop_event

        _queue, raw = item
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            logger.error("worker.bad_json", raw=raw[:200])
            continue

        logger.info("worker.job_received", job_id=payload.get("job_id"))
        # Run the job — do NOT swallow so we can log crashes and keep going.
        try:
            await _process_job(payload)
        except Exception:
            logger.exception("worker.unexpected_loop_error")

    logger.info("worker.stopped")
