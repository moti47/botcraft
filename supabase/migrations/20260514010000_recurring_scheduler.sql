-- =============================================================
-- Migration: recurring scheduler — daily slots per avatar
-- =============================================================
-- The previous scheduler only fired one-off videos.scheduled_for rows.
-- Users actually want "publish every day at 10:00 and 16:00" — a daily
-- recurring slot defined on avatars.{short,long,post}_video_schedule.
--
-- This migration adds:
--   1. A SQL helper that returns avatars whose current minute matches
--      one of their schedule.times (Asia/Jerusalem).
--   2. A pg_cron job that runs every minute and POSTs to produce-video
--      for each due avatar — fully self-contained, no external trigger.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Track what we've already triggered today so a single 10:00 slot fires
-- once even if the cron runs twice in the same minute (rare but possible).
CREATE TABLE IF NOT EXISTS scheduler_fires (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avatar_id   UUID NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
  schedule_kind TEXT NOT NULL,  -- 'short_video' | 'long_video' | 'post'
  slot_time   TEXT NOT NULL,    -- 'HH:MM'
  fired_date  DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'Asia/Jerusalem')::date,
  fired_at    TIMESTAMPTZ DEFAULT NOW(),
  video_id    UUID,
  UNIQUE (avatar_id, schedule_kind, slot_time, fired_date)
);
CREATE INDEX IF NOT EXISTS idx_fires_today ON scheduler_fires(fired_date, avatar_id);

-- Returns one row per avatar+kind+slot that should fire RIGHT NOW.
-- "Right now" = the slot's HH:MM matches the current minute in Asia/Jerusalem
-- AND we haven't already recorded a fire for that slot today.
CREATE OR REPLACE FUNCTION due_schedule_slots()
RETURNS TABLE (
  avatar_id UUID,
  user_id UUID,
  niche TEXT,
  language TEXT,
  schedule_kind TEXT,
  slot_time TEXT
) LANGUAGE SQL STABLE AS $$
  WITH now_il AS (
    SELECT to_char(NOW() AT TIME ZONE 'Asia/Jerusalem', 'HH24:MI') AS hhmm,
           (NOW() AT TIME ZONE 'Asia/Jerusalem')::date              AS d
  ),
  -- Unnest each kind's times array; tag with the kind.
  slots AS (
    SELECT a.id AS avatar_id, a.user_id, a.niche, a.language,
           'short_video'::text AS schedule_kind,
           jsonb_array_elements_text(COALESCE(a.short_video_schedule->'times', '[]'::jsonb)) AS slot
    FROM avatars a
    WHERE a.is_active AND NOT a.is_paused
      AND COALESCE((a.short_video_schedule->>'enabled')::boolean, false)
    UNION ALL
    SELECT a.id, a.user_id, a.niche, a.language, 'long_video',
           jsonb_array_elements_text(COALESCE(a.long_video_schedule->'times', '[]'::jsonb))
    FROM avatars a
    WHERE a.is_active AND NOT a.is_paused
      AND COALESCE((a.long_video_schedule->>'enabled')::boolean, false)
    UNION ALL
    SELECT a.id, a.user_id, a.niche, a.language, 'post',
           jsonb_array_elements_text(COALESCE(a.post_schedule->'times', '[]'::jsonb))
    FROM avatars a
    WHERE a.is_active AND NOT a.is_paused
      AND COALESCE((a.post_schedule->>'enabled')::boolean, false)
  )
  SELECT s.avatar_id, s.user_id, s.niche, s.language, s.schedule_kind, s.slot
  FROM slots s, now_il n
  WHERE s.slot = n.hhmm
    AND NOT EXISTS (
      SELECT 1 FROM scheduler_fires f
      WHERE f.avatar_id = s.avatar_id
        AND f.schedule_kind = s.schedule_kind
        AND f.slot_time = s.slot
        AND f.fired_date = n.d
    );
$$;

-- The actual scheduler: claim the due slots (insert into scheduler_fires
-- to take a per-slot lock), then fire produce-video for each.
-- Uses pg_net.http_post which is async — the function returns immediately.
-- produce-video is deployed with verify_jwt=false, so no auth header needed.
CREATE OR REPLACE FUNCTION run_recurring_scheduler()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  rec RECORD;
  count INTEGER := 0;
  project_url TEXT := 'https://unhorjseqvqmeoaqajnc.supabase.co';
BEGIN
  FOR rec IN SELECT * FROM due_schedule_slots() LOOP
    -- Claim the slot first (idempotent — UNIQUE will reject dupes)
    BEGIN
      INSERT INTO scheduler_fires (avatar_id, schedule_kind, slot_time)
      VALUES (rec.avatar_id, rec.schedule_kind, rec.slot_time);
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;  -- another worker beat us to this slot
    END;

    -- Fire produce-video asynchronously. We do NOT pass a topic so the
    -- function pulls a fresh viral trend per its own logic.
    PERFORM net.http_post(
      url := project_url || '/functions/v1/produce-video',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'avatar_id', rec.avatar_id,
        'voice',     'auto',
        'auto_post', false
      )
    );
    count := count + 1;
  END LOOP;

  RETURN count;
END;
$$;

-- Schedule the job: every minute. Replaces any prior version with same name.
DO $$
BEGIN
  PERFORM cron.unschedule('recurring-scheduler')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recurring-scheduler');
EXCEPTION WHEN others THEN NULL;
END $$;

SELECT cron.schedule(
  'recurring-scheduler',
  '* * * * *',
  $$ SELECT run_recurring_scheduler(); $$
);
