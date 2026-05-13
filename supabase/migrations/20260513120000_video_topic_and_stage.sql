-- =============================================================
-- Migration: add topic + per-stage status tracking to videos
-- =============================================================
-- The Edge Functions (produce-video, direct-video, process-video-queue)
-- all reference videos.topic but the column didn't exist → every
-- production attempt crashed with "column videos.topic does not exist".
-- Also adds currently_in + stage_error for granular pipeline status.
-- =============================================================

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS topic        TEXT,
  ADD COLUMN IF NOT EXISTS currently_in TEXT,
  ADD COLUMN IF NOT EXISTS stage_error  TEXT;

CREATE INDEX IF NOT EXISTS idx_videos_currently_in ON videos(currently_in);

COMMENT ON COLUMN videos.topic        IS 'Final topic for this video (auto-filled from trends if user did not supply one).';
COMMENT ON COLUMN videos.currently_in IS 'Current pipeline stage (e.g., director, script, audio, thumbnail). NULL when idle.';
COMMENT ON COLUMN videos.stage_error  IS 'Which stage failed, if status = failed.';
