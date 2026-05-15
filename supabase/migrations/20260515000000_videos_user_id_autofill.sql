-- =============================================================
-- Migration: auto-fill videos.user_id from videos.avatar_id
-- =============================================================
-- Reason: produce-video wasn't setting user_id on insert, so every
-- video row was created with user_id=NULL. The RLS policy on videos
-- requires user_id = auth.uid(), so the dashboard saw zero videos
-- even though they were being produced successfully.
--
-- Fix: backfill historical rows from their avatar's owner, then add
-- a BEFORE INSERT trigger so user_id is always populated even if
-- the caller forgets to set it.
-- =============================================================

-- 1. Backfill existing rows
UPDATE videos v
   SET user_id = a.user_id
  FROM avatars a
 WHERE v.avatar_id = a.id
   AND v.user_id IS NULL
   AND a.user_id IS NOT NULL;

-- 2. Trigger function: if user_id wasn't supplied, derive it
CREATE OR REPLACE FUNCTION videos_fill_user_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.avatar_id IS NOT NULL THEN
    SELECT a.user_id INTO NEW.user_id FROM avatars a WHERE a.id = NEW.avatar_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_videos_fill_user_id ON videos;
CREATE TRIGGER trg_videos_fill_user_id
  BEFORE INSERT ON videos
  FOR EACH ROW EXECUTE FUNCTION videos_fill_user_id();

-- 3. Make sure the RLS policy on videos covers both user_id and avatar ownership.
--    We add a permissive SELECT policy that checks either path so an avatar's
--    legitimate owner always sees its videos.
DO $$
BEGIN
  -- drop any stale conflicting policy with this name (idempotent)
  DROP POLICY IF EXISTS "users_see_own_videos" ON videos;
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE POLICY "users_see_own_videos" ON videos FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM avatars a
       WHERE a.id = videos.avatar_id AND a.user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- And let the owner update / delete their videos (for discard/publish)
DROP POLICY IF EXISTS "users_modify_own_videos" ON videos;
CREATE POLICY "users_modify_own_videos" ON videos FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM avatars a WHERE a.id = videos.avatar_id AND a.user_id = auth.uid())
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "users_delete_own_videos" ON videos;
CREATE POLICY "users_delete_own_videos" ON videos FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM avatars a WHERE a.id = videos.avatar_id AND a.user_id = auth.uid())
    OR auth.role() = 'service_role'
  );
