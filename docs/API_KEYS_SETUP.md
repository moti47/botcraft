# Free-tier API keys — setup guide

The new pipeline replaces all Colab GPU servers with free-tier cloud APIs.
This guide walks you through getting each API key and where to paste it.

All entries below go into your **`.env`** file at the repo root.

---

## 1. ElevenLabs — TTS (primary)
**Free tier:** 10,000 characters / month (~30 short videos).

1. Sign up at https://elevenlabs.io
2. Profile → API Keys → Generate new key
3. `.env`: `ELEVENLABS_API_KEY=...`

If you exhaust the monthly quota, the pipeline automatically falls back to
**Edge TTS** which is completely free, no key needed (uses Microsoft Edge's
hidden Read-Aloud endpoint).

---

## 2. Pollinations — image generation
**Free tier:** unrestricted (be polite ~1 req/sec). **No API key required.**

Pollinations is anonymous — you don't need to register. The pipeline
hits `https://image.pollinations.ai/prompt/...` directly.

---

## 3. D-ID — lipsync (primary)
**Free tier:** 5 minutes of generated video / month (~15 short videos).

1. Sign up at https://www.d-id.com
2. Studio → API → Get API Key
3. `.env`: `DID_API_KEY=...`

When the monthly minute budget is gone, the pipeline falls through to:

## 4. Fal.ai — lipsync fallback
**Free tier:** ~$1 in credits / month (~5 short videos).

1. Sign up at https://fal.ai
2. Dashboard → API Keys → Create
3. `.env`: `FAL_API_KEY=...`

Fal.ai also exposes Pika, Kling, Luma, MuseTalk, Wav2Lip etc. — useful as
a single key for many models.

---

## 5. Creatomate — video assembly (primary)
**Free tier:** ~50 credits / month.

1. Sign up at https://creatomate.com
2. Project Settings → API → Generate Key
3. `.env`: `CREATOMATE_API_KEY=...`

Fallback when credits run out: local FFmpeg (no key needed — must be on
the worker container's `$PATH`, which it already is via the base image).

---

## 6. Pexels — stock video B-roll
**Free tier:** 200 requests/hour, 20k/month.

1. Sign up at https://www.pexels.com/api/
2. Confirm email → Get API Key
3. `.env`: `PEXELS_API_KEY=...`

---

## 7. Pixabay — royalty-free music
**Free tier:** 100 req/60s.

1. Sign up at https://pixabay.com
2. Account → API → Get API Key
3. `.env`: `PIXABAY_API_KEY=...`

---

## 8. YouTube Data API v3 — trend mining
**Free quota:** 10,000 units / day. (~80 niche searches/day.)

1. Go to https://console.cloud.google.com
2. Create or pick a project → APIs & Services → Library
3. Enable **YouTube Data API v3**
4. Credentials → Create credentials → API Key (no OAuth needed for read-only)
5. `.env`: `YOUTUBE_API_KEY=...`

> Note: this is **separate from** `YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN`
> which are for OAuth uploads. The Data API key is read-only.

---

## 9. HuggingFace — image generation fallback
**Free tier:** rate-limited but unlimited monthly.

1. Sign up at https://huggingface.co
2. Settings → Access Tokens → New (read scope)
3. `.env`: `HUGGINGFACE_API_KEY=...`

Used as a backup if Pollinations is down.

---

## Quick checklist

Minimum for the system to work end-to-end:

- [x] `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` (already required)
- [x] `GROQ_API_KEY` / `GEMINI_API_KEY` / `CEREBRAS_API_KEY` (one of)
- [x] `R2_*` (storage for finished videos)
- [ ] `ELEVENLABS_API_KEY`  ← TTS
- [ ] `DID_API_KEY`         ← Lipsync
- [ ] `CREATOMATE_API_KEY`  ← Assembly
- [ ] `PIXABAY_API_KEY`     ← Music

Everything else (Pexels, Fal, HuggingFace, YouTube Data API) is **highly
recommended but optional** — the pipeline degrades gracefully when any
single provider key is missing.

---

## Costs after free tier

| Provider    | Past free tier        |
|-------------|-----------------------|
| ElevenLabs  | $5/mo for 30k chars   |
| D-ID        | $5/mo for 10 min      |
| Fal.ai      | pay-per-second (~$0.05/sec lipsync) |
| Creatomate  | $25/mo for 1k credits |
| Pexels      | always free           |
| Pixabay     | always free           |
| YouTube API | always free (quota only) |

Realistic cost for **30 short videos / month**: **$0** if you stay in
free tiers across all providers. Add ~$10/month if you upgrade ElevenLabs
+ D-ID for higher quality.
