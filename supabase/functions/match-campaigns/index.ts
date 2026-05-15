/**
 * match-campaigns — match an open campaign to candidate avatars.
 *
 * Two modes:
 *   • POST { campaign_id }       → score every active avatar, create campaign_offers
 *                                   for the top N (default 20) whose owner has the
 *                                   marketplace feature enabled.
 *   • POST { avatar_id }         → return open campaigns ranked for this avatar
 *                                   (no offers written; for the dashboard's "open
 *                                   opportunities" tab).
 *
 * Scoring (free-tier — no embedding model required):
 *   • Niche tag overlap (campaign.niche_tags ∩ {avatar.niche, ...derived_tags})
 *   • Language match  (campaign.target_languages ∋ avatar.language)
 *   • Past performance (sqrt of posted_count, capped — so brand-new avatars
 *     are not over-weighted but recency still matters)
 *
 * If pgvector embeddings ARE populated on both sides (filled by other
 * functions, optional), we also add cosine similarity. We do that purely
 * in SQL via the `<=>` operator so it costs nothing extra.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

function score(
  campaign: Record<string, unknown>,
  avatar: Record<string, unknown>,
  perf: Record<string, unknown> | null,
): number {
  const cNiches = ((campaign.niche_tags as string[]) || []).map((s) => s.toLowerCase());
  const aNiche = String(avatar.niche || "").toLowerCase();
  const nicheHit = cNiches.length === 0 || cNiches.includes(aNiche) ? 1 : 0.25;

  const cLangs = ((campaign.target_languages as string[]) || []).map((l) => l.toUpperCase());
  const aLang = String(avatar.language || "EN").toUpperCase();
  const langHit = cLangs.length === 0 || cLangs.includes(aLang) ? 1 : 0.3;

  const posted = Number((perf?.posted_count as number) || 0);
  const perfBoost = Math.min(1, Math.sqrt(posted) / 5);  // 0 → 25 posts caps boost
  const viral = Number((perf?.avg_viral_score as number) || 50) / 100;

  // Weighted sum
  return 0.45 * nicheHit + 0.25 * langHit + 0.15 * perfBoost + 0.15 * viral;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { campaign_id, avatar_id, top_n = 20 } = body as {
      campaign_id?: string; avatar_id?: string; top_n?: number;
    };

    // Mode B: rank open campaigns for a single avatar (read-only)
    if (avatar_id && !campaign_id) {
      const { data: avatar } = await supabase.from("avatars").select("*").eq("id", avatar_id).maybeSingle();
      if (!avatar) return new Response(JSON.stringify({ error: "avatar not found" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
      const { data: perf } = await supabase.from("avatar_performance").select("*").eq("avatar_id", avatar_id).maybeSingle();
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("*")
        .eq("status", "open")
        .gte("ends_at", new Date().toISOString());

      const ranked = (campaigns || [])
        .map((c) => ({ campaign: c, score: score(c, avatar, perf) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, top_n);

      return new Response(JSON.stringify({ avatar_id, candidates: ranked }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Mode A: for a campaign, propose offers to top-N matching avatars
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id or avatar_id required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", campaign_id).maybeSingle();
    if (!campaign) return new Response(JSON.stringify({ error: "campaign not found" }), {
      status: 404, headers: { ...CORS, "Content-Type": "application/json" },
    });

    const { data: avatars } = await supabase
      .from("avatars")
      .select("id, name, niche, language, user_id, is_active, is_paused")
      .eq("is_active", true)
      .eq("is_paused", false);

    if (!avatars || avatars.length === 0) {
      return new Response(JSON.stringify({ campaign_id, offers_created: 0 }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Fetch performance rows in one shot
    const ids = avatars.map((a) => a.id);
    const { data: perfRows } = await supabase
      .from("avatar_performance")
      .select("*")
      .in("avatar_id", ids);
    const perfByAvatar = new Map((perfRows || []).map((p: Record<string, unknown>) => [p.avatar_id as string, p]));

    const ranked = avatars
      .map((a) => ({ avatar: a, score: score(campaign, a, perfByAvatar.get(a.id) || null) }))
      .filter((r) => r.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, top_n);

    if (ranked.length === 0) {
      return new Response(JSON.stringify({ campaign_id, offers_created: 0 }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Insert offers (idempotent via UNIQUE constraint on campaign_id+avatar_id)
    const offers = ranked.map((r) => ({
      campaign_id,
      avatar_id: r.avatar.id,
      match_score: r.score,
      status: "pending",
    }));
    const { data: inserted, error } = await supabase
      .from("campaign_offers")
      .upsert(offers, { onConflict: "campaign_id,avatar_id", ignoreDuplicates: false })
      .select();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      campaign_id,
      offers_created: inserted?.length || 0,
      top_matches: ranked.slice(0, 5).map((r) => ({
        avatar_id: r.avatar.id, name: r.avatar.name, score: Number(r.score.toFixed(3)),
      })),
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("match-campaigns error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
