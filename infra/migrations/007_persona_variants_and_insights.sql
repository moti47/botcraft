-- ============================================================
-- 007 — A/B testing for persona variants + AI insights cache
-- ============================================================

-- ----------------------------------------------------------
-- persona_variants: each avatar can run 2+ variants in parallel
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS persona_variants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    avatar_id       UUID NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
    label           TEXT NOT NULL,                 -- e.g. "A", "B", "playful tone"
    persona_dna     JSONB NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    -- Engagement aggregates (updated by analytics jobs)
    videos_count    INT NOT NULL DEFAULT 0,
    avg_score       NUMERIC,
    total_views     BIGINT NOT NULL DEFAULT 0,
    total_likes     BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    promoted_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_persona_variants_avatar ON persona_variants(avatar_id, is_active);

-- Tag every video with the variant it was produced under (nullable for legacy)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS persona_variant_id UUID REFERENCES persona_variants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_videos_variant ON videos(persona_variant_id);

-- ----------------------------------------------------------
-- avatar_insights: cached AI analysis (refreshed on demand)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS avatar_insights (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    avatar_id       UUID NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
    summary         TEXT NOT NULL,
    recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- raw blob: best_hours, best_topics, sub_niches, etc.
    analysis        JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    based_on_videos INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_avatar_insights_avatar ON avatar_insights(avatar_id, generated_at DESC);

-- ----------------------------------------------------------
-- script_consistency_checks: persona/script alignment scoring
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS script_consistency_checks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id     UUID REFERENCES videos(id) ON DELETE CASCADE,
    avatar_id    UUID REFERENCES avatars(id) ON DELETE CASCADE,
    score        NUMERIC NOT NULL,          -- 0..1 — higher = closer to persona
    issues       JSONB NOT NULL DEFAULT '[]'::jsonb,
    suggestion   TEXT,
    checked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consistency_video ON script_consistency_checks(video_id);
