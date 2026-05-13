-- =============================================================
-- Migration 011: Row Level Security + Realtime Configuration
-- =============================================================
-- Locks down all tables so users can only see/modify their own data,
-- and enables Realtime broadcasts for INSERT/UPDATE/DELETE events.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Add user_id columns where missing (multi-tenancy)
-- -------------------------------------------------------------
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE learning_facts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE trend_signals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_avatars_user_id ON avatars(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_facts_user_id ON learning_facts(user_id);
CREATE INDEX IF NOT EXISTS idx_trend_signals_user_id ON trend_signals(user_id);

-- -------------------------------------------------------------
-- 2. Enable Row Level Security
-- -------------------------------------------------------------
ALTER TABLE avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_queue ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------
-- 3. Policies: AVATARS
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_own_avatars" ON avatars;
CREATE POLICY "users_select_own_avatars"
  ON avatars FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_avatars" ON avatars;
CREATE POLICY "users_insert_own_avatars"
  ON avatars FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_avatars" ON avatars;
CREATE POLICY "users_update_own_avatars"
  ON avatars FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_avatars" ON avatars;
CREATE POLICY "users_delete_own_avatars"
  ON avatars FOR DELETE
  USING (auth.uid() = user_id);

-- -------------------------------------------------------------
-- 4. Policies: VIDEOS
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_own_videos" ON videos;
CREATE POLICY "users_select_own_videos"
  ON videos FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_videos" ON videos;
CREATE POLICY "users_insert_own_videos"
  ON videos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_videos" ON videos;
CREATE POLICY "users_update_own_videos"
  ON videos FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_videos" ON videos;
CREATE POLICY "users_delete_own_videos"
  ON videos FOR DELETE
  USING (auth.uid() = user_id);

-- -------------------------------------------------------------
-- 5. Policies: LEARNING_FACTS
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_own_facts" ON learning_facts;
CREATE POLICY "users_select_own_facts"
  ON learning_facts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "service_insert_facts" ON learning_facts;
CREATE POLICY "service_insert_facts"
  ON learning_facts FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

-- -------------------------------------------------------------
-- 6. Policies: TREND_SIGNALS
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_own_trends" ON trend_signals;
CREATE POLICY "users_select_own_trends"
  ON trend_signals FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "service_manage_trends" ON trend_signals;
CREATE POLICY "service_manage_trends"
  ON trend_signals FOR ALL
  USING (auth.role() = 'service_role');

-- -------------------------------------------------------------
-- 7. Policies: VIDEO_QUEUE (read-only for users; service writes)
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_own_queue" ON video_queue;
CREATE POLICY "users_select_own_queue"
  ON video_queue FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM videos v
      WHERE v.id = video_queue.video_id
        AND v.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "service_manage_queue" ON video_queue;
CREATE POLICY "service_manage_queue"
  ON video_queue FOR ALL
  USING (auth.role() = 'service_role');

-- -------------------------------------------------------------
-- 8. Enable Realtime (publish changes via WebSocket)
-- -------------------------------------------------------------
-- Add tables to the supabase_realtime publication
DO $$
BEGIN
  -- Avatars
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'avatars'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE avatars;
  END IF;

  -- Videos (most important — users watch this for status updates)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'videos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE videos;
  END IF;

  -- Learning facts
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'learning_facts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE learning_facts;
  END IF;

  -- Video queue
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'video_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE video_queue;
  END IF;
END $$;

-- -------------------------------------------------------------
-- 9. Auto-set user_id on INSERT (trigger)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_user_id_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_avatars_user_id ON avatars;
CREATE TRIGGER set_avatars_user_id
  BEFORE INSERT ON avatars
  FOR EACH ROW EXECUTE FUNCTION set_user_id_on_insert();

DROP TRIGGER IF EXISTS set_videos_user_id ON videos;
CREATE TRIGGER set_videos_user_id
  BEFORE INSERT ON videos
  FOR EACH ROW EXECUTE FUNCTION set_user_id_on_insert();

-- -------------------------------------------------------------
-- 10. Verify with: SELECT * FROM pg_policies WHERE schemaname = 'public';
-- -------------------------------------------------------------
