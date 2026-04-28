"""Avatar router — CRUD מלא + files + commands + ideas + duplicate + regenerate-image.

כל endpoints פה הם תוספת ל-POST /avatars/create ו-GET /avatars
שנשארים ב-main.py לתאימות אחורה.
"""
from __future__ import annotations

import asyncio
import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from app.schemas.models import (
    AvatarCommandCreate,
    AvatarCommandOut,
    AvatarCommandUpdate,
    AvatarDuplicateRequest,
    AvatarFileOut,
    AvatarFileUpdate,
    AvatarIdeaCreate,
    AvatarIdeaOut,
    AvatarOut,
    AvatarUpdateRequest,
    RegenerateImageRequest,
    RegenerateImageResponse,
)
from core.logging import get_logger
from core.supabase_client import get_row, get_supabase, insert_row, select_rows, update_row

logger = get_logger(__name__)

router = APIRouter(prefix="/avatars", tags=["avatars"])


# =====================================================================
# עזרים פנימיים
# =====================================================================

async def _get_avatar_or_404(avatar_id: str) -> dict[str, Any]:
    row = await get_row("avatars", avatar_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"avatar {avatar_id} not found")
    return row


async def _platforms_for_avatar(avatar_id: str) -> dict[str, dict[str, Any]]:
    """שלוף platform_tokens ובנה dict {platform: {account_id, is_active}}."""
    try:
        rows = await select_rows("platform_tokens", filters={"avatar_id": avatar_id})
    except Exception:
        return {}
    out: dict[str, dict[str, Any]] = {}
    for r in rows:
        p = r.get("platform") or ""
        if p:
            out[p] = {
                "account_id": r.get("account_id"),
                "is_active": r.get("is_active", True),
                "token_expires_at": r.get("token_expires_at"),
            }
    return out


async def _avatar_to_out(row: dict[str, Any]) -> AvatarOut:
    platforms = await _platforms_for_avatar(str(row.get("id", "")))
    return AvatarOut(**{**row, "platforms": platforms})


# =====================================================================
# GET /avatars/{avatar_id}
# =====================================================================

@router.get("/{avatar_id}", response_model=AvatarOut)
async def get_avatar(avatar_id: str) -> AvatarOut:
    row = await _get_avatar_or_404(avatar_id)
    return await _avatar_to_out(row)


# =====================================================================
# PATCH /avatars/{avatar_id}
# =====================================================================

@router.patch("/{avatar_id}", response_model=AvatarOut)
async def update_avatar(avatar_id: str, req: AvatarUpdateRequest) -> AvatarOut:
    await _get_avatar_or_404(avatar_id)

    patch = req.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no fields to update")

    try:
        saved = await update_row("avatars", avatar_id, patch)
    except Exception as exc:
        logger.exception("avatars.update_failed", avatar_id=avatar_id)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc

    # אם השתנה schedule או is_paused — רענן את ה-scheduler
    schedule_keys = {"short_video_schedule", "long_video_schedule", "post_schedule", "is_paused"}
    if schedule_keys & set(patch.keys()):
        try:
            from services.scheduler import get_scheduler
            sched = await get_scheduler()
            await sched.reload_avatar(avatar_id)
        except Exception as exc:
            logger.warning("avatars.scheduler_reload_failed", error=str(exc))

    return await _avatar_to_out(saved)


# =====================================================================
# DELETE /avatars/{avatar_id}
# =====================================================================

@router.delete("/{avatar_id}")
async def delete_avatar(avatar_id: str) -> Response:
    await _get_avatar_or_404(avatar_id)

    def _do() -> None:
        get_supabase().table("avatars").delete().eq("id", avatar_id).execute()

    try:
        await asyncio.to_thread(_do)
    except Exception as exc:
        logger.exception("avatars.delete_failed", avatar_id=avatar_id)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc

    logger.info("avatars.deleted", avatar_id=avatar_id)
    return Response(status_code=204)


# =====================================================================
# POST /avatars/{avatar_id}/duplicate
# =====================================================================

@router.post("/{avatar_id}/duplicate", response_model=AvatarOut, status_code=status.HTTP_201_CREATED)
async def duplicate_avatar(avatar_id: str, req: AvatarDuplicateRequest) -> AvatarOut:
    """שכפל אווטר — מעתיק persona_dna ומאפשר לשנות שם/שפה/נישה."""
    src = await _get_avatar_or_404(avatar_id)

    new_id = str(uuid.uuid4())
    src_name = src.get("name") or "Avatar"
    new_row = {
        "id": new_id,
        "name": req.name or f"{src_name} (copy)",
        "handle": None,
        "niche": req.niche or src.get("niche"),
        "language": req.language or src.get("language", "en"),
        "persona_dna": src.get("persona_dna") or {},
        "generator_provider": src.get("generator_provider"),
        "generator_model": src.get("generator_model"),
        "avatar_style": src.get("avatar_style", "realistic"),
        "status": "active",
        "is_paused": False,
        "auto_publish": False,
    }

    try:
        saved = await insert_row("avatars", new_row)
    except Exception as exc:
        logger.exception("avatars.duplicate_failed", src_id=avatar_id)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc

    logger.info("avatars.duplicated", src_id=avatar_id, new_id=new_id)
    return AvatarOut(**{**saved, "platforms": {}})


# =====================================================================
# POST /avatars/{avatar_id}/regenerate-image
# =====================================================================

@router.post("/{avatar_id}/regenerate-image", response_model=RegenerateImageResponse)
async def regenerate_image(
    avatar_id: str,
    req: RegenerateImageRequest,
    background_tasks: BackgroundTasks,
) -> RegenerateImageResponse:
    """הפעל מחדש יצירת תמונת פנים — מחזיר placeholder מיד, מסיים ברקע."""
    row = await _get_avatar_or_404(avatar_id)

    if req.avatar_style:
        await update_row("avatars", avatar_id, {"avatar_style": req.avatar_style})

    async def _run() -> None:
        from services.avatar_image import PLACEHOLDER_FACE_URL, generate_avatar_face

        dna = row.get("persona_dna") or {}
        style = req.avatar_style or row.get("avatar_style", "realistic")
        seed = req.seed or 42

        try:
            face_url, needs_regen = await generate_avatar_face(avatar_id, dna, seed=seed, style=style)
        except Exception:
            logger.exception("avatars.regenerate_image_failed", avatar_id=avatar_id)
            face_url = PLACEHOLDER_FACE_URL
            needs_regen = True

        await update_row("avatars", avatar_id, {
            "face_url": face_url,
            "needs_face_regeneration": needs_regen,
        })
        logger.info("avatars.image_regenerated", avatar_id=avatar_id)

    background_tasks.add_task(_run)

    from services.avatar_image import PLACEHOLDER_FACE_URL
    return RegenerateImageResponse(
        avatar_id=avatar_id,
        face_url=row.get("face_url") or PLACEHOLDER_FACE_URL,
        needs_face_regeneration=True,
    )


# =====================================================================
# Commands
# =====================================================================

@router.get("/{avatar_id}/commands", response_model=list[AvatarCommandOut])
async def commands_list(avatar_id: str) -> list[AvatarCommandOut]:
    await _get_avatar_or_404(avatar_id)
    rows = await select_rows(
        "avatar_commands",
        filters={"avatar_id": avatar_id},
        order_by="priority",
        desc=False,
    )
    return [AvatarCommandOut(**r) for r in rows]


@router.post("/{avatar_id}/commands", response_model=AvatarCommandOut, status_code=status.HTTP_201_CREATED)
async def commands_create(avatar_id: str, req: AvatarCommandCreate) -> AvatarCommandOut:
    await _get_avatar_or_404(avatar_id)
    row = {
        "avatar_id": avatar_id,
        "command_text": req.command_text,
        "priority": req.priority,
        "is_active": req.is_active,
    }
    try:
        saved = await insert_row("avatar_commands", row)
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return AvatarCommandOut(**saved)


@router.patch("/{avatar_id}/commands/{command_id}", response_model=AvatarCommandOut)
async def commands_update(
    avatar_id: str, command_id: str, req: AvatarCommandUpdate,
) -> AvatarCommandOut:
    await _get_avatar_or_404(avatar_id)
    patch = req.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no fields to update")
    try:
        saved = await update_row("avatar_commands", command_id, patch)
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return AvatarCommandOut(**saved)


@router.delete("/{avatar_id}/commands/{command_id}")
async def commands_delete(avatar_id: str, command_id: str) -> Response:
    def _do() -> None:
        get_supabase().table("avatar_commands").delete().eq("id", command_id).execute()
    try:
        await asyncio.to_thread(_do)
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return Response(status_code=204)


# =====================================================================
# Files
# =====================================================================

@router.get("/{avatar_id}/files", response_model=list[AvatarFileOut])
async def files_list(avatar_id: str) -> list[AvatarFileOut]:
    await _get_avatar_or_404(avatar_id)
    rows = await select_rows(
        "avatar_files", filters={"avatar_id": avatar_id},
        order_by="uploaded_at", desc=True,
    )
    return [AvatarFileOut(**r) for r in rows]


@router.post("/{avatar_id}/files", response_model=AvatarFileOut, status_code=status.HTTP_201_CREATED)
async def files_upload(
    avatar_id: str,
    file: UploadFile = File(...),
    description: str = "",
) -> AvatarFileOut:
    await _get_avatar_or_404(avatar_id)

    content = await file.read()
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "file too large (max 100MB)")

    key = f"avatars/{avatar_id}/files/{uuid.uuid4().hex}_{file.filename}"
    try:
        from services.r2_uploader import upload_bytes
        public_url = await upload_bytes(
            content, key=key,
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as exc:
        logger.exception("files_upload.r2_failed", avatar_id=avatar_id)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"upload failed: {exc}") from exc

    row = {
        "avatar_id": avatar_id,
        "filename": file.filename or key.split("/")[-1],
        "file_url": public_url,
        "file_type": file.content_type,
        "file_size_bytes": len(content),
        "description": description,
    }
    try:
        saved = await insert_row("avatar_files", row)
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return AvatarFileOut(**saved)


@router.patch("/{avatar_id}/files/{file_id}", response_model=AvatarFileOut)
async def files_update(avatar_id: str, file_id: str, req: AvatarFileUpdate) -> AvatarFileOut:
    patch = req.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no fields to update")
    try:
        saved = await update_row("avatar_files", file_id, patch)
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return AvatarFileOut(**saved)


@router.delete("/{avatar_id}/files/{file_id}")
async def files_delete(avatar_id: str, file_id: str) -> Response:
    def _do() -> None:
        get_supabase().table("avatar_files").delete().eq("id", file_id).execute()
    try:
        await asyncio.to_thread(_do)
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return Response(status_code=204)


# =====================================================================
# Ideas
# =====================================================================

@router.get("/{avatar_id}/ideas", response_model=list[AvatarIdeaOut])
async def ideas_list(avatar_id: str, unused_only: bool = False) -> list[AvatarIdeaOut]:
    await _get_avatar_or_404(avatar_id)
    filters: dict[str, Any] = {"avatar_id": avatar_id}
    if unused_only:
        filters["is_used"] = False
    rows = await select_rows("avatar_ideas", filters=filters, order_by="created_at", desc=True)
    return [AvatarIdeaOut(**r) for r in rows]


@router.post("/{avatar_id}/ideas", response_model=AvatarIdeaOut, status_code=status.HTTP_201_CREATED)
async def ideas_create(avatar_id: str, req: AvatarIdeaCreate) -> AvatarIdeaOut:
    await _get_avatar_or_404(avatar_id)
    row = {"avatar_id": avatar_id, "idea_text": req.idea_text, "source": req.source}
    try:
        saved = await insert_row("avatar_ideas", row)
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return AvatarIdeaOut(**saved)


@router.delete("/{avatar_id}/ideas/{idea_id}")
async def ideas_delete(avatar_id: str, idea_id: str) -> Response:
    def _do() -> None:
        get_supabase().table("avatar_ideas").delete().eq("id", idea_id).execute()
    try:
        await asyncio.to_thread(_do)
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return Response(status_code=204)


@router.post("/{avatar_id}/ideas/{idea_id}/use", response_model=AvatarIdeaOut)
async def ideas_mark_used(avatar_id: str, idea_id: str) -> AvatarIdeaOut:
    """סמן רעיון כנוצל."""
    saved = await update_row("avatar_ideas", idea_id, {"is_used": True})
    return AvatarIdeaOut(**saved)
