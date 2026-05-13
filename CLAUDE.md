# Botcraft / Viral Empire — repo guide

Local-first AI-influencer stack: FastAPI backend, React dashboard, Redis-backed worker, n8n workflows, and **free-tier media APIs** (no Colab GPU servers anymore). The README has the full architecture; this file is the orientation map.

## Sub-projects in this folder

The user has been writing code across **several distinct sub-projects** in this directory. When a request comes in, pick the right one before diving in.

### 1. FastAPI backend — `app/`, `core/`, `services/`, `tasks/`
- Entry: `app/main.py` (uvicorn on `:8000`)
- Routers (`app/routers/`): `avatars.py`, `videos.py`, `scheduler.py`, `posts.py`, `analytics.py`, `admin.py`, `chat.py`, `insights.py`, `notifications.py`
- Core (`core/`): `config.py`, `llm_router.py` (Groq→Gemini→Cerebras fallthrough), `redis_client.py`, `supabase_client.py`, `logging.py`, `notify.py`
- Services (`services/`):
  - `persona_generator.py`, `avatar_image.py` (Pollinations)
  - `script_generator.py` — LLM → script JSON
  - `visual_director.py` — LLM → scene-by-scene render plan (zoom/clips/music volume/transitions)
  - `trend_engine.py` — Google Trends + YouTube + LLM → ranked viral topics
  - `music_selector.py` — picks royalty-free music from cache (Pixabay)
  - `video_pipeline.py` — full no-Colab pipeline (script → TTS → lipsync → music → assembly)
  - `learning_system.py` — extracts patterns from analytics → `learning_facts` table
  - `scheduler.py` (APScheduler, Asia/Jerusalem)
  - `r2_uploader.py`, `rate_limiter.py`, `publisher.py`
  - `providers/` — free-API clients: `elevenlabs_tts`, `edge_tts` (fallback), `pollinations_image`, `did_lipsync`, `fal_lipsync` (fallback), `pexels_music` (B-roll), `pixabay_music`, `creatomate_assembly`, `google_trends`, `youtube_trends`
- Tasks (`tasks/`): `video_worker.py` (Redis queue drainer running `services.video_pipeline.run_pipeline`), `token_validator.py` (6h token refresh)

### 2. React dashboard — `dashboard/`
- Vite + React 18, TanStack Query, Zustand, Radix UI, Tailwind, Axios, Recharts
- Dev server on `:3000`. Source under `dashboard/src/`: `components/{layout,modals,ui}/`, `pages/`, `store/`, `hooks/`, `lib/`

### 3. n8n workflows — `n8n_workflows/`
- `smart_video_pipeline.json` — webhook to produce a video (auto-pulls topic from trend engine if not supplied)
- `trend_refresh.json` — every 4h, refresh trend signals per active avatar
- `nightly_learning.json` — every 03:00, run `learning_system.analyze_all_active`
- `daily_content_pipeline.json`, `engagement_poller.json`, `weekly_evolution.json` (existing schedulers)

Run inside the `viral_n8n` container at `:5678`.

### 4. DB migrations — `infra/migrations/`
Run in order in Supabase SQL editor: `001` … `008` (existing) then **`009_brand_identity_and_learning.sql`** which adds `music_genre`, `brand_identity` JSONB DNA per avatar, `visual_director_plan` on videos, plus tables: `trend_signals`, `learning_facts`, `avatar_pipeline_runs`, `music_tracks`.

### 5. Tests — `tests/`
`test_avatar_image.py`, `test_scheduler.py`.

## Running the stack

```bash
docker compose up --build   # api + worker + redis + postgres + n8n + dashboard
```

Ports: dashboard `3000`, FastAPI `8000` (`/docs` for Swagger), n8n `5678`, redis `6379`, postgres only inside the network.

`.env` exists in the repo root (don't read its contents — see `.env.example` for required keys).

## Provider chain (free tier)

| Stage    | Primary       | Fallback                     | Free quota                    |
|----------|---------------|------------------------------|-------------------------------|
| TTS      | ElevenLabs    | Edge TTS (free, unlimited)   | 10k chars/month               |
| Image    | Pollinations  | HuggingFace inference        | unrestricted (be polite)      |
| Lipsync  | D-ID          | Fal.ai SadTalker             | 5 min/month                   |
| B-roll   | Pexels videos | —                            | 200 req/hour                  |
| Music    | Pixabay       | —                            | 100 req/min                   |
| Assembly | Creatomate    | local FFmpeg simple-mux      | tier credits/month            |
| Trends   | YouTube + Google Trends + LLM ranking | — | 10k YT units/day            |

## Gotchas already fixed (don't re-introduce)

- **`httpx` must stay `<0.28`** — supabase 2.10.0 caps it. `requirements.txt` is pinned to `httpx==0.27.2`.
- **Worker must run as a module**, not as a script. `docker-compose.yml` runs `python -u -m tasks.video_worker`.
- **No Colab anymore.** Removed `services/colab_client.py`, `services/video_orchestrator.py`, `colab/` folder, `COLAB_*_URL` env vars, `/admin/colab-urls` endpoint, `/colab/health` endpoint. The new pipeline lives in `services/video_pipeline.py` and is driven by free-tier provider modules under `services/providers/`.

## Conventions

- Logs are structlog JSON. Use `core.logging.get_logger(__name__)`.
- LLM calls go through `core.llm_router` — never call providers directly from routers/services.
- All notifications go through `core/notify.py` (writes to DB + SSE broadcast + web push). Don't re-introduce a Discord shim.
- Per-avatar brand DNA lives at `avatars.brand_identity` (JSONB). Music genre + visual style + color palette + animation preferences all sit there.
- Every video persists a `visual_director_plan` JSONB describing scene-by-scene zoom/clips/music volume/transitions.
- Schedules are per-avatar; saving a schedule must call `AvatarScheduler.reload_avatar(id)`.
- All times Asia/Jerusalem.
