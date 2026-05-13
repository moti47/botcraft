"""TTS server (edge-tts / Microsoft) — runs locally, no GPU needed.
Usage: python scripts/run_tts_server.py
API is compatible with the Colab TTS server expected by VideoOrchestrator.
"""
import asyncio, io, os, tempfile, uuid
import edge_tts, uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

AUDIO_DIR = os.path.join(os.path.dirname(__file__), '..', 'tmp_audio')
os.makedirs(AUDIO_DIR, exist_ok=True)

app = FastAPI(title='Viral Empire — TTS Server (local / edge-tts)')

# Voice map: language code → Microsoft edge-tts voice name
VOICE_MAP = {
    'he':    'he-IL-AvriNeural',       # Hebrew male
    'he-f':  'he-IL-HilaNeural',       # Hebrew female
    'en':    'en-US-AndrewNeural',     # English male
    'en-f':  'en-US-JennyNeural',      # English female
    'ar':    'ar-IL-AvishaiNeural',    # Arabic (Israel)
    'fr':    'fr-FR-HenriNeural',
    'es':    'es-ES-AlvaroNeural',
    'de':    'de-DE-ConradNeural',
    'pt':    'pt-BR-AntonioNeural',
    'ru':    'ru-RU-DmitryNeural',
}
DEFAULT_VOICE = 'he-IL-AvriNeural'

class TtsRequest(BaseModel):
    job_id: str = Field(..., min_length=1)
    text: str   = Field(..., min_length=1)
    language: str = 'he'
    speaker_wav_filename: str = ''   # ignored — kept for API compat

@app.get('/health')
def health():
    return {'status': 'ok', 'provider': 'edge-tts', 'mode': 'local'}

@app.post('/tts')
async def tts(req: TtsRequest):
    voice = VOICE_MAP.get(req.language, DEFAULT_VOICE)
    out_path = os.path.join(AUDIO_DIR, f'{req.job_id}.wav')

    communicate = edge_tts.Communicate(req.text, voice)
    # edge-tts outputs MP3 natively; save to temp then re-export as WAV
    tmp_mp3 = out_path.replace('.wav', '_tmp.mp3')
    await communicate.save(tmp_mp3)

    # Convert mp3 → wav using ffmpeg (available on most systems)
    import subprocess, shutil
    if shutil.which('ffmpeg'):
        subprocess.run(
            ['ffmpeg', '-y', '-i', tmp_mp3, out_path],
            capture_output=True, check=True
        )
        os.remove(tmp_mp3)
        final_path = out_path
    else:
        # No ffmpeg — just rename .mp3 and serve it; orchestrator accepts mp3 too
        final_path = tmp_mp3.replace('_tmp.mp3', '.mp3')
        os.rename(tmp_mp3, final_path)

    size = os.path.getsize(final_path)
    return {
        'job_id':    req.job_id,
        'audio_url': final_path,
        'voice':     voice,
        'provider':  'edge-tts',
        'size_bytes': size,
    }

@app.get('/jobs/{job_id}/download')
def download(job_id: str):
    for ext in ('wav', 'mp3'):
        p = os.path.join(AUDIO_DIR, f'{job_id}.{ext}')
        if os.path.exists(p):
            mime = 'audio/wav' if ext == 'wav' else 'audio/mpeg'
            return FileResponse(p, media_type=mime)
    raise HTTPException(404, 'not found')

if __name__ == '__main__':
    uvicorn.run(app, host='0.0.0.0', port=8001)
