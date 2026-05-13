"""Videos router — drives the new no-Colab pipeline.

``POST /videos/produce`` creates the video row in ``status='queued'`` and
runs ``services.video_pipeline.run_pipeline`` in a FastAPI BackgroundTask
(or enqueues a Redis job for the worker if you prefer durability).

Other endpoints expose status/list/retry for the dashboard.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, status

from app.schemas.models import (
    VideoOut,
    VideoProduceRequest,
    VideoProduceResponse,
    VideoStageTimestamps,
    VideoStatusResponse,
)
from core.config import get_settings
from core.logging import get_logger
from core.notify import notify_video_failure
from core.redis_client import enqueue_job
from core.supabase_client import get_row, insert_row, select_rows, update_row
from services.video_pipeline import run_pipeline

logger = get_logger(__name__)

router = APIRouter(prefix="/videos", tags=["videos"])

STATUS_QUEUED = "queued"
STATUS_FAILED = "failed"


async def _run_pipeline_background(video_id: str, avatar_id: str | None) -> None:
    """BackgroundTasks entry — kick off pipeline, swallow terminal errors.

    The pipeline already stamps the videos row as failed and fires a
    notification on error; here we only need to log.
    """
    try:
        await run_pipeline(video_id)
    except Exception as exc:
        logger.exception("videos.produce.background_crashed", video_id=video_id)
        try:
            await notify_video_failure(
                video_id=video_id, stage="background_task", reason=str(exc),
                avatar_id=avatar_id,
            )
        except Exception:
            pass


@router.post(
    "/produce",
    response_model=VideoProduceResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def produce(
    req: VideoProduceRequest,
    background_tasks: BackgroundTasks,
) -> VideoProduceResponse:
    """Start the full pipeline; returns immediately with the new video_id."""
    avatar = await get_row("avatars", req.avatar_id)
    if not avatar:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"avatar {req.avatar_id} not found")

    import uuid as _uuid
    job_id = str(_uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    row = {
        "job_id": job_id,
        "avatar_id": req.avatar_id,
        "topic": req.topic,
        "language": getattr(req, "language", None) or avatar.get("language") or "en",
        "priority": 5,
        "render_options": {
            "topic": req.topic,
            "voice": req.voice,
            "auto_post": req.auto_post,
            "stages": {STATUS_QUEUED: now},
        },
        "status": STATUS_QUEUED,
    }
    try:
        saved = await insert_row("videos", row)
    except Exception as exc:
        logger.exception("videos.produce.insert_failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc

    video_db_id = saved.get("id")
    if not video_db_id:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "insert returned no id")

    background_tasks.add_task(_run_pipeline_background, video_db_id, req.avatar_id)

    logger.info(
        "videos.produce.queued",
        video_id=video_db_id, avatar_id=req.avatar_id, topic=req.topic,
    )
    return VideoProduceResponse(
        video_id=video_db_id,
        status=STATUS_QUEUED,
        message="Pipeline started",
    )


@router.get("/{video_id}/status", response_model=VideoStatusResponse)
async def get_status(video_id: str) -> VideoStatusResponse:
    """Return the current pipeline stage and per-stage timestamps."""
    row = await get_row("videos", video_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"video {video_id} not found")

    render_options: dict[str, Any] = row.get("render_options") or {}
    stages: dict[str, str] = render_options.get("stages") or {}

    return VideoStatusResponse(
        video_id=video_id,
        status=row.get("status") or STATUS_FAILED,
        stages=VideoStageTimestamps(**{k: stages.get(k) for k in VideoStageTimestamps.model_fields}),
        error_message=row.get("error_message"),
        video_url=row.get("video_url"),
        face_url=row.get("face_url"),
        audio_url=row.get("audio_url"),
    )


@router.get("/recent")
async def videos_recent(limit: int = 20) -> list[dict[str, Any]]:
    """Last N videos with avatar name + status, for the dashboard activity feed."""
    try:
        videos = await select_rows("videos", order_by="created_at", desc=True, limit=limit)
    except Exception:
        videos = []
    try:
        avatars = await select_rows("avatars") or []
    except Exception:
        avatars = []
    by_id = {a.get("id"): a for a in avatars}
    out: list[dict[str, Any]] = []
    for v in videos or []:
        a = by_id.get(v.get("avatar_id"), {})
        opts = v.get("render_options") or {}
        out.append({
            **v,
            "avatar_name": a.get("name"),
            "face_url": a.get("face_url"),
            "topic": v.get("topic") or opts.get("topic"),
        })
    return out


@router.get("/by-id/{video_id}", response_model=VideoOut)
async def get_video(video_id: str) -> VideoOut:
    """Fetch a video row by its primary-key id (complements the job_id lookup)."""
    row = await get_row("videos", video_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"video {video_id} not found")
    return VideoOut(**row)


@router.post("/{video_id}/retry")
async def retry_video(
    video_id: str, background_tasks: BackgroundTasks,
) -> VideoProduceResponse:
    row = await get_row("videos", video_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"video {video_id} not found")

    avatar_id = row.get("avatar_id")
    if not avatar_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "video has no avatar_id")

    render_options = row.get("render_options") or {}
    now = datetime.now(timezone.utc).isoformat()
    new_options = {
        **render_options,
        "stages": {**(render_options.get("stages") or {}), STATUS_QUEUED: now},
        "retry_count": int(render_options.get("retry_count", 0)) + 1,
    }
    await update_row("videos", video_id, {
        "status": STATUS_QUEUED,
        "error_message": None,
        "render_options": new_options,
    })

    try:
        await enqueue_job(
            get_settings().video_queue_name,
            {"video_id": video_id, "avatar_id": avatar_id},
        )
    except Exception:
        logger.warning("videos.retry.enqueue_failed", video_id=video_id)

    background_tasks.add_task(_run_pipeline_background, video_id, avatar_id)

    logger.info("videos.retried", video_id=video_id)
    return VideoProduceResponse(
        video_id=video_id, status=STATUS_QUEUED, message="Retry queued",
    )
