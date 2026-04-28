from __future__ import annotations

import json
import re
from typing import Any

from core.llm_router import get_router
from core.logging import get_logger
from core.supabase_client import get_row, insert_row, select_rows

logger = get_logger(__name__)


SYSTEM_PROMPT = """You are a world-class short-form viral video scriptwriter.
You write for TikTok / Reels / Shorts: hooks in the first 1.5 seconds, rising
tension, pattern-interrupts, hard CTA.
Always return VALID JSON only, no markdown fences, no commentary."""


async def _build_context_block(avatar_id: str) -> str:
    """בונה בלוק הקשר שמוזרק ל-system prompt לפני שליחה ל-LLM.

    כולל את ה-commands הפעילים של האווטאר (מסודרים לפי priority יורד)
    ואת רשימת הקבצים שהמשתמש העלה לאווטאר עם התיאורים שלהם.

    אם אין commands ואין files — מחזירים מחרוזת ריקה כדי לא לזהם את
    ה-system prompt בכותרות מיותרות.
    """
    try:
        commands = await select_rows(
            "avatar_commands",
            filters={"avatar_id": avatar_id, "is_active": True},
            order_by="priority",
            desc=True,
        )
    except Exception:
        # אם הטבלה לא קיימת (migration לא רץ) — נמשיך בלי
        commands = []
    try:
        files = await select_rows(
            "avatar_files",
            filters={"avatar_id": avatar_id},
            order_by="uploaded_at",
            desc=True,
        )
    except Exception:
        files = []

    if not commands and not files:
        return ""

    cmd_lines = "\n".join(
        f"- {c.get('command_text', '').strip()}" for c in commands
    ) or "(none)"
    file_lines = "\n".join(
        f"- {f.get('filename', '?')}: {f.get('description') or '(no description)'}"
        for f in files
    ) or "(none)"

    return (
        "\n\nAvatar permanent instructions (priority order, must follow):\n"
        f"{cmd_lines}\n\n"
        "Available context files:\n"
        f"{file_lines}\n"
    )


USER_TEMPLATE = """Write a viral short-form video script in the voice of this persona.

PERSONA DNA:
{persona_json}

Topic: {topic}
Target length: 30-45 seconds (~80-120 words of spoken content).
Language: {language}

Return JSON with EXACTLY these keys:
{{
  "title": "str (catchy, <=60 chars)",
  "hook": "str (first 1.5s — pattern interrupt)",
  "beats": [
    {{"time": "0-2s", "visual": "str", "voiceover": "str"}},
    {{"time": "2-8s", "visual": "str", "voiceover": "str"}},
    {{"time": "8-20s", "visual": "str", "voiceover": "str"}},
    {{"time": "20-35s", "visual": "str", "voiceover": "str"}},
    {{"time": "35-45s", "visual": "str", "voiceover": "str"}}
  ],
  "cta": "str",
  "caption": "str (<=200 chars, hook + question)",
  "hashtags": ["str", "str", "str", "str", "str"],
  "on_screen_text": ["str", "str", "str"],
  "sound_direction": "str"
}}

Output JSON only."""


def _extract_json(text: str) -> dict[str, Any]:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t)
        t = re.sub(r"\s*```$", "", t)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", t, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


async def generate_script(avatar_id: str, topic: str) -> dict[str, Any]:
    avatar = await get_row("avatars", avatar_id)
    if not avatar:
        raise ValueError(f"avatar {avatar_id} not found")

    language = avatar.get("language") or "en"
    persona_dna = avatar.get("persona_dna") or {}
    user_prompt = USER_TEMPLATE.format(
        persona_json=json.dumps(persona_dna, ensure_ascii=False, indent=2),
        topic=topic,
        language=language,
    )

    # ----- בנייה של system prompt עם הוראות-קבע ומידע על קבצים -----
    context_block = await _build_context_block(avatar_id)
    system_prompt_with_context = SYSTEM_PROMPT + context_block

    router = get_router()
    result = await router.complete(
        system_prompt_with_context, user_prompt, temperature=0.85, max_tokens=1600
    )
    script = _extract_json(result["text"])

    row = {
        "avatar_id": avatar_id,
        "topic": topic,
        "title": script.get("title"),
        "script": script,
        "language": language,
        "provider": result["provider"],
        "model": result["model"],
        "status": "draft",
    }

    saved = await insert_row("scripts", row)
    logger.info(
        "script.created",
        script_id=saved.get("id"),
        avatar_id=avatar_id,
        provider=result["provider"],
    )
    return saved
