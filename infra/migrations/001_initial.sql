-- =====================================================================
-- Viral Empire — Initial Schema
-- Tables: avatars, scripts, videos, posts, trends
-- + indexes + RLS policies (service_role full access, anon read-only)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- avatars
-- ---------------------------------------------------------------------
create table if not exists public.avatars (
    id                  uuid primary key default gen_random_uuid(),
    name                text,
    handle              text,
    niche               text not null,
    language            text not null default 'en',
    persona_dna         jsonb not null default '{}'::jsonb,
    generator_provider  text,
    generator_model     text,
    is_active           boolean not null default true,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists idx_avatars_niche       on public.avatars (niche);
create index if not exists idx_avatars_language    on public.avatars (language);
create index if not exists idx_avatars_created_at  on public.avatars (created_at desc);
create index if not exists idx_avatars_persona_dna on public.avatars using gin (persona_dna);

-- ---------------------------------------------------------------------
-- scripts
-- ---------------------------------------------------------------------
create table if not exists public.scripts (
    id          uuid primary key default gen_random_uuid(),
    avatar_id   uuid not null references public.avatars(id) on delete cascade,
    topic       text not null,
    title       text,
    script      jsonb not null default '{}'::jsonb,
    language    text,
    provider    text,
    model       text,
    status      text not null default 'draft',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists idx_scripts_avatar_id   on public.scripts (avatar_id);
create index if not exists idx_scripts_status      on public.scripts (status);
create index if not exists idx_scripts_created_at  on public.scripts (created_at desc);
create index if not exists idx_scripts_script_gin  on public.scripts using gin (script);

-- ---------------------------------------------------------------------
-- videos
-- ---------------------------------------------------------------------
create table if not exists public.videos (
    id              uuid primary key default gen_random_uuid(),
    job_id          text unique not null,
    script_id       uuid references public.scripts(id) on delete set null,
    avatar_id       uuid references public.avatars(id) on delete set null,
    priority        int not null default 5,
    render_options  jsonb not null default '{}'::jsonb,
    status          text not null default 'queued',
    video_url       text,
    thumbnail_url   text,
    duration_sec    numeric,
    error_message   text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_videos_status      on public.videos (status);
create index if not exists idx_videos_script_id   on public.videos (script_id);
create index if not exists idx_videos_avatar_id   on public.videos (avatar_id);
create index if not exists idx_videos_created_at  on public.videos (created_at desc);

-- ---------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------
create table if not exists public.posts (
    id              uuid primary key default gen_random_uuid(),
    video_id        uuid references public.videos(id) on delete set null,
    avatar_id       uuid references public.avatars(id) on delete set null,
    platform        text not null,
    platform_post_id text,
    caption         text,
    hashtags        text[] default '{}',
    status          text not null default 'pending',
    scheduled_for   timestamptz,
    posted_at       timestamptz,
    metrics         jsonb not null default '{}'::jsonb,
    error_message   text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_posts_platform    on public.posts (platform);
create index if not exists idx_posts_status      on public.posts (status);
create index if not exists idx_posts_scheduled   on public.posts (scheduled_for);
create index if not exists idx_posts_avatar_id   on public.posts (avatar_id);
create index if not exists idx_posts_video_id    on public.posts (video_id);

-- ---------------------------------------------------------------------
-- trends
-- ---------------------------------------------------------------------
create table if not exists public.trends (
    id          uuid primary key default gen_random_uuid(),
    keyword     text not null,
    platform    text,
    score       numeric not null default 0,
    source      text,
    payload     jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now()
);

create index if not exists idx_trends_score      on public.trends (score desc);
create index if not exists idx_trends_platform   on public.trends (platform);
create index if not exists idx_trends_keyword    on public.trends (keyword);
create index if not exists idx_trends_created_at on public.trends (created_at desc);

-- ---------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

do $$
declare
    t text;
begin
    for t in select unnest(array['avatars', 'scripts', 'videos', 'posts']) loop
        execute format(
            'drop trigger if exists trg_%1$s_updated_at on public.%1$s;', t
        );
        execute format(
            'create trigger trg_%1$s_updated_at
                before update on public.%1$s
                for each row execute function public.set_updated_at();', t
        );
    end loop;
end;
$$;

-- =====================================================================
-- Row Level Security
-- Service role bypasses RLS anyway; these policies define what anon /
-- authenticated callers can see if you ever expose this DB publicly.
-- =====================================================================

alter table public.avatars enable row level security;
alter table public.scripts enable row level security;
alter table public.videos  enable row level security;
alter table public.posts   enable row level security;
alter table public.trends  enable row level security;

-- Anonymous read-only access
drop policy if exists "anon_read_avatars" on public.avatars;
create policy "anon_read_avatars" on public.avatars
    for select to anon using (true);

drop policy if exists "anon_read_scripts" on public.scripts;
create policy "anon_read_scripts" on public.scripts
    for select to anon using (true);

drop policy if exists "anon_read_videos" on public.videos;
create policy "anon_read_videos" on public.videos
    for select to anon using (true);

drop policy if exists "anon_read_posts" on public.posts;
create policy "anon_read_posts" on public.posts
    for select to anon using (true);

drop policy if exists "anon_read_trends" on public.trends;
create policy "anon_read_trends" on public.trends
    for select to anon using (true);

-- Service role: full access (explicit policies — service_role also bypasses RLS by default)
drop policy if exists "service_all_avatars" on public.avatars;
create policy "service_all_avatars" on public.avatars
    for all to service_role using (true) with check (true);

drop policy if exists "service_all_scripts" on public.scripts;
create policy "service_all_scripts" on public.scripts
    for all to service_role using (true) with check (true);

drop policy if exists "service_all_videos" on public.videos;
create policy "service_all_videos" on public.videos
    for all to service_role using (true) with check (true);

drop policy if exists "service_all_posts" on public.posts;
create policy "service_all_posts" on public.posts
    for all to service_role using (true) with check (true);

drop policy if exists "service_all_trends" on public.trends;
create policy "service_all_trends" on public.trends
    for all to service_role using (true) with check (true);
