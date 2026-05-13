-- Add production_blueprint to avatars — full editable directive for content production
ALTER TABLE avatars
  ADD COLUMN IF NOT EXISTS production_blueprint JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN avatars.production_blueprint IS
  'AI-generated directive: script_template (format/hook/structure), edit_style (cuts/captions/music), visual_style (shots/lighting). Editable per-section.';

CREATE INDEX IF NOT EXISTS idx_avatars_blueprint_gin
  ON avatars USING gin(production_blueprint);
