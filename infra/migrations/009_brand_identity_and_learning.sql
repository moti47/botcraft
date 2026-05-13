-- =====================================================================
-- 009 — Brand Identity (per-avatar music/visual DNA) + Learning System
--
-- Adds the "very smart" infrastructure:
--   • brand_identity JSONB on avatars (music genre, visual style, palette,
--     voice tone, animation style, avatar screen-time %, transition pace)
--   • music_genre top-level column for fast filtering
--   • visual_director_plan on videos (the JSON the LLM produces describing
--     scene-by-scene zoom/clips/music volume/transitions)
--   • trend_signals table — cached Google/YouTube/TikTok trend snapshots
--     per niche, refreshed by the trend_hunter workflow
--   • learning_facts table — atomic insights extracted from analytics
--     ("hooks <2s outperform avg by 38%") fed back into prompts
--   • avatar_pipeline_runs — every script→TTS→image→lipsync run, with
--     per-stage providers and timings (so we can compare ElevenLabs vs
--     Edge TTS, Pollinations vs Fal, etc. and pick the winner)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Brand Identity DNA on avatars
-- ---------------------------------------------------------------------
alter table public.avatars
    add column if not exists music_genre text,
    add column if not exists brand_identity jsonb default '{
        "music_genre": null,
        "music_intensity": "medium",
        "visual_style": "modern",
        "color_palette": [],
        "primary_color": null,
        "accent_color": null,
        "font_family": null,
        "animation_style": "smooth",
        "avatar_screen_time_pct": 50,
        "transition_pace": "medium",
        "preferred_visual_types": ["avatar_animation", "stock_video", "kinetic_text"],
        "voice_tone": "neutral",
        "thumbnail_template": null
    }'::jsonb,
    add column if not exists thumbnail_url text,
    add column if not exists thumbnail_template_url text;

create index if not exists idx_avatars_music_genre
    on public.avatars (music_genre)
    where music_genre is not null;

-- ---------------------------------------------------------------------
-- 2. Visual Director plan on videos
-- ---------------------------------------------------------------------
alter table public.videos
    add column if not exists visual_director_plan jsonb,
    add column if not exists music_track_url      text,
    add column if not exists music_track_title    text,
    add column if not exists music_track_source   text,
    add column if not exists scenes_count         int,
    add column if not exists trend_signal_id      uuid;

-- ---------------------------------------------------------------------
-- 3. Trend signals — cached "what is going viral right now per niche"
-- ---------------------------------------------------------------------
create table if not exists public.trend_signals (
    id              uuid primary key default gen_random_uuid(),
    niche           text not null,
    source          text not null,                -- 'google_trends','youtube','tiktok','instagram','reddit'
    topic           text not null,
    score           numeric not null default 0,   -- 0..100 normalized virality
    velocity        numeric,                       -- rate-of-change vs last snapshot
    sample_titles   jsonb default '[]'::jsonb,    -- array of viral titles seen
    sample_hooks    jsonb default '[]'::jsonb,    -- array of opening hooks
    sample_hashtags jsonb default '[]'::jsonb,
    raw             jsonb default '{}'::jsonb,    -- raw API response
    detected_at     timestamptz not null default now(),
    expires_at      timestamptz not null default (now() + interval '24 hours')
);

create index if not exists idx_trend_signals_niche_score
    on public.trend_signals (niche, score desc, detected_at desc);
create index if not exists idx_trend_signals_expires
    on public.trend_signals (expires_at);

alter table public.trend_signals enable row level security;

drop policy if exists "service_all_trend_signals" on public.trend_signals;
create policy "service_all_trend_signals" on public.trend_signals
    for all to service_role using (true) with check (true);

drop policy if exists "anon_read_trend_signals" on public.trend_signals;
create policy "anon_read_trend_signals" on public.trend_signals
    for select to anon using (true);

-- Foreign key on videos
alter table public.videos
    drop constraint if exists videos_trend_signal_fkey;
alter table public.videos
    add constraint videos_trend_signal_fkey
    foreign key (trend_signal_id) references public.trend_signals(id) on delete set null;

-- ---------------------------------------------------------------------
-- 4. Learning facts — atomic insights the system extracts from analytics
-- ---------------------------------------------------------------------
create table if not exists public.learning_facts (
    id           uuid primary key default gen_random_uuid(),
    avatar_id    uuid references public.avatars(id) on delete cascade,
    scope        text not null,                  -- 'global','niche','avatar'
    niche        text,
    category     text not null,                  -- 'hook','length','posting_time','visual_type','music','cta'
    fact         text not null,                  -- "hooks under 2s outperform 5s+ by 38%"
    confidence   numeric not null default 0.5,
    sample_size  int not null default 0,
    metric_delta numeric,                         -- e.g. +0.38 for 38% lift
    evidence     jsonb default '{}'::jsonb,
    is_active    boolean not null default true,
    created_at   timestamptz not null default now(),
    expires_at   timestamptz
);

create index if not exists idx_learning_facts_avatar
    on public.learning_facts (avatar_id, is_active, confidence desc);
create index if not exists idx_learning_facts_niche
    on public.learning_facts (niche, is_active, confidence desc);
create index if not exists idx_learning_facts_global
    on public.learning_facts (scope, is_active, confidence desc)
    where scope = 'global';

alter table public.learning_facts enable row level security;

drop policy if exists "service_all_learning_facts" on public.learning_facts;
create policy "service_all_learning_facts" on public.learning_facts
    for all to service_role using (true) with check (true);

drop policy if exists "anon_read_learning_facts" on public.learning_facts;
create policy "anon_read_learning_facts" on public.learning_facts
    for select to anon using (true);

-- ---------------------------------------------------------------------
-- 5. Pipeline runs — observability for the no-Colab pipeline
-- ---------------------------------------------------------------------
create table if not exists public.avatar_pipeline_runs (
    id                uuid primary key default gen_random_uuid(),
    video_id          uuid references public.videos(id) on delete cascade,
    avatar_id         uuid references public.avatars(id) on delete cascade,
    -- Provider used at each stage (so we can compare quality / cost)
    tts_provider      text,                       -- 'elevenlabs','edge_tts','fal'
    image_provider    text,                       -- 'pollinations','fal','huggingface'
    lipsync_provider  text,                       -- 'd_id','pika','sadtalker'
    music_provider    text,                       -- 'pexels','pixabay','none'
    assembly_provider text,                       -- 'creatomate','ffmpeg','remotion'
    -- Durations (ms) per stage
    script_ms         int,
    tts_ms            int,
    image_ms          int,
    lipsync_ms        int,
    music_ms          int,
    assembly_ms       int,
    total_ms          int,
    -- Cost tracking (free tier credit usage)
    credits_used      jsonb default '{}'::jsonb,
    -- Outcome
    succeeded         boolean,
    error             text,
    error_stage       text,
    started_at        timestamptz not null default now(),
    finished_at       timestamptz
);

create index if not exists idx_pipeline_runs_video on public.avatar_pipeline_runs (video_id);
create index if not exists idx_pipeline_runs_avatar on public.avatar_pipeline_runs (avatar_id, started_at desc);

alter table public.avatar_pipeline_runs enable row level security;

drop policy if exists "service_all_pipeline_runs" on public.avatar_pipeline_runs;
create policy "service_all_pipeline_runs" on public.avatar_pipeline_runs
    for all to service_role using (true) with check (true);

drop policy if exists "anon_read_pipeline_runs" on public.avatar_pipeline_runs;
create policy "anon_read_pipeline_runs" on public.avatar_pipeline_runs
    for select to anon using (true);

-- ---------------------------------------------------------------------
-- 6. Music tracks cache — avoid re-downloading the same track
-- ---------------------------------------------------------------------
create table if not exists public.music_tracks (
    id           uuid primary key default gen_random_uuid(),
    source       text not null,                  -- 'pexels','pixabay','youtube_audio'
    source_id    text not null,                  -- ID at the source
    title        text,
    artist       text,
    genre        text,
    mood         text,
    duration_sec int,
    bpm          int,
    download_url text,
    r2_url       text,                            -- our cached copy on R2
    license      text default 'royalty_free',
    raw          jsonb default '{}'::jsonb,
    created_at   timestamptz not null default now(),
    last_used_at timestamptz,
    use_count    int not null default 0,
    unique (source, source_id)
);

create index if not exists idx_music_tracks_genre on public.music_tracks (genre);
create index if not exists idx_music_tracks_mood on public.music_tracks (mood);

alter table public.music_tracks enable row level security;

drop policy if exists "service_all_music_tracks" on public.music_tracks;
create policy "service_all_music_tracks" on public.music_tracks
    for all to service_role using (true) with check (true);

drop policy if exists "anon_read_music_tracks" on public.music_tracks;
create policy "anon_read_music_tracks" on public.music_tracks
    for select to anon using (true);
