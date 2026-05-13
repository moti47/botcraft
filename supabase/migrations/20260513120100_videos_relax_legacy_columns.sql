-- =============================================================
-- Migration: drop NOT NULL on legacy video columns
-- =============================================================
-- job_id / script_id / persona_variant_id are remnants of the
-- pre-serverless Redis-worker pipeline. The current pipeline
-- (produce-video → process-video-queue → direct-video) does not
-- populate them, but their NOT NULL constraints made every
-- insert fail with "null value in column job_id violates ...".
--
-- Backfill missing job_ids with the video's own id so legacy
-- joins still resolve, then relax the constraint.
-- =============================================================

UPDATE videos SET job_id     = id WHERE job_id     IS NULL;

ALTER TABLE videos
  ALTER COLUMN job_id     DROP NOT NULL,
  ALTER COLUMN job_id     SET DEFAULT gen_random_uuid();

-- script_id / persona_variant_id may also be NOT NULL in older schemas
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos' AND column_name = 'script_id' AND is_nullable = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE videos ALTER COLUMN script_id DROP NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos' AND column_name = 'persona_variant_id' AND is_nullable = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE videos ALTER COLUMN persona_variant_id DROP NOT NULL';
  END IF;
END $$;
