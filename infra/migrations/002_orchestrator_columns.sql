-- =====================================================================
-- 002 — Orchestrator columns
--
-- The video pipeline produces intermediate artifacts (face portrait, TTS
-- audio) before the final lip-synced MP4. Storing their URLs as first-class
-- columns makes the UI / dashboards / debugging easier than digging through
-- the render_options jsonb.
-- =====================================================================

alter table public.videos
    add column if not exists face_url   text,
    add column if not exists audio_url  text,
    add column if not exists final_path text;

create index if not exists idx_videos_face_url  on public.videos (face_url);
create index if not exists idx_videos_audio_url on public.videos (audio_url);
