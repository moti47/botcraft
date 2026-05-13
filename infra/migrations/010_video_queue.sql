-- Migration 010: Video queue table (replaces Redis)
-- Stores pending video jobs for the Cron-based worker

CREATE TABLE IF NOT EXISTS video_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  avatar_id UUID NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | done | failed
  retry_count INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status_created (status, created_at)
);

-- RLS: Service role only
ALTER TABLE video_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON video_queue
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
