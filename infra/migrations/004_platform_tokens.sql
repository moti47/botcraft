-- =====================================================================
-- 004 — Platform tokens per-avatar
--
-- כל אווטאר יכול לחבר מספר פלטפורמות עם הטוקנים שלו עצמו.
-- ה-publisher בוחר אוטומטית רק את הפלטפורמות שיש להן טוקן פעיל.
--
-- שמתי 004 ולא 003 כי 003_posts.sql כבר קיים בתיקייה.
-- =====================================================================

create table if not exists public.platform_tokens (
    id                 uuid primary key default gen_random_uuid(),
    avatar_id          uuid references public.avatars(id) on delete cascade,
    platform           text not null,
    access_token       text,
    refresh_token      text,
    account_id         text,
    token_expires_at   timestamptz,
    is_active          boolean default true,
    created_at         timestamptz default now(),
    unique (avatar_id, platform)
);

create index if not exists idx_platform_tokens_avatar
    on public.platform_tokens (avatar_id);
create index if not exists idx_platform_tokens_active
    on public.platform_tokens (is_active);

-- ---------------------------------------------------------------------
-- Row Level Security — בעלים בלבד יכול לראות / לעדכן את הטוקנים שלו
-- ---------------------------------------------------------------------
alter table public.platform_tokens enable row level security;

drop policy if exists "owner access" on public.platform_tokens;
create policy "owner access" on public.platform_tokens
    for all using (
        avatar_id in (
            select id from public.avatars where user_id = auth.uid()
        )
    );

-- שירות (service_role) תמיד מקבל גישה מלאה — דרוש ל-publisher
drop policy if exists "service_all_platform_tokens" on public.platform_tokens;
create policy "service_all_platform_tokens" on public.platform_tokens
    for all to service_role using (true) with check (true);
