"""Learning System — extracts patterns from analytics and feeds them back.

Two responsibilities:

  1. ANALYZE — given a window of recent videos with their performance metrics
     (views, likes, watch_time, comments), find patterns:
       - Which posting hours win?
       - Which hook lengths win?
       - Which visual types win for THIS avatar?
       - Which music genres win?
       - Which script lengths win?

  2. APPLY — convert each pattern into a ``learning_facts`` row that the
     prompts (Trend Engine, Script Generator, Visual Director) automatically
     pick up next time they run.

The system runs nightly per active avatar. It also runs in "global" scope
once a day to compile insights across the entire fleet (which informs
new avatars that don't have data yet).

This is purely a smart layer — if the LLM can't find a real pattern with
adequate confidence, no fact is written, and the prompts keep using
general best practices.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from core.llm_router import get_router
from core.logging import get_logger
from core.supabase_client import insert_row, select_rows, update_row

logger = get_logger(__name__)


SYSTEM_PROMPT = """You analyze short-form video performance data and extract
ATOMIC, ACTIONABLE patterns. You return strict JSON only.

A useful fact is:
- Specific (not "make better content")
- Quantitative when possible ("hooks under 2s outperform 5s+ by ~38%")
- Falsifiable (clearly wrong if untrue)
- Actionable (a script writer or director can change behavior)

You only emit facts you are confident in given the sample size.
"""

USER_TEMPLATE = """AVATAR: {name} (niche: {niche})
WINDOW: last {window_days} days, {n_videos} videos.

VIDEO METRICS (sorted desc by views):
{rows}

VIDEOS' VISUAL DIRECTOR CHOICES summary:
{plans_summary}

Extract up to {max_facts} atomic patterns. For each: a category
(hook|length|posting_time|visual_type|music|cta), a fact text, a confidence
0..1, and an optional metric_delta (e.g. 0.38 for "+38%").

Return JSON:
{{"facts": [
  {{"category": "...", "fact": "...", "confidence": 0.x,
    "metric_delta": 0.x, "evidence": {{...}} }},
  ...
]}}
If nothing rises above weak coincidence, return ``{{"facts": []}}``."""


def _summarize_rows(videos: list[dict[str, Any]]) -> str:
    out = []
    for v in videos[:25]:
        out.append(
            f"- views={v.get('views', 0):,} likes={v.get('likes', 0):,} "
            f"watch={v.get('avg_watch_pct', '?')} dur={v.get('duration_sec', '?')}s "
            f"posted_at={v.get('published_at', '')[:13]} "
            f"hook=\"{(v.get('hook') or v.get('script_text', '')[:80])[:80]}\""
        )
    return "\n".join(out)


def _summarize_plans(videos: list[dict[str, Any]]) -> str:
    visual_counts: dict[str, int] = {}
    music_counts: dict[str, int] = {}
    avg_zoom: list[float] = []
    for v in videos:
        plan = v.get("visual_director_plan") or {}
        for s in plan.get("scenes", []):
            vt = s.get("visual_type") or "?"
            visual_counts[vt] = visual_counts.get(vt, 0) + 1
            if s.get("zoom") is not None:
                avg_zoom.append(float(s["zoom"]))
        if plan.get("music_genre"):
            mg = plan["music_genre"]
            music_counts[mg] = music_counts.get(mg, 0) + 1
    return (
        f"visual_type counts: {visual_counts}\n"
        f"music_genre counts: {music_counts}\n"
        f"avg zoom across scenes: {sum(avg_zoom)/len(avg_zoom):.2f} (n={len(avg_zoom)})"
        if avg_zoom else f"visual_types={visual_counts}, music={music_counts}"
    )


async def _deactivate_stale(avatar_id: str) -> None:
    """Mark previous facts inactive so today's analysis replaces them."""
    try:
        old = await select_rows(
            "learning_facts",
            filters={"avatar_id": avatar_id, "is_active": True},
        )
        for row in old:
            await update_row("learning_facts", row["id"], {"is_active": False})
    except Exception:
        pass


async def analyze_avatar(
    avatar_id: str,
    *,
    window_days: int = 30,
    max_facts: int = 8,
) -> dict[str, Any]:
    """Run the LLM analysis for a single avatar; persist learning facts."""
    avatar = await select_rows("avatars", filters={"id": avatar_id}, limit=1)
    if not avatar:
        return {"facts": [], "reason": "avatar_not_found"}
    avatar = avatar[0]

    since = (datetime.now(timezone.utc) - timedelta(days=window_days)).isoformat()
    videos = await select_rows(
        "videos",
        filters={"avatar_id": avatar_id, "status": "ready"},
        order_by="views",
        desc=True,
        limit=50,
    )
    videos = [v for v in videos if (v.get("rendered_at") or v.get("created_at") or "") >= since]
    if len(videos) < 3:
        logger.info("learning.skip.too_few", avatar_id=avatar_id, n=len(videos))
        return {"facts": [], "reason": "not_enough_data"}

    user = USER_TEMPLATE.format(
        name=avatar.get("name", "?"),
        niche=avatar.get("niche", "?"),
        window_days=window_days,
        n_videos=len(videos),
        rows=_summarize_rows(videos),
        plans_summary=_summarize_plans(videos),
        max_facts=max_facts,
    )
    router = get_router()
    raw = await router.complete(
        system=SYSTEM_PROMPT,
        user=user,
        temperature=0.2,
        max_tokens=1100,
    )

    try:
        text = raw.strip()
        if text.startswith("```"):
            text = text.strip("`").lstrip("json").strip()
        parsed = json.loads(text)
        facts = parsed.get("facts") or []
    except json.JSONDecodeError:
        logger.warning("learning.parse_fail", raw=raw[:300])
        facts = []

    if not facts:
        return {"facts": [], "reason": "no_pattern"}

    # Refresh: deactivate stale, insert new
    await _deactivate_stale(avatar_id)
    inserted_ids: list[str] = []
    for f in facts:
        try:
            row = await insert_row(
                "learning_facts",
                {
                    "avatar_id": avatar_id,
                    "scope": "avatar",
                    "niche": avatar.get("niche"),
                    "category": f.get("category", "hook"),
                    "fact": f.get("fact", "").strip(),
                    "confidence": float(f.get("confidence", 0.5)),
                    "sample_size": len(videos),
                    "metric_delta": f.get("metric_delta"),
                    "evidence": f.get("evidence", {}),
                },
            )
            inserted_ids.append(row.get("id"))
        except Exception as e:
            logger.warning("learning.insert.fail", error=str(e), fact=f.get("fact"))

    logger.info(
        "learning.analyze.ok",
        avatar_id=avatar_id,
        n_videos=len(videos),
        n_facts=len(inserted_ids),
    )
    return {"facts": facts, "ids": inserted_ids, "n_videos": len(videos)}


async def analyze_all_active() -> dict[str, Any]:
    """Run analysis for every active avatar — used by the nightly cron."""
    avatars = await select_rows("avatars", filters={"is_active": True})
    out = {}
    for a in avatars:
        try:
            out[a["id"]] = await analyze_avatar(a["id"])
        except Exception as e:
            logger.warning("learning.batch.fail", avatar_id=a["id"], error=str(e))
            out[a["id"]] = {"facts": [], "reason": f"error: {e}"}
    return out
