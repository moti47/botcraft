-- =============================================================
-- Migration 012: On-Demand Scheduling + Analytics Polling
-- =============================================================
-- Switches from global cron jobs (trends/learning) to on-demand:
--   • Scheduled videos via videos.scheduled_for
--   • Trends fetched inside produce-video (per-job, not global)
--   • Analytics polled only for recently-posted videos
-- =============================================================

-- -------------------------------------------------------------
-- 1. Add scheduled_for to videos
-- -------------------------------------------------------------
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

-- Index for fast "what's due now?" lookups
CREATE INDEX IF NOT EXISTS idx_videos_scheduled_due
  ON videos(scheduled_for)
  WHERE status = 'queued' AND scheduled_for IS NOT NULL;

COMMENT ON COLUMN videos.scheduled_for IS
  'When the user asked this video to be produced. NULL = produce immediately.';

-- -------------------------------------------------------------
-- 2. Video analytics table (stats polled per-video)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS video_analytics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id        UUID REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
  platform        TEXT NOT NULL,                     -- 'youtube', 'instagram', 'tiktok'
  views           BIGINT DEFAULT 0,
  likes           INTEGER DEFAULT 0,
  comments        INTEGER DEFAULT 0,
  shares          INTEGER DEFAULT 0,
  watch_time_sec  BIGINT DEFAULT 0,
  raw_response    JSONB DEFAULT '{}'::jsonb,
  polled_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, platform, polled_at)
);

CREATE INDEX IF NOT EXISTS idx_analytics_video ON video_analytics(video_id);
CREATE INDEX IF NOT EXISTS idx_analytics_polled ON video_analytics(polled_at DESC);

ALTER TABLE video_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_analytics" ON video_analytics;
CREATE POLICY "users_select_own_analytics"
  ON video_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM videos v
      WHERE v.id = video_analytics.video_id
        AND v.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "service_manage_analytics" ON video_analytics;
CREATE POLICY "service_manage_analytics"
  ON video_analytics FOR ALL
  USING (auth.role() = 'service_role');

-- Realtime broadcast
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'video_analytics'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE video_analytics;
  END IF;
END $$;

-- -------------------------------------------------------------
-- 3. Drop old global cron jobs (if they exist)
-- -------------------------------------------------------------
DO $$
BEGIN
  -- Only run if pg_cron is installed
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('find-viral-topic') WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'find-viral-topic'
    );
    PERFORM cron.unschedule('learn-all') WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'learn-all'
    );
    PERFORM cron.unschedule('process-video-queue') WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'process-video-queue'
    );
  END IF;
EXCEPTION
  WHEN others THEN NULL;  -- ignore errors if jobs don't exist
END $$;

-- =============================================================
-- 4. Create the 2 NEW cron jobs (REPLACE these placeholders!)
-- =============================================================
-- ⚠️  IMPORTANT: Replace before running:
--     YOUR-PROJECT-ID  → your actual Supabase project ref
--     YOUR_SERVICE_ROLE_KEY → service_role key from API settings
--
-- These jobs use pg_net + pg_cron which are pre-installed on Supabase.
-- =============================================================

/*
-- Cron #1: scheduler-tick (every minute)
-- Triggers produce-video for any queued video whose scheduled_for has arrived.
SELECT cron.schedule(
  'scheduler-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR-PROJECT-ID.supabase.co/functions/v1/produce-video',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := jsonb_build_object('video_id', v.id)
  )
  FROM videos v
  WHERE v.status = 'queued'
    AND v.scheduled_for IS NOT NULL
    AND v.scheduled_for <= NOW()
    AND v.scheduled_for > NOW() - INTERVAL '5 minutes';
  $$
);

-- Cron #2: poll-analytics (every 10 minutes)
-- Polls stats only for videos posted in the last 7 days.
SELECT cron.schedule(
  'poll-analytics',
  '*／10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR-PROJECT-ID.supabase.co/functions/v1/poll-stats',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := jsonb_build_object('video_id', v.id)
  )
  FROM videos v
  WHERE v.status = 'posted'
    AND v.ready_at >= NOW() - INTERVAL '7 days';
  $$
);
*/
