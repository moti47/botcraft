# Architecture

End-to-end data flow for Viral Empire.

## High-level

```
┌─────────────────┐  HTTPS  ┌────────────────┐
│  Dashboard      │ ─────── │  FastAPI :8000 │
│  React + Vite   │         │                │
│  :3000          │ <─SSE── │  routers/*     │
└─────────────────┘         └─────┬──────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
┌──────────────┐         ┌────────────────┐         ┌──────────────┐
│  Redis       │         │  Supabase      │         │  Cloudflare  │
│  • job queue │         │  • avatars     │         │  R2          │
│  • LLM quota │         │  • videos      │         │  • MP4s      │
│  • rate-lim  │         │  • posts       │         │  • thumbs    │
│  • Colab URLs│         │  • notifs      │         └──────────────┘
└──────┬───────┘         │  • ideas       │
       │                 │  • chat        │
       ▼                 └────────────────┘
┌──────────────┐
│  Worker      │
│  consumes    │
│  job queue   │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  VideoOrchestrator                                   │
│   1. script_generator (LLM)                          │
│   2. ConsistencyChecker (compare to persona_dna)     │
│   3. TTS → Colab                                     │
│   4. Image (thumbnail) → Colab → R2                  │
│   5. Lipsync → Colab → R2                            │
│   6. (optional) auto_publish → publisher.py          │
└──────────────────────────────────────────────────────┘
```

## Avatars

`avatars` is the central entity. Created via `POST /avatars/create` →
`services.persona_generator` calls the LLM router for a persona DNA blob, then
`services.avatar_image` renders a fixed portrait via the Colab Image server,
uploads to R2, and saves `face_url`. The face stays constant across every
video the avatar produces — that's how character consistency is achieved.

Per-avatar configuration lives in:

| Table | Purpose |
|---|---|
| `avatar_commands` | Persistent system-prompt instructions injected into every script |
| `avatar_files` | Reference files the script generator pulls context from |
| `avatar_ideas` | Content idea bank — one click queues a video from an idea |
| `platform_tokens` | Per-platform OAuth (YouTube refresh, TikTok access, IG access + account_id) |
| `persona_variants` | (Optional) A/B variants of `persona_dna` for engagement testing |

## Notifications (`core/notify.py`)

A single `notify(title, message, level, ...)` call:

1. Inserts a row into `notifications`.
2. Broadcasts to every open SSE listener via `_sse_listeners` queue list.
3. Fires Web Push (best-effort, only for `error`/`warning` levels) using `pywebpush`.

The dashboard subscribes to `GET /notifications/stream`. Closed tabs still get
push if the user has subscribed via `POST /notifications/push/subscribe`.

Wrappers:
- `notify_video_failure(video_id, stage, reason)`
- `notify_video_ready(video_id)`
- `notify_post_published(video_id, platform, post_id)`
- `notify_publish_failed(video_id, platform, reason)`

## Chat agent (`app/routers/chat.py`)

LLM-backed assistant with a portable JSON-in-text tool protocol — works
across Groq, Gemini, and Cerebras (no native function-calling). Tools:

- `create_avatar(niche, language, tone, avatar_style)`
- `bulk_create_avatars(niches, ...)` — capped at 10
- `produce_video(avatar_id, topic)`
- `pause_avatar(avatar_id, paused)`
- `list_avatars()`
- `list_recent_videos()`

Conversation history is stored in `chat_messages`.

## Scheduler (`services/scheduler.py`)

`AvatarScheduler` is an APScheduler instance with `Asia/Jerusalem` timezone.
Each row in `avatar_commands` with `schedule_cron` becomes a `CronTrigger` job.
The job-fire callback re-reads the avatar row and **skips** if `is_paused` or
`status='paused'` — so toggling vacation mode is instant and doesn't require
re-registering jobs.

`reload_avatar(avatar_id)` is called whenever a schedule is saved.

## Publishers (`services/publisher.py`)

Each platform is a class with `async upload(...) -> str` returning the platform
post ID. All three:

- Refuse to upload without credentials (`PublisherUnavailable`).
- Use `services.rate_limiter` (15/day per avatar+platform, UTC midnight reset).
- Are safe to instantiate without network — failures only happen in `upload()`.

Special behaviors:

| Publisher | Notes |
|---|---|
| `YouTubePublisher` | Resumable upload via google-api-python-client. Detects `≤60 s` and adds `#Shorts` to the title. Sets thumbnail via `youtube.thumbnails().set()` after upload. |
| `TikTokPublisher` | Three-step flow: init → chunked PUT → status poll. |
| `InstagramPublisher` | Reels: container creation → poll → publish. Requires public HTTPS URL (R2). |

Fan-out happens in `app/routers/posts.py`. The `publish` endpoint queries
`platform_tokens` for the avatar, runs all connected platforms in parallel via
`asyncio.gather`, and persists one `posts` row per platform with the outcome.

## Video orchestrator (`services/video_orchestrator.py`)

Per-stage `asyncio.wait_for` timeouts: `script=60s`, `tts=300s`, `image=180s`,
`lipsync=900s`. Each stage stamps a timestamp on `videos.render_options.stages`
so the dashboard can render a timeline.

Failures call `notify_video_failure()` — single channel for all alerts.

If the avatar has `auto_publish=True`, the orchestrator hands the finished
video off to the publisher fan-out automatically.

## Dashboard data flow

- **Server state** lives in TanStack Query (`hooks/useApi.js`). Mutations
  invalidate the relevant query key.
- **Client UI state** lives in a single Zustand store (`store/useStore.js`).
- **SSE bridge** in `App.jsx` keeps notification queries fresh and shows a
  toast for `error`/`warning` levels.
