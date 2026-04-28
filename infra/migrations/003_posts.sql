-- =====================================================================
-- 003 — Posts publisher columns
--
-- The publisher needs three new pieces of metadata on each posts row:
--   * platform_post_id — id returned by the platform (YT video id, IG
--     media id, TikTok publish_id). Lets the dashboard deep-link.
--   * publish_error    — last error string when status='failed'.
--   * retry_count      — how many publish attempts have run; the
--     scheduled-retry worker increments this.
-- =====================================================================

alter table public.posts
    add column if not exists platform_post_id text,
    add column if not exists publish_error    text,
    add column if not exists retry_count      int not null default 0;

create index if not exists idx_posts_platform_post_id
    on public.posts (platform_post_id);

create index if not exists idx_posts_video_platform
    on public.posts (video_id, platform);
