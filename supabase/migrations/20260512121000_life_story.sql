-- Add life_story to avatars — full narrative biography (multi-paragraph)
ALTER TABLE avatars
  ADD COLUMN IF NOT EXISTS life_story TEXT;

COMMENT ON COLUMN avatars.life_story IS
  'Full multi-paragraph biography (background, personality, motivation). Generated in the UI language at creation time.';

-- Also store the UI language separately from content language
ALTER TABLE avatars
  ADD COLUMN IF NOT EXISTS ui_language TEXT DEFAULT 'EN';
