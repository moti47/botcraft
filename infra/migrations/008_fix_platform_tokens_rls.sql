-- =====================================================================
-- 008 — Fix broken RLS policy on platform_tokens
--
-- Migration 004 created a policy that references avatars.user_id,
-- which doesn't exist. This breaks all inserts/updates on platform_tokens.
-- Remove the broken policy; service_role policy is sufficient for the backend.
-- =====================================================================

drop policy if exists "owner access" on public.platform_tokens;
