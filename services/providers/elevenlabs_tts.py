"""ElevenLabs TTS provider — free tier: 10,000 chars/month.

Why ElevenLabs first:
- Highest quality voices, supports voice cloning.
- Multilingual (Hebrew + English in the same model).
- Free tier 10k chars/month is enough for ~30-50 short videos.

If the free tier is exhausted, ``elevenlabs_tts.synthesize`` raises
``ProviderError`` and the orchestrator falls through to ``edge_tts`` (free,
unlimited via Microsoft Edge's hidden TTS endpoint) or ``fal_tts``.
"""
from __future__ import annotations

import time
from typing import Any

import httpx

from core.config import get_settings
from core.logging import get_logger

from .base import ProviderError, ProviderResult, ProviderUnavailable

logger = get_logger(__name__)

ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

# Default voices that work well across languages (multilingual_v2)
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # "Rachel" — neutral female English
DEFAULT_MODEL = "eleven_multilingual_v2"


async def synthesize(
    text: str,
    *,
    voice_id: str | None = None,
    model: str | None = None,
    stability: float = 0.5,
    similarity: float = 0.75,
    style: float = 0.0,
    timeout: float = 60.0,
) -> ProviderResult:
    """Generate speech audio from text. Returns MP3 bytes inline.

    The orchestrator uploads the bytes to R2 immediately so callers don't
    need to keep them in memory.
    """
    settings = get_settings()
    api_key = getattr(settings, "elevenlabs_api_key", None)
    if not api_key:
        raise ProviderUnavailable("ELEVENLABS_API_KEY not set")

    voice = voice_id or DEFAULT_VOICE_ID
    body = {
        "text": text,
        "model_id": model or DEFAULT_MODEL,
        "voice_settings": {
            "stability": stability,
            "similarity_boost": similarity,
            "style": style,
            "use_speaker_boost": True,
        },
    }
    headers = {
        "xi-api-key": api_key,
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
    }
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(ENDPOINT.format(voice_id=voice), json=body, headers=headers)
        if r.status_code != 200:
            raise ProviderError(f"ElevenLabs returned {r.status_code}: {r.text[:200]}")
    except httpx.HTTPError as e:
        raise ProviderError(f"ElevenLabs HTTP error: {e}") from e

    elapsed_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "elevenlabs.synthesize.ok",
        chars=len(text),
        voice=voice,
        elapsed_ms=elapsed_ms,
    )
    return ProviderResult(
        bytes_inline=r.content,
        duration_ms=elapsed_ms,
        provider="elevenlabs",
        cost_credits=len(text),  # 1 credit ~ 1 char on free tier
        raw={"voice_id": voice, "content_type": r.headers.get("content-type")},
    )
