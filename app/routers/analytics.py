"""Analytics summary endpoint for the dashboard."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Query

from core.logging import get_logger
from core.supabase_client import select_rows

logger = get_logger(__name__)
router = APIRouter(prefix="/analytics", tags=["analytics"])


def _parse_dt(v: Any) -> datetime | None:
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        return None


@router.get("/summary")
async def summary(days: int = Query(7, ge=1, le=3650)) -> dict[str, Any]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    try:
        videos = await select_rows("videos") or []
    except Exception:
        videos = []
    try:
        posts = await select_rows("posts") or []
    except Exception:
        posts = []
    try:
        avatars = await select_rows("avatars") or []
    except Exception:
        avatars = []

    avatars_by_id = {a.get("id"): a for a in avatars}

    in_window_videos = [v for v in videos if (_parse_dt(v.get("created_at")) or cutoff) >= cutoff]
    in_window_posts = [p for p in posts if (_parse_dt(p.get("created_at")) or cutoff) >= cutoff]

    daily_videos_counter: dict[str, int] = defaultdict(int)
    daily_score_counter: dict[str, list[float]] = defaultdict(list)
    for v in in_window_videos:
        dt = _parse_dt(v.get("created_at"))
        if not dt:
            continue
        key = dt.strftime("%Y-%m-%d")
        daily_videos_counter[key] += 1
        score = v.get("viral_score")
        if isinstance(score, (int, float)):
            daily_score_counter[key].append(float(score))

    daily_videos = [{"date": k, "count": v} for k, v in sorted(daily_videos_counter.items())]
    daily_score = [
        {"date": k, "score": round(sum(vs) / len(vs), 1)}
        for k, vs in sorted(daily_score_counter.items())
    ]

    platform_counter: dict[str, int] = defaultdict(int)
    for p in in_window_posts:
        platform_counter[p.get("platform", "unknown")] += 1
    platform_posts = [{"platform": k, "count": v} for k, v in sorted(platform_counter.items())]
    total_posts_window = sum(platform_counter.values()) or 1
    platform_distribution = [
        {"name": k, "value": round(v * 100 / total_posts_window, 1)}
        for k, v in sorted(platform_counter.items())
    ]

    avatar_stats: dict[str, dict[str, Any]] = {}
    for v in videos:
        aid = v.get("avatar_id")
        if not aid:
            continue
        s = avatar_stats.setdefault(aid, {"id": aid, "videos": 0, "posts": 0, "scores": [], "best_post": None, "best_score": -1})
        s["videos"] += 1
        score = v.get("viral_score")
        if isinstance(score, (int, float)):
            s["scores"].append(float(score))
            if score > s["best_score"]:
                s["best_score"] = score
                s["best_post"] = v.get("topic")
    for p in posts:
        aid = p.get("avatar_id")
        if aid in avatar_stats:
            avatar_stats[aid]["posts"] += 1

    avatars_performance = []
    for aid, s in avatar_stats.items():
        scores = s.pop("scores")
        s.pop("best_score", None)
        s["avg_score"] = round(sum(scores) / len(scores), 1) if scores else 0
        s["name"] = avatars_by_id.get(aid, {}).get("name", "Unknown")
        avatars_performance.append(s)
    avatars_performance.sort(key=lambda x: x["avg_score"], reverse=True)

    top_videos = sorted(
        [v for v in videos if isinstance(v.get("viral_score"), (int, float))],
        key=lambda v: v.get("viral_score", 0),
        reverse=True,
    )[:5]
    for v in top_videos:
        v["avatar_name"] = avatars_by_id.get(v.get("avatar_id"), {}).get("name", "Unknown")

    avg_score_overall = (
        round(sum(s["avg_score"] for s in avatars_performance) / len(avatars_performance), 1)
        if avatars_performance else 0
    )

    return {
        "summary": {
            "videos_count": len(in_window_videos),
            "posts_count": len(in_window_posts),
            "avg_score": avg_score_overall,
            "active_avatars": sum(1 for a in avatars if a.get("status") == "active"),
        },
        "daily_videos": daily_videos,
        "daily_score": daily_score,
        "platform_posts": platform_posts,
        "platform_distribution": platform_distribution,
        "avatars_performance": avatars_performance,
        "top_videos": top_videos,
    }
