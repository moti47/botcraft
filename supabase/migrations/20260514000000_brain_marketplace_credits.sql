-- =============================================================
-- Migration: Brain System + Marketplace + Credits
-- =============================================================
-- This migration lays the schema groundwork for the full vision:
--   • avatar_memory       — per-avatar long-term memory (RAG-ready)
--   • avatar_performance  — analytics view feeding the Director
--   • channels            — per-avatar platform connections
--   • campaigns           — advertiser briefs
--   • campaign_offers     — match an avatar+owner to a campaign
--   • payouts             — money flowing to creators
--   • usage_credits       — token-bucket per user for quota enforcement
--   • plan_tier           — free / starter / pro / studio
--
-- pgvector is enabled so we can do semantic search over memories
-- without paying for Pinecone. If pgvector isn't available on this
-- project tier we still keep the column as text (degrades gracefully).
-- =============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -------------------------------------------------------------
-- 1. Avatar memory (long-term, RAG)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS avatar_memory (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avatar_id    UUID NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,                          -- 'fact' | 'preference' | 'file' | 'video_lesson' | 'command'
  source       TEXT,                                   -- 'user' | 'system' | 'learning' | filename
  content      TEXT NOT NULL,                          -- the actual snippet (chunked if from a file)
  embedding    vector(384),                            -- 384-dim for free MiniLM-class embeddings
  weight       REAL DEFAULT 1.0,                       -- relevance / freshness multiplier
  metadata     JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  decayed_at   TIMESTAMPTZ,                            -- when this memory was last attenuated
  expires_at   TIMESTAMPTZ                             -- optional hard expiry
);
CREATE INDEX IF NOT EXISTS idx_memory_avatar      ON avatar_memory(avatar_id);
CREATE INDEX IF NOT EXISTS idx_memory_kind        ON avatar_memory(avatar_id, kind);
-- Vector index: HNSW for fast ANN. Skip if pgvector version is too old.
DO $$
BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_memory_embedding ON avatar_memory USING hnsw (embedding vector_cosine_ops)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HNSW index not created (older pgvector?), falling back to ivfflat or none';
END $$;

ALTER TABLE avatar_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_memory_select" ON avatar_memory;
CREATE POLICY "users_own_memory_select" ON avatar_memory FOR SELECT
  USING (EXISTS (SELECT 1 FROM avatars a WHERE a.id = avatar_memory.avatar_id AND a.user_id = auth.uid()));
DROP POLICY IF EXISTS "service_all_memory" ON avatar_memory;
CREATE POLICY "service_all_memory" ON avatar_memory FOR ALL USING (auth.role() = 'service_role');

-- -------------------------------------------------------------
-- 2. Avatar performance view — feeds the Director
-- -------------------------------------------------------------
CREATE OR REPLACE VIEW avatar_performance AS
SELECT
  a.id                                                          AS avatar_id,
  a.name,
  a.niche,
  COUNT(v.id) FILTER (WHERE v.status = 'posted')                AS posted_count,
  COUNT(v.id) FILTER (WHERE v.status = 'ready_for_review')      AS ready_count,
  COUNT(v.id) FILTER (WHERE v.status = 'failed')                AS failed_count,
  AVG(v.viral_score)        FILTER (WHERE v.viral_score IS NOT NULL) AS avg_viral_score,
  AVG(va.views::float)      FILTER (WHERE va.views IS NOT NULL)      AS avg_views,
  AVG(va.likes::float)      FILTER (WHERE va.likes IS NOT NULL)      AS avg_likes,
  AVG((va.watch_time_sec::float / NULLIF(v.duration_sec, 0)) * 100.0)
                            FILTER (WHERE va.watch_time_sec IS NOT NULL AND v.duration_sec > 0) AS avg_retention_pct,
  MAX(v.created_at)                                             AS last_video_at
FROM avatars a
LEFT JOIN videos v          ON v.avatar_id = a.id
LEFT JOIN video_analytics va ON va.video_id = v.id
GROUP BY a.id, a.name, a.niche;

-- -------------------------------------------------------------
-- 3. Channels — per-avatar platform connections (OAuth refresh tokens etc.)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avatar_id       UUID NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL,                  -- 'youtube' | 'tiktok' | 'instagram' | 'twitter' | 'linkedin'
  external_id     TEXT,                           -- channel ID / username on the platform
  display_name    TEXT,
  oauth_token     TEXT,                           -- encrypted in production; for now plain (service-role only)
  refresh_token   TEXT,
  scopes          TEXT[],
  expires_at      TIMESTAMPTZ,
  publish_enabled BOOLEAN DEFAULT FALSE,
  publish_schedule JSONB DEFAULT '{}'::jsonb,     -- per-channel cadence overrides
  status          TEXT DEFAULT 'disconnected',    -- 'connected' | 'disconnected' | 'error'
  last_error      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (avatar_id, platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_channels_avatar ON channels(avatar_id);

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_channels" ON channels;
CREATE POLICY "users_own_channels" ON channels FOR ALL
  USING (EXISTS (SELECT 1 FROM avatars a WHERE a.id = channels.avatar_id AND a.user_id = auth.uid()));
DROP POLICY IF EXISTS "service_all_channels" ON channels;
CREATE POLICY "service_all_channels" ON channels FOR ALL USING (auth.role() = 'service_role');

-- -------------------------------------------------------------
-- 4. Campaigns — advertiser briefs
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title                TEXT NOT NULL,
  brief                TEXT NOT NULL,
  niche_tags           TEXT[],
  target_languages     TEXT[],
  budget_total_cents   INTEGER NOT NULL,
  budget_per_post_cents INTEGER,
  per_view_cents       NUMERIC(10,4),               -- e.g. 0.0025 = quarter cent per view
  required_platforms   TEXT[],                      -- ['youtube','tiktok']
  starts_at            TIMESTAMPTZ DEFAULT NOW(),
  ends_at              TIMESTAMPTZ,
  status               TEXT DEFAULT 'open',         -- 'open' | 'paused' | 'closed'
  embedding            vector(384),                 -- for matching against avatars
  metadata             JSONB DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- Offers: a campaign proposed to a specific avatar owner
CREATE TABLE IF NOT EXISTS campaign_offers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  avatar_id    UUID NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
  match_score  REAL,                                -- 0-1 cosine similarity
  status       TEXT DEFAULT 'pending',              -- 'pending' | 'accepted' | 'declined' | 'expired'
  accepted_at  TIMESTAMPTZ,
  declined_at  TIMESTAMPTZ,
  upfront_paid_cents INTEGER DEFAULT 0,
  total_paid_cents   INTEGER DEFAULT 0,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_id, avatar_id)
);
CREATE INDEX IF NOT EXISTS idx_offers_avatar ON campaign_offers(avatar_id, status);

-- Payouts: actual money movements
CREATE TABLE IF NOT EXISTS payouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id     UUID REFERENCES campaign_offers(id) ON DELETE SET NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL,
  currency     TEXT DEFAULT 'USD',
  reason       TEXT,                                -- 'upfront' | 'per_view' | 'milestone' | 'platform_fee'
  platform_fee_cents INTEGER DEFAULT 0,             -- our cut
  stripe_transfer_id TEXT,
  status       TEXT DEFAULT 'pending',              -- 'pending' | 'sent' | 'failed'
  metadata     JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payouts_user ON payouts(user_id);

ALTER TABLE campaigns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_offers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns_read_all"   ON campaigns;
CREATE POLICY "campaigns_read_all"   ON campaigns FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "campaigns_advertiser_write" ON campaigns;
CREATE POLICY "campaigns_advertiser_write" ON campaigns FOR ALL
  USING (advertiser_user_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "offers_owner_read"    ON campaign_offers;
CREATE POLICY "offers_owner_read"    ON campaign_offers FOR SELECT
  USING (EXISTS (SELECT 1 FROM avatars a WHERE a.id = campaign_offers.avatar_id AND a.user_id = auth.uid())
         OR auth.role() = 'service_role');
DROP POLICY IF EXISTS "offers_owner_update"  ON campaign_offers;
CREATE POLICY "offers_owner_update"  ON campaign_offers FOR UPDATE
  USING (EXISTS (SELECT 1 FROM avatars a WHERE a.id = campaign_offers.avatar_id AND a.user_id = auth.uid())
         OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "payouts_owner_read"   ON payouts;
CREATE POLICY "payouts_owner_read"   ON payouts FOR SELECT
  USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- -------------------------------------------------------------
-- 5. Plan tiers + usage credits
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_plans (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier             TEXT NOT NULL DEFAULT 'free',    -- 'free' | 'starter' | 'pro' | 'studio'
  monthly_credits  INTEGER NOT NULL DEFAULT 200,    -- refilled each month
  max_avatars      INTEGER NOT NULL DEFAULT 2,
  max_live_minutes INTEGER NOT NULL DEFAULT 0,      -- 0 on free
  features         JSONB DEFAULT '{}'::jsonb,       -- flags (e.g., {"can_use_lora": false})
  current_period_start TIMESTAMPTZ DEFAULT date_trunc('month', NOW()),
  stripe_customer_id   TEXT,
  stripe_subscription_id TEXT,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_credits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta        INTEGER NOT NULL,                    -- +grant or -spend
  kind         TEXT NOT NULL,                       -- 'grant_monthly' | 'spend_video' | 'spend_image' | 'spend_live'
  reference_id UUID,                                -- video_id / channel_id / etc.
  metadata     JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credits_user ON usage_credits(user_id, created_at DESC);

-- Cheap balance view (sum since current period start)
CREATE OR REPLACE VIEW user_credit_balance AS
SELECT
  up.user_id,
  up.tier,
  up.monthly_credits,
  COALESCE(SUM(uc.delta) FILTER (WHERE uc.created_at >= up.current_period_start), 0) AS balance,
  up.monthly_credits + COALESCE(SUM(uc.delta) FILTER (WHERE uc.created_at >= up.current_period_start), 0) AS effective_balance
FROM user_plans up
LEFT JOIN usage_credits uc ON uc.user_id = up.user_id
GROUP BY up.user_id, up.tier, up.monthly_credits, up.current_period_start;

ALTER TABLE user_plans     ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_credits  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plans_own"    ON user_plans;
CREATE POLICY "plans_own"    ON user_plans   FOR SELECT USING (user_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS "credits_own"  ON usage_credits;
CREATE POLICY "credits_own"  ON usage_credits FOR SELECT USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- Auto-grant a free plan whenever a new auth.user is created
CREATE OR REPLACE FUNCTION grant_default_plan()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_plans (user_id, tier, monthly_credits, max_avatars, max_live_minutes, features)
  VALUES (NEW.id, 'free', 200, 2, 0, '{"can_use_lora": false, "can_use_marketplace": true}'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO usage_credits (user_id, delta, kind, metadata)
  VALUES (NEW.id, 200, 'grant_monthly', jsonb_build_object('reason','signup'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_plan ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_plan
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION grant_default_plan();

-- Backfill existing users
INSERT INTO user_plans (user_id, tier, monthly_credits, max_avatars)
SELECT id, 'free', 200, 2 FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
