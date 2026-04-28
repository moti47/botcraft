"""pytest fixtures — shared HTTP client + monkey-patches for offline tests."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# Ensure repo root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Hint: smoke tests run against a real running API at API_URL (default http://localhost:8000)
API_URL = os.environ.get("API_URL", "http://localhost:8000")


@pytest.fixture(scope="session")
def api_url() -> str:
    return API_URL


@pytest.fixture
def httpx_client():
    import httpx
    with httpx.Client(base_url=API_URL, timeout=15) as client:
        yield client
