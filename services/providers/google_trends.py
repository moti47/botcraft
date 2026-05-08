"""Google Trends provider — daily trending topics per geo/category.

We use the unofficial ``pytrends`` package (HTTP scraping wrapper) because
Google does not publish an official Trends API. It's free and works well
for batch queries we run once a day.

Strategy:
- ``daily_trends(geo='US')`` → top 20 trending searches in the US
- ``related_queries(seed)``   → for each avatar's niche, what queries are
                                rising in that niche
- ``interest_over_time``      → confirm the topic is actually rising not
                                a one-day blip
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

from core.logging import get_logger

from .base import ProviderError, ProviderResult, ProviderUnavailable

logger = get_logger(__name__)


def _import_pytrends():
    try:
        from pytrends.request import TrendReq  # type: ignore[import-not-found]
    except ImportError as e:
        raise ProviderUnavailable(
            "pytrends not installed. Add `pytrends>=4.9.2` to requirements.txt."
        ) from e
    return TrendReq


async def daily_trends(geo: str = "US", *, hl: str = "en-US") -> ProviderResult:
    """Top trending searches today for a geo. Returns rows of dicts."""
    TrendReq = _import_pytrends()
    started = time.monotonic()

    def _call() -> list[dict[str, Any]]:
        pytrends = TrendReq(hl=hl, tz=180, timeout=(10, 25))
        try:
            df = pytrends.trending_searches(pn={"US": "united_states", "IL": "israel"}.get(geo, "united_states"))
        except Exception as e:
            raise ProviderError(f"pytrends trending_searches failed: {e}") from e
        rows = []
        for i, row in enumerate(df.iloc[:, 0].tolist()):
            rows.append({"rank": i + 1, "topic": row})
        return rows

    try:
        rows = await asyncio.to_thread(_call)
    except ProviderError:
        raise
    except Exception as e:
        raise ProviderError(f"google_trends.daily failed: {e}") from e

    elapsed_ms = int((time.monotonic() - started) * 1000)
    logger.info("google_trends.daily.ok", geo=geo, count=len(rows), elapsed_ms=elapsed_ms)
    return ProviderResult(
        duration_ms=elapsed_ms,
        provider="google_trends",
        cost_credits=0.0,
        raw={"trends": rows, "geo": geo},
    )


async def related_for_niche(seed: str, *, geo: str = "US") -> ProviderResult:
    """For an avatar niche (e.g. 'fitness'), return rising related queries."""
    TrendReq = _import_pytrends()
    started = time.monotonic()

    def _call() -> dict[str, Any]:
        pytrends = TrendReq(hl="en-US", tz=180, timeout=(10, 25))
        try:
            pytrends.build_payload([seed], timeframe="now 7-d", geo=geo)
            related = pytrends.related_queries() or {}
        except Exception as e:
            raise ProviderError(f"pytrends related_queries failed: {e}") from e
        seed_data = related.get(seed) or {}
        rising = seed_data.get("rising")
        top = seed_data.get("top")
        rising_rows = rising.to_dict("records") if rising is not None else []
        top_rows = top.to_dict("records") if top is not None else []
        return {"rising": rising_rows, "top": top_rows}

    try:
        data = await asyncio.to_thread(_call)
    except ProviderError:
        raise
    except Exception as e:
        raise ProviderError(f"google_trends.related failed: {e}") from e

    elapsed_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "google_trends.related.ok",
        seed=seed,
        rising=len(data["rising"]),
        elapsed_ms=elapsed_ms,
    )
    return ProviderResult(
        duration_ms=elapsed_ms,
        provider="google_trends",
        cost_credits=0.0,
        raw=data,
    )
