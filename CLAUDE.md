# BotCraft — repo guide

Multi-user AI-influencer platform: each user creates AI personas that auto-produce viral short-form videos and publish to their own channels. **Fully serverless** — no FastAPI backend, no Docker, no Redis worker, no n8n. Just React + Supabase.

## Stack

- **Frontend:** React 18 + Vite + TanStack Query + Zustand + Tailwind + Radix UI. Deployed on Vercel.
- **Backend:** Supabase Edge Functions (Deno/TypeScript). Postgres with RLS + Realtime + Storage + pg_cron + pgvector.
- **AI providers (all free-tier):** Groq (llama-3.3-70b primary, llama-3.1-8b fallback), Gemini, HuggingFace inference (embeddings), Pollinations (image + audio), YouTube Data API (trends), Pexels/Pixabay/Unsplash (b-roll). ElevenLabs/D-ID are integrated but blocked on free tier — we fall back to browser SpeechSynthesis (voice_id prefixed `browser:`).

## Layout

```
botcraft/
├── dashboard/              React app (Vite) — user-facing UI
│   └── src/
│       ├── BotCraftPage.jsx, BotCraftData.jsx   main page + hooks
│       ├── components/                          NewAvatarModal, AvatarDetailModal,
│       │                                        VideoPreviewModal, VoicePicker,
│       │                                        LanguagePicker, AvatarCommandInput, ChatWidget
│       ├── pages/                               routes (Overview, Avatars, Videos, …)
│       └── lib/api.js                           supabase client
├── supabase/
│   ├── functions/          Edge Functions (each in its own folder)
│   │   ├── create-avatar         persona + portrait → Storage
│   │   ├── produce-video         user-initiated or scheduler-tick cron
│   │   ├── process-video-queue   stage-tracked pipeline (script/audio/thumbnail)
│   │   ├── direct-video          THE AI DIRECTOR — single LLM call orchestrates the plan
│   │   ├── find-viral-topic      on-demand trend lookup (YouTube + LLM ranking)
│   │   ├── learn-all             nightly: analytics → learning_facts
│   │   ├── poll-stats            per-video analytics from platforms
│   │   ├── generate-blueprint    production blueprint (DNA → script template)
│   │   ├── update-blueprint      user edits via chat or UI
│   │   ├── avatar-command        user "make it funnier" → command stored, applied next video
│   │   ├── voice-preview, match-voices   voice picker helpers
│   │   ├── proxy-image           bypass Pollinations CORS for the dashboard
│   │   ├── publish-video         marks ready → posted (platform-API stubs)
│   │   ├── discard-video         user rejects, status → discarded
│   │   └── ingest-file           PDF/text → chunks + embeddings → avatar_memory
│   └── migrations/         schema (run with `supabase db push`)
├── infra/migrations/       legacy pre-supabase migrations (kept for reference)
├── docs/                   architecture notes
├── vercel.json             routes /api/* → Supabase Functions
└── .env / .env.example     SUPABASE_*, GROQ_API_KEY, HUGGINGFACE_API_KEY, YOUTUBE_API_KEY, …
```

## Database — key tables

- **avatars** — persona DNA (name, niche, language, life_story, brand_identity JSONB, image_url to Storage, voice_id with `browser:` / `poll:` / ElevenLabs prefix, production_blueprint, music_genre, schedules).
- **videos** — pipeline rows. Status: `queued → processing → ready_for_review → posted | discarded | failed`. Has `topic`, `script`, `audio_url`, `thumbnail_url`, `directors_plan` JSONB, `viral_score`, `currently_in` (live pipeline stage), `stage_error`, `error_message`, `render_options.stages` (per-stage timestamp).
- **video_queue** — work to do (consumed by `process-video-queue`).
- **video_analytics** — per-video per-platform stats, polled.
- **trend_signals** — cached viral topics per avatar.
- **learning_facts** — patterns extracted from past performance.
- **avatar_memory** — long-term RAG store, pgvector 384-dim embeddings.
- **channels** — per-avatar platform connections (OAuth tokens, publish enable).
- **campaigns / campaign_offers / payouts** — advertiser marketplace.
- **user_plans / usage_credits** — quotas, tier, monthly credit bucket. Auto-granted on signup.

RLS is on for everything. Service role bypasses; users see only their own rows.

## The Pipeline (how a video gets made)

1. User clicks **Produce now** in the dashboard.
2. `produce-video` inserts a row in `videos` (status=queued), enqueues to `video_queue`, fires-and-forgets a call to `process-video-queue`.
3. `process-video-queue` flips status to `processing`, sets `currently_in='director'`, calls `direct-video`.
4. `direct-video` is the AI Director: one Groq call combining avatar DNA + last 5 videos' viral_scores + top 3 YouTube refs for this niche → returns full plan (hook, sections, CTA, music, thumbnail, viral_score). Saved to `videos.directors_plan`.
5. Back in `process-video-queue`: `currently_in` flows `script → audio → thumbnail → finalizing`, each stage timestamped in `render_options.stages`. Audio uses browser SpeechSynthesis if `voice_id` starts with `browser:`, else Pollinations or ElevenLabs.
6. Status flips to `ready_for_review`. Realtime pings the dashboard; user reviews and clicks Publish or Discard.

If anything throws, `status=failed`, `stage_error=<stage>`, `error_message=[stage] <msg>`. Granular debugging built in.

## Running

```bash
cd dashboard && npm install && npm run dev    # Vite on :3000
```

Production frontend deploys automatically to Vercel from `main`.
Edge Functions deploy via `supabase functions deploy <name> --no-verify-jwt`.
Migrations apply via `supabase db push` (linked project: `unhorjseqvqmeoaqajnc`).

## Conventions

- **No FastAPI, no Docker, no Redis, no n8n.** All async work is Supabase Edge Functions + pg_cron + Realtime.
- **LLM routing** is per-function (each picks Groq → Gemini → fallback). No central llm_router service.
- **Logs:** `console.log` in Edge Functions → Supabase dashboard.
- **Times** in Asia/Jerusalem on the UI; ISO 8601 / UTC in the DB.
- **All user-facing copy** has EN + HE in `STRINGS` (BotCraftData.jsx).
- **Edge Function naming:** kebab-case folder = function name.
- **Stage tracking:** every long pipeline writes `currently_in` + `render_options.stages.<stage_name>` timestamps so the UI can show a live progress bar.
