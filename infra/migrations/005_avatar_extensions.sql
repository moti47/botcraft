-- =====================================================================
-- 005 — Avatar extensions: schedules, files, commands, image columns
--
-- מוסיף לאווטאר:
--   • טור face_url ו-needs_face_regeneration לטיפול בתמונת הפנים הקבועה
--   • שלושה JSONB schedules נפרדים לסוגי תוכן שונים
--   • טבלת avatar_files (קבצים שמועלים על-ידי המשתמש לכל אווטאר)
--   • טבלת avatar_commands (הוראות קבועות שיוזרקו ל-system prompt)
--
-- שמתי 005 ולא 004 כי 004_platform_tokens.sql כבר קיים.
-- ה-MD שצורף לבקשת ה-refactor מתייחס לקובץ "004" כי לא ידע על 004 הקיים.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. עמודות חדשות על avatars
-- ---------------------------------------------------------------------
alter table public.avatars
  add column if not exists face_url                  text,
  add column if not exists needs_face_regeneration   boolean not null default false,
  add column if not exists short_video_schedule      jsonb default '{"enabled": false, "times": []}'::jsonb,
  add column if not exists long_video_schedule       jsonb default '{"enabled": false, "times": []}'::jsonb,
  add column if not exists post_schedule             jsonb default '{"enabled": false, "times": []}'::jsonb;

-- אינדקס למציאת אווטארים שצריכים rebuild לפנים
create index if not exists idx_avatars_needs_face
    on public.avatars (needs_face_regeneration)
    where needs_face_regeneration = true;

-- ---------------------------------------------------------------------
-- 2. טבלת avatar_files — קבצים שהמשתמש מעלה לאווטאר
-- ---------------------------------------------------------------------
create table if not exists public.avatar_files (
    id              uuid primary key default gen_random_uuid(),
    avatar_id       uuid references public.avatars(id) on delete cascade,
    filename        text not null,
    file_url        text not null,
    file_type       text,
    file_size_bytes bigint,
    description     text,
    uploaded_at     timestamptz default now()
);

create index if not exists idx_avatar_files_avatar
    on public.avatar_files (avatar_id);

alter table public.avatar_files enable row level security;

drop policy if exists "service_all_avatar_files" on public.avatar_files;
create policy "service_all_avatar_files" on public.avatar_files
    for all to service_role using (true) with check (true);

drop policy if exists "anon_read_avatar_files" on public.avatar_files;
create policy "anon_read_avatar_files" on public.avatar_files
    for select to anon using (true);

-- ---------------------------------------------------------------------
-- 3. טבלת avatar_commands — הוראות קבועות, ייכנסו ל-system prompt
-- ---------------------------------------------------------------------
create table if not exists public.avatar_commands (
    id            uuid primary key default gen_random_uuid(),
    avatar_id     uuid references public.avatars(id) on delete cascade,
    command_text  text not null,
    priority      int default 5,
    is_active     boolean default true,
    created_at    timestamptz default now()
);

create index if not exists idx_avatar_commands_avatar
    on public.avatar_commands (avatar_id);
create index if not exists idx_avatar_commands_priority
    on public.avatar_commands (avatar_id, priority desc)
    where is_active = true;

alter table public.avatar_commands enable row level security;

drop policy if exists "service_all_avatar_commands" on public.avatar_commands;
create policy "service_all_avatar_commands" on public.avatar_commands
    for all to service_role using (true) with check (true);

drop policy if exists "anon_read_avatar_commands" on public.avatar_commands;
create policy "anon_read_avatar_commands" on public.avatar_commands
    for select to anon using (true);

-- ---------------------------------------------------------------------
-- 4. הסרת ייחודיות (avatar_id, platform) על platform_tokens
--    כדי לאפשר טוקנים מרובים של אותה פלטפורמה לאותו אווטאר
--    (למשל account ראשי + secondary).
-- ---------------------------------------------------------------------
alter table public.platform_tokens
    drop constraint if exists platform_tokens_avatar_id_platform_key;
