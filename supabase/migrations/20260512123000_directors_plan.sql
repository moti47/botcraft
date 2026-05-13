-- The Director's Plan — full AI-orchestrated video production directive.
-- One LLM call decides hook, script, animations, music, thumbnail, transitions.
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS directors_plan JSONB DEFAULT '{}'::jsonb;

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS viral_score INTEGER;

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS user_command TEXT;

COMMENT ON COLUMN videos.directors_plan IS
  'Full video plan from AI Director — sections with animations, music, thumbnail prompt, transitions. Used to drive script gen, audio, thumbnail, future MP4 assembly.';

CREATE INDEX IF NOT EXISTS idx_videos_viral_score
  ON videos(viral_score DESC NULLS LAST)
  WHERE status IN ('posted', 'ready_for_review');
