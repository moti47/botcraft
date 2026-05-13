-- Add missing columns to avatars table for BotCraft persona generation
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS music_genre TEXT;
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS brand_identity JSONB DEFAULT '{}'::jsonb;
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS tone TEXT DEFAULT 'engaging';

-- Backfill image_url from face_url if present (avoid losing existing portraits)
UPDATE avatars SET image_url = face_url WHERE image_url IS NULL AND face_url IS NOT NULL;
