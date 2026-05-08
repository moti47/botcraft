# Viral Empire — Zero-Infrastructure AI Influencer Platform

**Fully serverless AI influencer management platform.** Create avatars, auto-generate viral videos, publish to TikTok/YouTube/Instagram, and continuously improve via data-driven learning — all with **$0 infrastructure cost** (free tier).

> 🚀 **New:** Deployed on Vercel + Supabase (no Docker, no servers)  
> 📊 **Dashboard:** https://viral-empire.vercel.app  
> 🧠 **LLM:** Groq/Gemini/Cerebras (free tier)  
> 🎬 **Media:** ElevenLabs, Pollinations, D-ID, Fal, Creatomate, Pexels, Pixabay (free tier)

---

## Architecture

```
React (Vercel) 
   ↓ HTTP
Supabase Edge Functions (TypeScript)
   ├─ produce-video
   ├─ find-viral-topic
   ├─ learn-all
   └─ process-video-queue (job worker)
   ↓
PostgreSQL (Supabase managed)
   ├ avatars (persona + brand DNA)
   ├ videos (status, render_options, video_url)
   ├ trend_signals (cached viral topics per avatar)
   ├ learning_facts (extracted patterns, confidence 0..1)
   └ video_queue (job queue, replaces Redis)
```

**No FastAPI. No Redis. No Docker. Pure serverless.**

---

## Stack

| Layer | Tech |
|---|---|
| **Dashboard** | React 18 · Vite 5 · TanStack Query · Zustand · Radix UI · Tailwind (Vercel) |
| **API** | Supabase Edge Functions · TypeScript · Deno |
| **Database** | Supabase PostgreSQL · fully managed |
| **Scheduler** | Supabase Cron Jobs (every 1m, 4h, daily) |
| **Job Queue** | Supabase `video_queue` table (no Redis!) |
| **LLM** | Groq → Gemini → Cerebras (smart routing) |
| **Media APIs** | ElevenLabs, D-ID, Pollinations, Fal, Creatomate, Pexels, Pixabay (11 free-tier providers) |

---

## Quick Start (5 minutes)

### 1. Supabase
```bash
# Create project at https://supabase.com
# Copy Project URL and Service Role Key

# Run migrations (001 through 010_video_queue.sql)
# Deploy Edge Functions
supabase functions deploy produce-video
supabase functions deploy find-viral-topic
supabase functions deploy learn-all
supabase functions deploy process-video-queue

# Create Cron Jobs (in Supabase dashboard)
# • Every 1m: process-video-queue
# • Every 4h: find-viral-topic
# • Daily 3 AM: learn-all
```

### 2. Vercel
```bash
# Connect GitHub repo to https://vercel.com
# Set env vars (VITE_API_URL, VITE_SUPABASE_URL, etc.)
# Deploy (auto on git push)
```

### 3. Done!
Open Vercel URL → create avatar → produce video → profit 📈

**See [QUICK_START.md](./docs/QUICK_START.md) for detailed steps.**

---

## Cost (Free Tier)

Generate **30+ videos/month** at **$0/month**:

| Service | Free Quota | Usage |
|---------|-----------|-------|
| Supabase DB | 500MB | ~50k videos |
| Supabase Functions | 500k calls | ~5k (30 videos) |
| Vercel | 100GB bandwidth | ~50MB (dashboard) |
| ElevenLabs | 10k chars | ~9k (30 videos) |
| D-ID | 5 min | ~10 min (paid for overage) |
| Others | Unlimited | $0 |
| **Total** | | **$0–1** |

Upgrade Supabase Pro ($25/mo) for 100+ videos. Still **6–10x cheaper** than self-hosted!

---

## Local Development

```bash
# Install Supabase CLI
npm install -g supabase

# Start local Supabase
supabase start

# In another terminal, start dashboard
cd dashboard && npm run dev

# Test an Edge Function
curl -X POST http://localhost:54321/functions/v1/produce-video \
  -H "Content-Type: application/json" \
  -d '{"avatar_id": "test", "topic": "hello"}'
```

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [QUICK_START.md](./docs/QUICK_START.md) | 5-minute setup |
| [DEPLOY.md](./docs/DEPLOY.md) | Detailed deployment guide |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System overview + data model |
| [SERVERLESS_MIGRATION.md](./docs/SERVERLESS_MIGRATION.md) | Why this approach (before/after) |
| [API_KEYS_SETUP.md](./docs/API_KEYS_SETUP.md) | Per-provider API key setup |

---

## Features

✅ **Persona Generation** — LLM creates avatar personality, voice, visual style  
✅ **Trend Discovery** — YouTube + Google Trends + LLM ranking per avatar  
✅ **Smart Video Pipeline** — Script → TTS → Lipsync → Music → Assembly (11 free APIs)  
✅ **Visual Director** — LLM decomposes script into scenes with zoom/clips/music volume  
✅ **Learning System** — Extracts patterns from analytics, feeds back into prompts  
✅ **Multi-Platform Publishing** — TikTok, YouTube, Instagram (hooks included)  
✅ **Real-Time Dashboard** — React + Supabase Realtime for live updates  
✅ **AI Chat Agent** — LLM-backed assistant with tool use  

---

## Serverless vs Self-Hosted

| Aspect | Serverless (This) | Self-Hosted (Docker) |
|--------|---------|---|
| **Cost** | $0–25/mo | $10–50/mo (server + bandwidth) |
| **DevOps** | None (git push auto-deploys) | Docker, k8s, monitoring |
| **Scaling** | Auto (infinite) | Manual (add replicas) |
| **Cold starts** | ~1-2s (Edge Fns) | <100ms (always warm) |
| **Latency** | ~200ms | ~50ms |
| **Complexity** | Low | High |

**Best for:** <100 avatars / 1000 videos/month  
**Scale beyond:** Migrate to self-hosted FastAPI + k8s (still uses same free media APIs)

---

## API Endpoints

All endpoints are Supabase Edge Functions (TypeScript/Deno):

```bash
# Produce a video
POST /functions/v1/produce-video
{"avatar_id": "uuid", "topic": "trending", "voice": "auto"}

# Find viral topics
POST /functions/v1/find-viral-topic
{"avatar_id": "uuid", "top_n": 5}

# Learn from analytics
POST /functions/v1/learn-all
{}

# Job worker (called by Cron every 1m)
POST /functions/v1/process-video-queue
{}
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full API spec.

---

## Environment Variables

Create `.env` from [.env.example](./.env.example):

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=<service role key>

# LLM (one of: Groq, Gemini, Cerebras)
GROQ_API_KEY=...
GEMINI_API_KEY=...
CEREBRAS_API_KEY=...

# Media providers
ELEVENLABS_API_KEY=...
DID_API_KEY=...
FAL_API_KEY=...
CREATOMATE_API_KEY=...
PEXELS_API_KEY=...
PIXABAY_API_KEY=...
YOUTUBE_API_KEY=...

# Dashboard (Vite env vars)
VITE_API_URL=https://your-project.supabase.co/functions/v1
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

---

## Project Structure

```
viral-empire/
├── dashboard/              # React app (Vercel)
│   ├── src/
│   │   ├── pages/         # Overview, Avatars, Videos, Analytics
│   │   ├── components/    # UI, modals, layout
│   │   ├── lib/api.js     # HTTP + Supabase client
│   │   └── store/         # Zustand global state
│   └── package.json
├── supabase/              # Edge Functions + DB
│   ├── functions/
│   │   ├── produce-video/
│   │   ├── find-viral-topic/
│   │   ├── learn-all/
│   │   └── process-video-queue/
│   └── config.toml
├── infra/
│   └── migrations/        # SQL migrations (001–010)
├── docs/
│   ├── QUICK_START.md
│   ├── DEPLOY.md
│   ├── SERVERLESS_MIGRATION.md
│   └── API_KEYS_SETUP.md
├── ARCHITECTURE.md        # Full system design
└── README.md             # This file
```

---

## Comparison: Before & After

**Before:** Docker Compose, FastAPI, Redis, n8n
```bash
# Old: run full stack locally
docker compose up

# Services: dashboard, fastapi, redis, worker, n8n, postgres
```

**After:** Git push → Vercel auto-deploys
```bash
# New: just push to GitHub
git push origin main

# Services: Vercel (dashboard), Supabase (Edge Fns + DB + Cron)
```

**Result:** ✅ Simpler, faster, cheaper, scales to infinity.

---

## Next Steps

1. **Deploy now:** Follow [QUICK_START.md](./docs/QUICK_START.md)
2. **Understand architecture:** Read [ARCHITECTURE.md](./ARCHITECTURE.md)
3. **Deep dive:** Check [SERVERLESS_MIGRATION.md](./docs/SERVERLESS_MIGRATION.md)
4. **Set up API keys:** Use [API_KEYS_SETUP.md](./docs/API_KEYS_SETUP.md)

---

## Support

- **Questions?** See [QUICK_START.md](./docs/QUICK_START.md) or [DEPLOY.md](./docs/DEPLOY.md)
- **Issues?** Check [ARCHITECTURE.md](./ARCHITECTURE.md) for debugging
- **Local dev?** Run `supabase start && cd dashboard && npm run dev`

---

## License

MIT

---

**Viral Empire — Turn ideas into viral videos, automatically. 🚀**
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
| 007 | `007_persona_variants_and_insights.sql` | `persona_variants` (A/B), `avatar_insights` (LLM cache), `script_consistency_checks`; `videos.persona_variant_id` |

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
