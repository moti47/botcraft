from __future__ import annotations

import json
from typing import Any

import redis.asyncio as redis

from core.config import get_settings
from core.logging import get_logger

logger = get_logger(__name__)

_client: redis.Redis | None = None


async def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        settings = get_settings()
        _client = redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        try:
            await _client.ping()
            logger.info("redis.connected", url=settings.redis_url)
        except Exception as exc:
            logger.error("redis.connect_failed", error=str(exc))
            raise
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None


async def enqueue_job(queue: str, payload: dict[str, Any]) -> int:
    r = await get_redis()
    length = await r.lpush(queue, json.dumps(payload, ensure_ascii=False))
    logger.info("redis.enqueued", queue=queue, length=length)
    return int(length)


async def increment_daily_counter(key: str, ttl_seconds: int = 86400) -> int:
    r = await get_redis()
    pipe = r.pipeline()
    pipe.incr(key)
    pipe.expire(key, ttl_seconds)
    result = await pipe.execute()
    return int(result[0])


async def get_counter(key: str) -> int:
    r = await get_redis()
    val = await r.get(key)
    return int(val) if val else 0


# =====================================================================
# Runtime config — Colab URLs נשמרים ב-Redis ולא בקובץ .env
# כך ש-/admin/colab-urls יכול לעדכן בלי restart לקונטיינרים.
# =====================================================================

CONFIG_COLAB_URLS_KEY = "config:colab_urls"


async def get_colab_urls() -> dict[str, str]:
    """מחזיר dict של {tts, image, lipsync} → URL. ערכים חסרים = string ריק."""
    r = await get_redis()
    raw = await r.get(CONFIG_COLAB_URLS_KEY)
    if not raw:
        return {"tts": "", "image": "", "lipsync": ""}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"tts": "", "image": "", "lipsync": ""}


async def set_colab_urls(urls: dict[str, str]) -> dict[str, str]:
    """מעדכן את ה-URLs (merge עם הקיימים)."""
    current = await get_colab_urls()
    current.update({k: v for k, v in urls.items() if v is not None})
    r = await get_redis()
    await r.set(CONFIG_COLAB_URLS_KEY, json.dumps(current))
    logger.info("redis.colab_urls_updated", keys=list(urls.keys()))
    return current


# ----- ניהול error log אחרון לתצוגה ב-/admin/diagnostics -----

ERROR_LOG_KEY = "admin:errors:recent"
ERROR_LOG_LIMIT = 20


async def push_error(message: str, *, source: str = "unknown") -> None:
    """דוחף שגיאה ל-LIFO list ב-Redis. שומר רק 20 אחרונות."""
    r = await get_redis()
    entry = json.dumps({"source": source, "message": message[:500]})
    await r.lpush(ERROR_LOG_KEY, entry)
    await r.ltrim(ERROR_LOG_KEY, 0, ERROR_LOG_LIMIT - 1)


async def get_recent_errors(limit: int = 10) -> list[dict[str, Any]]:
    r = await get_redis()
    raw = await r.lrange(ERROR_LOG_KEY, 0, limit - 1)
    out: list[dict[str, Any]] = []
    for item in raw:
        try:
            out.append(json.loads(item))
        except json.JSONDecodeError:
            out.append({"message": str(item), "source": "unknown"})
    return out


async def get_queue_size(queue: str) -> int:
    r = await get_redis()
    return int(await r.llen(queue))
