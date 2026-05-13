-- =============================================================
-- Migration 000: Bootstrap Schema
-- =============================================================
-- Creates all core tables required by BotCraft.
-- Run this FIRST in a fresh Supabase database, before any other
-- migration. Idempotent — safe to re-run.
-- =============================================================

-- Required extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -------------------------------------------------------------
-- 1. AVATARS — AI personas that produce content
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS avatars (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  niche           TEXT,                              -- tech, fitness, comedy, etc.
  language        TEXT DEFAULT 'EN',                 -- EN, HE, ES...
  tone            TEXT DEFAULT 'engaging',           -- engaging, formal, witty
  avatar_style    TEXT DEFAULT 'realistic',          -- realistic, cartoon, anime
  voice_id        TEXT,                              -- ElevenLabs voice id
  image_url       TEXT,                              -- Pollinations-generated portrait
  bio             TEXT,                              -- LLM-written bio
  brand_identity  JSONB DEFAULT '{}'::jsonb,         -- DNA: colors, fonts, music genre, animation prefs
  music_genre     TEXT,                              -- lo-fi, electronic, cinematic...
  is_active       BOOLEAN DEFAULT TRUE,
  is_paused       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_avatars_active ON avatars(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_avatars_created ON avatars(created_at DESC);

-- -------------------------------------------------------------
-- 2. VIDEOS — generated content
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS videos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avatar_id             UUID REFERENCES avatars(id) ON DELETE CASCADE,
  topic                 TEXT,                        -- video subject
  script                TEXT,                        -- generated script
  visual_director_plan  JSONB DEFAULT '{}'::jsonb,   -- scene-by-scene render plan
  render_options        JSONB DEFAULT '{}'::jsonb,   -- voice, auto_post, etc.
  status                TEXT DEFAULT 'queued'
                        CHECK (status IN ('queued','processing','ready','failed','posted')),
  error_message         TEXT,
  audio_url             TEXT,                        -- TTS output
  video_url             TEXT,                        -- final assembled video (R2/Storage URL)
  thumbnail_url         TEXT,
  duration_seconds      INTEGER,
  published_platforms   TEXT[] DEFAULT '{}',         -- ['yt','tt','ig']
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  ready_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_videos_avatar ON videos(avatar_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);

-- -------------------------------------------------------------
-- 3. TREND_SIGNALS — viral topics discovered by trend engine
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trend_signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avatar_id       UUID REFERENCES avatars(id) ON DELETE CASCADE,
  topic           TEXT NOT NULL,
  source          TEXT NOT NULL,                     -- youtube, google_trends, llm_synthesis
  score           NUMERIC DEFAULT 0,                 -- 0..100 ranking
  metadata        JSONB DEFAULT '{}'::jsonb,         -- query, region, raw stats
  used_in_video   UUID REFERENCES videos(id) ON DELETE SET NULL,
  expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trends_avatar ON trend_signals(avatar_id);
CREATE INDEX IF NOT EXISTS idx_trends_score ON trend_signals(score DESC);
CREATE INDEX IF NOT EXISTS idx_trends_expires ON trend_signals(expires_at);

-- -------------------------------------------------------------
-- 4. LEARNING_FACTS — patterns extracted from analytics
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learning_facts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avatar_id       UUID REFERENCES avatars(id) ON DELETE CASCADE,
  fact            TEXT NOT NULL,                     -- human-readable insight
  confidence      NUMERIC DEFAULT 0.5,               -- 0..1
  category        TEXT,                              -- timing, content, tone, format
  evidence        JSONB DEFAULT '{}'::jsonb,         -- supporting data (video ids, metrics)
  applied         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facts_avatar ON learning_facts(avatar_id);
CREATE INDEX IF NOT EXISTS idx_facts_confidence ON learning_facts(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_facts_created ON learning_facts(created_at DESC);

-- -------------------------------------------------------------
-- 5. VIDEO_QUEUE — job queue (replaces Redis)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS video_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id        UUID REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
  status          TEXT DEFAULT 'queued'
                  CHECK (status IN ('queued','processing','done','failed','retrying')),
  priority        INTEGER DEFAULT 5,                 -- 1=highest, 10=lowest
  attempts        INTEGER DEFAULT 0,
  max_attempts    INTEGER DEFAULT 3,
  worker_id       TEXT,                              -- which Edge Function instance picked it up
  payload         JSONB DEFAULT '{}'::jsonb,         -- pipeline params
  error_message   TEXT,
  scheduled_for   TIMESTAMPTZ DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queue_status ON video_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_scheduled ON video_queue(scheduled_for) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_queue_video ON video_queue(video_id);

-- -------------------------------------------------------------
-- 6. AUTO-UPDATE updated_at triggers
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS avatars_updated_at ON avatars;
CREATE TRIGGER avatars_updated_at
  BEFORE UPDATE ON avatars
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS videos_updated_at ON videos;
CREATE TRIGGER videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------
-- 7. Verify
-- -------------------------------------------------------------
-- After running, check with:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('avatars','videos','trend_signals','learning_facts','video_queue');
-- Expected: 5 rows.
-- =============================================================
