#!/usr/bin/env python3
"""
Kaggle All-in-One: TTS + Image + Lip-Sync Servers
Just run this in a Kaggle Notebook with GPU (T4)
"""

import asyncio, io, os, shutil, socket, subprocess, threading, time, traceback, urllib.parse
from typing import Optional

import httpx, nest_asyncio, torch, uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

# ============================================================
# SETUP
# ============================================================
print("Installing packages...")
os.system("pip install -q coqui-tts fastapi uvicorn nest-asyncio aiofiles httpx python-multipart pillow opencv-python-headless ffmpeg-python librosa numpy numba resampy batch-face pyngrok")
os.system("apt-get install -y -qq ffmpeg")

print("Cloning Wav2Lip...")
os.system("git clone -q https://github.com/Rudrabha/Wav2Lip.git /tmp/Wav2Lip 2>/dev/null || echo 'ok'")
os.system("cd /tmp/Wav2Lip && pip install -q -r requirements.txt 2>/dev/null || echo 'ok'")

os.makedirs('/tmp/Wav2Lip/checkpoints', exist_ok=True)
os.makedirs('/tmp/outputs', exist_ok=True)

print("Downloading Wav2Lip checkpoints...")
CKPT = '/tmp/Wav2Lip/checkpoints/wav2lip_gan.pth'
S3FD = '/tmp/Wav2Lip/face_detection/detection/sfd/s3fd.pth'

if not os.path.exists(CKPT) or os.path.getsize(CKPT) < 100_000_000:
    os.system(f"wget -q --show-progress 'https://huggingface.co/camenduru/Wav2Lip/resolve/main/wav2lip_gan.pth' -O {CKPT}")

if not os.path.exists(S3FD):
    os.system(f"wget -q 'https://www.adrianbulat.com/downloads/python-fan/s3fd-619a316812.pth' -O {S3FD} || wget -q 'https://huggingface.co/camenduru/Wav2Lip/resolve/main/s3fd.pth' -O {S3FD}")

print("Loading XTTS-v2...")
os.environ['COQUI_TOS_AGREED'] = '1'
from TTS.api import TTS

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f"Device: {DEVICE}")
tts = TTS('tts_models/multilingual/multi-dataset/xtts_v2').to(DEVICE)
print("XTTS-v2 loaded.")

nest_asyncio.apply()

WAV2LIP = '/tmp/Wav2Lip'
OUT_BASE = '/tmp/outputs'

# ============================================================
# TTS APP
# ============================================================
tts_app = FastAPI(title='TTS')

class TTSRequest(BaseModel):
    job_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1)
    language: str = 'en'
    speaker_wav_filename: str
    callback_url: Optional[str] = None

@tts_app.post('/tts')
async def tts_synth(req: TTSRequest):
    ref_path = f'{OUT_BASE}/{req.speaker_wav_filename}'
    if not os.path.exists(ref_path):
        raise HTTPException(404, 'speaker_wav not found')
    out_path = f'{OUT_BASE}/tts_{req.job_id}.wav'

    def _sync():
        tts.tts_to_file(text=req.text, speaker_wav=ref_path, language=req.language, file_path=out_path)

    try:
        await asyncio.to_thread(_sync)
    except Exception as exc:
        raise HTTPException(500, str(exc))

    return {'job_id': req.job_id, 'status': 'done', 'path': out_path, 'size_bytes': os.path.getsize(out_path)}

@tts_app.get('/health')
def tts_health():
    return {'status': 'ok', 'model': 'xtts-v2', 'gpu': bool(torch.cuda.is_available())}

# ============================================================
# IMAGE APP
# ============================================================
img_app = FastAPI(title='Image')

class AvatarRequest(BaseModel):
    job_id: str = Field(..., min_length=1)
    prompt: str = Field(..., min_length=3)
    negative_prompt: str = ''
    width: int = 1080
    height: int = 1350
    seed: int = 42

async def _fetch_pollinations(req: AvatarRequest) -> bytes:
    encoded = urllib.parse.quote(req.prompt, safe='')
    url = f'https://image.pollinations.ai/prompt/{encoded}'
    params = {'width': req.width, 'height': req.height, 'seed': req.seed, 'model': 'flux', 'nologo': 'true'}
    if req.negative_prompt:
        params['negative'] = req.negative_prompt
    async with httpx.AsyncClient(timeout=90, follow_redirects=True) as http:
        resp = await http.get(url, params=params)
    resp.raise_for_status()
    return resp.content

@img_app.post('/generate-avatar')
async def gen_avatar(req: AvatarRequest):
    out_path = f'{OUT_BASE}/img_{req.job_id}.jpg'
    try:
        image_bytes = await _fetch_pollinations(req)
    except Exception as exc:
        raise HTTPException(503, f'pollinations failed: {exc}')

    img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    img.save(out_path, format='JPEG', quality=92)

    return {'job_id': req.job_id, 'image_url': out_path, 'provider': 'pollinations',
            'size_bytes': os.path.getsize(out_path), 'dimensions': [img.width, img.height]}

@img_app.get('/health')
def img_health():
    return {'status': 'ok', 'provider': 'pollinations'}

# ============================================================
# LIP-SYNC APP
# ============================================================
ls_app = FastAPI(title='Lip-Sync')

class LipSyncRequest(BaseModel):
    job_id: str = Field(..., min_length=1)
    face_image_url: str
    audio_url: str
    callback_url: Optional[str] = None

async def _fetch_to_file(src: str, dst: str):
    if src.startswith(('http://', 'https://')):
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as http:
            async with http.stream('GET', src) as resp:
                resp.raise_for_status()
                with open(dst, 'wb') as f:
                    async for chunk in resp.aiter_bytes(chunk_size=65536):
                        f.write(chunk)
    else:
        if not os.path.exists(src):
            raise FileNotFoundError(src)
        shutil.copyfile(src, dst)

def _run_wav2lip(face_path, audio_path, out_path):
    cmd = ['python', 'inference.py',
           '--checkpoint_path', CKPT,
           '--face', face_path, '--audio', audio_path, '--outfile', out_path,
           '--resize_factor', '1', '--nosmooth']
    result = subprocess.run(cmd, cwd=WAV2LIP, capture_output=True, text=True, timeout=900)
    if result.returncode != 0:
        raise RuntimeError(f'wav2lip failed: {result.stderr[-500:]}')

def _postproc(src, dst):
    vf = ("scale='if(gt(a,9/16),1080,-2)':'if(gt(a,9/16),-2,1920)',"
          "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,"
          "unsharp=5:5:0.8:3:3:0.4")
    cmd = ['ffmpeg', '-y', '-i', src, '-vf', vf,
           '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
           '-c:a', 'aac', '-b:a', '192k', dst]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(f'ffmpeg failed: {result.stderr[-300:]}')

@ls_app.post('/lipsync')
async def do_lipsync(req: LipSyncRequest):
    face_path = f'/tmp/{req.job_id}_face.jpg'
    audio_path = f'/tmp/{req.job_id}_audio.wav'
    raw_out = f'{OUT_BASE}/ls_{req.job_id}_raw.mp4'
    final_out = f'{OUT_BASE}/ls_{req.job_id}.mp4'

    try:
        await _fetch_to_file(req.face_image_url, face_path)
        await _fetch_to_file(req.audio_url, audio_path)
    except Exception as exc:
        raise HTTPException(400, f'fetch failed: {exc}')

    try:
        await asyncio.to_thread(_run_wav2lip, face_path, audio_path, raw_out)
        await asyncio.to_thread(_postproc, raw_out, final_out)
    except Exception as exc:
        raise HTTPException(500, str(exc))

    return {'job_id': req.job_id, 'status': 'done', 'path': final_out,
            'size_bytes': os.path.getsize(final_out)}

@ls_app.get('/health')
def ls_health():
    return {'status': 'ok', 'model': 'wav2lip_gan', 'checkpoint_exists': os.path.exists(CKPT)}

# ============================================================
# RUN SERVERS
# ============================================================
TTS_PORT = 8001
IMG_PORT = 8002
LS_PORT = 8003

def run_server(app_obj, port):
    uvicorn.run(app_obj, host='127.0.0.1', port=port, log_level='critical')

print("\nStarting servers...")
for app_obj, port, name in [(tts_app, TTS_PORT, 'TTS'), (img_app, IMG_PORT, 'Image'), (ls_app, LS_PORT, 'Lip-Sync')]:
    t = threading.Thread(target=run_server, args=(app_obj, port), daemon=True)
    t.start()
    time.sleep(0.5)

for port in [TTS_PORT, IMG_PORT, LS_PORT]:
    for _ in range(20):
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=1):
                break
        except:
            time.sleep(1)

# ============================================================
# NGROK TUNNELS
# ============================================================
print("Starting ngrok tunnels...")
from pyngrok import ngrok

try:
    tts_url = ngrok.connect(TTS_PORT, 'http').public_url
    img_url = ngrok.connect(IMG_PORT, 'http').public_url
    ls_url = ngrok.connect(LS_PORT, 'http').public_url
except Exception as e:
    print(f"ngrok error: {e}")
    tts_url = img_url = ls_url = "ngrok failed"

print("\n" + "="*70)
print(f"TTS:      {tts_url}")
print(f"Image:    {img_url}")
print(f"Lip-Sync: {ls_url}")
print("="*70)
print("\nRegister with backend:")
print(f"curl -X POST http://localhost:8000/admin/colab-urls \\")
print(f'  -H "Content-Type: application/json" \\')
print(f'  -d \'{{"tts_url": "{tts_url}", "image_url": "{img_url}", "lipsync_url": "{ls_url}"}}\'')
print("\n✓ Servers running. Keep this cell running.")

print("\nServers running. Keep this cell running.")
print(f'  TTS:      {tts_url}')
print(f'  Image:    {img_url}')
print(f'  Lip-Sync: {ls_url}')

# לא while True — תא עוצר בטבעי אחרי 5 דקות
for i in range(300):
    time.sleep(1)
    if i % 30 == 0:
        print(f"Alive: {time.strftime('%H:%M:%S')}")
