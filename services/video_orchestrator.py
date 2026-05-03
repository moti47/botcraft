"""End-to-end video production pipeline.

Two orchestration surfaces live in this module:

1. ``produce_video`` — the ORIGINAL function-based flow. It expects a script
   row to already exist in Supabase and requires an explicit
   ``voice_ref_filename`` (an XTTS-v2 reference WAV). Used by the legacy
   Redis worker (``services/video_worker.py``) and kept for backwards
   compatibility with ``POST /videos/queue``.

2. ``VideoOrchestrator`` — the NEW class-based pipeline. Takes just
   ``avatar_id`` + ``topic`` and runs the full chain:
       avatar → script (via llm_router) → TTS → image → lip-sync.
   Status transitions on the ``videos`` row are:
       queued → script_ready → tts_done → lipsync_done → ready
   Used by ``POST /videos/produce`` (BackgroundTasks) and the standalone
   ``tasks/video_worker.py`` process.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from core.config import get_settings
from core.logging import get_logger
from core.notify import notify_video_failure
from core.supabase_client import get_row, insert_row, select_rows, update_row
from services.colab_client import (
    ColabError,
    ColabUnavailable,
    ImageClient,
    LipsyncClient,
    TTSClient,
)
from services.script_generator import generate_script

logger = get_logger(__name__)


class OrchestratorError(Exception):
    pass


# =====================================================================
# Shared helpers
# =====================================================================

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_voiceover_text(script_jsonb: dict[str, Any]) -> str:
    """Concatenate beat voiceovers into one TTS string.

    Falls back to ``hook + cta`` if the script has no beats.
    """
    beats = script_jsonb.get("beats") or []
    parts: list[str] = []
    for b in beats:
        line = (b.get("voiceover") or "").strip()
        if line:
            parts.append(line)
    if parts:
        return " ".join(parts)
    fallback = " ".join(
        s for s in (script_jsonb.get("hook"), script_jsonb.get("cta")) if s
    )
    if not fallback:
        raise OrchestratorError("script has no voiceover text (no beats, no hook/cta)")
    return fallback


def _build_portrait_prompt(persona_dna: dict[str, Any]) -> str:
    """Compose a detailed portrait prompt from the persona's visual_style."""
    vs = persona_dna.get("visual_style") or {}
    parts = [
        "professional cinematic portrait, centered on face, eye-level shot",
        f"subject: {persona_dna.get('age_appearance', 'young adult')}",
        f"gender: {persona_dna.get('gender_presentation', 'neutral')}",
    ]
    if vs.get("hair"):
        parts.append(f"hair: {vs['hair']}")
    if vs.get("outfit"):
        parts.append(f"wearing: {vs['outfit']}")
    if vs.get("setting"):
        parts.append(f"setting: {vs['setting']}")
    palette = vs.get("color_palette") or []
    if palette:
        parts.append("color palette: " + ", ".join(palette))
    parts.append(
        "ultra detailed, 4k, soft rim lighting, neutral expression with "
        "slight smile, photographic, shallow depth of field"
    )
    return ", ".join(parts)


DEFAULT_NEGATIVE = (
    "low quality, blurry, deformed, extra limbs, watermark, text, "
    "logo, poorly drawn hands, duplicate, nude"
)


# =====================================================================
# Legacy function-based pipeline (kept for the existing Redis queue flow)
# =====================================================================

async def produce_video(
    *,
    script_id: str,
    voice_ref_filename: str,
    avatar_id: str | None = None,
    priority: int = 5,
    render_options: dict[str, Any] | None = None,
    portrait_prompt_override: str | None = None,
    existing_job_id: str | None = None,
) -> dict[str, Any]:
    """Legacy 3-stage pipeline driven by a pre-existing script row."""
    render_options = render_options or {}
    job_id = existing_job_id or str(uuid.uuid4())

    script_row = await get_row("scripts", script_id)
    if not script_row:
        raise OrchestratorError(f"script {script_id} not found")
    script_jsonb = script_row.get("script") or {}
    language = script_row.get("language") or "en"

    resolved_avatar_id = avatar_id or script_row.get("avatar_id")
    if not resolved_avatar_id:
        raise OrchestratorError("no avatar_id on script or request")
    avatar_row = await get_row("avatars", resolved_avatar_id)
    if not avatar_row:
        raise OrchestratorError(f"avatar {resolved_avatar_id} not found")
    persona_dna = avatar_row.get("persona_dna") or {}

    video_row = {
        "job_id": job_id,
        "script_id": script_id,
        "avatar_id": resolved_avatar_id,
        "priority": priority,
        "render_options": render_options,
        "status": "in_progress",
    }
    saved = await insert_row("videos", video_row)
    video_db_id = saved.get("id")

    image_client = ImageClient()
    tts_client = TTSClient()
    lipsync_client = LipsyncClient()

    portrait_prompt = portrait_prompt_override or _build_portrait_prompt(persona_dna)
    face_job_id = f"{job_id}_face"
    try:
        image_res = await image_client.generate_avatar(
            job_id=face_job_id,
            prompt=portrait_prompt,
            negative_prompt=render_options.get("negative_prompt", DEFAULT_NEGATIVE),
            width=render_options.get("portrait_width", 1080),
            height=render_options.get("portrait_height", 1350),
            seed=render_options.get("seed", 42),
        )
        face_url = image_client.download_url(face_job_id)
        if video_db_id:
            await update_row("videos", video_db_id, {
                "face_url": face_url,
                "thumbnail_url": face_url,
            })
        logger.info("orchestrator.image_done", job_id=job_id, provider=image_res.get("provider"))
    except (ColabUnavailable, ColabError) as exc:
        if video_db_id:
            await update_row("videos", video_db_id, {
                "status": "failed",
                "error_message": f"image stage: {exc}",
            })
        raise OrchestratorError(f"image stage failed: {exc}") from exc

    voiceover_text = _extract_voiceover_text(script_jsonb)
    voice_job_id = f"{job_id}_voice"
    try:
        tts_res = await tts_client.synthesize(
            job_id=voice_job_id,
            text=voiceover_text,
            language=language,
            speaker_wav_filename=voice_ref_filename,
        )
        audio_url = tts_client.download_url(voice_job_id)
        if video_db_id:
            await update_row("videos", video_db_id, {"audio_url": audio_url})
        logger.info("orchestrator.tts_done", job_id=job_id, bytes=tts_res.get("size_bytes"))
    except (ColabUnavailable, ColabError) as exc:
        if video_db_id:
            await update_row("videos", video_db_id, {
                "status": "failed",
                "error_message": f"tts stage: {exc}",
            })
        raise OrchestratorError(f"tts stage failed: {exc}") from exc

    try:
        ls_res = await lipsync_client.lipsync(
            job_id=job_id,
            face_image_url=face_url,
            audio_url=audio_url,
        )
        final_path = ls_res.get("path")
        final_download = lipsync_client.download_url(job_id)
        logger.info("orchestrator.lipsync_done", job_id=job_id, bytes=ls_res.get("size_bytes"))
    except (ColabUnavailable, ColabError) as exc:
        if video_db_id:
            await update_row("videos", video_db_id, {
                "status": "failed",
                "error_message": f"lipsync stage: {exc}",
            })
        raise OrchestratorError(f"lipsync stage failed: {exc}") from exc

    patch = {
        "status": "done",
        "video_url": final_download,
        "final_path": final_path,
        "render_options": {
            **render_options,
            "voice_ref_filename": voice_ref_filename,
            "portrait_prompt": portrait_prompt,
        },
    }
    if video_db_id:
        final_row = await update_row("videos", video_db_id, patch)
    else:
        final_row = {**saved, **patch}
    logger.info("orchestrator.done", job_id=job_id, video_id=video_db_id)
    return final_row


# =====================================================================
# New class-based pipeline (avatar_id + topic → full video)
# =====================================================================

# ----- מיפוי סטטוסים עבור צינור הייצור החדש -----
# queued        → העבודה נוספה לתור, עדיין לא התחילה
# script_ready  → ה-LLM יצר סקריפט ושמר ב-Supabase
# tts_done      → שרת ה-TTS יצר קובץ אודיו
# image_done    → שרת התמונות יצר דמות (או הוחזר face קיים)
# lipsync_done  → סרטון הליפ-סינק מוכן אך עדיין לא גמרנו (post-processing)
# ready         → הכל הסתיים בהצלחה, video_url מלא בזמינה
# failed        → שגיאה בשלב כלשהו; error_message מתאר מה קרה

STATUS_QUEUED = "queued"
STATUS_SCRIPT_READY = "script_ready"
STATUS_TTS_DONE = "tts_done"
STATUS_IMAGE_DONE = "image_done"
STATUS_LIPSYNC_DONE = "lipsync_done"
STATUS_READY = "ready"
STATUS_FAILED = "failed"


# ----- timeouts לכל שלב ב-pipeline (שניות) -----
# אם שלב מסוים חורג מהזמן הזה — הסרטון מסומן כ-failed עם stage_name+"_timeout"
STAGE_TIMEOUTS: dict[str, int] = {
    "script": 60,
    "tts": 300,
    "image": 180,
    "lipsync": 900,
}


class VideoOrchestrator:
    """Class-based full pipeline: avatar_id + topic → rendered talking-head video."""

    def __init__(self) -> None:
        settings = get_settings()
        self._tts_url = (settings.colab_tts_url or "").rstrip("/")
        self._image_url = (settings.colab_image_url or "").rstrip("/")
        self._lipsync_url = (settings.colab_lipsync_url or "").rstrip("/")
        self._tts_client = TTSClient()
        self._image_client = ImageClient()
        self._lipsync_client = LipsyncClient()

    # ------------------------------------------------------------------
    # DB helpers — track pipeline stage + timestamps on the videos row
    # ------------------------------------------------------------------

    async def _stamp(
        self,
        video_db_id: str,
        *,
        status: str,
        extra: dict[str, Any] | None = None,
    ) -> None:
        """Update videos row with a new status and append a timestamp.

        Timestamps are stored inside ``render_options.stages`` so we don't
        need another DB migration just for stage-level observability.
        """
        # שלב: שליפת השורה הנוכחית כדי למזג את ה-stages הקיימים
        current = await get_row("videos", video_db_id)
        render_options = (current or {}).get("render_options") or {}
        stages = dict(render_options.get("stages") or {})
        stages[status] = _now_iso()
        render_options["stages"] = stages

        patch: dict[str, Any] = {
            "status": status,
            "render_options": render_options,
        }
        if extra:
            patch.update(extra)
        await update_row("videos", video_db_id, patch)
        logger.info("orchestrator.stage", video_id=video_db_id, status=status)

    # ------------------------------------------------------------------
    # Colab server callers
    # ------------------------------------------------------------------

    async def _wait_for_job(
        self,
        server_url: str,
        job_id: str,
        timeout_sec: int = 300,
    ) -> str:
        """Poll ``GET {server_url}/jobs/{job_id}`` every 5s until done.

        Returns the download URL once the server reports ``status=="done"``.
        Raises ``TimeoutError`` after ``timeout_sec``.
        Raises ``OrchestratorError`` if the server reports failure.
        """
        if not server_url:
            raise ColabUnavailable("server_url is empty — set the matching COLAB_*_URL")

        base = server_url.rstrip("/")
        deadline = timeout_sec
        elapsed = 0
        poll_interval = 5

        # לולאת polling: שואלים את השרת כל 5 שניות עד שהג'וב מסתיים
        while elapsed < deadline:
            try:
                async with httpx.AsyncClient(timeout=30, follow_redirects=True) as http:
                    resp = await http.get(f"{base}/jobs/{job_id}")
            except httpx.HTTPError as exc:
                logger.warning(
                    "orchestrator.poll_transport_error",
                    job_id=job_id, error=str(exc),
                )
                await asyncio.sleep(poll_interval)
                elapsed += poll_interval
                continue

            if resp.status_code == 404:
                # הג'וב עדיין לא נרשם אצל השרת — נמתין ונמשיך
                await asyncio.sleep(poll_interval)
                elapsed += poll_interval
                continue

            if resp.status_code >= 400:
                raise OrchestratorError(
                    f"poll {base}/jobs/{job_id} → {resp.status_code}: {resp.text[:200]}"
                )

            data = resp.json()
            status = (data.get("status") or "").lower()
            if status in ("done", "complete", "completed", "success", "ready"):
                return data.get("url") or f"{base}/jobs/{job_id}/download"
            if status in ("failed", "error"):
                raise OrchestratorError(
                    f"job {job_id} failed on {base}: {data.get('error') or data}"
                )

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        raise TimeoutError(f"job {job_id} timed out after {timeout_sec}s on {base}")

    async def _call_tts(self, job_id: str, text: str, voice: str) -> str:
        """POST to ``COLAB_TTS_URL/tts``, return audio download URL."""
        if not self._tts_url:
            raise ColabUnavailable("COLAB_TTS_URL is not set")
        # מעבירים גם voice (שם פריסט כמו af_bella) וגם speaker_wav_filename לצורך תאימות
        payload = {
            "job_id": job_id,
            "text": text,
            "voice": voice,
            "speaker_wav_filename": voice if voice.endswith(".wav") else f"{voice}.wav",
            "language": "en",
        }
        logger.info("orchestrator.tts.request", job_id=job_id, voice=voice)
        try:
            async with httpx.AsyncClient(timeout=600, follow_redirects=True) as http:
                resp = await http.post(f"{self._tts_url}/tts", json=payload)
        except httpx.HTTPError as exc:
            raise ColabError(f"TTS transport error: {exc}") from exc
        if resp.status_code >= 400:
            raise ColabError(f"TTS {self._tts_url}/tts → {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        return data.get("url") or f"{self._tts_url}/jobs/{job_id}/download"

    async def _call_image(self, job_id: str, prompt: str) -> str:
        """POST to ``COLAB_IMAGE_URL/generate-avatar``, return image download URL."""
        if not self._image_url:
            raise ColabUnavailable("COLAB_IMAGE_URL is not set")
        payload = {
            "job_id": job_id,
            "prompt": prompt,
            "negative_prompt": DEFAULT_NEGATIVE,
            "width": 1080,
            "height": 1350,
            "seed": 42,
        }
        logger.info("orchestrator.image.request", job_id=job_id)
        try:
            async with httpx.AsyncClient(timeout=300, follow_redirects=True) as http:
                resp = await http.post(f"{self._image_url}/generate-avatar", json=payload)
        except httpx.HTTPError as exc:
            raise ColabError(f"image transport error: {exc}") from exc
        if resp.status_code >= 400:
            raise ColabError(f"image {self._image_url}/generate-avatar → {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        return data.get("url") or f"{self._image_url}/jobs/{job_id}/download"

    async def _call_lipsync(self, job_id: str, face_url: str, audio_url: str) -> str:
        """POST to ``COLAB_LIPSYNC_URL/lipsync``, return video download URL."""
        if not self._lipsync_url:
            raise ColabUnavailable("COLAB_LIPSYNC_URL is not set")
        payload = {
            "job_id": job_id,
            "face_image_url": face_url,
            "audio_url": audio_url,
        }
        logger.info("orchestrator.lipsync.request", job_id=job_id)
        try:
            async with httpx.AsyncClient(timeout=1200, follow_redirects=True) as http:
                resp = await http.post(f"{self._lipsync_url}/lipsync", json=payload)
        except httpx.HTTPError as exc:
            raise ColabError(f"lipsync transport error: {exc}") from exc
        if resp.status_code >= 400:
            raise ColabError(f"lipsync {self._lipsync_url}/lipsync → {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        return data.get("url") or f"{self._lipsync_url}/jobs/{job_id}/download"

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    async def produce(
        self,
        avatar_id: str,
        topic: str,
        *,
        voice: str = "af_bella",
        auto_post: bool = False,
        existing_video_id: str | None = None,
    ) -> dict[str, Any]:
        """Run the full pipeline. Returns the final ``videos`` row.

        If ``existing_video_id`` is provided, the row is updated in place
        (used when ``POST /videos/produce`` created the row ahead of time
        and dispatched this method to BackgroundTasks). Otherwise a fresh
        row is inserted.
        """
        # ---- שלב 0: ודא שיש שורת videos — או קיימת, או ניצור אחת חדשה ----
        job_id = str(uuid.uuid4())
        if existing_video_id:
            existing = await get_row("videos", existing_video_id)
            if not existing:
                raise OrchestratorError(f"video row {existing_video_id} not found")
            video_db_id = existing_video_id
            job_id = existing.get("job_id") or job_id
        else:
            row = {
                "job_id": job_id,
                "avatar_id": avatar_id,
                "priority": 5,
                "render_options": {
                    "voice": voice,
                    "auto_post": auto_post,
                    "topic": topic,
                    "stages": {STATUS_QUEUED: _now_iso()},
                },
                "status": STATUS_QUEUED,
            }
            saved = await insert_row("videos", row)
            video_db_id = saved["id"]

        try:
            # ---- שלב 1: שליפת ה-persona_dna של האווטאר מסופבייס ----
            avatar_row = await get_row("avatars", avatar_id)
            if not avatar_row:
                raise OrchestratorError(f"avatar {avatar_id} not found")
            persona_dna = avatar_row.get("persona_dna") or {}

            # ---- שלב 2: יצירת סקריפט (timeout: STAGE_TIMEOUTS['script']) ----
            try:
                script_row = await asyncio.wait_for(
                    generate_script(avatar_id=avatar_id, topic=topic),
                    timeout=STAGE_TIMEOUTS["script"],
                )
            except asyncio.TimeoutError as exc:
                raise OrchestratorError("script_timeout") from exc
            script_id = script_row["id"]
            script_jsonb = script_row.get("script") or {}
            voiceover_text = _extract_voiceover_text(script_jsonb)
            await self._stamp(
                video_db_id,
                status=STATUS_SCRIPT_READY,
                extra={"script_id": script_id},
            )

            # ---- שלב 2.5: בדיקת עקביות פרסונה — best effort, לא חוסם ----
            try:
                from services.consistency_checker import check_script_consistency
                asyncio.create_task(check_script_consistency(
                    avatar_id=avatar_id,
                    persona_dna=persona_dna,
                    script_text=voiceover_text,
                    video_id=video_db_id,
                ))
            except Exception:
                logger.debug("orchestrator.consistency_check_skipped")

            # ---- שלב 3: יצירת אודיו (timeout: STAGE_TIMEOUTS['tts']) ----
            try:
                audio_url = await asyncio.wait_for(
                    self._call_tts(
                        job_id=f"{job_id}_voice",
                        text=voiceover_text,
                        voice=voice,
                    ),
                    timeout=STAGE_TIMEOUTS["tts"],
                )
            except asyncio.TimeoutError as exc:
                raise OrchestratorError("tts_timeout") from exc
            await self._stamp(video_db_id, status=STATUS_TTS_DONE, extra={"audio_url": audio_url})

            # ---- שלב 4: שימוש ב-face_url של האווטאר (לא מייצרים חדש לכל סרטון) ----
            try:
                face_url = await asyncio.wait_for(
                    self._resolve_face_url(
                        avatar_id, job_id, persona_dna, avatar_row=avatar_row,
                    ),
                    timeout=STAGE_TIMEOUTS["image"],
                )
            except asyncio.TimeoutError as exc:
                raise OrchestratorError("image_timeout") from exc
            await self._stamp(
                video_db_id,
                status=STATUS_IMAGE_DONE,
                extra={"face_url": face_url, "thumbnail_url": face_url},
            )

            # ---- שלב 5: שרת הליפ-סינק (timeout: STAGE_TIMEOUTS['lipsync']) ----
            try:
                raw_video_url = await asyncio.wait_for(
                    self._call_lipsync(
                        job_id=job_id,
                        face_url=face_url,
                        audio_url=audio_url,
                    ),
                    timeout=STAGE_TIMEOUTS["lipsync"],
                )
            except asyncio.TimeoutError as exc:
                raise OrchestratorError("lipsync_timeout") from exc
            await self._stamp(
                video_db_id,
                status=STATUS_LIPSYNC_DONE,
                extra={"video_url": raw_video_url},
            )

            # ---- שלב 6: יצירת thumbnail ייעודי (best-effort — לא מפיל pipeline) ----
            thumbnail_url = face_url  # ברירת מחדל: תמונת הפנים
            try:
                thumbnail_url = await asyncio.wait_for(
                    self._generate_thumbnail(job_id, topic, avatar_row),
                    timeout=60,
                )
            except Exception as exc:
                logger.warning(
                    "orchestrator.thumbnail_skipped",
                    video_id=video_db_id, error=str(exc),
                )

            # ---- שלב 7: סימון הווידאו כמוכן ----
            await self._stamp(
                video_db_id,
                status=STATUS_READY,
                extra={"video_url": raw_video_url, "thumbnail_url": thumbnail_url},
            )

            # ---- שלב 8: auto_publish אם האווטאר מוגדר לפרסם אוטומטית ----
            if avatar_row.get("auto_publish"):
                try:
                    from app.routers.posts import _connected_tokens_for_avatar, _publish_to_platform, _persist_post_row
                    import asyncio as _aio
                    final_row_for_publish = await get_row("videos", video_db_id) or {}
                    tokens = await _connected_tokens_for_avatar(avatar_id)
                    caption = topic
                    pub_tasks = [
                        _publish_to_platform(
                            platform,
                            avatar_id=avatar_id,
                            tokens=tok,
                            video_row=final_row_for_publish,
                            public_url=raw_video_url or "",
                            local_path=None,
                            caption=caption,
                            thumbnail_url=final_row_for_publish.get("thumbnail_url"),
                        )
                        for platform, tok in tokens.items()
                    ]
                    if pub_tasks:
                        pub_results = await _aio.gather(*pub_tasks, return_exceptions=True)
                        logger.info(
                            "orchestrator.auto_publish",
                            video_id=video_db_id,
                            platforms=list(tokens.keys()),
                        )
                except Exception as exc:
                    logger.warning("orchestrator.auto_publish_failed", error=str(exc))

            # ---- שלב 9: החזרת רשומת הווידאו המלאה לקורא ----
            final = await get_row("videos", video_db_id)
            logger.info("orchestrator.produce.done", video_id=video_db_id, job_id=job_id)
            return final or {"id": video_db_id, "status": STATUS_READY}

        except ColabUnavailable as exc:
            await self._handle_failure(
                video_db_id, stage="colab_unavailable", reason=str(exc),
            )
            raise OrchestratorError(f"colab server offline: {exc}") from exc
        except (ColabError, OrchestratorError, TimeoutError) as exc:
            await self._handle_failure(
                video_db_id, stage="pipeline", reason=str(exc),
            )
            raise
        except Exception as exc:
            logger.exception("orchestrator.produce.crashed", video_id=video_db_id)
            await self._handle_failure(
                video_db_id, stage="unexpected", reason=f"crash: {exc}",
            )
            raise OrchestratorError(str(exc)) from exc

    # ------------------------------------------------------------------
    # Thumbnail generation (best-effort — called after lipsync)
    # ------------------------------------------------------------------

    async def _generate_thumbnail(
        self,
        job_id: str,
        topic: str,
        avatar_row: dict[str, Any],
    ) -> str:
        """Generate a topic-aware thumbnail using the Image Colab server.

        Returns a public URL — either from R2 (if configured) or from the
        Colab server directly. Falls back to face_url on any failure;
        the caller is responsible for catching exceptions.
        """
        if not self._image_url:
            raise ColabUnavailable("COLAB_IMAGE_URL not set — skipping thumbnail")

        persona_dna = avatar_row.get("persona_dna") or {}
        name = persona_dna.get("name") or avatar_row.get("name") or "Creator"
        backdrop = persona_dna.get("backdrop_style") or "studio background"

        prompt = (
            f"YouTube thumbnail, cinematic, bold text overlay saying '{topic[:50]}', "
            f"featured person: {name}, background: {backdrop}, "
            "high contrast colors, 16:9 aspect ratio, professional, 4K"
        )

        thumbnail_job_id = f"{job_id}_thumb"
        payload = {
            "job_id": thumbnail_job_id,
            "prompt": prompt,
            "negative_prompt": DEFAULT_NEGATIVE,
            "width": 1280,
            "height": 720,
            "seed": 123,
        }
        try:
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as http:
                resp = await http.post(f"{self._image_url}/generate-avatar", json=payload)
            if resp.status_code >= 400:
                raise ColabError(f"thumbnail server {resp.status_code}: {resp.text[:100]}")
            data = resp.json()
            thumb_url = data.get("url") or f"{self._image_url}/jobs/{thumbnail_job_id}/download"
        except Exception as exc:
            raise ColabError(f"thumbnail generation failed: {exc}") from exc

        # Try to persist to R2 for a stable public URL
        try:
            from services.r2_uploader import upload_remote_url
            thumb_url = await upload_remote_url(thumb_url, key=f"thumbnails/{thumbnail_job_id}.jpg")
        except Exception:
            pass  # R2 not configured — use Colab URL directly

        logger.info("orchestrator.thumbnail_done", job_id=job_id, url=thumb_url)
        return thumb_url

    # ------------------------------------------------------------------
    # Failure handling
    # ------------------------------------------------------------------

    async def _handle_failure(
        self,
        video_db_id: str,
        *,
        stage: str,
        reason: str,
    ) -> None:
        """Mark the videos row failed and fire-and-forget a Discord alert."""
        try:
            await self._stamp(
                video_db_id,
                status=STATUS_FAILED,
                extra={"error_message": f"{stage}: {reason}"},
            )
        except Exception as exc:
            logger.error(
                "orchestrator.failure_stamp_error",
                video_id=video_db_id, error=str(exc),
            )
        # in-app notification — non-blocking
        try:
            await notify_video_failure(
                video_id=video_db_id, stage=stage, reason=reason,
            )
        except Exception as exc:
            logger.warning(
                "orchestrator.notify_error",
                video_id=video_db_id, error=str(exc),
            )

    # ------------------------------------------------------------------
    # Face reuse: every video uses the SAME face image of the avatar
    # ------------------------------------------------------------------

    async def _resolve_face_url(
        self,
        avatar_id: str,
        job_id: str,
        persona_dna: dict[str, Any],
        avatar_row: dict[str, Any] | None = None,
    ) -> str:
        """מחזיר את ``avatar.face_url`` — תמיד אותו פרצוף לאותו אווטאר.

        אחרי ה-refactor אנחנו לא יוצרים תמונה חדשה לכל סרטון. הפנים נוצרים
        פעם אחת ב-POST /avatars/create ונשמרים על avatars.face_url.
        זה מבטיח character consistency 100% בין כל הסרטונים של האווטאר.

        אם אין face_url — נכשל מהר עם הוראה ברורה למשתמש להריץ
        regenerate-image. אנחנו לא יוצרים בעצמנו כי זה ישתק את ה-pipeline
        כל פעם שמשהו רץ ללא תמונה תקפה.
        """
        if avatar_row is None:
            avatar_row = await get_row("avatars", avatar_id) or {}
        face_url = avatar_row.get("face_url")
        if not face_url:
            raise OrchestratorError(
                "Avatar has no face image — regenerate first "
                "(POST /avatars/{id}/regenerate-image)"
            )
        logger.info(
            "orchestrator.face.using_avatar_face",
            avatar_id=avatar_id, face_url=face_url,
        )
        return face_url
