/**
 * publish-video — Edge Function
 *
 * Marks a video as 'posted'. For now this is a placeholder; in production
 * it would call YouTube / Instagram / TikTok upload APIs using the user's
 * OAuth tokens (stored in platform_tokens table).
 *
 * Input: { video_id, platforms?: ['yt','tt','ig'] }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { video_id, platforms = ["yt"] } = body as { video_id?: string; platforms?: string[] };

    if (!video_id) {
      return new Response(JSON.stringify({ error: "video_id required" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const auth = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user }, error: authError } = await auth.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify ownership
    const { data: video } = await admin
      .from("videos")
      .select("*, avatars!inner(user_id)")
      .eq("id", video_id)
      .single();

    if (!video || video.avatars?.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Video not found" }), {
        status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (video.status !== "ready_for_review" && video.status !== "ready") {
      return new Response(JSON.stringify({
        error: `Cannot publish — current status is "${video.status}"`,
      }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // TODO: actual platform upload via OAuth tokens. For now, mark as posted.
    const { data: updated, error: updateError } = await admin
      .from("videos")
      .update({
        status: "posted",
        published_platforms: platforms,
        ready_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", video_id)
      .select()
      .single();

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      video: updated,
      message: `Published to ${platforms.join(", ")}`,
    }), {
      status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("publish-video error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
