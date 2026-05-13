/**
 * poll-stats — Edge Function
 *
 * Polls platform analytics (YouTube/Instagram/TikTok) for a single video.
 * Called by `poll-analytics` cron every 10 minutes for each video posted
 * in the last 7 days.
 *
 * Stats are upserted into video_analytics with current timestamp.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─────────────────────────────────────────────────────────────
// YouTube Data API v3 — videos.list?part=statistics
// ─────────────────────────────────────────────────────────────
async function fetchYouTubeStats(videoId: string) {
  if (!YOUTUBE_API_KEY) return null;

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "statistics");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", YOUTUBE_API_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const json = await res.json();
  const stats = json.items?.[0]?.statistics;
  if (!stats) return null;

  return {
    views: parseInt(stats.viewCount || "0"),
    likes: parseInt(stats.likeCount || "0"),
    comments: parseInt(stats.commentCount || "0"),
    shares: 0,
    raw: stats,
  };
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { video_id } = body;

    if (!video_id) {
      return new Response(JSON.stringify({ error: "video_id required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch the video record to find platform IDs
    const { data: video } = await supabase
      .from("videos")
      .select("id, published_platforms, render_options")
      .eq("id", video_id)
      .single();

    if (!video) {
      return new Response(JSON.stringify({ error: `video ${video_id} not found` }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }

    const platforms = video.published_platforms || [];
    const platformIds = video.render_options?.platform_ids || {};
    const results: Record<string, unknown> = {};

    // Poll YouTube
    if (platforms.includes("yt") && platformIds.yt) {
      const stats = await fetchYouTubeStats(platformIds.yt);
      if (stats) {
        await supabase.from("video_analytics").insert([{
          video_id,
          platform: "youtube",
          views: stats.views,
          likes: stats.likes,
          comments: stats.comments,
          shares: stats.shares,
          raw_response: stats.raw,
          polled_at: new Date().toISOString(),
        }]);
        results.youtube = stats;
      }
    }

    // TODO: add Instagram + TikTok pollers when their APIs are wired up.
    // The pattern is identical to YouTube above.

    return new Response(JSON.stringify({
      video_id,
      polled: Object.keys(results),
      stats: results,
    }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("poll-stats error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
