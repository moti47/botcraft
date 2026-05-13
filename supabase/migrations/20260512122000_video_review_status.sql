-- Extend videos.status check to include 'ready_for_review' + 'discarded'.
-- Add columns the new pipeline writes to.

-- Add new columns if missing
ALTER TABLE videos ADD COLUMN IF NOT EXISTS script TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Drop old check constraint (we'll recreate with extended values)
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.videos'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE videos DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE videos
  ADD CONSTRAINT videos_status_check
  CHECK (status IN (
    'queued',
    'processing',
    'ready',                -- back-compat for legacy
    'ready_for_review',     -- new — content generated, awaiting user approval
    'failed',
    'posted',
    'discarded'
  ));
