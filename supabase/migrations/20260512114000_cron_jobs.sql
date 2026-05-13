-- =============================================================
-- Cron jobs: scheduler-tick + poll-analytics
-- =============================================================
-- Two on-demand triggers replace the old global cron jobs.
-- =============================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Drop previous versions if they exist (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('scheduler-tick') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'scheduler-tick'
  );
  PERFORM cron.unschedule('poll-analytics') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'poll-analytics'
  );
EXCEPTION WHEN others THEN NULL;
END $$;

-- 3. Cron #1: scheduler-tick (every minute)
--    Picks up videos whose scheduled_for has arrived and triggers produce-video.
SELECT cron.schedule(
  'scheduler-tick',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://unhorjseqvqmeoaqajnc.supabase.co/functions/v1/produce-video',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuaG9yanNlcXZxbWVvYXFham5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzAyNDAwNSwiZXhwIjoyMDkyNjAwMDA1fQ.tYT4S_2kA1N_vwTOlAe7Sm_yqHKTsdaJQYiscQjGJMg'
    ),
    body := jsonb_build_object('video_id', v.id::text)
  )
  FROM videos v
  WHERE v.status = 'queued'
    AND v.scheduled_for IS NOT NULL
    AND v.scheduled_for <= NOW()
    AND v.scheduled_for > NOW() - INTERVAL '5 minutes';
  $cron$
);

-- 4. Cron #2: poll-analytics (every 10 minutes)
--    Polls stats for videos posted in the last 7 days.
SELECT cron.schedule(
  'poll-analytics',
  '*/10 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://unhorjseqvqmeoaqajnc.supabase.co/functions/v1/poll-stats',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuaG9yanNlcXZxbWVvYXFham5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzAyNDAwNSwiZXhwIjoyMDkyNjAwMDA1fQ.tYT4S_2kA1N_vwTOlAe7Sm_yqHKTsdaJQYiscQjGJMg'
    ),
    body := jsonb_build_object('video_id', v.id::text)
  )
  FROM videos v
  WHERE v.status = 'posted'
    AND v.ready_at >= NOW() - INTERVAL '7 days';
  $cron$
);

-- 5. Verify
-- SELECT jobname, schedule, active FROM cron.job;
