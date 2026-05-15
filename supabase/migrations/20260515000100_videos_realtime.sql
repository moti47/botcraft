-- Ensure videos table is included in the supabase_realtime publication so
-- the dashboard's useVideos subscription receives postgres_changes events.
-- Idempotent: only adds the table if it's not already in the publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'videos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE videos;
  END IF;
END $$;
