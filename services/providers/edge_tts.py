"""Edge TTS provider — completely free, no API key, unlimited.

Uses the same Microsoft TTS endpoints that power Microsoft Edge's
"Read Aloud" feature. The ``edge-tts`` PyPI package wraps it.

This is the safety-net TTS — if ElevenLabs fails or runs out of credits,
we fall through to here. Quality is lower than ElevenLabs but very usable
for short-form content, supports many languages including Hebrew.

Common voices:
- en-US-AriaNeural (English female)
- en-US-GuyNeural (English male)
- he-IL-AvriNeural (Hebrew male)
- he-IL-HilaNeural (Hebrew female)
"""
from __future__ import annotations

import time

from core.logging import get_logger

from .base import ProviderError, ProviderResult, ProviderUnavailable

logger = get_logger(__name__)

DEFAULT_VOICE_EN = "en-US-AriaNeural"
DEFAULT_VOICE_HE = "he-IL-HilaNeural"


async def synthesize(
    text: str,
    *,
    voice: str | None = None,
    rate: str = "+0%",
    pitch: str = "+0Hz",
    language: str = "en",
) -> ProviderResult:
    """Generate speech using Edge's free TTS endpoint."""
    try:
        import edge_tts  # type: ignore[import-not-found]
    except ImportError as e:
        raise ProviderUnavailable(
            "edge-tts package not installed. Add `edge-tts>=6.1.0` to requirements.txt."
        ) from e

    chosen_voice = voice or (DEFAULT_VOICE_HE if language.startswith("he") else DEFAULT_VOICE_EN)
    started = time.monotonic()
    try:
        communicate = edge_tts.Communicate(text, chosen_voice, rate=rate, pitch=pitch)
        chunks: list[bytes] = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        audio = b"".join(chunks)
    except Exception as e:
        raise ProviderError(f"edge-tts failed: {e}") from e

    elapsed_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "edge_tts.synthesize.ok",
        chars=len(text),
        voice=chosen_voice,
        elapsed_ms=elapsed_ms,
        bytes=len(audio),
    )
    return ProviderResult(
        bytes_inline=audio,
        duration_ms=elapsed_ms,
        provider="edge_tts",
        cost_credits=0.0,  # truly free
        raw={"voice": chosen_voice, "rate": rate, "pitch": pitch},
    )
