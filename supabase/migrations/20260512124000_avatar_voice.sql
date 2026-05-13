-- Voice selection for avatars (ElevenLabs)
ALTER TABLE avatars
  ADD COLUMN IF NOT EXISTS voice_id TEXT,
  ADD COLUMN IF NOT EXISTS voice_name TEXT,
  ADD COLUMN IF NOT EXISTS voice_settings JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN avatars.voice_id IS
  'ElevenLabs voice ID — used by TTS pipeline for video audio';
