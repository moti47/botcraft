from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.routers import admin as admin_router
from app.routers import analytics as analytics_router
from app.routers import avatars as avatars_router
from app.routers import chat as chat_router
from app.routers import insights as insights_router
from app.routers import notifications as notifications_router
from app.routers import posts as posts_router
from app.routers import scheduler as scheduler_router
from app.routers import videos as videos_router
from app.schemas.models import (
    AvatarCreateRequest,
    AvatarOut,
    ColabHealthResponse,
    HealthResponse,
    LLMUsageResponse,
    PlatformConnectRequest,
    PlatformDisconnectResponse,
    PlatformTokenOut,
    ScriptGenerateRequest,
    ScriptOut,
    TrendOut,
    VideoOut,
    VideoQueueRequest,
    VideoQueueResponse,
)
from core.config import get_settings
from core.llm_router import AllProvidersFailed, get_router
from core.logging import configure_logging, get_logger
from core.redis_client import close_redis, enqueue_job, get_redis
from core.supabase_client import (
    get_row,
    get_supabase,
    insert_row,
    select_rows,
    update_row,
)
from services.colab_client import ColabError, ColabUnavailable, ImageClient, LipsyncClient, TTSClient
from services.persona_generator import generate_persona
from services.script_generator import generate_script
from services.video_worker import run_worker

configure_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("app.startup", env=settings.env)
    try:
        await get_redis()
    except Exception as exc:
        logger.error("app.startup_redis_failed", error=str(exc))
    try:
        get_supabase()
    except Exception as exc:
        logger.error("app.startup_supabase_failed", error=str(exc))

    worker_task: asyncio.Task | None = None
    stop_event = asyncio.Event()
    if settings.video_worker_enabled:
        worker_task = asyncio.create_task(run_worker(stop_event), name="video-worker")
        logger.info("app.worker_started")

    try:
        yield
    finally:
        if worker_task is not None:
            stop_event.set()
            try:
                await asyncio.wait_for(worker_task, timeout=10)
            except asyncio.TimeoutError:
                logger.warning("app.worker_shutdown_timeout")
                worker_task.cancel()
        await close_redis()
        logger.info("app.shutdown")


app = FastAPI(
    title="Viral Empire — Local AI Influencer Backend",
    description="Local-first backend for generating AI influencers, viral scripts, trends intake, and video job queueing.",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(videos_router.router)
app.include_router(posts_router.router)
app.include_router(admin_router.router)
app.include_router(analytics_router.router)
app.include_router(notifications_router.router)
app.include_router(chat_router.router)
app.include_router(scheduler_router.router)
app.include_router(insights_router.router)
# avatars_router נרשם אחרון כי /avatars/{id} יחטוף /avatars/create
app.include_router(avatars_router.router)


# ---------- Health ----------

@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health() -> HealthResponse:
    settings = get_settings()
    redis_status = "down"
    try:
        r = await get_redis()
        await r.ping()
        redis_status = "up"
    except Exception as exc:
        logger.error("health.redis_down", error=str(exc))

    supabase_status = "down"
    try:
        get_supabase()
        supabase_status = "up"
    except Exception as exc:
        logger.error("health.supabase_down", error=str(exc))

    return HealthResponse(
        status="ok" if redis_status == "up" else "degraded",
        redis=redis_status,
        supabase=supabase_status,
        env=settings.env,
    )


@app.get("/llm/usage", response_model=LLMUsageResponse, tags=["system"])
async def llm_usage() -> LLMUsageResponse:
    router = get_router()
    snapshot = await router.usage_snapshot()
    return LLMUsageResponse(usage=snapshot)


# ---------- Avatars ----------

@app.post("/avatars/create", response_model=AvatarOut, tags=["avatars"])
async def avatars_create(req: AvatarCreateRequest) -> AvatarOut:
    """יצירת אווטר + image generation ברקע."""
    try:
        saved = await generate_persona(
            niche=req.niche,
            language=req.language,
            tone=getattr(req, "tone", None),
            avatar_style=getattr(req, "avatar_style", "realistic"),
        )
    except AllProvidersFailed as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except Exception as exc:
        logger.exception("avatars.create_failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc

    avatar_id = saved.get("id")
    if avatar_id:
        asyncio.create_task(_generate_face_background(
            avatar_id=avatar_id,
            persona_dna=saved.get("persona_dna") or {},
            avatar_style=getattr(req, "avatar_style", "realistic"),
        ))

    return AvatarOut(**{**saved, "platforms": {}})


async def _generate_face_background(avatar_id: str, persona_dna: dict, avatar_style: str = "realistic") -> None:
    """image gen ברקע — לא חוסם את ה-create response."""
    try:
        from services.avatar_image import PLACEHOLDER_FACE_URL, generate_avatar_face
        face_url, needs_regen = await generate_avatar_face(avatar_id, persona_dna, style=avatar_style)
        await update_row("avatars", avatar_id, {
            "face_url": face_url,
            "needs_face_regeneration": needs_regen,
        })
        logger.info("avatars.face_generated", avatar_id=avatar_id)
    except Exception as exc:
        logger.warning("avatars.face_generation_skipped", error=str(exc))


@app.get("/avatars", response_model=list[AvatarOut], tags=["avatars"])
async def avatars_list(limit: int = 50) -> list[AvatarOut]:
    """רשימת כל האווטרים כולל join עם platform_tokens."""
    try:
        rows = await select_rows("avatars", order_by="created_at", desc=True, limit=limit)
    except Exception as exc:
        logger.exception("avatars.list_failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc

    if not rows:
        return []

    # טוען את כל platform_tokens בשאילתה אחת
    try:
        all_tokens = await select_rows("platform_tokens")
    except Exception:
        all_tokens = []

    tokens_by_avatar: dict[str, dict[str, dict]] = {}
    for t in all_tokens:
        aid = t.get("avatar_id") or ""
        platform = t.get("platform") or ""
        if aid and platform:
            tokens_by_avatar.setdefault(aid, {})[platform] = {
                "account_id": t.get("account_id"),
                "is_active": t.get("is_active", True),
                "token_expires_at": t.get("token_expires_at"),
            }

    return [
        AvatarOut(**{**r, "platforms": tokens_by_avatar.get(str(r.get("id", "")), {})})
        for r in rows
    ]


# ---------- Platform tokens ----------

def _mask_token_row(row: dict) -> PlatformTokenOut:
    return PlatformTokenOut(
        id=str(row.get("id") or ""),
        avatar_id=str(row.get("avatar_id") or ""),
        platform=row.get("platform") or "",
        account_id=row.get("account_id"),
        is_active=bool(row.get("is_active", True)),
        token_expires_at=row.get("token_expires_at"),
        created_at=row.get("created_at"),
    )


@app.post("/avatars/{avatar_id}/platforms/connect", response_model=PlatformTokenOut, tags=["platforms"])
async def platforms_connect(avatar_id: str, req: PlatformConnectRequest) -> PlatformTokenOut:
    avatar_row = await get_row("avatars", avatar_id)
    if not avatar_row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"avatar {avatar_id} not found")

    existing = await select_rows("platform_tokens", filters={"avatar_id": avatar_id, "platform": req.platform}, limit=1)

    payload: dict = {
        "avatar_id": avatar_id,
        "platform": req.platform,
        "access_token": req.access_token,
        "refresh_token": req.refresh_token,
        "account_id": req.account_id,
        "token_expires_at": req.token_expires_at.isoformat() if req.token_expires_at else None,
        "is_active": req.is_active,
    }

    try:
        if existing:
            saved = await update_row("platform_tokens", existing[0]["id"], payload)
        else:
            saved = await insert_row("platform_tokens", payload)
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc

    logger.info("platforms.connected", avatar_id=avatar_id, platform=req.platform)
    return _mask_token_row(saved)


@app.get("/avatars/{avatar_id}/platforms", response_model=list[PlatformTokenOut], tags=["platforms"])
async def platforms_list(avatar_id: str) -> list[PlatformTokenOut]:
    try:
        rows = await select_rows("platform_tokens", filters={"avatar_id": avatar_id})
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return [_mask_token_row(r) for r in rows]


@app.delete("/avatars/{avatar_id}/platforms/{platform}", response_model=PlatformDisconnectResponse, tags=["platforms"])
async def platforms_disconnect(avatar_id: str, platform: str) -> PlatformDisconnectResponse:
    rows = await select_rows("platform_tokens", filters={"avatar_id": avatar_id, "platform": platform.lower()}, limit=1)
    if not rows:
        return PlatformDisconnectResponse(avatar_id=avatar_id, platform=platform, removed=False)

    def _delete() -> None:
        get_supabase().table("platform_tokens").delete().eq("id", rows[0]["id"]).execute()

    try:
        await asyncio.to_thread(_delete)
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc

    logger.info("platforms.disconnected", avatar_id=avatar_id, platform=platform)
    return PlatformDisconnectResponse(avatar_id=avatar_id, platform=platform, removed=True)


# ---------- Scripts ----------

@app.post("/scripts/generate", response_model=ScriptOut, tags=["scripts"])
async def scripts_generate(req: ScriptGenerateRequest) -> ScriptOut:
    try:
        saved = await generate_script(avatar_id=req.avatar_id, topic=req.topic)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except AllProvidersFailed as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except Exception as exc:
        logger.exception("scripts.generate_failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return ScriptOut(**saved)


# ---------- Trends (API only — לא חשוף ב-UI) ----------

@app.get("/trends", response_model=list[TrendOut], tags=["trends"])
async def trends_top(limit: int = 5) -> list[TrendOut]:
    try:
        rows = await select_rows("trends", order_by="score", desc=True, limit=limit)
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return [TrendOut(**r) for r in rows]


# ---------- Colab & legacy video ----------

@app.get("/colab/health", response_model=ColabHealthResponse, tags=["system"])
async def colab_health() -> ColabHealthResponse:
    async def _probe(client) -> dict | str:
        try:
            return await client.health()
        except ColabUnavailable as exc:
            return f"unavailable: {exc}"
        except ColabError as exc:
            return f"error: {exc}"

    tts, image, lipsync = await asyncio.gather(
        _probe(TTSClient()),
        _probe(ImageClient()),
        _probe(LipsyncClient()),
    )
    return ColabHealthResponse(tts=tts, image=image, lipsync=lipsync)


@app.get("/videos/{job_id}", response_model=VideoOut, tags=["videos"])
async def videos_get(job_id: str) -> VideoOut:
    rows = await select_rows("videos", filters={"job_id": job_id}, limit=1)
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"video {job_id} not found")
    return VideoOut(**rows[0])


@app.post("/videos/queue", response_model=VideoQueueResponse, tags=["videos"])
async def videos_queue(req: VideoQueueRequest) -> VideoQueueResponse:
    job_id = str(uuid.uuid4())
    queue_name = get_settings().video_queue_name
    merged_options = {**req.render_options, "voice_ref_filename": req.voice_ref_filename}
    payload = {"job_id": job_id, "script_id": req.script_id, "avatar_id": req.avatar_id, "priority": req.priority, "render_options": merged_options}

    try:
        await insert_row("videos", {**payload, "status": "queued"})
    except Exception as exc:
        logger.warning("videos.queue_db_insert_failed", error=str(exc))

    try:
        position = await enqueue_job(queue_name, payload)
    except Exception as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    return VideoQueueResponse(job_id=job_id, queue=queue_name, position=position, status="queued")
