# Viral Empire Architecture

**All-in-One AI Influencer Platform with Zero Infrastructure**

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     User (Web Browser)                          │
├─────────────────────────────────────────────────────────────────┤
│                   Vercel (React Dashboard)                      │
│                   https://viral-empire.vercel.app               │
├─────────────────────────────────────────────────────────────────┤
│              Supabase (PostgreSQL + Edge Functions)             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Functions (TypeScript/Deno)                                │ │
│  │ • produce-video      (create + queue video)                │ │
│  │ • find-viral-topic   (discover trends per niche)           │ │
│  │ • learn-all          (extract patterns from analytics)     │ │
│  │ • process-video-queue (job worker, runs every 1m)          │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Database (PostgreSQL)                                       │ │
│  │ • avatars (persona, brand_identity, music_genre)          │ │
│  │ • videos (status, render_options, video_url)              │ │
│  │ • trend_signals (cached viral topics, 24h TTL)            │ │
│  │ • learning_facts (extracted patterns, confidence 0..1)    │ │
│  │ • video_queue (pending jobs, replaces Redis)              │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Cron Jobs (Scheduler)                                       │ │
│  │ • */1 * * * * → process-video-queue (job worker)           │ │
│  │ • 0 */4 * * * → find-viral-topic (trend refresh per avatar)│ │
│  │ • 0 3 * * * → learn-all (nightly pattern learning)         │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                  ┌───────────┴───────────┐
                  │                       │
        ┌─────────▼──────────┐   ┌───────▼──────────┐
        │ Free-Tier Media    │   │ Third-Party APIs │
        │ ├─ ElevenLabs TTS  │   │ ├─ Google Trends │
        │ ├─ D-ID Lipsync    │   │ ├─ YouTube Data  │
        │ ├─ Pollinations AI │   │ └─ Groq/Gemini   │
        │ ├─ Fal.ai SadTalk  │   └───────────────────┘
        │ ├─ Pexels B-roll   │
        │ ├─ Pixabay Music   │
        │ └─ Creatomate Asm  │
        └────────────────────┘
```

---

## Core Concepts

### 1. Avatar (Persona DNA)
Each avatar has:
- **Niche** (e.g., "fitness", "cooking", "gaming")
- **Persona DNA** (JSON):
  - tone (energetic, calm, sarcastic, etc.)
  - voice_gender (male, female, neutral)
  - avatar_screen_time_pct (how much of video is the avatar)
- **Brand Identity** (JSON):
  - music_genre (chill, energetic, cinematic, upbeat)
  - visual_style (animated, realistic, minimalist)
  - color_palette (primary, secondary, accent)
  - animation_preferences (fast, slow, quirky)

### 2. Video Pipeline (No-Colab)
Single orchestration function that stages:
1. **Trend signal** — pulled from `trend_signals` table (or fresh discovery)
2. **Script** — LLM generates hook + beats + CTA
3. **Visual director plan** — LLM decomposes script into 4-9 scenes, each with zoom/clips/music_volume/transition
4. **TTS** — ElevenLabs (10k chars/mo) → Edge TTS (fallback, unlimited)
5. **B-roll** — Pexels API for stock video clips
6. **AI images** — Pollinations (unrestricted, free)
7. **Lipsync** — D-ID (5 min/mo) → Fal.ai SadTalker (fallback)
8. **Music** — Auto-select from cache by avatar's music_genre
9. **Assembly** — Creatomate JSON template → FFmpeg (fallback)
10. **Upload** — S3/R2 (or Supabase Storage)

Each stage logs to `avatar_pipeline_runs` for observability.

### 3. Trend Engine (Smart Discovery)
Per avatar, every 4 hours:
1. Gather YouTube trending + Google Trends (by niche)
2. Merge + deduplicate
3. Rank via LLM considering avatar persona, past performance, learning facts
4. Save top 5 to `trend_signals` (expires in 24h)

Result: avatars always know what's "viral for them", not just globally trending.

### 4. Learning System (Data-Driven Improvement)
Nightly (03:00), per active avatar:
1. Fetch last 30 ready videos + their analytics (views, engagement, watch_time)
2. Ask LLM to extract atomic patterns:
   - "Hooks <3s outperform >5s by 38%"
   - "Videos posted 18:00–21:00 get 20% more views"
   - "Upbeat music wins in fitness niche"
3. Save high-confidence facts (0.5–1.0) to `learning_facts`
4. Next time script_generator, visual_director, or music_selector runs, they pull these facts and apply them

Result: system learns what works for each avatar and continuously improves.

### 5. Video Queue (No Redis)
Instead of Redis:
- Dashboard calls `POST /produce-video` → creates row in `videos` table
- Also inserts to `video_queue` table: `{video_id, status: "pending"}`
- Cron job every 1 minute runs `process-video-queue`
  - Polls `video_queue` for pending jobs
  - Runs the pipeline
  - Updates `videos` status to "ready" or "failed"
  - Marks queue item as "done"

Result: no Redis dependency, fully persisted, resilient to crashes.

---

## Technology Stack

| Layer | Service | Role |
|-------|---------|------|
| **Frontend** | Vercel + React 18 | Dashboard UI (dashboard/) |
| **Compute** | Supabase Edge Functions | API (TypeScript/Deno) |
| **Database** | Supabase PostgreSQL | All data persistence |
| **Scheduler** | Supabase Cron Jobs | Periodic tasks (trends, learning, queue) |
| **Media** | 11 free-tier APIs | TTS, images, lipsync, music, B-roll, assembly |
| **LLM** | Groq / Gemini / Cerebras | Script, trends, learning, visual direction |

**No Docker. No servers. No ops. Pure serverless.**

---

## File Structure

```
botcraft/
├── dashboard/                   # React app (Vercel)
│   ├── src/
│   │   ├── pages/              # Overview, Avatars, Videos, Analytics
│   │   ├── components/         # UI, modals, layout
│   │   ├── lib/api.js          # HTTP + Supabase client
│   │   └── store/              # Zustand global state
│   └── package.json
├── supabase/                    # Edge Functions + config
│   ├── functions/
│   │   ├── produce-video/
│   │   ├── find-viral-topic/
│   │   ├── learn-all/
│   │   ├── process-video-queue/
│   │   └── _shared/
│   └── config.toml
├── infra/
│   └── migrations/
│       ├── 001_avatars.sql
│       ├── 002_videos.sql
│       ├── ...
│       └── 010_video_queue.sql
├── docs/
│   ├── QUICK_START.md          # 5-minute setup
│   ├── DEPLOY.md               # Detailed deployment
│   ├── SERVERLESS_MIGRATION.md # Deep-dive architecture
│   └── API_KEYS_SETUP.md       # Provider setup guide
└── README.md                    # Overview
```

---

## Data Model

### avatars
```sql
id UUID PRIMARY KEY
name TEXT
niche TEXT
persona_dna JSONB  -- {tone, voice_gender, avatar_screen_time_pct}
brand_identity JSONB -- {music_genre, visual_style, color_palette, animation_preferences}
language TEXT DEFAULT 'en'
is_active BOOLEAN DEFAULT true
is_paused BOOLEAN DEFAULT false
created_at TIMESTAMP
```

### videos
```sql
id UUID PRIMARY KEY
job_id UUID
avatar_id UUID REFERENCES avatars
topic TEXT
language TEXT
status TEXT -- queued | processing | ready | failed
video_url TEXT
audio_url TEXT
face_url TEXT
render_options JSONB -- {topic, voice, auto_post, stages{...}, retry_count}
error_message TEXT
created_at TIMESTAMP
```

### trend_signals
```sql
id UUID PRIMARY KEY
avatar_id UUID REFERENCES avatars
topic TEXT
score FLOAT
source TEXT -- youtube | google_trends
created_at TIMESTAMP
expires_at TIMESTAMP  -- 24h TTL
```

### learning_facts
```sql
id UUID PRIMARY KEY
avatar_id UUID REFERENCES avatars
category TEXT -- hook | length | timing | visual | music | cta
fact TEXT
confidence FLOAT -- 0.0 .. 1.0
metric_delta FLOAT -- e.g., 0.38 for "+38%"
created_at TIMESTAMP
```

### video_queue
```sql
id UUID PRIMARY KEY
video_id UUID REFERENCES videos
avatar_id UUID REFERENCES avatars
status TEXT -- pending | done | failed
retry_count INT DEFAULT 0
error_message TEXT
created_at TIMESTAMP
```

---

## API Endpoints (Edge Functions)

### Produce Video
```
POST /functions/v1/produce-video
{
  "avatar_id": "uuid",
  "topic": "trending topic" (optional),
  "voice": "af_bella" (optional, default "auto"),
  "auto_post": false
}
→ {video_id, status: "queued"}
```

### Find Viral Topic
```
POST /functions/v1/find-viral-topic
{
  "avatar_id": "uuid",
  "top_n": 5 (optional)
}
→ {avatar_id, topics: [{topic, score, source}]}
```

### Learn All
```
POST /functions/v1/learn-all
→ {status: "ok", avatars_analyzed: N, results: [...]}
```

### Process Video Queue
```
POST /functions/v1/process-video-queue
(Called by Cron every 1 minute)
→ {status: "ok", video_id, video_url}
```

---

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| Cold start (Edge Function) | ~1-2s | Cron jobs keep warm |
| Video pipeline time | ~3-5 min | TTS + lipsync + assembly |
| Trend discovery | ~30-60s | YouTube + Google Trends + LLM rank |
| Learning analysis | ~60-120s | LLM pattern extraction |
| Database query | <100ms | Direct Supabase (optimized) |
| API call latency | <200ms | Edge Functions close to DB |

---

## Cost Estimate (Free Tier)

| Service | Free Quota | Typical Usage | Cost |
|---------|-----------|---------------|------|
| Supabase DB | 500MB | ~50k video metadata | $0 |
| Supabase Functions | 500k calls/month | 30 videos × 15 calls | $0 |
| Vercel | 100GB bandwidth | ~100MB/month dashboard | $0 |
| ElevenLabs | 10k chars/month | ~15 videos (300 chars each) | $0–$5 |
| D-ID | 5 min/month | ~15 videos (20s each) | $0–$5 |
| Pollinations | Unlimited (polite) | ~30 videos | $0 |
| Pexels | 200 req/hour | ~30 videos | $0 |
| Pixabay | 100 req/minute | ~30 videos | $0 |
| YouTube API | 10k units/day | ~20 searches | $0 |
| **Total** | | **30 videos/month** | **$0** |

Upgrade to Supabase Pro ($25/mo) for 100+ videos/month.

---

## Scaling Path

1. **0–30 videos/month** → All free tier
2. **30–100 videos** → Upgrade Supabase Pro ($25/mo) + maybe ElevenLabs ($5/mo)
3. **100–500 videos** → Supabase Pro, ElevenLabs Pro, D-ID Pro (~$50/mo total)
4. **500+ videos** → Self-host FastAPI + workers, or use dedicated video platform (AWS MediaConvert, etc.)

---

## Development

### Local Dev (No Docker needed!)
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

### Deploy
```bash
# Edge Functions
supabase functions deploy *

# Dashboard (auto-deploy on git push)
# Just push to GitHub, Vercel auto-builds
```

---

## Limitations & Roadmap

### Current Limitations
- Edge Function max execution: 120s (may timeout for very complex pipelines)
- Cron jobs run sequentially (no parallel execution)
- No built-in user authentication (add Supabase Auth later)
- No video storage (currently returns placeholder URLs)

### Roadmap
1. **Supabase Auth** — multi-user accounts
2. **Supabase Storage** — replace R2 with managed S3-compatible storage
3. **Supabase Realtime** — live dashboard updates (pub/sub)
4. **Vector Search** — semantic search of past videos/ideas
5. **Payment Gateway** — Stripe integration for premium tier
6. **Mobile App** — React Native version

---

## Support

- Questions? Check [QUICK_START.md](./docs/QUICK_START.md) or [DEPLOY.md](./docs/DEPLOY.md)
- Bug reports? GitHub issues
- Deep-dive? Read [SERVERLESS_MIGRATION.md](./docs/SERVERLESS_MIGRATION.md)

---

**Viral Empire — AI influencers, zero infrastructure. 🚀**
