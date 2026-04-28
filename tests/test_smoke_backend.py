"""Smoke tests against a running FastAPI instance.

Run with:
    pytest tests/test_smoke_backend.py -m smoke -v
    # API_URL=http://localhost:8000 by default

These hit the real API + Supabase + Redis. They're idempotent: each test creates
its own avatar, then cleans up afterwards.
"""
from __future__ import annotations

import json
import time
import uuid

import pytest

pytestmark = pytest.mark.smoke


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_avatar(client) -> dict:
    payload = {
        "niche": f"smoke-test-{uuid.uuid4().hex[:6]}",
        "language": "en",
        "tone": "casual",
        "avatar_style": "realistic",
    }
    r = client.post("/avatars/create", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def _delete_avatar(client, avatar_id: str) -> None:
    client.delete(f"/avatars/{avatar_id}")


# ---------------------------------------------------------------------------
# 1. health
# ---------------------------------------------------------------------------

def test_health_endpoint(httpx_client):
    r = httpx_client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in ("ok", "degraded")
    assert "redis" in body
    assert "supabase" in body


# ---------------------------------------------------------------------------
# 2. avatar create + list + delete
# ---------------------------------------------------------------------------

def test_create_avatar(httpx_client):
    avatar = _create_avatar(httpx_client)
    try:
        assert avatar.get("id")
        assert avatar.get("niche", "").startswith("smoke-test-")
    finally:
        _delete_avatar(httpx_client, avatar["id"])


def test_avatars_list_includes_created(httpx_client):
    avatar = _create_avatar(httpx_client)
    try:
        r = httpx_client.get("/avatars")
        assert r.status_code == 200
        ids = [a["id"] for a in r.json()]
        assert avatar["id"] in ids
    finally:
        _delete_avatar(httpx_client, avatar["id"])


# ---------------------------------------------------------------------------
# 3. platform tokens
# ---------------------------------------------------------------------------

def test_platform_token_connect(httpx_client):
    avatar = _create_avatar(httpx_client)
    try:
        r = httpx_client.post(
            f"/avatars/{avatar['id']}/platforms/connect",
            json={
                "platform": "youtube",
                "access_token": "fake-token-for-smoke-test",
                "refresh_token": "fake-refresh",
                "is_active": True,
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["platform"] == "youtube"
        assert body["is_active"] is True

        list_r = httpx_client.get(f"/avatars/{avatar['id']}/platforms")
        assert list_r.status_code == 200
        assert any(p["platform"] == "youtube" for p in list_r.json())
    finally:
        _delete_avatar(httpx_client, avatar["id"])


# ---------------------------------------------------------------------------
# 4. notifications + SSE
# ---------------------------------------------------------------------------

def test_notifications_list_endpoint(httpx_client):
    r = httpx_client.get("/notifications", params={"limit": 5})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_notifications_unread_count(httpx_client):
    r = httpx_client.get("/notifications/unread-count")
    assert r.status_code == 200
    assert "count" in r.json()


def test_sse_connection_opens(httpx_client):
    """We just confirm the stream returns an event-stream content type and the
    'connected' frame is emitted within ~3s."""
    import httpx
    with httpx.stream("GET", f"{httpx_client.base_url}/notifications/stream", timeout=5) as r:
        assert r.status_code == 200
        assert "event-stream" in r.headers.get("content-type", "")
        # Read just the first SSE frame
        for chunk in r.iter_lines():
            if chunk:
                assert "connected" in chunk or "ping" in chunk or chunk.startswith("data:")
                break


# ---------------------------------------------------------------------------
# 5. chat agent + tool execution
# ---------------------------------------------------------------------------

def test_chat_send_simple_question(httpx_client):
    """Plain hello — should not trigger any tool, just a reply."""
    r = httpx_client.post("/chat", json={"message": "hi"}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "reply" in body
    assert isinstance(body.get("actions_taken", []), list)


def test_chat_list_avatars_tool(httpx_client):
    """Asking the agent to list avatars should invoke the tool."""
    r = httpx_client.post(
        "/chat",
        json={"message": "list all my avatars"},
        timeout=30,
    )
    assert r.status_code == 200
    body = r.json()
    # The agent should have either invoked list_avatars OR replied with the list inline
    actions = body.get("actions_taken", [])
    if actions:
        assert any(a.get("tool") == "list_avatars" for a in actions)


# ---------------------------------------------------------------------------
# 6. ideas CRUD
# ---------------------------------------------------------------------------

def test_ideas_crud(httpx_client):
    avatar = _create_avatar(httpx_client)
    try:
        # Create
        r = httpx_client.post(
            f"/avatars/{avatar['id']}/ideas",
            json={"topic": "smoke test idea", "notes": "just a smoke test"},
        )
        assert r.status_code in (200, 201), r.text
        idea = r.json()
        assert idea.get("topic") == "smoke test idea"
        idea_id = idea["id"]

        # List
        list_r = httpx_client.get(f"/avatars/{avatar['id']}/ideas")
        assert list_r.status_code == 200
        assert any(i["id"] == idea_id for i in list_r.json())

        # Delete
        del_r = httpx_client.delete(f"/avatars/{avatar['id']}/ideas/{idea_id}")
        assert del_r.status_code in (200, 204)
    finally:
        _delete_avatar(httpx_client, avatar["id"])


# ---------------------------------------------------------------------------
# 7. duplicate avatar
# ---------------------------------------------------------------------------

def test_duplicate_avatar(httpx_client):
    src = _create_avatar(httpx_client)
    dup_id = None
    try:
        r = httpx_client.post(
            f"/avatars/{src['id']}/duplicate",
            json={"name": "smoke-dup", "language": "en"},
        )
        assert r.status_code in (200, 201), r.text
        dup = r.json()
        assert dup.get("id") and dup["id"] != src["id"]
        assert dup.get("name") == "smoke-dup"
        dup_id = dup["id"]
    finally:
        _delete_avatar(httpx_client, src["id"])
        if dup_id:
            _delete_avatar(httpx_client, dup_id)
