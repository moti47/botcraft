"""יצירת אווטאר חדש: persona_dna → portrait → שמירה ב-Supabase.

הזרימה החדשה (לאחר ה-refactor):
  1. ה-LLM יוצר את persona_dna (כמו קודם).
  2. נבנה פרומפט פורטרייט מ-persona_dna.visual_style.
  3. ImageClient (Colab) יוצר את הפרצוף בפועל.
  4. ה-bytes מועלים ל-Cloudflare R2 → URL ציבורי קבוע.
  5. שומרים שורת avatars עם face_url מאוכלס.
  6. מחזירים את האווטאר עם dna וגם face_url.

המטרה: כל הסרטונים העתידיים של אווטאר משתמשים באותה תמונה — character consistency
מובטח כי הפנים נוצרים פעם אחת בלבד ונשמרים כ-URL ציבורי.
"""
from __future__ import annotations

import json
import re
from typing import Any

from core.llm_router import get_router
from core.logging import get_logger
from core.supabase_client import insert_row, update_row
from services.avatar_image import build_portrait_prompt, generate_avatar_face

logger = get_logger(__name__)


SYSTEM_PROMPT = """You are an elite AI persona architect for viral short-form video.
You design deeply detailed "Persona DNA" profiles for virtual influencers.
Always return VALID JSON only, no markdown fences, no commentary."""


# ה-USER_TEMPLATE עודכן כך שה-LLM ייצר גם את השדות שהפרומפט-פורטרייט צריך:
#   age, ethnicity_look, hair, eyes, signature_outfit, backdrop_style.
# שדות אלה נמצאים ב-top-level של ה-DNA כדי שיהיה קל ל-build_portrait_prompt.
USER_TEMPLATE = """Create a complete Persona DNA for a virtual influencer.

Niche: {niche}
Primary language: {language}

Return a JSON object with EXACTLY these keys:
{{
  "name": "str (catchy, 1-3 words)",
  "handle": "str (lowercase, no spaces, @ not included)",
  "niche": "str",
  "language": "str",
  "archetype": "str (mentor / rebel / hero / jester / etc)",
  "age": "str (numeric age, e.g. '27')",
  "age_appearance": "str",
  "gender_presentation": "str",
  "ethnicity_look": "str (e.g. 'mixed mediterranean')",
  "hair": "str (color + style, detailed)",
  "eyes": "str (color + expression)",
  "signature_outfit": "str (one specific outfit they always wear)",
  "backdrop_style": "str (signature backdrop, e.g. 'minimalist concrete loft')",
  "visual_style": {{
    "hair": "str",
    "outfit": "str",
    "setting": "str",
    "color_palette": ["str", "str", "str"]
  }},
  "voice": {{
    "tone": "str",
    "pace": "str",
    "signature_phrases": ["str", "str", "str"]
  }},
  "personality_traits": ["str", "str", "str", "str", "str"],
  "backstory": "str (2-3 sentences)",
  "content_pillars": ["str", "str", "str"],
  "hook_formulas": ["str", "str", "str"],
  "target_audience": "str",
  "posting_cadence": "str"
}}

Output JSON only."""


def _extract_json(text: str) -> dict[str, Any]:
    """חילוץ JSON מתוך תשובת LLM שיכולה להיות עטופה ב-```json``` או טקסט."""
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


async def generate_persona(
    niche: str,
    language: str = "en",
    tone: str | None = None,
    avatar_style: str = "realistic",
) -> dict[str, Any]:
    """יצירת אווטאר חדש — DNA + תמונת פנים, ושמירה לבסיס הנתונים.

    מחזיר את שורת avatars המלאה (כולל id, face_url ו-persona_dna).
    """
    # ----- שלב 1: ה-LLM יוצר את persona_dna -----
    router = get_router()
    tone_hint = f"\nPreferred tone: {tone}" if tone else ""
    user_prompt = USER_TEMPLATE.format(niche=niche, language=language) + tone_hint
    result = await router.complete(
        SYSTEM_PROMPT, user_prompt, temperature=0.9, max_tokens=1600
    )
    dna = _extract_json(result["text"])

    # ----- שלב 2: שמירה ראשונית של השורה כדי לקבל id -----
    # שומרים פעם ראשונה בלי face_url — אנחנו צריכים את ה-id כדי לעלות ל-R2
    # תחת avatars/{id}/face.png. אחרי יצירת התמונה — UPDATE עם ה-URL.
    row = {
        "name": dna.get("name", "Unnamed"),
        "handle": dna.get("handle", ""),
        "niche": niche,
        "language": language,
        "persona_dna": dna,
        "generator_provider": result["provider"],
        "generator_model": result["model"],
        "avatar_style": avatar_style,
        "status": "active",
    }
    saved = await insert_row("avatars", row)
    avatar_id = saved.get("id")
    if not avatar_id:
        # לא צריך להגיע לכאן בפועל — Supabase תמיד מחזיר id
        logger.error("persona.no_id_after_insert")
        return saved

    # ----- שלב 3: יצירת תמונת הפנים -----
    logger.info("persona.face_generation_started", avatar_id=avatar_id)
    face_url, needs_regen = await generate_avatar_face(avatar_id, dna, style=avatar_style)

    # ----- שלב 4: עדכון השורה עם face_url -----
    patch = {
        "face_url": face_url,
        "needs_face_regeneration": needs_regen,
    }
    final = await update_row("avatars", avatar_id, patch)

    logger.info(
        "persona.created",
        avatar_id=avatar_id,
        provider=result["provider"],
        face_url=face_url,
        needs_regen=needs_regen,
    )
    return final or {**saved, **patch}


async def regenerate_avatar_face_for(avatar_id: str, persona_dna: dict[str, Any]) -> dict[str, Any]:
    """יצירת תמונת פנים מחדש עבור אווטאר קיים, ושמירת ה-URL.

    בשימוש על-ידי POST /avatars/{id}/regenerate-image.
    """
    face_url, needs_regen = await generate_avatar_face(avatar_id, persona_dna)
    patch = {
        "face_url": face_url,
        "needs_face_regeneration": needs_regen,
    }
    final = await update_row("avatars", avatar_id, patch)
    logger.info(
        "persona.face_regenerated",
        avatar_id=avatar_id,
        face_url=face_url,
        needs_regen=needs_regen,
    )
    return final or {"id": avatar_id, **patch}
