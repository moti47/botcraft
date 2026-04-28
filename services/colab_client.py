"""HTTP clients for the three Colab-hosted services (TTS, Image, Lip-sync).

Each notebook exposes itself via a *.trycloudflare.com URL and writes that URL
to a .txt file in Drive. Locally we read those URLs from env vars
(COLAB_TTS_URL / COLAB_IMAGE_URL / COLAB_LIPSYNC_URL).

These clients wrap the HTTP calls with long timeouts (Colab jobs run for
minutes) and raise ColabUnavailable / ColabError in predictable ways.
"""
from __future__ import annotations

from typing import Any

import httpx

from core.config import get_settings
from core.logging import get_logger

logger = get_logger(__name__)


class ColabUnavailable(Exception):
    """The relevant COLAB_*_URL env var is empty."""


class ColabError(Exception):
    """A Colab service returned a non-2xx response or timed out."""


def _require_url(name: str, value: str | None) -> str:
    if not value:
        raise ColabUnavailable(
            f"{name} is not set. Run the notebook, copy the printed "
            f"*.trycloudflare.com URL, and set {name} in .env."
        )
    return value.rstrip("/")


async def _resolve_url(env_kind: str, env_value: str | None) -> str:
    """מחזיר URL לשרת Colab — Redis לפני env, env כ-fallback.

    env_kind ∈ {"tts", "image", "lipsync"}.

    Bug-fix #3 — Colab URLs נשמרים ב-Redis תחת config:colab_urls וניתן
    לעדכן אותם בלי restart דרך POST /admin/colab-urls. אם Redis לא זמין
    או שהשורה ריקה — נופלים ל-env var המקורי.
    """
    try:
        from core.redis_client import get_colab_urls
        urls = await get_colab_urls()
        live = urls.get(env_kind)
        if live:
            return live.rstrip("/")
    except Exception:
        # Redis לא זמין — נפל ל-env
        pass
    return _require_url(f"COLAB_{env_kind.upper()}_URL", env_value)


async def _post_json(base_url: str, path: str, payload: dict[str, Any], *, timeout: float) -> dict[str, Any]:
    url = f"{base_url}{path}"
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as http:
            resp = await http.post(url, json=payload)
    except httpx.HTTPError as exc:
        raise ColabError(f"POST {url} transport error: {exc}") from exc
    if resp.status_code >= 400:
        raise ColabError(f"POST {url} → {resp.status_code}: {resp.text[:400]}")
    return resp.json()


async def _get_json(base_url: str, path: str, *, timeout: float = 30) -> dict[str, Any]:
    url = f"{base_url}{path}"
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as http:
            resp = await http.get(url)
    except httpx.HTTPError as exc:
        raise ColabError(f"GET {url} transport error: {exc}") from exc
    if resp.status_code >= 400:
        raise ColabError(f"GET {url} → {resp.status_code}: {resp.text[:400]}")
    return resp.json()


# ---------------- TTS ----------------

class TTSClient:
    """Talks to 01_tts_server.ipynb (XTTS-v2)."""

    KIND = "tts"

    def __init__(self) -> None:
        self._base: str | None = get_settings().colab_tts_url

    @property
    def base_url(self) -> str:
        # שימוש סינכרוני (download_url, legacy callers) — נופל ל-env בלבד
        return _require_url("COLAB_TTS_URL", self._base)

    async def _live_base(self) -> str:
        # Redis-backed URL (config:colab_urls) → אם ריק, נופל ל-env
        return await _resolve_url(self.KIND, self._base)

    def download_url(self, job_id: str) -> str:
        return f"{self.base_url}/jobs/{job_id}/download"

    async def health(self) -> dict[str, Any]:
        return await _get_json(await self._live_base(), "/health")

    async def synthesize(
        self,
        *,
        job_id: str,
        text: str,
        language: str,
        speaker_wav_filename: str,
        callback_url: str | None = None,
    ) -> dict[str, Any]:
        payload = {
            "job_id": job_id,
            "text": text,
            "language": language,
            "speaker_wav_filename": speaker_wav_filename,
        }
        if callback_url:
            payload["callback_url"] = callback_url
        logger.info("colab.tts.request", job_id=job_id, language=language)
        return await _post_json(await self._live_base(), "/tts", payload, timeout=600)


# ---------------- Image ----------------

class ImageClient:
    """Talks to 02_image_server.ipynb (Pollinations → Flux)."""

    KIND = "image"

    def __init__(self) -> None:
        self._base: str | None = get_settings().colab_image_url

    @property
    def base_url(self) -> str:
        return _require_url("COLAB_IMAGE_URL", self._base)

    async def _live_base(self) -> str:
        return await _resolve_url(self.KIND, self._base)

    def download_url(self, job_id: str) -> str:
        return f"{self.base_url}/jobs/{job_id}/download"

    async def health(self) -> dict[str, Any]:
        return await _get_json(await self._live_base(), "/health")

    async def generate_avatar(
        self,
        *,
        job_id: str,
        prompt: str,
        negative_prompt: str = "",
        width: int = 1080,
        height: int = 1350,
        seed: int = 42,
    ) -> dict[str, Any]:
        payload = {
            "job_id": job_id,
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "width": width,
            "height": height,
            "seed": seed,
        }
        logger.info("colab.image.request", job_id=job_id, w=width, h=height)
        return await _post_json(
            await self._live_base(), "/generate-avatar", payload, timeout=300,
        )

    async def generate_thumbnail(
        self,
        *,
        job_id: str,
        background_image_path: str,
        text: str,
        text_color: str = "#FFFFFF",
        stroke_color: str = "#000000",
    ) -> dict[str, Any]:
        payload = {
            "job_id": job_id,
            "background_image_path": background_image_path,
            "text": text,
            "text_color": text_color,
            "stroke_color": stroke_color,
        }
        logger.info("colab.image.thumb_request", job_id=job_id)
        return await _post_json(
            await self._live_base(), "/generate-thumbnail", payload, timeout=120,
        )


# ---------------- Lip-sync ----------------

class LipsyncClient:
    """Talks to 03_lipsync_server.ipynb (Wav2Lip)."""

    KIND = "lipsync"

    def __init__(self) -> None:
        self._base: str | None = get_settings().colab_lipsync_url

    @property
    def base_url(self) -> str:
        return _require_url("COLAB_LIPSYNC_URL", self._base)

    async def _live_base(self) -> str:
        return await _resolve_url(self.KIND, self._base)

    def download_url(self, job_id: str) -> str:
        return f"{self.base_url}/jobs/{job_id}/download"

    async def health(self) -> dict[str, Any]:
        return await _get_json(await self._live_base(), "/health")

    async def lipsync(
        self,
        *,
        job_id: str,
        face_image_url: str,
        audio_url: str,
        callback_url: str | None = None,
    ) -> dict[str, Any]:
        payload = {
            "job_id": job_id,
            "face_image_url": face_image_url,
            "audio_url": audio_url,
        }
        if callback_url:
            payload["callback_url"] = callback_url
        logger.info("colab.lipsync.request", job_id=job_id)
        # Wav2Lip + ffmpeg post-process can take several minutes
        return await _post_json(
            await self._live_base(), "/lipsync", payload, timeout=1200,
        )
