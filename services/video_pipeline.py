"""Smart no-Colab video pipeline.

Stages (each persists to ``avatar_pipeline_runs`` for observability):

  1. trend_signal       — pulled from ``trend_signals`` (or fresh discover)
  2. script_generation  — LLM (existing services.script_generator)
  3. visual_director    — LLM (services.visual_director)
  4. tts                — ElevenLabs → Edge TTS fallback
  5. base_image         — Pollinations (avatar already has face_url)
  6. lipsync            — D-ID → Fal.ai SadTalker fallback
  7. music              — services.music_selector
  8. b_roll             — Pexels stock_video for visual_type=='stock_video'
  9. assembly           — Creatomate render → FFmpeg fallback
 10. thumbnail          — Pollinations (topic-aware)
 11. publish_or_ready   — auto_publish or wait for user

Each stage is its own coroutine and fails *softly* — pipeline records
which stage broke, surfaces a notification, and the user can retry from
the broken step in the dashboard.
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from core.logging import get_logger
from core.notify import notify_video_failure  # type: ignore[attr-defined]
from core.supabase_client import get_row, insert_row, update_row

from services import (
    music_selector,
    script_generator,
    visual_director,
)
from services.providers import (
    creatomate_assembly,
    did_lipsync,
    edge_tts,
    elevenlabs_tts,
    fal_lipsync,
    pexels_music,
    pollinations_image,
)
from services.providers.base import ProviderError, ProviderUnavailable

logger = get_logger(__name__)


# -----------------------------------------------------------------
# Provider chains — try each in order, return first success
# -----------------------------------------------------------------
TTS_CHAIN = ["elevenlabs", "edge_tts"]
LIPSYNC_CHAIN = ["d_id", "fal"]
ASSEMBLY_CHAIN = ["creatomate", "ffmpeg"]


async def _run_tts(text: str, language: str) -> tuple[str, dict[str, Any]]:
    last_err: Exception | None = None
    for name in TTS_CHAIN:
        try:
            if name == "elevenlabs":
                result = await elevenlabs_tts.synthesize(text)
            else:
                result = await edge_tts.synthesize(text, language=language)
            return name, {
                "bytes": result.bytes_inline,
                "ms": result.duration_ms,
                "credits": result.cost_credits,
                "provider": result.provider,
            }
        except (ProviderUnavailable, ProviderError) as e:
            logger.warning("pipeline.tts.try_next", provider=name, error=str(e))
            last_err = e
    raise RuntimeError(f"All TTS providers failed: {last_err}")


async def _run_lipsync(face_url: str, audio_url: str) -> tuple[str, dict[str, Any]]:
    last_err: Exception | None = None
    for name in LIPSYNC_CHAIN:
        try:
            if name == "d_id":
                result = await did_lipsync.animate(face_url, audio_url)
            else:
                result = await fal_lipsync.animate(face_url, audio_url)
            return name, {
                "url": result.url,
                "ms": result.duration_ms,
                "provider": result.provider,
            }
        except (ProviderUnavailable, ProviderError) as e:
            logger.warning("pipeline.lipsync.try_next", provider=name, error=str(e))
            last_err = e
    raise RuntimeError(f"All lipsync providers failed: {last_err}")


# -----------------------------------------------------------------
# B-roll fetching — for scenes that need stock_video
# -----------------------------------------------------------------
async def _fetch_b_roll(scenes: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    """For each scene whose visual_type=='stock_video' or 'screen_recording',
    fetch a clip URL via Pexels. Returns {scene_index: {url, duration}}."""
    out: dict[int, dict[str, Any]] = {}
    for idx, scene in enumerate(scenes):
        vtype = scene.get("visual_type")
        if vtype not in ("stock_video", "screen_recording"):
            continue
        query = scene.get("clip_query") or scene.get("text_on_screen") or ""
        if not query:
            continue
        try:
            res = await pexels_music.search_video(query, per_page=3)
            videos = res.raw.get("videos", [])
            if videos:
                pick = videos[0]
                out[idx] = {
                    "url": pick["src_mp4"],
                    "duration": pick["duration"],
                    "thumbnail": pick.get("thumbnail"),
                }
        except (ProviderUnavailable, ProviderError) as e:
            logger.warning("pipeline.b_roll.skip", idx=idx, query=query, error=str(e))
    return out


# -----------------------------------------------------------------
# AI image generation — for scenes that need ai_image
# -----------------------------------------------------------------
async def _fetch_ai_images(scenes: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    out: dict[int, dict[str, Any]] = {}
    for idx, scene in enumerate(scenes):
        if scene.get("visual_type") != "ai_image":
            continue
        prompt = scene.get("clip_query") or scene.get("text_on_screen") or ""
        if not prompt:
            continue
        try:
            res = await pollinations_image.generate(
                prompt, width=1080, height=1920, model="flux"
            )
            out[idx] = {"bytes": res.bytes_inline, "duration": scene.get("duration_sec", 3)}
        except (ProviderUnavailable, ProviderError) as e:
            logger.warning("pipeline.ai_image.skip", idx=idx, error=str(e))
    return out


# -----------------------------------------------------------------
# Build Creatomate template from the visual director plan
# -----------------------------------------------------------------
def build_creatomate_template(
    plan: dict[str, Any],
    *,
    avatar_video_url: str,
    music_url: str | None,
    b_roll: dict[int, dict[str, Any]],
    ai_images: dict[int, dict[str, Any]],
) -> dict[str, Any]:
    """Translate the Visual Director's scenes into Creatomate elements."""
    elements: list[dict[str, Any]] = []
    cursor = 0.0
    for idx, scene in enumerate(plan.get("scenes", [])):
        dur = float(scene.get("duration_sec") or 3.0)
        vtype = scene.get("visual_type")
        zoom = float(scene.get("zoom") or 1.0)
        zoom_dir = scene.get("zoom_direction", "static")
        transition = scene.get("transition_in", "cut")

        # main visual
        if vtype == "avatar_animation":
            elements.append({
                "type": "video",
                "source": avatar_video_url,
                "time": cursor,
                "duration": dur,
                "fit": "cover",
                "animations": _zoom_animation(zoom, zoom_dir, dur),
            })
        elif vtype == "stock_video" and idx in b_roll:
            elements.append({
                "type": "video",
                "source": b_roll[idx]["url"],
                "time": cursor,
                "duration": dur,
                "fit": "cover",
                "animations": _zoom_animation(zoom, zoom_dir, dur),
            })
        elif vtype == "ai_image" and idx in ai_images:
            elements.append({
                "type": "image",
                "source_bytes": ai_images[idx]["bytes"],
                "time": cursor,
                "duration": dur,
                "fit": "cover",
                "animations": _zoom_animation(zoom, zoom_dir, dur),
            })
        elif vtype == "kinetic_text":
            elements.append({
                "type": "text",
                "text": scene.get("text_on_screen", ""),
                "time": cursor,
                "duration": dur,
                "x": "50%",
                "y": "50%",
                "x_alignment": "50%",
                "y_alignment": "50%",
                "font_family": "Inter",
                "font_weight": "900",
                "font_size": "8 vmin",
                "fill_color": "#ffffff",
                "background_color": "#000000",
                "animations": [
                    {"type": "text-slide", "duration": 0.4, "split": "word"}
                ],
            })

        # caption overlay (if any)
        if scene.get("text_on_screen") and vtype != "kinetic_text":
            elements.append({
                "type": "text",
                "text": scene["text_on_screen"],
                "time": cursor,
                "duration": dur,
                "x": "50%",
                "y": "85%",
                "x_alignment": "50%",
                "y_alignment": "50%",
                "font_family": "Inter",
                "font_weight": "800",
                "font_size": "5 vmin",
                "fill_color": "#ffffff",
                "stroke_color": "#000000",
                "stroke_width": "0.5 vmin",
            })

        # transition (apply on the next element if not 'cut')
        if transition != "cut" and idx > 0:
            # Creatomate element-level transition
            if elements:
                elements[-1]["transition"] = {"type": transition, "duration": 0.35}

        cursor += dur

    # global music track (volume-modulated would need per-scene audio scaling
    # — Creatomate supports it via "audio_volume" keyframes on the audio element)
    if music_url:
        scenes = plan.get("scenes", [])
        keyframes = []
        t = 0.0
        for s in scenes:
            keyframes.append({"time": t, "value": float(s.get("music_volume") or 0.4)})
            t += float(s.get("duration_sec") or 3.0)
        elements.append({
            "type": "audio",
            "source": music_url,
            "time": 0,
            "duration": cursor,
            "audio_fade_in": 0.5,
            "audio_fade_out": 0.5,
            "audio_volume": keyframes if len(keyframes) > 1 else 0.4,
        })

    return {"elements": elements}


async def _ffmpeg_simple_assembly(
    *,
    avatar_video_url: str,
    music_url: str | None,
    video_id: str,
) -> str:
    """Last-resort fallback: download lipsync video + (optional) music, mix
    them with FFmpeg, push the result to R2, return the R2 URL.

    The pipeline's "smart" features (scene cuts, transitions, B-roll, AI
    images, captions, zoom) are skipped — Creatomate handles those. If
    Creatomate is unavailable we degrade gracefully to the avatar-only
    talking head + background music.
    """
    import shutil
    import subprocess
    import tempfile
    from pathlib import Path

    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not on PATH and Creatomate failed — cannot assemble")

    from services.r2_uploader import upload_bytes

    async with httpx.AsyncClient(timeout=120) as client:
        avatar_bytes = (await client.get(avatar_video_url)).content
        music_bytes = (await client.get(music_url)).content if music_url else None

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        avatar_path = tmp_dir / "avatar.mp4"
        avatar_path.write_bytes(avatar_bytes)
        out_path = tmp_dir / "out.mp4"

        cmd = ["ffmpeg", "-y", "-i", str(avatar_path)]
        if music_bytes:
            music_path = tmp_dir / "music.mp3"
            music_path.write_bytes(music_bytes)
            cmd += [
                "-i", str(music_path),
                "-filter_complex",
                "[0:a]volume=1.0[a0];[1:a]volume=0.3[a1];[a0][a1]amix=inputs=2:duration=shortest[a]",
                "-map", "0:v", "-map", "[a]",
            ]
        cmd += [
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "192k", "-shortest", str(out_path),
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        out_bytes = out_path.read_bytes()

    return await upload_bytes(out_bytes, f"videos/{video_id}/final.mp4", "video/mp4")


def _zoom_animation(zoom: float, direction: str, duration: float) -> list[dict[str, Any]]:
    if direction == "static" or abs(zoom - 1.0) < 0.01:
        return []
    start = 1.0 if direction == "in" else zoom
    end = zoom if direction == "in" else 1.0
    return [
        {"type": "scale", "duration": duration, "easing": "linear",
         "start_scale": f"{start*100:.0f}%", "end_scale": f"{end*100:.0f}%"}
    ]


# -----------------------------------------------------------------
# Public entry point
# -----------------------------------------------------------------
async def run_pipeline(video_id: str) -> dict[str, Any]:
    """Drive a video through the full no-Colab pipeline.

    Caller is responsible for having created the ``videos`` row with at
    least ``avatar_id``, ``topic``, and ``status='queued'``.
    """
    started = time.monotonic()
    video = await get_row("videos", video_id)
    if not video:
        raise ValueError(f"video {video_id} not found")
    avatar = await get_row("avatars", video["avatar_id"])
    if not avatar:
        raise ValueError(f"avatar {video['avatar_id']} not found")

    run = await insert_row(
        "avatar_pipeline_runs",
        {"video_id": video_id, "avatar_id": avatar["id"]},
    )
    run_id = run["id"]
    error_stage: str | None = None
    error: Exception | None = None

    try:
        # 1. SCRIPT
        await update_row("videos", video_id, {"status": "scripting"})
        script_row = await script_generator.generate_script(
            avatar_id=avatar["id"],
            topic=video["topic"],
        )
        script_json = script_row.get("script") or {}
        # Concatenate all beat voiceovers into the spoken text
        beats = script_json.get("beats") or []
        spoken = " ".join(
            (b.get("voiceover") or "").strip() for b in beats if b.get("voiceover")
        ).strip()
        if not spoken:
            spoken = " ".join(
                s for s in (script_json.get("hook"), script_json.get("cta")) if s
            ).strip()
        if not spoken:
            raise RuntimeError("script_generator returned empty voiceover")
        await update_row("videos", video_id, {
            "script_text": spoken,
            "title": script_row.get("title"),
            "caption": script_json.get("caption"),
            "hashtags": script_json.get("hashtags"),
            "status": "script_ready",
        })

        # 2. VISUAL DIRECTOR
        plan = await visual_director.plan_video(
            script_text=spoken,
            avatar=avatar,
            trend_angle=script_json.get("angle") or script_json.get("hook"),
        )
        await update_row("videos", video_id, {
            "visual_director_plan": plan,
            "scenes_count": len(plan.get("scenes", [])),
        })

        # 3. TTS
        error_stage = "tts"
        tts_provider, tts = await _run_tts(
            script_data["script_text"], video.get("language") or "en"
        )
        # upload tts.bytes to R2
        from services.r2_uploader import upload_bytes
        audio_url = await upload_bytes(
            tts["bytes"], f"videos/{video_id}/audio.mp3", "audio/mpeg"
        )
        await update_row("videos", video_id, {"audio_url": audio_url, "status": "tts_done"})

        # 4. LIPSYNC
        error_stage = "lipsync"
        face_url = avatar.get("face_url")
        if not face_url:
            raise RuntimeError("avatar.face_url is empty — generate face first")
        ls_provider, lipsync = await _run_lipsync(face_url, audio_url)
        avatar_video_url = lipsync["url"]
        await update_row("videos", video_id, {
            "lipsync_video_url": avatar_video_url,
            "status": "lipsync_done",
        })

        # 5. MUSIC + B-ROLL + AI IMAGES (parallel)
        error_stage = "media"
        music_task = asyncio.create_task(music_selector.select_for_video(
            {**video, "visual_director_plan": plan}, avatar
        ))
        b_roll_task = asyncio.create_task(_fetch_b_roll(plan.get("scenes", [])))
        images_task = asyncio.create_task(_fetch_ai_images(plan.get("scenes", [])))

        track, b_roll, ai_images = await asyncio.gather(
            music_task, b_roll_task, images_task, return_exceptions=False
        )

        if track:
            await update_row("videos", video_id, {
                "music_track_url": track["url"],
                "music_track_title": track["title"],
                "music_track_source": track["source"],
            })

        # 6. ASSEMBLY
        error_stage = "assembly"
        template = build_creatomate_template(
            plan,
            avatar_video_url=avatar_video_url,
            music_url=track["url"] if track else None,
            b_roll=b_roll,
            ai_images=ai_images,
        )
        try:
            assembly = await creatomate_assembly.render(template, width=1080, height=1920)
            final_url = assembly.url
            assembly_provider = "creatomate"
        except (ProviderUnavailable, ProviderError) as e:
            logger.warning("pipeline.creatomate.fallback_ffmpeg", error=str(e))
            # FFmpeg fallback — minimal: avatar video + music only (no scene cuts).
            # Full scene-by-scene FFmpeg assembly is intentionally out of scope:
            # if Creatomate is down, we keep the lipsynced avatar video + music
            # so the user still gets a usable result.
            final_url = await _ffmpeg_simple_assembly(
                avatar_video_url=avatar_video_url,
                music_url=track["url"] if track else None,
                video_id=video_id,
            )
            assembly_provider = "ffmpeg"

        # 7. DONE
        elapsed = int((time.monotonic() - started) * 1000)
        await update_row("videos", video_id, {
            "final_path": final_url,
            "video_url": final_url,
            "status": "ready",
            "rendered_at": datetime.now(timezone.utc).isoformat(),
        })
        await update_row(
            "avatar_pipeline_runs",
            run_id,
            {
                "tts_provider": tts_provider,
                "lipsync_provider": ls_provider,
                "music_provider": track["source"] if track else "none",
                "assembly_provider": assembly_provider,
                "tts_ms": tts["ms"],
                "lipsync_ms": lipsync["ms"],
                "total_ms": elapsed,
                "succeeded": True,
                "finished_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        return {"video_id": video_id, "status": "ready", "final_url": final_url}

    except Exception as e:
        error = e
        elapsed = int((time.monotonic() - started) * 1000)
        await update_row("videos", video_id, {
            "status": "failed",
            "error_message": str(e),
        })
        await update_row(
            "avatar_pipeline_runs",
            run_id,
            {
                "succeeded": False,
                "error": str(e),
                "error_stage": error_stage or "unknown",
                "total_ms": elapsed,
                "finished_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        try:
            await notify_video_failure(video_id=video_id, error=str(e), stage=error_stage)
        except Exception:
            pass
        raise
