from __future__ import annotations

import asyncio
from typing import Any

from supabase import Client, create_client

from core.config import get_settings
from core.logging import get_logger

logger = get_logger(__name__)

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        settings = get_settings()
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
        logger.info("supabase.connected", url=settings.supabase_url)
    return _client


async def insert_row(table: str, row: dict[str, Any]) -> dict[str, Any]:
    def _do() -> dict[str, Any]:
        client = get_supabase()
        res = client.table(table).insert(row).execute()
        data = res.data or []
        return data[0] if data else {}

    return await asyncio.to_thread(_do)


async def select_rows(
    table: str,
    *,
    columns: str = "*",
    filters: dict[str, Any] | None = None,
    order_by: str | None = None,
    desc: bool = True,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    def _do() -> list[dict[str, Any]]:
        client = get_supabase()
        q = client.table(table).select(columns)
        if filters:
            for k, v in filters.items():
                q = q.eq(k, v)
        if order_by:
            q = q.order(order_by, desc=desc)
        if limit:
            q = q.limit(limit)
        res = q.execute()
        return list(res.data or [])

    return await asyncio.to_thread(_do)


async def get_row(table: str, row_id: str) -> dict[str, Any] | None:
    rows = await select_rows(table, filters={"id": row_id}, limit=1)
    return rows[0] if rows else None


async def update_row(table: str, row_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    def _do() -> dict[str, Any]:
        client = get_supabase()
        res = client.table(table).update(patch).eq("id", row_id).execute()
        data = res.data or []
        return data[0] if data else {}

    return await asyncio.to_thread(_do)
