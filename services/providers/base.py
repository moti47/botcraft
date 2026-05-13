"""Common base for provider modules — TTS, image, lipsync, music, assembly."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


class ProviderUnavailable(Exception):
    """The provider is not configured (missing API key) — try the next one."""


class ProviderError(Exception):
    """The provider returned an error response or timed out."""


@dataclass
class ProviderResult:
    """Uniform shape returned by every media provider."""

    url: str | None = None
    bytes_inline: bytes | None = None
    duration_ms: int = 0
    provider: str = ""
    cost_credits: float = 0.0
    raw: dict[str, Any] = field(default_factory=dict)
