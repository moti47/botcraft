-- =====================================================================
-- 010 — Avatar deletion safety: ensure all child-table FK constraints
--       use ON DELETE CASCADE so deleting an avatar never fails with
--       a FK-violation error.
--
-- Migrations 001–009 already set CASCADE on most tables; this migration
-- re-confirms and repairs any that may differ in older Supabase projects.
-- Safe to run multiple times (all ops are idempotent).
-- =====================================================================

-- Helper: drop + recreate FK with CASCADE (runs only if FK exists)
-- -----------------------------------------------------------------------

-- avatar_ideas (created in 006)
DO $$
BEGIN
    ALTER TABLE public.avatar_ideas
        DROP CONSTRAINT IF EXISTS avatar_ideas_avatar_id_fkey;
    ALTER TABLE public.avatar_ideas
        ADD CONSTRAINT avatar_ideas_avatar_id_fkey
        FOREIGN KEY (avatar_id) REFERENCES public.avatars(id) ON DELETE CASCADE;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'avatar_ideas FK already correct or table missing: %', SQLERRM;
END;
$$;

-- avatar_commands (created in 005)
DO $$
BEGIN
    ALTER TABLE public.avatar_commands
        DROP CONSTRAINT IF EXISTS avatar_commands_avatar_id_fkey;
    ALTER TABLE public.avatar_commands
        ADD CONSTRAINT avatar_commands_avatar_id_fkey
        FOREIGN KEY (avatar_id) REFERENCES public.avatars(id) ON DELETE CASCADE;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'avatar_commands FK already correct or table missing: %', SQLERRM;
END;
$$;

-- avatar_files (created in 005)
DO $$
BEGIN
    ALTER TABLE public.avatar_files
        DROP CONSTRAINT IF EXISTS avatar_files_avatar_id_fkey;
    ALTER TABLE public.avatar_files
        ADD CONSTRAINT avatar_files_avatar_id_fkey
        FOREIGN KEY (avatar_id) REFERENCES public.avatars(id) ON DELETE CASCADE;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'avatar_files FK already correct or table missing: %', SQLERRM;
END;
$$;

-- platform_tokens (created in 004)
DO $$
BEGIN
    ALTER TABLE public.platform_tokens
        DROP CONSTRAINT IF EXISTS platform_tokens_avatar_id_fkey;
    ALTER TABLE public.platform_tokens
        ADD CONSTRAINT platform_tokens_avatar_id_fkey
        FOREIGN KEY (avatar_id) REFERENCES public.avatars(id) ON DELETE CASCADE;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'platform_tokens FK already correct or table missing: %', SQLERRM;
END;
$$;

-- notifications (created in 006)
DO $$
BEGIN
    ALTER TABLE public.notifications
        DROP CONSTRAINT IF EXISTS notifications_avatar_id_fkey;
    ALTER TABLE public.notifications
        ADD CONSTRAINT notifications_avatar_id_fkey
        FOREIGN KEY (avatar_id) REFERENCES public.avatars(id) ON DELETE CASCADE;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'notifications FK already correct or table missing: %', SQLERRM;
END;
$$;

-- persona_variants (created in 007)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'persona_variants') THEN
        ALTER TABLE public.persona_variants
            DROP CONSTRAINT IF EXISTS persona_variants_avatar_id_fkey;
        ALTER TABLE public.persona_variants
            ADD CONSTRAINT persona_variants_avatar_id_fkey
            FOREIGN KEY (avatar_id) REFERENCES public.avatars(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'persona_variants FK: %', SQLERRM;
END;
$$;

-- avatar_insights (created in 007)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'avatar_insights') THEN
        ALTER TABLE public.avatar_insights
            DROP CONSTRAINT IF EXISTS avatar_insights_avatar_id_fkey;
        ALTER TABLE public.avatar_insights
            ADD CONSTRAINT avatar_insights_avatar_id_fkey
            FOREIGN KEY (avatar_id) REFERENCES public.avatars(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'avatar_insights FK: %', SQLERRM;
END;
$$;

-- scripts: keep CASCADE (already set in 001)
-- videos:  keep SET NULL (intentional — historical video rows are kept after avatar deletion)
-- posts:   keep SET NULL (intentional — post history is kept for analytics)
