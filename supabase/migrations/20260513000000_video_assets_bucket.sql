-- Create public bucket for video assets (audio, thumbnails, final videos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'video-assets',
  'video-assets',
  true,
  52428800,                                              -- 50 MB
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'image/png', 'image/jpeg', 'image/webp', 'video/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- Public read access
DROP POLICY IF EXISTS "Public read video-assets" ON storage.objects;
CREATE POLICY "Public read video-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'video-assets');

-- Service role write access
DROP POLICY IF EXISTS "Service write video-assets" ON storage.objects;
CREATE POLICY "Service write video-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'video-assets' AND auth.role() = 'service_role');
