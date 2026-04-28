"""AI insights + persona variants + cross-avatar idea sharing.

Endpoints:
  POST /avatars/{id}/insights/refresh           → force regenerate insights
  GET  /avatars/{id}/insights                   → latest cached insights

  GET  /avatars/{id}/variants                   → list persona variants
  POST /avatars/{id}/variants                   → create a new variant
  POST /avatars/{id}/variants/{vid}/promote     → promote variant → main DNA
  DELETE /avatars/{id}/variants/{vid}           → remove a variant

  POST /avatars/{src}/ideas/{idea_id}/share-to/{dst}
       → copy idea to another avatar with tone-adapted topic
"""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel

from core.llm_router import AllProvidersFailed, get_router
from core.logging import get_logger
from core.supabase_client import get_row, get_supabase, insert_row, select_rows, update_row

logger = get_logger(__name__)

router = APIRouter(tags=["insights"])


# =====================================================================
# Insights — LLM analysis of recent videos
# =====================================================================

INSIGHTS_PROMPT = """You are an analytics assistant for an AI influencer platform.

Given a list of recent videos (topics + statuses + performance), produce
strategic recommendations for the avatar's content strategy.

Reply STRICTLY in this JSON shape:

{
  "summary": "<2-3 sentence overview>",
  "recommendations": [
    {"category": "content_type", "title": "...", "rationale": "..."},
    {"category": "timing", "title": "...", "rationale": "..."},
    {"category": "sub_niche", "title": "...", "rationale": "..."}
  ],
  "best_hours": ["09:00", "21:00"],
  "best_topics": ["..."]
}

Reply ONLY with the JSON object. No markdown, no preamble.
"""


def _parse_json(text: str) -> dict:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t)
        t = re.sub(r"\s*```$", "", t)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", t, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return {"summary": text[:500], "recommendations": [], "best_hours": [], "best_topics": []}


@router.get("/avatars/{avatar_id}/insights")
async def get_insights(avatar_id: str, refresh: bool = False) -> dict[str, Any]:
    """Return latest cached insights — or refresh on demand via ?refresh=true."""
    avatar = await get_row("avatars", avatar_id)
    if not avatar:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"avatar {avatar_id} not found")

    if not refresh:
        cached = await select_rows(
            "avatar_insights", filters={"avatar_id": avatar_id},
            order_by="generated_at", desc=True, limit=1,
        )
        if cached:
            return cached[0]

    # Pull recent videos for context
    videos = await select_rows(
        "videos", filters={"avatar_id": avatar_id},
        order_by="created_at", desc=True, limit=30,
    )
    summary_for_llm = [
        {
            "topic": (v.get("render_options") or {}).get("topic") or v.get("topic"),
            "status": v.get("status"),
            "created_at": v.get("created_at"),
        }
        for v in (videos or [])
    ]

    user_msg = (
        f"Avatar niche: {avatar.get('niche')}\n"
        f"Tone: {(avatar.get('persona_dna') or {}).get('tone')}\n"
        f"Recent videos ({len(summary_for_llm)}):\n"
        + json.dumps(summary_for_llm, ensure_ascii=False, default=str)[:4000]
    )

    try:
        llm = get_router()
        result = await llm.complete(INSIGHTS_PROMPT, user_msg, temperature=0.4, max_tokens=800)
    except AllProvidersFailed as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    parsed = _parse_json(result.get("text", ""))
    row = {
        "avatar_id": avatar_id,
        "summary": parsed.get("summary", "")[:2000],
        "recommendations": parsed.get("recommendations") or [],
        "analysis": {
            "best_hours": parsed.get("best_hours") or [],
            "best_topics": parsed.get("best_topics") or [],
        },
        "based_on_videos": len(summary_for_llm),
    }
    try:
        saved = await insert_row("avatar_insights", row)
        return saved
    except Exception as exc:
        logger.warning("insights.persist_failed", avatar_id=avatar_id, error=str(exc))
        return row


@router.post("/avatars/{avatar_id}/insights/refresh")
async def refresh_insights(avatar_id: str) -> dict[str, Any]:
    return await get_insights(avatar_id, refresh=True)


# =====================================================================
# Persona variants — A/B testing
# =====================================================================

class VariantCreateRequest(BaseModel):
    label: str
    persona_dna: dict[str, Any] | None = None
    is_active: bool = True


@router.get("/avatars/{avatar_id}/variants")
async def list_variants(avatar_id: str) -> list[dict[str, Any]]:
    rows = await select_rows(
        "persona_variants", filters={"avatar_id": avatar_id},
        order_by="created_at", desc=False,
    )
    return rows or []


@router.post("/avatars/{avatar_id}/variants", status_code=status.HTTP_201_CREATED)
async def create_variant(avatar_id: str, req: VariantCreateRequest) -> dict[str, Any]:
    avatar = await get_row("avatars", avatar_id)
    if not avatar:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"avatar {avatar_id} not found")

    dna = req.persona_dna or avatar.get("persona_dna") or {}
    saved = await insert_row("persona_variants", {
        "avatar_id": avatar_id,
        "label": req.label[:64],
        "persona_dna": dna,
        "is_active": req.is_active,
    })
    logger.info("variants.created", avatar_id=avatar_id, variant_id=saved.get("id"), label=req.label)
    return saved


@router.post("/avatars/{avatar_id}/variants/{variant_id}/promote")
async def promote_variant(avatar_id: str, variant_id: str) -> dict[str, Any]:
    """Promote variant → replaces avatar.persona_dna and marks variant as winner."""
    variant = await get_row("persona_variants", variant_id)
    if not variant or variant.get("avatar_id") != avatar_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "variant not found for this avatar")

    await update_row("avatars", avatar_id, {"persona_dna": variant.get("persona_dna") or {}})
    await update_row("persona_variants", variant_id, {
        "promoted_at": datetime.now(timezone.utc).isoformat(),
    })
    logger.info("variants.promoted", avatar_id=avatar_id, variant_id=variant_id)
    return {"status": "ok", "promoted": variant_id}


@router.delete("/avatars/{avatar_id}/variants/{variant_id}")
async def delete_variant(avatar_id: str, variant_id: str) -> Response:
    def _do() -> None:
        get_supabase().table("persona_variants").delete().eq("id", variant_id).execute()
    try:
        await asyncio.to_thread(_do)
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return Response(status_code=204)


# =====================================================================
# Cross-avatar idea sharing
# =====================================================================

ADAPT_PROMPT = """You adapt a content idea from one AI influencer to another.

Given the SOURCE_TOPIC and the TARGET_AVATAR's persona (niche, tone), rewrite
the idea to fit the target's voice and audience while keeping the core concept.

Reply with ONLY the new topic line — no quotes, no preamble, no explanation.
Keep it under 100 characters.
"""


@router.post("/avatars/{src_id}/ideas/{idea_id}/share-to/{dst_id}")
async def share_idea(src_id: str, idea_id: str, dst_id: str) -> dict[str, Any]:
    """Copy idea from src avatar to dst avatar with LLM tone-adaptation."""
    src = await get_row("avatars", src_id)
    dst = await get_row("avatars", dst_id)
    if not src or not dst:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "source or destination avatar not found")

    idea = await get_row("avatar_ideas", idea_id)
    if not idea or idea.get("avatar_id") != src_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "idea not found for source avatar")

    src_topic = idea.get("topic") or ""
    dst_dna = dst.get("persona_dna") or {}
    user_msg = (
        f"SOURCE_TOPIC: {src_topic}\n"
        f"TARGET_AVATAR niche: {dst.get('niche')}\n"
        f"TARGET_AVATAR tone: {dst_dna.get('tone')}\n"
    )

    new_topic = src_topic
    try:
        llm = get_router()
        result = await llm.complete(ADAPT_PROMPT, user_msg, temperature=0.7, max_tokens=120)
        adapted = (result.get("text") or "").strip().strip('"').splitlines()[0]
        if adapted:
            new_topic = adapted[:200]
    except Exception as exc:
        logger.warning("ideas.adapt_failed", error=str(exc))

    new_idea = await insert_row("avatar_ideas", {
        "avatar_id": dst_id,
        "topic": new_topic,
        "notes": f"Adapted from avatar {src.get('name', src_id)}: {src_topic[:200]}",
    })
    logger.info("ideas.shared", src_id=src_id, dst_id=dst_id, new_idea_id=new_idea.get("id"))
    return new_idea
