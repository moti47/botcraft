"""Chat agent — LLM-backed assistant with tool-use for the dashboard.

The LLM receives a system prompt describing available actions and returns
a JSON blob: {"reply": "...", "actions": [{"tool": "...", "args": {...}}]}.

Tools available:
  • create_avatar(niche, language, tone, avatar_style)
  • produce_video(avatar_id, topic)
  • pause_avatar(avatar_id, paused)
  • list_avatars()
  • list_recent_videos()
"""
from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from core.llm_router import AllProvidersFailed, get_router
from core.logging import get_logger
from core.supabase_client import insert_row, select_rows, update_row

logger = get_logger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])

SYSTEM_PROMPT = """You are a helpful AI dashboard assistant for "Viral Empire" — an AI influencer management platform.

You can help the user manage their AI avatars and content pipeline. When the user asks you to perform an action, include it in your JSON response.

ALWAYS respond with valid JSON in this exact format:
{
  "reply": "your friendly reply to the user",
  "actions": []
}

Available actions (add to "actions" array when needed):
- {"tool": "create_avatar", "args": {"niche": "...", "language": "en", "tone": "energetic", "avatar_style": "realistic"}}
- {"tool": "bulk_create_avatars", "args": {"niches": ["niche1", "niche2", ...], "language": "en", "tone": "energetic", "avatar_style": "realistic"}}
- {"tool": "produce_video", "args": {"avatar_id": "uuid", "topic": "..."}}
- {"tool": "pause_avatar", "args": {"avatar_id": "uuid", "paused": true|false}}
- {"tool": "list_avatars", "args": {}}
- {"tool": "list_recent_videos", "args": {}}

Rules:
- For "create 5 avatars on topic X", use bulk_create_avatars with 5 distinct niches
- Only include actions the user explicitly requested
- If listing data, just reply with it directly — no need for an action
- Keep replies concise and friendly
- Respond in the same language the user writes in
- For Hebrew messages, reply in Hebrew
"""


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str
    actions_taken: list[dict[str, Any]] = []
    message_id: str | None = None


def _extract_json(text: str) -> dict[str, Any]:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t)
        t = re.sub(r"\s*```$", "", t)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", t, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
    return {"reply": text, "actions": []}


async def _execute_tool(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    """Run one tool call and return a result summary."""
    try:
        if tool == "create_avatar":
            from services.persona_generator import generate_persona
            result = await generate_persona(
                niche=args.get("niche", "general"),
                language=args.get("language", "en"),
                tone=args.get("tone"),
                avatar_style=args.get("avatar_style", "realistic"),
            )
            return {"tool": tool, "status": "ok", "avatar_id": result.get("id"), "name": result.get("name")}

        elif tool == "produce_video":
            from core.redis_client import enqueue_job
            from core.config import get_settings
            import uuid
            job_id = str(uuid.uuid4())
            payload = {
                "job_id": job_id,
                "avatar_id": args.get("avatar_id"),
                "topic": args.get("topic", "trending topic"),
                "voice": "af_bella",
                "render_options": {},
            }
            await insert_row("videos", {**payload, "status": "queued"})
            await enqueue_job(get_settings().video_queue_name, payload)
            return {"tool": tool, "status": "ok", "job_id": job_id}

        elif tool == "pause_avatar":
            avatar_id = args.get("avatar_id")
            paused = bool(args.get("paused", True))
            await update_row("avatars", avatar_id, {
                "is_paused": paused,
                "status": "paused" if paused else "active",
            })
            return {"tool": tool, "status": "ok", "avatar_id": avatar_id, "paused": paused}

        elif tool == "bulk_create_avatars":
            from services.persona_generator import generate_persona
            niches = args.get("niches") or []
            if not niches:
                return {"tool": tool, "status": "error", "error": "no niches provided"}
            # Cap at 10 to avoid abuse
            niches = niches[:10]
            results = []
            for niche in niches:
                try:
                    r = await generate_persona(
                        niche=niche,
                        language=args.get("language", "en"),
                        tone=args.get("tone"),
                        avatar_style=args.get("avatar_style", "realistic"),
                    )
                    results.append({"niche": niche, "avatar_id": r.get("id"), "name": r.get("name"), "status": "ok"})
                except Exception as exc:
                    results.append({"niche": niche, "status": "error", "error": str(exc)})
            return {"tool": tool, "status": "ok", "created": results}

        elif tool == "list_avatars":
            rows = await select_rows("avatars", limit=20, order_by="created_at", desc=True)
            return {
                "tool": tool,
                "status": "ok",
                "avatars": [{"id": r.get("id"), "name": r.get("name"), "niche": r.get("niche"), "status": r.get("status")} for r in rows],
            }

        elif tool == "list_recent_videos":
            rows = await select_rows("videos", limit=10, order_by="created_at", desc=True)
            return {
                "tool": tool,
                "status": "ok",
                "videos": [{"id": r.get("id"), "topic": r.get("topic"), "status": r.get("status")} for r in rows],
            }

        else:
            return {"tool": tool, "status": "unknown_tool"}

    except Exception as exc:
        logger.exception("chat.tool_failed", tool=tool)
        return {"tool": tool, "status": "error", "error": str(exc)}


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    if not req.message.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "message is required")

    llm = get_router()
    try:
        result = await llm.complete(SYSTEM_PROMPT, req.message, temperature=0.7, max_tokens=1000)
    except AllProvidersFailed as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    parsed = _extract_json(result["text"])
    reply = parsed.get("reply") or result["text"]
    actions_spec = parsed.get("actions") or []

    # Execute each tool sequentially
    actions_taken: list[dict[str, Any]] = []
    for action in actions_spec:
        tool = action.get("tool", "")
        args = action.get("args") or {}
        if tool:
            outcome = await _execute_tool(tool, args)
            actions_taken.append(outcome)

    # Persist message + reply in DB
    saved = None
    try:
        saved = await insert_row("chat_messages", {
            "role": "user",
            "content": req.message,
            "actions_taken": actions_taken,
        })
        await insert_row("chat_messages", {
            "role": "assistant",
            "content": reply,
            "actions_taken": [],
        })
    except Exception:
        logger.warning("chat.persist_failed")

    return ChatResponse(
        reply=reply,
        actions_taken=actions_taken,
        message_id=saved.get("id") if saved else None,
    )


@router.get("/history")
async def chat_history(limit: int = 30) -> list[dict[str, Any]]:
    try:
        rows = await select_rows("chat_messages", limit=limit, order_by="created_at", desc=False)
        return rows
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
