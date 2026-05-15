/**
 * produce-video — Edge Function
 *
 * Triggered in two ways:
 *   1. User clicks "Produce" in the dashboard
 *      → creates a video row with status='queued' (and optional scheduled_for)
 *   2. Cron `scheduler-tick` calls with { video_id }
 *      → picks up an existing video and runs the pipeline
 *
 * On-demand trend lookup:
 *   If `topic` is empty, fetches a fresh viral topic INSIDE this function.
 *   No global trend cron needed. Saves it to trend_signals for analytics.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";
import { precheck, spendCredits } from "../_shared/credits.ts";

interface RequestBody {
  // For new video creation
  avatar_id?: string;
  topic?: string;
  voice?: string;
  auto_post?: boolean;
  language?: string;
  scheduled_for?: string;  // ISO 8601; null = produce now
  user_command?: string;   // optional: "make it funnier", "emphasize the surprise"

  // For cron-driven execution
  video_id?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};
const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

// ─────────────────────────────────────────────────────────────
// On-demand trend lookup (no global cron — fetched per-video)
// ─────────────────────────────────────────────────────────────
async function fetchTrendForAvatar(avatarId: string, niche: string): Promise<string> {
  // Try a cached trend from the last 6 hours first
  const { data: recent } = await supabase
    .from("trend_signals")
    .select("topic")
    .eq("avatar_id", avatarId)
    .is("used_in_video", null)
    .gte("created_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent?.topic) return recent.topic;

  // No fresh trend → call find-viral-topic
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/find-viral-topic`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ avatar_id: avatarId, niche }),
    });
    const json = await res.json();
    return json.topic || `${niche} insights`;
  } catch (err) {
    console.error("[produce-video] trend lookup failed:", err);
    return `${niche} insights`;
  }
}

// ─────────────────────────────────────────────────────────────
// Run the pipeline for an existing video row
// ─────────────────────────────────────────────────────────────
async function runPipeline(videoId: string) {
  await supabase
    .from("videos")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", videoId);

  const { data: video } = await supabase
    .from("videos")
    .select("*, avatars!inner(*)")
    .eq("id", videoId)
    .single();

  if (!video) throw new Error(`video ${videoId} not found`);
  const avatar = video.avatars;

  // On-demand: fetch trend if no topic
  let topic = video.topic;
  if (!topic) {
    topic = await fetchTrendForAvatar(avatar.id, avatar.niche || "general");
    await supabase.from("videos").update({ topic }).eq("id", videoId);
  }

  // Enqueue to video_queue for the worker
  await supabase.from("video_queue").insert([{
    video_id: videoId,
    status: "queued",
    payload: {
      avatar_id: avatar.id,
      topic,
      voice: video.render_options?.voice || "auto",
      auto_post: video.render_options?.auto_post || false,
      language: video.render_options?.language || avatar.language || "en",
    },
    scheduled_for: new Date().toISOString(),
  }]);

  // Trigger generation immediately (don't wait — fire-and-forget so the
  // user sees the response right away, then realtime updates flip the
  // status to ready_for_review when generation finishes).
  fetch(`${SUPABASE_URL}/functions/v1/process-video-queue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ video_id: videoId }),
  }).catch((err) => console.error("[produce-video] generation trigger failed:", err));

  return { video_id: videoId, status: "processing", topic };
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  try {
    const body: RequestBody = await req.json();

    // Path A: cron-driven
    if (body.video_id) {
      const result = await runPipeline(body.video_id);
      return new Response(JSON.stringify(result), {
        status: 202,
        headers: JSON_HEADERS,
      });
    }

    // Path B: user-initiated
    const {
      avatar_id, topic, voice = "auto", auto_post = false,
      language, scheduled_for = null, user_command = null,
    } = body;

    if (!avatar_id) {
      return new Response(JSON.stringify({ error: "avatar_id required" }), {
        status: 400, headers: JSON_HEADERS,
      });
    }

    const { data: avatar, error: avatarError } = await supabase
      .from("avatars")
      .select("*")
      .eq("id", avatar_id)
      .single();

    if (avatarError || !avatar) {
      return new Response(JSON.stringify({ error: `avatar ${avatar_id} not found` }), {
        status: 404, headers: JSON_HEADERS,
      });
    }

    // Credit guard — the avatar's owner pays. Reject early if they're out.
    if (avatar.user_id) {
      const reason = await precheck(supabase, avatar.user_id, "video");
      if (reason) {
        return new Response(JSON.stringify({
          error: "out_of_credits",
          detail: reason,
          hint: "Upgrade the plan or wait until next month's grant.",
        }), { status: 402, headers: JSON_HEADERS });
      }
    }

    const now = new Date().toISOString();
    const videoId = crypto.randomUUID();

    const { error: insertError } = await supabase.from("videos").insert([{
      id: videoId,
      avatar_id,
      topic: topic || null,
      status: "queued",
      scheduled_for,
      user_command: user_command || null,
      render_options: { voice, auto_post, language: language || avatar.language || "en" },
      created_at: now,
    }]);

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500, headers: JSON_HEADERS,
      });
    }

    // Charge the user (we already passed precheck above)
    if (avatar.user_id) {
      await spendCredits(supabase, avatar.user_id, "video", videoId, { topic });
    }

    // If no scheduled_for → run immediately
    if (!scheduled_for) {
      await runPipeline(videoId);
      return new Response(JSON.stringify({
        video_id: videoId,
        status: "processing",
        message: "Pipeline started",
      }), {
        status: 202, headers: JSON_HEADERS,
      });
    }

    // Otherwise wait for scheduler-tick cron
    return new Response(JSON.stringify({
      video_id: videoId,
      status: "queued",
      scheduled_for,
      message: `Will produce at ${scheduled_for}`,
    }), {
      status: 202, headers: JSON_HEADERS,
    });

  } catch (error) {
    console.error("produce-video error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: JSON_HEADERS,
    });
  }
});
