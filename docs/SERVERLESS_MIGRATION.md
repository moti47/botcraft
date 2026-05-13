# Serverless Migration Guide

**From:** FastAPI + Redis Worker + n8n + Docker Compose  
**To:** Vercel + Supabase Edge Functions + Supabase Cron Jobs

---

## Why This Architecture

| Aspect | Old (Docker) | New (Serverless) |
|--------|-------------|------------------|
| **Server cost** | ~$5–20/month (hosting) | $0–25/month (if you exceed free tier) |
| **Dev ops** | Docker Compose, manual deployments | Git push → auto-deploy (Vercel) |
| **Scaling** | Manual replica management | Auto-scales |
| **Cold starts** | Warm (always running) | ~1-2s first call (Edge Functions cache warm) |
| **Code location** | All Python (FastAPI, services/) | Dashboard: React (Vercel); Functions: TypeScript (Supabase) |
| **Database** | Self-managed PostgreSQL | Fully managed Supabase (PostgreSQL) |
| **Job queue** | Redis (another service) | Supabase `video_queue` table + Cron |

---

## Architecture Changes

### Before: Docker Compose

```
User (Dashboard)
  ↓ HTTP
FastAPI (port 8000)
  ├─→ Services (script_generator, video_pipeline, trend_engine)
  ├─→ Redis (job queue)
  └─→ PostgreSQL (Supabase)

Video Worker (separate container)
  ├─ Polls Redis queue
  └─ Runs video_pipeline

n8n (port 5678)
  ├─ Trend refresh (every 4h) → HTTP call to FastAPI
  └─ Nightly learning (03:00) → HTTP call to FastAPI
```

### After: Vercel + Supabase

```
User (Dashboard)
  ↓ HTTPS
Vercel (React)
  ├─ Calls Edge Functions (HTTPS API)
  └─ Direct Supabase queries (realtime, auth)

Supabase Edge Functions
├─ produce-video (webhook)
├─ find-viral-topic (trend engine)
├─ learn-all (nightly learning)
└─ process-video-queue (job worker)

Supabase Cron Jobs
├─ process-video-queue every 1 minute
├─ find-viral-topic every 4 hours
└─ learn-all daily @ 03:00

PostgreSQL (fully managed)
└─ All tables (avatars, videos, trend_signals, learning_facts, video_queue)
```

---

## Key Changes

### 1. FastAPI → Supabase Edge Functions

FastAPI routes are now TypeScript/Deno functions in `supabase/functions/`:

| Endpoint | Old Path | New Path |
|----------|----------|----------|
| Produce video | `POST /videos/produce` | `POST /functions/v1/produce-video` |
| Find trends | `POST /chat/tools/find_viral_topic` | `POST /functions/v1/find-viral-topic` |
| Learn patterns | `POST /insights/learn-all` | `POST /functions/v1/learn-all` |

**Migration steps:**
1. Delete `app/main.py`, `app/routers/`, `core/`, `services/`, `tasks/`
2. Create `supabase/functions/{name}/index.ts` for each endpoint
3. Rewrite logic in TypeScript using Supabase SDK (not asyncio, httpx, etc.)

### 2. Redis Queue → Supabase `video_queue` Table

Before:
```python
await enqueue_job(queue_name, {"video_id": video_id})
```

After:
```typescript
await supabase
  .from("video_queue")
  .insert([{ video_id, avatar_id, status: "pending" }])
```

A Cron job every 1 minute runs `process-video-queue` to pick up pending jobs.

### 3. n8n Workflows → Supabase Cron Jobs

**Removed:** n8n container, n8n workflows JSON files  
**Added:** Cron jobs defined in Supabase dashboard

| Workflow | Cron Expression | Handler |
|----------|-----------------|---------|
| Trend refresh (every 4h) | `0 */4 * * *` | `find-viral-topic` Edge Function |
| Nightly learning (03:00 Jerusalem) | `0 3 * * *` | `learn-all` Edge Function |
| Video queue worker (every 1m) | `*/1 * * * *` | `process-video-queue` Edge Function |

### 4. Dashboard: Direct Supabase Queries

**Before:** All calls went to FastAPI (`/avatars`, `/videos`, etc.)  
**After:** Dashboard queries Supabase **directly** for read-only data:

```typescript
// Old
const { data } = await api.get("/avatars")

// New
const { data } = await supabase
  .from("avatars")
  .select("*")
```

Mutations still use Edge Functions (to run business logic like LLM calls).

---

## Migration Checklist

### Phase 1: Supabase Setup
- [ ] Create Supabase project
- [ ] Run migrations 001–010 (adds `video_queue` table)
- [ ] Set environment variables in Edge Functions Secrets

### Phase 2: Deploy Edge Functions
- [ ] Write `supabase/functions/produce-video/index.ts`
- [ ] Write `supabase/functions/find-viral-topic/index.ts`
- [ ] Write `supabase/functions/learn-all/index.ts`
- [ ] Write `supabase/functions/process-video-queue/index.ts`
- [ ] Deploy: `supabase functions deploy *`

### Phase 3: Configure Cron Jobs
- [ ] In Supabase dashboard, add Cron Job: process-video-queue every 1 minute
- [ ] In Supabase dashboard, add Cron Job: find-viral-topic every 4 hours
- [ ] In Supabase dashboard, add Cron Job: learn-all daily @ 03:00 Asia/Jerusalem

### Phase 4: Update Dashboard
- [ ] Update `dashboard/src/lib/api.js`: add Supabase client + endpoints
- [ ] Update `dashboard/package.json`: add `@supabase/supabase-js`
- [ ] Test API calls in local dev
- [ ] Set environment variables in Vercel

### Phase 5: Deploy Dashboard
- [ ] Connect repository to Vercel
- [ ] Set build command: `cd dashboard && npm run build`
- [ ] Set environment variables in Vercel
- [ ] Click Deploy

### Phase 6: Test & Monitor
- [ ] Create avatar → produces video
- [ ] Check Cron logs in Supabase dashboard
- [ ] Check Edge Function logs for errors
- [ ] Verify video status updates in real-time

### Phase 7: Cleanup
- [ ] Delete Docker compose setup (optional — keep for local dev)
- [ ] Delete FastAPI code (`app/`, `core/`, `services/`, `tasks/`)
- [ ] Delete `n8n_workflows/` folder
- [ ] Delete `requirements.txt` (Python no longer needed)

---

## Performance Tuning

### Edge Function Cold Starts
Cold starts (~1-2s) happen after 15 minutes of inactivity. To keep warm:
1. Call the function periodically (the Cron jobs do this)
2. Or wrap in a background task (use Supabase task system if needed)

### Timeout Limits
- Edge Functions: max 120s timeout
- Long-running pipelines may need async job handling — currently works because Cron jobs retry

### Database Connection Pooling
Supabase manages connection pooling automatically. Dashboard queries are optimized because they query directly (not via HTTP).

---

## Cost Breakdown (After Scaling)

| Usage | Free Tier | Needs Upgrade? |
|-------|-----------|----------------|
| 30 videos/month | ✓ (all within free tier) | No |
| 100 videos/month | ~500 Edge Function calls + 50MB DB | Maybe (upgrade to Pro: $25/mo) |
| 1000 videos/month | ~10k calls + 500MB DB | Yes (Pro: $25/mo) |

---

## Local Development

To develop locally:

```bash
# Start Supabase
supabase start

# In another terminal, start dashboard
cd dashboard && npm run dev

# Test an Edge Function
curl -X POST http://localhost:54321/functions/v1/produce-video \
  -H "Content-Type: application/json" \
  -d '{"avatar_id": "test", "topic": "hello"}'
```

Your `.env` file still works; the dashboard connects to local Supabase automatically via `VITE_SUPABASE_URL=http://localhost:54321`.

---

## Rollback Plan

If you need to revert:
1. Keep the Docker Compose setup (don't delete yet)
2. Dashboard is already agnostic (uses Edge Functions API, but falls back to FastAPI)
3. Swap `VITE_API_URL` back to `http://localhost:8000`
4. Stop Supabase, start docker compose: `docker compose up`

---

## Future Enhancements

Once you're comfortable with the serverless model:
1. **Use Supabase Realtime** for live dashboard updates (pub/sub)
2. **Supabase Storage** for video/image uploads (replaces R2)
3. **Supabase Auth** for user authentication
4. **Edge Functions per-function environment** (instead of global secrets)
5. **Supabase Vector** for semantic search (if adding RAG later)
