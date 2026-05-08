"""AI Visual Director — turns a script into a scene-by-scene render plan.

For each beat of the script, the LLM decides:
  • visual_type: avatar_animation | stock_video | ai_image | kinetic_text
                 | code_visualization | lottie | screen_recording
  • clip_query (when visual_type wants stock/ai media)
  • zoom: target zoom factor (1.0 = none, 1.2 = subtle, 1.5 = strong)
  • zoom_direction: in | out | static
  • music_volume: 0.0 - 1.0  (drops while avatar speaks, rises in B-roll)
  • transition: cut | fade | whip_pan | zoom_blur
  • caption_style: none | subtle | kinetic | meme
  • effects: shake|flash|glitch (sparingly)

The Visual Director input is enriched with:
  • avatar.brand_identity (visual_style, color_palette, animation_style,
    avatar_screen_time_pct, transition_pace, preferred_visual_types)
  • learning_facts that say "X works for this avatar"
  • the trend signal angle that inspired the script

Output is the ``visual_director_plan`` JSON saved on the video row.
"""
from __future__ import annotations

import json
from typing import Any

from core.llm_router import get_router
from core.logging import get_logger
from core.supabase_client import select_rows

logger = get_logger(__name__)


SYSTEM_PROMPT = """You are an expert short-form video director (TikTok / Reels / Shorts).
Given a script and an avatar's brand DNA, you decompose the script into 4-9
scenes and decide for EACH scene:

- visual_type: one of [
    "avatar_animation",    // talking-head of the avatar
    "stock_video",         // Pexels/Pixabay B-roll
    "ai_image",            // generated image, panned with Ken Burns
    "kinetic_text",        // animated bold text on color background
    "code_visualization",  // syntax-highlighted code (carbon-style)
    "lottie",              // motion-graphic animation
    "screen_recording"     // demo / UI walkthrough
  ]
- duration_sec (number, 1.5-8)
- text_on_screen (caption, may be empty)
- clip_query (search terms used by stock/AI sources)
- zoom (1.0..1.5)
- zoom_direction ("in"|"out"|"static")
- transition_in ("cut"|"fade"|"whip_pan"|"zoom_blur")
- music_volume (0.0..1.0)
- effect (optional: "shake"|"flash"|"glitch"|null)
- caption_style ("none"|"subtle"|"kinetic"|"meme")

Strict rules:
- The first 1.5s is the HOOK — must be high-energy.
- Avatar screen-time should approximately match ``avatar_screen_time_pct``.
- Use the avatar's ``preferred_visual_types`` more often than others.
- Match transition_pace: slow=>1-2 transitions, medium=>3-5, fast=>6+.
- Music drops to 0.2-0.4 when avatar speaks, rises 0.6-0.9 on B-roll.
- Total duration should match the spoken script length.

Return STRICT JSON only:
{"plan": {
  "total_duration_sec": int,
  "music_genre": "str (echoes brand)",
  "color_grade": "str",
  "scenes": [ <scene>, <scene>, ... ]
}}
"""


USER_TEMPLATE = """SCRIPT (spoken text, in order):
{script}

AVATAR BRAND DNA:
{brand}

PERSONA:
{persona}

LEARNING FACTS to apply (pick the relevant ones):
{learning}

TREND ANGLE inspiring this script:
{trend_angle}

Decompose into scenes and return the JSON plan."""


async def _gather_learning(avatar_id: str, niche: str | None) -> str:
    """Pull active learning facts that should influence directing."""
    rows: list[dict[str, Any]] = []
    try:
        rows.extend(await select_rows(
            "learning_facts",
            filters={"avatar_id": avatar_id, "is_active": True},
            order_by="confidence",
            desc=True,
            limit=10,
        ))
    except Exception:
        pass
    if niche:
        try:
            extra = await select_rows(
                "learning_facts",
                filters={"niche": niche, "scope": "niche", "is_active": True},
                order_by="confidence",
                desc=True,
                limit=5,
            )
            rows.extend(extra)
        except Exception:
            pass
    if not rows:
        return "(no learning facts yet — use general best practices)"
    return "\n".join(
        f"- [{r.get('category')}] {r.get('fact')}  (confidence={r.get('confidence')})"
        for r in rows
    )


async def plan_video(
    *,
    script_text: str,
    avatar: dict[str, Any],
    trend_angle: str | None = None,
) -> dict[str, Any]:
    """Generate the Visual Director plan for a single video."""
    brand = avatar.get("brand_identity") or {}
    persona = avatar.get("persona_dna") or {}
    learning = await _gather_learning(avatar["id"], avatar.get("niche"))

    user = USER_TEMPLATE.format(
        script=script_text,
        brand=json.dumps(brand, ensure_ascii=False)[:1500],
        persona=json.dumps(persona, ensure_ascii=False)[:1200],
        learning=learning,
        trend_angle=trend_angle or "(none — use general viral patterns)",
    )

    router = get_router()
    raw = await router.complete(
        system=SYSTEM_PROMPT,
        user=user,
        temperature=0.75,
        max_tokens=1800,
    )

    plan = _parse_plan(raw)
    if not plan or not plan.get("scenes"):
        # Fallback: minimal plan that still produces a video
        logger.warning("visual_director.fallback_plan", avatar_id=avatar.get("id"))
        plan = _fallback_plan(script_text, brand)

    plan["avatar_id"] = avatar.get("id")
    return plan


def _parse_plan(raw: str) -> dict[str, Any]:
    try:
        text = raw.strip()
        if text.startswith("```"):
            text = text.strip("`").lstrip("json").strip()
        parsed = json.loads(text)
        plan = parsed.get("plan") if "plan" in parsed else parsed
        if not isinstance(plan, dict):
            return {}
        scenes = plan.get("scenes")
        if not isinstance(scenes, list) or not scenes:
            return {}
        # normalize each scene
        for s in scenes:
            s.setdefault("zoom", 1.0)
            s.setdefault("zoom_direction", "static")
            s.setdefault("transition_in", "cut")
            s.setdefault("music_volume", 0.5)
            s.setdefault("caption_style", "subtle")
            s.setdefault("text_on_screen", "")
            s.setdefault("effect", None)
        plan["scenes"] = scenes
        return plan
    except json.JSONDecodeError:
        return {}


def _fallback_plan(script: str, brand: dict[str, Any]) -> dict[str, Any]:
    """Used if the LLM output can't be parsed — produces a single avatar-only scene."""
    return {
        "total_duration_sec": 30,
        "music_genre": brand.get("music_genre") or "upbeat",
        "color_grade": "neutral",
        "scenes": [
            {
                "visual_type": "avatar_animation",
                "duration_sec": 30,
                "text_on_screen": "",
                "zoom": 1.05,
                "zoom_direction": "in",
                "transition_in": "cut",
                "music_volume": 0.3,
                "caption_style": "subtle",
                "effect": None,
                "clip_query": None,
            }
        ],
        "fallback": True,
    }
