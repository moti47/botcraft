# Botcraft / Viral Empire — repo guide

Local-first AI-influencer stack: FastAPI backend, React dashboard, Redis-backed worker, n8n workflows, and Colab-hosted GPU servers. The README has the full architecture; this file is the orientation map.

## Sub-projects in this folder

The user has been writing code across **several distinct sub-projects** in this directory. When a request comes in, pick the right one before diving in.

### 1. FastAPI backend — `app/`, `core/`, `services/`, `tasks/`
- Entry: `app/main.py` (uvicorn on `:8000`)
- Routers (`app/routers/`): `avatars.py`, `videos.py`, `scheduler.py`, `posts.py`, `analytics.py`, `admin.py`
- Core (`core/`): `config.py`, `llm_router.py` (Groq→Gemini→Cerebras fallthrough), `redis_client.py`, `supabase_client.py`, `logging.py`, `notifier.py`
- Services (`services/`): `persona_generator.py`, `avatar_image.py`, `video_orchestrator.py` (script→TTS→lipsync, per-stage timeouts), `script_generator.py`, `colab_client.py`, `scheduler.py` (APScheduler, Asia/Jerusalem), `r2_uploader.py`, `rate_limiter.py`, `publisher.py`
- Tasks (`tasks/`): `video_worker.py` (Redis queue drainer), `token_validator.py` (6h token refresh)

### 2. React dashboard — `dashboard/`
- Vite + React 18, TanStack Query, Zustand, Radix UI, Tailwind, Axios, Recharts
- Dev server on `:3000`. Source under `dashboard/src/`: `components/{layout,modals,ui}/`, `pages/`, `store/`, `hooks/`, `lib/`

### 3. Colab notebooks — `colab/`
GPU servers exposed via tunnels; URLs stored in Redis and hot-reloaded via `POST /admin/colab-urls`.
- `01_tts_server.ipynb`, `02_image_server.ipynb`, `03_lipsync_server.ipynb`

### 4. n8n workflows — `n8n_workflows/`
`daily_content_pipeline.json`, `trend_hunter.json`, `engagement_poller.json`, `weekly_evolution.json`. Run inside the `viral_n8n` container at `:5678`.

### 5. DB migrations — `infra/migrations/`
Run in order in Supabase SQL editor: `001_initial.sql` → `002_orchestrator_columns.sql` → `003_posts.sql` → `004_platform_tokens.sql` → `005_avatar_extensions.sql`.

### 6. Tests — `tests/`
`test_avatar_image.py`, `test_scheduler.py`.

## Running the stack

```bash
docker compose up --build   # api + worker + redis + postgres + n8n + dashboard
```

Ports: dashboard `3000`, FastAPI `8000` (`/docs` for Swagger), n8n `5678`, redis `6379`, postgres only inside the network.

`.env` exists in the repo root (don't read its contents — see `.env.example` for required keys: `SUPABASE_*`, `R2_*`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `CEREBRAS_API_KEY`, etc.).

## Gotchas already fixed (don't re-introduce)

- **`httpx` must stay `<0.28`** — supabase 2.10.0 caps it. `requirements.txt` is pinned to `httpx==0.27.2`. Don't bump to 0.28.x without also upgrading supabase.
- **Worker must run as a module**, not as a script. `docker-compose.yml` runs `python -u -m tasks.video_worker` — running `python tasks/video_worker.py` puts only `tasks/` on `sys.path` and breaks `from core.config import ...`. Healthcheck is `pgrep -f 'tasks.video_worker'`.

## Conventions

- Logs are structlog JSON. Use `core.logging.get_logger(__name__)`.
- LLM calls go through `core.llm_router` — never call providers directly from routers/services.
- Colab service URLs are read from Redis at call time via `services.colab_client`, not from env.
- Schedules are per-avatar; saving a schedule must call `AvatarScheduler.reload_avatar(id)`.
- All times Asia/Jerusalem.
