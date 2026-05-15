# BotCraft — Free vs Paid: what was built, what still costs money

This document is the honest accounting of your vision vs. what's possible on free tier in 2026. Everything in **Built (free)** is live in the codebase now. Everything under **Not built** needs a paid service or paid compute and is flagged with a rough monthly cost.

---

## ✅ Built — works fully on free tier

### Avatar Engine
- Persona creation (name, niche, language, tone, life story, brand identity, voice id, music genre, schedules) — `create-avatar` Edge Function
- Random diversity seeds (ethnicity / age / body / style / gender) injected into the life-story prompt so two avatars in the same niche don't look the same
- Photorealistic portrait via Pollinations (Flux model, 768×768) with concrete photographic descriptors (Canon EOS R5, 85mm, pore-level skin, catchlights, negatives against "AI-looking" skin)
- **Server-side image persistence** — the Pollinations URL is fetched + uploaded to Supabase Storage at `video-assets/avatars/`, so the image survives even if Pollinations rate-limits or expires the URL
- Voice is selected from browser SpeechSynthesis (free, no quota) with `voice_id="browser:Google UK English Female"` or similar
- Life story + physical description (English, for the image gen) + short bio in user's UI language — Groq llama-3.1-8b
- File upload → memory: `ingest-file` parses PDFs (unpdf) and text, chunks at ~600 chars, embeds via HuggingFace MiniLM-L6-v2 (384-dim, free), stores in `avatar_memory` with pgvector

### Brain System
- `avatar_memory` table with pgvector embeddings (HNSW index where supported)
- `avatar_performance` view aggregating posted_count, avg_viral_score, avg_views, avg_likes, avg_retention_pct, last_video_at
- `learning_facts` table (carried over) for nightly pattern extraction
- Director consumes `avatar_performance` + last 5 videos' viral scores + top memories + open user commands when it plans

### AI Director (`direct-video`)
- One Groq llama-3.3-70b call (fallback to 8b on rate-limit) produces the full plan: hook + sections (with per-section animation, b-roll source+query, overlay graphics, emphasis words) + CTA + music (search query, energy, ducking, swells) + thumbnail (prompt, text overlay, facial expression) + transitions + color grade + viral_score_prediction + hashtags
- Pulls real-time viral references from YouTube Data API (free 10k units/day) for the avatar's niche
- Honors `user_command` + pending commands from memory ("be funnier", "always end with X")
- Output stored in `videos.directors_plan` as JSONB

### Pipeline (`process-video-queue`)
- Stage-tracked: `currently_in` + `stage_error` columns + `render_options.stages.<name>` timestamps for `director → script → audio → thumbnail → finalizing`
- Per-stage failures: status flips to `failed`, `stage_error` set to the exact stage, `error_message` prefixed with `[stage]`
- Audio: browser SpeechSynthesis (free), Pollinations TTS fallback, ElevenLabs if the user has a (paid) key

### Chatbot Assistant (`avatar-chatbot`)
- Groq with OpenAI-style tool calling, 7 tools:
  - `list_avatars`, `create_avatar`, `delete_avatar`
  - `produce_video`, `list_videos`
  - `set_schedule`
  - `add_memory`, `get_performance`
- User asks "make my Lumine avatar funnier" → chatbot calls `add_memory` with kind=command → next video's Director honors it
- Up to 4 tool rounds per turn; runs scoped to the authenticated user's data only

### Marketplace skeleton
- `campaigns` table (advertiser brief with budget, niche tags, target languages, per-view rate)
- `campaign_offers` table (proposed to specific avatar+owner pair, status pending/accepted/declined)
- `payouts` table (ledger of money movements, our cut tracked in `platform_fee_cents`)
- `match-campaigns` Edge Function scores avatars against campaigns by niche overlap + language + performance, creates offers for the top N. **All matching is free** (no embedding model required for the basic score, though pgvector is ready if you want to add it)

### Monetization scaffolding
- `user_plans` table — tier, monthly_credits, max_avatars, max_live_minutes, features JSONB
- `usage_credits` table — append-only ledger of grants and spends
- `user_credit_balance` view — current effective balance
- Signup trigger auto-grants 200 free credits/month + 2 avatars
- Cost table in `_shared/credits.ts`: video=10, image=1, live=50, campaign_post=5
- `precheck()` + `spendCredits()` helpers; `produce-video` already enforces the guard (returns HTTP 402 `out_of_credits` if the user can't afford)

### Schema / Ops
- Migrations for everything above, applied to production (Supabase project `unhorjseqvqmeoaqajnc`)
- `topic`, `currently_in`, `stage_error` added to `videos`
- Legacy NOT NULL constraints relaxed (job_id, script_id, persona_variant_id) so the new pipeline doesn't crash on insert
- RLS policies on every new table

---

## ❌ Not built — these need a paid service / paid compute

| Feature you asked for | Why free won't cut it | Approx. monthly cost at MVP scale |
|---|---|---|
| **LoRA per avatar (100% face consistency)** | Free image APIs don't expose LoRA training. Cheapest real option is Replicate (Flux LoRA training ~$2/run, ~5 LoRAs/user) or running a GPU yourself. | $50-200 for ~25-50 LoRAs/month, OR $500+/month for a self-hosted 24GB GPU |
| **Talking head with real lip-sync (D-ID / HeyGen / Tavus)** | D-ID free is 5 min/month. HeyGen has no free tier. Tavus has trials only. | $40-300/month depending on minutes |
| **Studio-quality TTS (ElevenLabs in production)** | Your key was already flagged ("detected unusual activity"). Real production needs $22-99/month at minimum, more if you serve many users. | $22+/month base, scales with characters |
| **Generative B-roll (Runway Gen-3 / Kling / Luma)** | All paid. Free credits run out instantly. Pexels stock works for most niches but not for "explainer of an abstract concept" — your "ssarot hasbara" gap. | $50-100/month for ~30 min generation |
| **Real video assembly (Creatomate / Shotstack)** | Creatomate free tier is 50 credits, ~5 short videos. After that $39/month. | $39+/month |
| **Live streaming (WebRTC + interactive avatar)** | LiveKit free tier has 5GB/month egress, fine for a demo, breaks at scale. Real-time avatars (HeyGen Interactive, Tavus) start at $99/month. | $100-500/month |
| **Multi-avatar conversations on live** | Same as above, multiplied. Each avatar holds a connection. | Per-stream cost ×N avatars |
| **OAuth + actual publishing to YouTube/TikTok/IG** | The APIs are free but require app verification (Google: ~$15 one-time + privacy policy + 2-3 weeks review; TikTok: developer review; Meta: business verification + App Review). Free in dollars but not in time. The `channels` table is ready; the publish-video function is a stub. | $0 cash, 2-6 weeks calendar |
| **Stripe Connect for marketplace payouts** | Stripe itself has no monthly fee but takes 2.9% + 25¢ + 0.25% on Connect transfers. Activation needs business verification. | 3-4% of GMV |
| **Webhooks for analytics (real CTR, retention)** | YouTube Analytics API + TikTok Insights need OAuth + the same app verification above. Free in dollars. | $0 cash, time again |
| **PDF parsing at scale** | unpdf works free up to ~100 pages reliably. Beyond that the Edge Function may time out — needs a worker. | $0 small scale; ~$20/month for a long-running worker |
| **Vector search across all users** (campaign matching with embeddings) | pgvector handles ~100k embeddings free on the Supabase free tier. Beyond that you need Pinecone (free → $70/month) or upgrade Supabase ($25/month). | $0 → $25-70/month at scale |
| **Email/SMS notifications for marketplace offers** | Resend free is 100 emails/day, Twilio has trial only. | $20-50/month for production volume |
| **Auto-moderation of generated content** | OpenAI moderation API is free but rate-limited; running Llama Guard locally is the better path → still needs a GPU. | $0-50/month |
| **Watermarking + content provenance (C2PA)** | C2PA tooling is OSS but signing requires an x509 cert from an authority — ~$50-300/year. | $5-25/month amortized |

### What we deliberately faked / skipped
- **Lip-sync**: we don't actually animate the avatar in the produced video. We deliver a thumbnail + script + audio. The dashboard's `VideoPreviewModal` shows the avatar's still image and plays the audio. To make the still image *speak*, you need D-ID / HeyGen / SadTalker on a GPU — paid.
- **Live streaming**: no Edge Function exists for this. `user_plans.max_live_minutes` is wired but enforcement is a no-op until LiveKit + a streaming worker exist.
- **Real auto-publish**: `publish-video` flips `status` to `posted` but does not call YouTube/TikTok APIs yet. Once you do the app-review dance, fill in the API calls there.
- **Stripe Connect**: `payouts` rows are created but `stripe_transfer_id` stays null. You'd plug Stripe in `process-payouts` (not yet written).

---

## 🟡 Free but with caveats you should know

- **Groq rate limits**: 30 req/min on llama-3.3-70b, 14400 req/day. With 100 active users producing a video each per day = well within limits. At 1000 users/day you'll start hitting RPM; either queue or upgrade.
- **HuggingFace inference**: Free is "best effort" — cold-start can be 20-30s on first call to a model. The `ingest-file` function uses `wait_for_model: true` to handle this. Per-user budget is small; heavy file ingest will rate-limit.
- **YouTube Data API**: 10k units/day. Each search costs 100 units → ~100 trend lookups/day total across all users. Cache aggressively (we already do for 6 hours per avatar).
- **Pollinations**: free and pretty fast but unstable — sometimes returns 503 or a placeholder. The realism prompt is loaded with negatives to fight "AI face" artifacts but you'll occasionally get an off image. The Storage persistence step downgrades gracefully if Pollinations 503s mid-fetch.
- **Supabase free tier**: 500MB DB + 1GB Storage + 50k MAU + 500k Edge Function invocations / month. Adequate for a beta; ~$25/month for Pro when you outgrow it.

---

## 📦 Path from MVP → Paid, in order of ROI

1. **Pay for ElevenLabs ($22/month)** — instantly upgrades audio from browser TTS to studio voices. Highest user-perceived quality jump per dollar.
2. **Pay for Creatomate ($39/month) or write FFmpeg-on-Edge** — turns the still+audio into a real video. Without this you're shipping audio + thumbnail, not actual video.
3. **D-ID Pro ($49/month) for the first 100 talking-head minutes** — actual avatar speaking with lip-sync. Now the demo looks magical.
4. **Replicate Flux LoRA ($30-50/month for ~25 trainings)** — once a user crosses N videos with the same persona, you train a LoRA and switch to it. Faces become rock-solid.
5. **Stripe Connect onboarding** — start collecting on the marketplace. Pays for everything above once a campaign or two clears.

Everything else (live streaming, multi-avatar conversations, real-time interactivity) is post-Series-A territory.
