"""Voice/style consistency checker.

Runs an LLM-graded comparison of a generated script against an avatar's
persona_dna. If the alignment score drops below `WARNING_THRESHOLD`, fires a
warning notification suggesting a revision.

Best-effort — never blocks the pipeline. Called from `video_orchestrator`
right after script generation, before TTS.
"""
from __future__ import annotations

import json
import re
from typing import Any

from core.llm_router import AllProvidersFailed, get_router
from core.logging import get_logger
from core.notify import notify
from core.supabase_client import insert_row

logger = get_logger(__name__)

WARNING_THRESHOLD = 0.55  # below this we warn the user
SYSTEM_PROMPT = """You grade how well a script matches an AI influencer's persona.

Compare the SCRIPT against the PERSONA_DNA. Return STRICT JSON:

{
  "score": <float 0..1>,                    // 0 = totally off, 1 = perfect
  "issues": ["..."],                         // short bullet points; empty list if none
  "suggestion": "<one-sentence revision hint or empty string>"
}

Rules:
- Score >= 0.7 means the script is on-brand.
- Score 0.55..0.69 means minor drift — list 1-2 specific issues.
- Score < 0.55 means significant drift — list 3+ issues.
- Reply ONLY with the JSON object. No markdown, no preamble.
"""


def _extract_json(text: str) -> dict[str, Any]:
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
    return {"score": 0.7, "issues": [], "suggestion": ""}


async def check_script_consistency(
    *,
    avatar_id: str,
    persona_dna: dict[str, Any],
    script_text: str,
    video_id: str | None = None,
) -> dict[str, Any]:
    """Returns a dict with score, issues, suggestion. Never raises."""
    if not script_text or not persona_dna:
        return {"score": 1.0, "issues": [], "suggestion": ""}

    user_msg = (
        "PERSONA_DNA:\n"
        + json.dumps(persona_dna, ensure_ascii=False, indent=2)[:3000]
        + "\n\nSCRIPT:\n"
        + script_text[:3000]
    )

    try:
        llm = get_router()
        result = await llm.complete(SYSTEM_PROMPT, user_msg, temperature=0.2, max_tokens=400)
    except AllProvidersFailed:
        logger.warning("consistency.llm_unavailable", avatar_id=avatar_id)
        return {"score": 0.7, "issues": [], "suggestion": ""}
    except Exception as exc:
        logger.warning("consistency.llm_error", avatar_id=avatar_id, error=str(exc))
        return {"score": 0.7, "issues": [], "suggestion": ""}

    parsed = _extract_json(result.get("text", ""))
    try:
        score = float(parsed.get("score", 0.7))
    except (TypeError, ValueError):
        score = 0.7
    score = max(0.0, min(1.0, score))
    issues = parsed.get("issues") or []
    suggestion = parsed.get("suggestion") or ""

    # Persist (best effort)
    try:
        await insert_row("script_consistency_checks", {
            "video_id": video_id,
            "avatar_id": avatar_id,
            "score": score,
            "issues": issues,
            "suggestion": suggestion,
        })
    except Exception:
        pass

    if score < WARNING_THRESHOLD:
        await notify(
            title="Script drifted from persona",
            message=f"Score: {score:.2f}\nIssues: {'; '.join(issues[:3])}\nSuggestion: {suggestion[:200]}",
            level="warning",
            type_="consistency_drift",
            avatar_id=avatar_id,
            payload={"video_id": video_id, "score": score, "issues": issues, "suggestion": suggestion},
        )

    logger.info("consistency.checked", avatar_id=avatar_id, video_id=video_id, score=round(score, 2))
    return {"score": score, "issues": issues, "suggestion": suggestion}
