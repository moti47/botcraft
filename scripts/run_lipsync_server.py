"""Lipsync server (ffmpeg slideshow) — runs locally, no GPU needed.

Wav2Lip-quality lip-sync needs a GPU (Colab). This server produces a basic
"talking head" video by looping the avatar portrait image over the TTS audio
track — identical API surface to the real Colab lipsync server.

Usage: python scripts/run_lipsync_server.py
"""
import asyncio, io, os, shutil, subprocess, tempfile, uuid
import httpx, uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

VIDEOS_DIR = os.path.join(os.path.dirname(__file__), '..', 'tmp_videos')
os.makedirs(VIDEOS_DIR, exist_ok=True)

# Find ffmpeg bundled with imageio-ffmpeg
try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG = shutil.which('ffmpeg') or 'ffmpeg'

app = FastAPI(title='Viral Empire — Lipsync Server (local/ffmpeg slideshow)')


class LipsyncRequest(BaseModel):
    job_id: str = Field(..., min_length=1)
    face_image_url: str = Field(..., min_length=5)
    audio_url: str = Field(..., min_length=5)


async def _download(url: str, suffix: str) -> str:
    """Download url to a temp file; return the temp path."""
    tmp = tempfile.mktemp(suffix=suffix)
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as http:
        resp = await http.get(url)
    resp.raise_for_status()
    with open(tmp, 'wb') as f:
        f.write(resp.content)
    return tmp


@app.get('/health')
def health():
    return {'status': 'ok', 'provider': 'ffmpeg-slideshow', 'mode': 'local',
            'ffmpeg': FFMPEG}


@app.post('/lipsync')
async def lipsync(req: LipsyncRequest):
    """Combine face image + audio into a video (no AI lipsync — static portrait)."""
    out_path = os.path.join(VIDEOS_DIR, f'{req.job_id}.mp4')

    # Download face image and audio in parallel
    img_path, audio_path = await asyncio.gather(
        _download(req.face_image_url, '.jpg'),
        _download(req.audio_url, '.wav'),
    )

    try:
        # ffmpeg: loop the image for the duration of the audio track
        cmd = [
            FFMPEG, '-y',
            '-loop', '1',              # loop the still image
            '-i', img_path,            # image input
            '-i', audio_path,          # audio input
            '-c:v', 'libx264',
            '-tune', 'stillimage',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-pix_fmt', 'yuv420p',
            '-shortest',               # stop when audio ends
            '-vf', 'scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2',
            out_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=300)
        if result.returncode != 0:
            err = result.stderr.decode('utf-8', errors='replace')[-500:]
            raise RuntimeError(f'ffmpeg failed: {err}')
    finally:
        for p in (img_path, audio_path):
            try:
                os.remove(p)
            except OSError:
                pass

    size = os.path.getsize(out_path)
    return {
        'job_id': req.job_id,
        'path':   out_path,
        'url':    f'/jobs/{req.job_id}/download',
        'provider': 'ffmpeg-slideshow',
        'size_bytes': size,
    }


@app.get('/jobs/{job_id}/download')
def download(job_id: str):
    p = os.path.join(VIDEOS_DIR, f'{job_id}.mp4')
    if not os.path.exists(p):
        raise HTTPException(404, 'not found')
    return FileResponse(p, media_type='video/mp4')


if __name__ == '__main__':
    uvicorn.run(app, host='0.0.0.0', port=8003)
