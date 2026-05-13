# Deployment Guide — Vercel + Supabase (No-Infrastructure)

This guide walks you through deploying Viral Empire with **zero servers to manage**:
- **Vercel**: React Dashboard (free tier)
- **Supabase**: Database + Edge Functions + Cron Jobs (free tier)
- **Free-tier APIs**: ElevenLabs, Pollinations, D-ID, Fal, Creatomate, Pixabay, YouTube (all existing)

## Prerequisites

1. **Supabase account** — https://supabase.com (sign up, create project)
2. **Vercel account** — https://vercel.com (sign up)
3. **Git repository** — your GitHub/GitLab repo with this codebase

## Step 1: Supabase Setup

### 1a. Create Project
1. Go to https://supabase.com/dashboard
2. Click "New project"
3. Choose region closest to you
4. Set a strong database password
5. Copy `Project URL` and `Service Role Key` — you'll need these

### 1b. Run Migrations
1. Go to SQL Editor in Supabase dashboard
2. Copy contents of `infra/migrations/001.sql` through `010_video_queue.sql`
3. Paste and execute each migration in order
   - Each migration creates tables (avatars, videos, learning_facts, trend_signals, video_queue, etc.)

### 1c. Enable Realtime (Optional)
For live dashboard updates:
1. Go to "Replication" → select tables `videos`, `avatars`
2. Toggle "Realtime" on

## Step 2: Supabase Edge Functions

### 2a. Deploy Functions
```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref <your-project-ref>

# Deploy Edge Functions
supabase functions deploy produce-video
supabase functions deploy find-viral-topic
supabase functions deploy learn-all
supabase functions deploy process-video-queue
```

After deployment, copy the function URLs from Supabase dashboard.

### 2b. Set Environment Variables
In Supabase → Project Settings → Edge Functions → Secrets:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
GROQ_API_KEY=<your-groq-key>
GEMINI_API_KEY=<your-gemini-key>
ELEVENLABS_API_KEY=<your-elevenlabs-key>
DID_API_KEY=<your-d-id-key>
FAL_API_KEY=<your-fal-key>
CREATOMATE_API_KEY=<your-creatomate-key>
PEXELS_API_KEY=<your-pexels-key>
PIXABAY_API_KEY=<your-pixabay-key>
YOUTUBE_API_KEY=<your-youtube-key>
```

## Step 3: Supabase Cron Jobs

In Supabase dashboard → Cron Jobs:

### 3a. Every 1 minute — process videos
```
POST https://your-project.supabase.co/functions/v1/process-video-queue
Interval: */1 * * * *
```

### 3b. Every 4 hours — refresh trends
```
POST https://your-project.supabase.co/functions/v1/find-viral-topic
Body: {"avatar_id": "*"}  // special wildcard to iterate all active avatars
Interval: 0 */4 * * *
```

### 3c. Daily at 03:00 (Asia/Jerusalem) — learn
```
POST https://your-project.supabase.co/functions/v1/learn-all
Interval: 0 3 * * *
Timezone: Asia/Jerusalem
```

## Step 4: Vercel Dashboard Deployment

### 4a. Connect Repository
1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Select project root: `/`

### 4b. Environment Variables
Add in Vercel → Settings → Environment Variables:
```
VITE_API_URL=https://your-project.supabase.co/functions/v1
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_VAPID_PUBLIC_KEY=<your-vapid-public-key>
```

### 4c. Build Settings
- Framework: Vite
- Build Command: `cd dashboard && npm run build`
- Output Directory: `dashboard/dist`
- Install Command: `cd dashboard && npm install`

### 4d. Deploy
Click "Deploy" — Vercel will auto-build and host your React dashboard.

## Step 5: Update Dashboard API Calls

In `dashboard/src/lib/api.ts` (or wherever you make HTTP calls):

```typescript
const API_BASE = import.meta.env.VITE_API_URL; // https://your-project.supabase.co/functions/v1

export async function produceVideo(avatarId: string, topic?: string) {
  const res = await fetch(`${API_BASE}/produce-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avatar_id: avatarId, topic }),
  });
  return res.json();
}

export async function findViralTopic(avatarId: string) {
  const res = await fetch(`${API_BASE}/find-viral-topic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avatar_id: avatarId }),
  });
  return res.json();
}
```

## Step 6: Test

1. **Dashboard**: Visit your Vercel URL — should see React app
2. **Create Avatar**: Use dashboard to create an avatar
3. **Produce Video**: Click "produce video" — should create job
4. **Check Logs**: Go to Supabase → process-video-queue Cron → Logs (see if jobs are picked up)

## Cost Estimate (Free Tier)

| Service | Free Quota | Cost | Notes |
|---------|-----------|------|-------|
| Supabase | 500MB DB, 500k function calls/mo | $0 | Upgrade to $25/mo if needed |
| Vercel | 100GB bandwidth | $0 | Auto-scales |
| ElevenLabs | 10k chars/mo TTS | $0–$5 | Fallback to Edge TTS |
| D-ID | 5 min/mo lipsync | $0–$5 | Fallback to Fal |
| Pollinations | Unrestricted (be polite) | $0 | No limits |
| Pexels | 200 req/hr | $0 | Always free |
| Pixabay | 100 req/60s | $0 | Always free |
| YouTube API | 10k units/day | $0 | Read-only quota |

**30 videos/month = $0–$15 if you upgrade one provider.**

## Limitations vs Self-Hosted

- **Cold starts**: Edge Functions take ~1-2s first call (Supabase keeps them warm after)
- **Execution time**: Max 120s per function (video pipeline will timeout for complex jobs)
- **Concurrency**: Cron jobs run sequentially (each waits for previous to finish)

For larger workloads, migrate to self-hosted FastAPI + Worker, but this setup works great for testing and small-scale production.

## Next: Local Development

To work locally and test:

```bash
# 1. Install Supabase CLI
npm install -g supabase

# 2. Start local Supabase
supabase start

# 3. In another terminal, start dashboard
cd dashboard
npm install
npm run dev

# 4. In a third terminal, test functions
curl -X POST http://localhost:54321/functions/v1/produce-video \
  -H "Content-Type: application/json" \
  -d '{"avatar_id": "test-uuid", "topic": "trending"}'
```

Local Edge Functions run in Deno, same as production.
