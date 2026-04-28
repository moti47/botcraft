"""Admin endpoints for the dashboard.

Runtime config getter/setter (masked), danger-zone actions.
Discord הוסר — ההתראות עוברות דרך core/notify.py.
"""
from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from core.logging import get_logger
from core.redis_client import get_redis
from core.supabase_client import select_rows, update_row

logger = get_logger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])

_PUBLIC_KEYS = {
    "colab_tts_url",
    "colab_image_url",
    "colab_lipsync_url",
    "notify_on_video_ready",
    "notify_on_post_published",
    "notify_on_pipeline_failure",
}
_SECRET_KEYS = {"groq_api_key", "gemini_api_key", "cerebras_api_key"}


def _mask(v: str | None) -> str:
    if not v:
        return ""
    if len(v) <= 8:
        return "•" * 8
    return v[:4] + "•" * 8 + v[-4:]


def _truthy(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if v is None:
        return False
    return str(v).lower() in {"1", "true", "yes", "on"}


@router.get("/config")
async def get_config() -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k in _PUBLIC_KEYS:
        val = os.getenv(k.upper(), "")
        out[k] = _truthy(val if val != "" else "1") if k.startswith("notify_") else val
    for k in _SECRET_KEYS:
        out[k] = _mask(os.getenv(k.upper(), ""))
    return out


class ConfigUpdate(BaseModel):
    colab_tts_url: str | None = None
    colab_image_url: str | None = None
    colab_lipsync_url: str | None = None
    groq_api_key: str | None = None
    gemini_api_key: str | None = None
    cerebras_api_key: str | None = None
    notify_on_video_ready: bool | None = None
    notify_on_post_published: bool | None = None
    notify_on_pipeline_failure: bool | None = None


@router.post("/config")
async def update_config(body: ConfigUpdate) -> dict[str, str]:
    updated: list[str] = []
    for k, v in body.model_dump(exclude_none=True).items():
        os.environ[k.upper()] = str(v) if not isinstance(v, bool) else ("1" if v else "0")
        updated.append(k)
    logger.info("admin.config_updated", keys=updated)
    return {"status": "ok", "updated": ",".join(updated)}


@router.post("/pause-all")
async def pause_all() -> dict[str, Any]:
    try:
        rows = await select_rows("avatars")
    except Exception:
        rows = []
    count = 0
    for r in rows:
        try:
            await update_row("avatars", r["id"], {"status": "paused", "is_paused": True})
            count += 1
        except Exception:
            pass
    logger.warning("admin.paused_all", count=count)
    return {"status": "ok", "paused": count}


@router.post("/clear-queue")
async def clear_queue() -> dict[str, Any]:
    try:
        redis = await get_redis()
        keys = await redis.keys("queue:*")
        if keys:
            await redis.delete(*keys)
        return {"status": "ok", "cleared": len(keys)}
    except Exception as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"redis: {exc}") from exc


@router.get("/export")
async def export_data() -> dict[str, Any]:
    out: dict[str, Any] = {}
    for table in ("avatars", "videos", "scripts", "posts", "trends", "notifications"):
        try:
            out[table] = await select_rows(table)
        except Exception as exc:
            out[table] = {"error": str(exc)}
    return out


@router.post("/colab-urls")
async def update_colab_urls(body: dict[str, str]) -> dict[str, str]:
    """עדכון URLs של שרתי Colab ב-Redis בלי restart."""
    try:
        from core.redis_client import set_colab_urls
        await set_colab_urls(body)
    except Exception as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"redis: {exc}") from exc
    return {"status": "ok", **body}
