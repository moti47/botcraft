"""Trend Engine — discovers viral topics per niche and ranks them.

Pipeline:
  1. Pull Google Trends (daily + niche-related rising queries)
  2. Pull YouTube most-popular + niche search by view-count
  3. (Optional) Pull Reddit hot posts in matched subreddits
  4. Merge → score each topic by:
       - cross-source coverage (appears in multiple sources = more viral)
       - velocity (rising > steady)
       - niche fit (LLM judges)
  5. LLM picks the TOP-N most likely to make a viral video for THIS avatar
     given persona, voice, brand, and the avatar's own past performance.
  6. Persist to ``trend_signals`` table for the script generator to pick up.

Used by:
  • n8n trend_hunter workflow (cron, every 4h per niche)
  • POST /chat tool ``find_viral_topic`` (on-demand from chat agent)
  • avatar pipeline before script generation (auto-pick latest signal)
"""
from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from core.llm_router import get_router
from core.logging import get_logger
from core.supabase_client import insert_row, select_rows

from services.providers import google_trends, youtube_trends
from services.providers.base import ProviderError, ProviderUnavailable

logger = get_logger(__name__)


# ----------------------------------------------------------------------
# Step 1-2: pull raw signals from each source
# ----------------------------------------------------------------------
async def _gather_youtube(niche: str) -> list[dict[str, Any]]:
    try:
        result = await youtube_trends.search_niche(niche, days_lookback=7)
        videos = result.raw.get("videos", [])
        return [
            {
                "topic": v["title"],
                "score": min(100.0, (v["views"] or 0) / 100_000),
                "source": "youtube",
                "sample": v,
            }
            for v in videos[:15]
        ]
    except (ProviderError, ProviderUnavailable) as e:
        logger.warning("trend_engine.youtube.skip", error=str(e))
        return []


async def _gather_google(niche: str) -> list[dict[str, Any]]:
    try:
        result = await google_trends.related_for_niche(niche)
        rising = result.raw.get("rising", []) or []
        out = []
        for row in rising[:20]:
            value = row.get("value") or 0
            out.append({
                "topic": row.get("query"),
                "score": min(100.0, float(value) / 50.0) if value else 50.0,
                "source": "google_trends",
                "sample": row,
            })
        return out
    except (ProviderError, ProviderUnavailable) as e:
        logger.warning("trend_engine.google.skip", error=str(e))
        return []


# ----------------------------------------------------------------------
# Step 3: merge (cross-source boost + dedup)
# ----------------------------------------------------------------------
def _merge_signals(*sets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for batch in sets:
        for sig in batch:
            topic = (sig.get("topic") or "").strip().lower()
            if not topic:
                continue
            if topic not in merged:
                merged[topic] = {
                    "topic": sig["topic"],
                    "sources": {sig["source"]},
                    "score": sig["score"],
                    "samples": [sig.get("sample")],
                }
            else:
                m = merged[topic]
                m["sources"].add(sig["source"])
                m["score"] = max(m["score"], sig["score"])
                m["samples"].append(sig.get("sample"))

    rows = []
    for m in merged.values():
        # cross-source boost: +20 per extra source
        m["score"] = min(100.0, m["score"] + (len(m["sources"]) - 1) * 20)
        m["sources"] = sorted(m["sources"])
        rows.append(m)
    rows.sort(key=lambda r: r["score"], reverse=True)
    return rows


# ----------------------------------------------------------------------
# Step 4: LLM ranks for a specific avatar
# ----------------------------------------------------------------------
LLM_SYSTEM = (
    "You are a viral content strategist. Given a list of candidate viral "
    "topics and an avatar's persona DNA, you pick the BEST topics likely "
    "to produce a viral short-form video for THIS specific avatar. "
    "You return strict JSON only."
)

LLM_USER_TPL = """AVATAR PERSONA:
{persona}

NICHE: {niche}
LANGUAGE: {language}

CANDIDATE TOPICS (with raw virality scores 0-100):
{candidates}

PAST WINNERS for this avatar (high-engagement scripts they've made):
{past_winners}

Pick the {top_n} BEST topics for THIS avatar. For each, write a viral hook
(<2s spoken), a recommended angle, and rate fit 0-100.

Return JSON shape EXACTLY:
{{"picks": [
  {{"topic": "str", "score": int, "fit": int,
    "hook": "str (<= 12 words)",
    "angle": "str (one sentence)",
    "hashtags": ["#tag", ...] }},
  ...
]}}
"""


async def rank_for_avatar(
    avatar: dict[str, Any],
    candidates: list[dict[str, Any]],
    *,
    top_n: int = 5,
    language: str = "en",
) -> list[dict[str, Any]]:
    persona = avatar.get("persona_dna") or {}
    persona_str = json.dumps(persona, ensure_ascii=False)[:1500]
    candidate_str = "\n".join(
        f"- {c['topic']} (score={c['score']:.0f}, sources={','.join(c['sources'])})"
        for c in candidates[:25]
    )

    # past winners
    try:
        past = await select_rows(
            "videos",
            filters={"avatar_id": avatar["id"], "status": "ready"},
            order_by="views",
            desc=True,
            limit=5,
        )
        past_winners = "\n".join(
            f"- {v.get('topic', '?')} (views={v.get('views', 0)})" for v in past
        ) or "(none)"
    except Exception:
        past_winners = "(none)"

    user_prompt = LLM_USER_TPL.format(
        persona=persona_str,
        niche=avatar.get("niche", ""),
        language=language,
        candidates=candidate_str,
        past_winners=past_winners,
        top_n=top_n,
    )

    router = get_router()
    raw = await router.complete(
        system=LLM_SYSTEM,
        user=user_prompt,
        temperature=0.6,
        max_tokens=900,
    )
    try:
        # strip code fences if present
        raw = raw.strip().lstrip("`").lstrip("json").strip().rstrip("`")
        parsed = json.loads(raw)
        return parsed.get("picks") or []
    except json.JSONDecodeError:
        logger.warning("trend_engine.rank.parse_fail", raw=raw[:300])
        return []


# ----------------------------------------------------------------------
# Step 5: persist signals
# ----------------------------------------------------------------------
async def persist_signals(niche: str, picks: list[dict[str, Any]]) -> list[str]:
    out_ids: list[str] = []
    expires = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    for p in picks:
        try:
            row = await insert_row(
                "trend_signals",
                {
                    "niche": niche,
                    "source": "merged",
                    "topic": p.get("topic"),
                    "score": p.get("score") or p.get("fit") or 50,
                    "sample_titles": [p.get("topic")],
                    "sample_hooks": [p.get("hook")] if p.get("hook") else [],
                    "sample_hashtags": p.get("hashtags") or [],
                    "raw": p,
                    "expires_at": expires,
                },
            )
            out_ids.append(row.get("id"))
        except Exception as e:
            logger.warning("trend_engine.persist.fail", topic=p.get("topic"), error=str(e))
    return out_ids


# ----------------------------------------------------------------------
# Public entry point
# ----------------------------------------------------------------------
async def discover_for_avatar(
    avatar: dict[str, Any],
    *,
    top_n: int = 5,
    language: str = "en",
) -> dict[str, Any]:
    """End-to-end: pull → merge → rank → persist. Returns top picks."""
    niche = (avatar.get("niche") or "lifestyle").strip()
    started = time.monotonic()

    yt_task = asyncio.create_task(_gather_youtube(niche))
    g_task = asyncio.create_task(_gather_google(niche))
    yt_signals, g_signals = await asyncio.gather(yt_task, g_task)

    merged = _merge_signals(yt_signals, g_signals)
    if not merged:
        logger.warning("trend_engine.no_signals", niche=niche)
        return {"picks": [], "merged_count": 0}

    picks = await rank_for_avatar(avatar, merged, top_n=top_n, language=language)
    if not picks:
        # fall back to top of merged list if LLM failed
        picks = [
            {"topic": m["topic"], "score": int(m["score"]), "fit": 60}
            for m in merged[:top_n]
        ]

    ids = await persist_signals(niche, picks)
    elapsed = int((time.monotonic() - started) * 1000)
    logger.info(
        "trend_engine.discover.ok",
        niche=niche,
        merged=len(merged),
        picks=len(picks),
        elapsed_ms=elapsed,
    )
    return {"picks": picks, "merged_count": len(merged), "signal_ids": ids}
