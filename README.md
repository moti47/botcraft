# Viral Empire — Local-First AI Influencer Backend + Dashboard

Local-first stack for managing AI influencers end-to-end: persona generation,
scheduled video production, multi-platform publishing, in-app notifications,
and an LLM-backed chat assistant — all driven from a React dashboard.

> Dashboard: <http://localhost:3000> · FastAPI Swagger: <http://localhost:8000/docs>

---

## Stack

| Layer | Tech |
|---|---|
| **API** | Python 3.11 · FastAPI 0.115 · Uvicorn (`--limit-max-requests 1000 --timeout-keep-alive 300`) |
| **Dashboard** | React 18 · Vite 5 · TanStack Query · Zustand · Radix UI · Tailwind |
| **DB** | Supabase (Postgres + Storage) |
| **Queue / cache / runtime config** | Redis 7 |
| **Worker** | `tasks/video_worker.py` drains `viral:videos:queue` |
| **Scheduler** | APScheduler · `Asia/Jerusalem` · per-avatar |
| **LLM router** | Groq → Gemini 2.5 Flash-Lite → Cerebras (24h Redis quota tracking, 429 fallthrough) |
| **GPU compute** | Colab notebooks (TTS / Image / Lipsync) tunnelled via Cloudflare; URLs hot-reloaded from Redis |
| **Media hosting** | Cloudflare R2 (S3-compatible) for finished MP4s + thumbnails |
| **Notifications** | In-app SSE stream + Web Push (VAPID) — Discord removed |
| **Workflows** | n8n at `:5678` (`daily_content_pipeline`, `trend_hunter`, `engagement_poller`, `weekly_evolution`) |

---

## Services / Ports

| Service | URL | Container |
|---|---|---|
| Dashboard | http://localhost:3000 | `viral_dashboard` |
| FastAPI | http://localhost:8000/docs | `viral_fastapi` |
| n8n | http://localhost:5678 | `viral_n8n` |
| Redis | localhost:6379 | `viral_redis` |
| Worker | (no port, drains Redis) | `viral_worker` |
| Postgres | (n8n only, internal) | `viral_postgres` |

---

## Quickstart

```bash
# 1. clone + env
git clone <this-repo>
cp .env.example .env
# fill SUPABASE_*, R2_*, LLM keys, social tokens

# 2. generate VAPID keys for Web Push notifications
python scripts/generate_vapid.py
# paste output into .env (VAPID_*) and dashboard/.env (VITE_VAPID_PUBLIC_KEY)

# 3. run DB migrations in the Supabase SQL editor, in order
#    infra/migrations/001_initial.sql
#    infra/migrations/002_orchestrator_columns.sql
#    infra/migrations/003_posts.sql
#    infra/migrations/004_platform_tokens.sql
#    infra/migrations/005_avatar_extensions.sql
#    infra/migrations/006_main_extensions.sql

# 4. launch
docker compose up --build -d
docker compose ps   # verify all 6 containers are healthy
```

---

## Environment variables

Full list in `.env.example`. Grouped:

### Required
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- At least one of: `GROQ_API_KEY`, `GEMINI_API_KEY`, `CEREBRAS_API_KEY`

### Required for publishing
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`
- YouTube: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`
- TikTok: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_ACCESS_TOKEN`
- Instagram: `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_ACCOUNT_ID`

### Web Push (browser notifications when the tab is closed)
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — generate with `python scripts/generate_vapid.py`
- `VITE_VAPID_PUBLIC_KEY` (in `dashboard/.env`) — same value as `VAPID_PUBLIC_KEY`, baked into the Vite build

### Infra
- `REDIS_URL` (default `redis://redis:6379`)
- `LOG_LEVEL` (`INFO`)
- `ENV` (`local`)
- `VIDEO_WORKER_ENABLED`, `VIDEO_QUEUE_NAME`
- `PUBLISH_MAX_PER_DAY` (default 15), `PUBLISH_MIN_GAP_SECONDS` (default 1800)

### Colab GPU services (set after running the notebooks)
- `COLAB_TTS_URL`, `COLAB_IMAGE_URL`, `COLAB_LIPSYNC_URL`
  Or hot-reload them at runtime via `POST /admin/colab-urls`.

### Dashboard build-time
- `VITE_API_URL` — set in `dashboard/.env`, defaults to `http://localhost:8000`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — only if you use Supabase Realtime in the UI

---

## Database migrations

Run files **in order** in the Supabase SQL editor:

| # | File | What it adds |
|---|---|---|
| 001 | `infra/migrations/001_initial.sql` | core tables: `avatars`, `videos`, `trends`, `scripts` |
| 002 | `002_orchestrator_columns.sql` | `videos.render_options.stages`, `videos.error_message` |
| 003 | `003_posts.sql` | `posts` with per-platform fan-out |
| 004 | `004_platform_tokens.sql` | per-avatar OAuth tokens with expiry |
| 005 | `005_avatar_extensions.sql` | `avatar_commands`, `avatar_files`, `face_url` |
| 006 | `006_main_extensions.sql` | `notifications`, `push_subscriptions`, `avatar_ideas`, `chat_messages`; new `avatars` columns: `status`, `is_paused`, `auto_publish`, `avatar_style` |

---

## Running pieces individually

### Backend only
```bash
docker compose up -d redis fastapi
```

### Worker
```bash
docker compose up -d worker
# Or locally:  python -u -m tasks.video_worker
# (must be invoked as a module — script form breaks core.* imports)
```

### Dashboard
```bash
cd dashboard
npm install
npm run dev      # http://localhost:3000 with hot-reload
```

### Generate VAPID keys for Web Push
```bash
python scripts/generate_vapid.py
```

---

## Tests

### Backend smoke tests (`tests/test_smoke_backend.py`)

These hit a **running** FastAPI instance + real Supabase + real Redis. Each test
creates its own avatar and cleans up afterwards.

```bash
# 1. make sure the stack is up
docker compose up -d

# 2. install pytest + run the smoke marker
pip install pytest pytest-asyncio httpx
pytest -m smoke -v
# Override the API URL if needed:
# API_URL=http://localhost:8000 pytest -m smoke -v
```

Coverage:
- `/health` reachable
- avatar create + list + delete
- platform token connect + list
- notifications list + unread count
- SSE stream emits `connected` frame
- chat agent: simple message + tool execution (`list_avatars`)
- ideas CRUD (create / list / delete)
- duplicate avatar

### Frontend tests (Vitest + React Testing Library)

```bash
cd dashboard
npm install
npm test                # one-shot
npm run test:watch      # watch mode
```

Coverage: `NotificationBell`, `ChatWidget`, `WeeklyCalendar`, `AlertsPanel`.
All API calls are mocked — no backend required.

---

## How a video gets made

1. **Create avatar** in dashboard → LLM generates persona DNA → backend renders portrait prompt → ImageClient → R2 → `avatars.face_url` saved. The face is **fixed** for character consistency across every video.
2. **Configure avatar** in `/avatars/{id}` (7 tabs):
   - **Profile** — DNA editor + Regenerate Image + auto-publish toggle + Duplicate
   - **Platforms** — connect YouTube / TikTok / Instagram tokens
   - **Schedules** — per-type cron slots (Asia/Jerusalem) + vacation mode
   - **Commands** — permanent instructions injected into every script's system prompt
   - **Files** — context files (≤100 MB) referenced by the script generator
   - **Ideas** — content idea bank; one click queues a video from an idea
   - **Activity** — recent videos for this avatar
3. **Produce** — manual ("Video" button) or scheduled. The orchestrator pulls `face_url`, runs script → TTS → lipsync → thumbnail → R2.
4. **Publish** — manual or auto. Routes to YouTube / TikTok / Instagram per the avatar's connected tokens. YouTube also receives the thumbnail via `youtube.thumbnails().set()`.

---

## Notifications

All in-app — Discord webhook removed.

- **In-app bell** in TopBar shows unread count, polls every 30 s.
- **SSE stream** at `GET /notifications/stream` pushes new notifications live.
- **Web Push** (when granted) wakes the user even when the dashboard tab is closed; only `error` and `warning` levels fire push.
- Notifications are written to Supabase via `core.notify.notify()` from anywhere in the codebase.

Pipeline failures, publish failures, video-ready, post-published — all flow through this single channel.

---

## Endpoints (selection)

System:
- `GET /health`, `GET /admin/diagnostics`
- `GET /llm/usage` — daily quota counters per provider

Avatars:
- `GET /avatars`, `POST /avatars/create`
- `GET/PATCH/DELETE /avatars/{id}`
- `POST /avatars/{id}/duplicate`, `POST /avatars/{id}/regenerate-image`
- `GET/POST/PATCH/DELETE /avatars/{id}/commands[/{cmd_id}]`
- `GET/POST/PATCH/DELETE /avatars/{id}/files[/{file_id}]`
- `GET/POST/DELETE /avatars/{id}/ideas[/{idea_id}]` + `POST /…/use`
- `POST /avatars/{id}/platforms/connect`, `DELETE /…/platforms/{platform}`

Videos & posts:
- `POST /videos/produce`, `POST /videos/{id}/retry`, `GET /videos/{id}/status`
- `POST /posts/publish`, `GET /posts/{video_id}/status`

Scheduler:
- `GET /scheduler/status`

Notifications:
- `GET /notifications`, `GET /notifications/unread-count`
- `POST /notifications/{id}/read`, `POST /notifications/read-all`, `DELETE /notifications/{id}`
- `GET /notifications/stream` (SSE)
- `POST /notifications/push/subscribe`, `POST /notifications/push/unsubscribe`

Chat agent:
- `POST /chat`, `GET /chat/history`

Admin:
- `GET/POST /admin/config`, `GET/POST /admin/colab-urls`
- `POST /admin/pause-all`, `POST /admin/clear-queue`, `GET /admin/export`

---

## Architecture

See `docs/architecture.md` for the full data flow: avatars → scheduler → orchestrator → publishers → notifications → chat agent.

---

## Project layout

```
.
├── app/
│   ├── main.py                  # FastAPI app + lifespan + worker boot
│   ├── routers/                 # avatars, videos, posts, scheduler, admin, notifications, chat, analytics
│   └── schemas/models.py
├── core/                        # config, logging, llm_router, notify, redis_client, supabase_client
├── services/
│   ├── persona_generator.py
│   ├── avatar_image.py
│   ├── scheduler.py             # AvatarScheduler (vacation-mode aware)
│   ├── video_orchestrator.py    # script → tts → lipsync → thumbnail → R2 (+ optional auto-publish)
│   ├── script_generator.py
│   ├── colab_client.py
│   ├── publisher.py             # YouTube / TikTok / Instagram
│   ├── r2_uploader.py
│   └── rate_limiter.py
├── tasks/
│   ├── video_worker.py          # python -u -m tasks.video_worker
│   └── token_validator.py
├── infra/migrations/
├── dashboard/                   # React + Vite + Tailwind
├── tests/                       # pytest smoke tests
├── docs/architecture.md
├── scripts/generate_vapid.py
├── docker-compose.yml
└── Dockerfile
```

---

## Gotchas (already fixed — don't re-introduce)

- **`httpx` must stay `<0.28`** — supabase 2.10.0 caps it.
- **Worker must run as a module** (`python -m tasks.video_worker`); script form breaks `core.*` imports.
- **Worker container has no `pgrep`/`ps`** (slim image) — healthcheck reads `/proc/1/cmdline`.
- **FastAPI 0.115+ rejects `status_code=204` with `-> None`** — use `Response(status_code=204)` and `-> Response`.
- **`avatars_router` registered last** in `app/main.py` — otherwise `/avatars/{id}` swallows `/avatars/create`.
