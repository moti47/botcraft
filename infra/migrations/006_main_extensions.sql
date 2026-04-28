-- =====================================================================
-- 006 — Main extensions
--
-- מוסיף:
--   1. עמודות חדשות על avatars (status, is_paused, auto_publish, avatar_style)
--   2. טבלת notifications — התראות in-app
--   3. טבלת push_subscriptions — Web Push
--   4. טבלת avatar_ideas — מאגר רעיונות תוכן
--   5. טבלת chat_messages — היסטוריית שיחת ה-agent
--   6. טבלת avatar_presets — תבניות מובנות
-- =====================================================================

-- -----------------------------------------------------------------------
-- 1. עמודות חדשות על avatars
-- -----------------------------------------------------------------------

-- status: active | paused — גלוי ב-UI כ-badge
alter table public.avatars
    add column if not exists status text not null default 'active';

-- is_paused: "vacation mode" — משבית את כל התזמונים זמנית
alter table public.avatars
    add column if not exists is_paused boolean not null default false;

-- auto_publish: פרסום אוטומטי של סרטון מוכן לכל הפלטפורמות המחוברות
alter table public.avatars
    add column if not exists auto_publish boolean not null default false;

-- avatar_style: סגנון ויזואלי לתמונה (realistic / anime / 3d / cinematic)
alter table public.avatars
    add column if not exists avatar_style text not null default 'realistic';

create index if not exists idx_avatars_status on public.avatars (status);
create index if not exists idx_avatars_is_paused on public.avatars (is_paused);

-- -----------------------------------------------------------------------
-- 2. notifications — התראות in-app
-- -----------------------------------------------------------------------
create table if not exists public.notifications (
    id          uuid primary key default gen_random_uuid(),
    avatar_id   uuid references public.avatars(id) on delete cascade,
    type        text not null default 'info',
    title       text not null,
    message     text,
    level       text not null default 'info',   -- info | warn | error | success
    is_read     boolean not null default false,
    payload     jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now()
);

create index if not exists idx_notifications_is_read   on public.notifications (is_read);
create index if not exists idx_notifications_avatar    on public.notifications (avatar_id);
create index if not exists idx_notifications_created   on public.notifications (created_at desc);
create index if not exists idx_notifications_level     on public.notifications (level);

alter table public.notifications enable row level security;

drop policy if exists "service_all_notifications" on public.notifications;
create policy "service_all_notifications" on public.notifications
    for all to service_role using (true) with check (true);

drop policy if exists "anon_read_notifications" on public.notifications;
create policy "anon_read_notifications" on public.notifications
    for select to anon using (true);

-- -----------------------------------------------------------------------
-- 3. push_subscriptions — Web Push API
-- -----------------------------------------------------------------------
create table if not exists public.push_subscriptions (
    id          uuid primary key default gen_random_uuid(),
    endpoint    text not null unique,
    keys        jsonb not null default '{}'::jsonb,  -- {p256dh, auth}
    user_agent  text,
    created_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "service_all_push" on public.push_subscriptions;
create policy "service_all_push" on public.push_subscriptions
    for all to service_role using (true) with check (true);

-- -----------------------------------------------------------------------
-- 4. avatar_ideas — מאגר רעיונות תוכן
-- -----------------------------------------------------------------------
create table if not exists public.avatar_ideas (
    id          uuid primary key default gen_random_uuid(),
    avatar_id   uuid references public.avatars(id) on delete cascade,
    idea_text   text not null,
    source      text not null default 'manual',  -- manual | chat | trend
    is_used     boolean not null default false,
    created_at  timestamptz not null default now()
);

create index if not exists idx_avatar_ideas_avatar  on public.avatar_ideas (avatar_id);
create index if not exists idx_avatar_ideas_is_used on public.avatar_ideas (avatar_id, is_used);

alter table public.avatar_ideas enable row level security;

drop policy if exists "service_all_ideas" on public.avatar_ideas;
create policy "service_all_ideas" on public.avatar_ideas
    for all to service_role using (true) with check (true);

drop policy if exists "anon_read_ideas" on public.avatar_ideas;
create policy "anon_read_ideas" on public.avatar_ideas
    for select to anon using (true);

-- -----------------------------------------------------------------------
-- 5. chat_messages — היסטוריית שיחת ה-agent
-- -----------------------------------------------------------------------
create table if not exists public.chat_messages (
    id              uuid primary key default gen_random_uuid(),
    role            text not null,   -- user | assistant | tool
    content         text not null,
    actions_taken   jsonb not null default '[]'::jsonb,
    created_at      timestamptz not null default now()
);

create index if not exists idx_chat_messages_created on public.chat_messages (created_at desc);

alter table public.chat_messages enable row level security;

drop policy if exists "service_all_chat" on public.chat_messages;
create policy "service_all_chat" on public.chat_messages
    for all to service_role using (true) with check (true);

drop policy if exists "anon_read_chat" on public.chat_messages;
create policy "anon_read_chat" on public.chat_messages
    for select to anon using (true);
