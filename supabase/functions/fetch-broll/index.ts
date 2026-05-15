/**
 * fetch-broll — get free stock video clips that match a query.
 *
 * Sources, in order: Pexels Videos → Pixabay Videos (fallback).
 * Both have generous free tiers; the Pexels key lives in env, Pixabay too.
 *
 * Body: { query: string, count?: number = 3, orientation?: 'portrait'|'landscape'|'square' }
 * Returns: { clips: [{ url, poster, duration, source }] }
 *
 * Each clip URL is a direct .mp4 the browser can <video src=...> immediately.
 * Public — no auth.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const PEXELS_KEY = Deno.env.get("PEXELS_API_KEY") || "";
const PIXABAY_KEY = Deno.env.get("PIXABAY_API_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

interface Clip {
  url: string;
  poster: string;
  duration: number;
  source: "pexels" | "pixabay";
  width?: number;
  height?: number;
}

async function searchPexels(query: string, count: number, orientation: string): Promise<Clip[]> {
  if (!PEXELS_KEY) return [];
  try {
    const url = new URL("https://api.pexels.com/videos/search");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(Math.min(15, count + 5)));
    url.searchParams.set("orientation", orientation);
    url.searchParams.set("size", "medium");
    const res = await fetch(url.toString(), { headers: { Authorization: PEXELS_KEY } });
    if (!res.ok) return [];
    const data = await res.json();
    const out: Clip[] = [];
    for (const v of data.videos || []) {
      // Pick the smallest hd/sd file that fits the orientation
      const files = (v.video_files || []) as Array<Record<string, unknown>>;
      // Prefer hd 1080p or 720p mp4
      const file = files.find((f) => f.quality === "hd" && (f.file_type === "video/mp4")) ||
                   files.find((f) => f.quality === "sd" && (f.file_type === "video/mp4")) ||
                   files[0];
      if (!file?.link) continue;
      out.push({
        url: String(file.link),
        poster: String(v.image || ""),
        duration: Number(v.duration || 0),
        source: "pexels",
        width: Number(v.width || 0),
        height: Number(v.height || 0),
      });
      if (out.length >= count) break;
    }
    return out;
  } catch (err) {
    console.error("[broll] pexels failed:", err);
    return [];
  }
}

async function searchPixabay(query: string, count: number): Promise<Clip[]> {
  if (!PIXABAY_KEY) return [];
  try {
    const url = new URL("https://pixabay.com/api/videos/");
    url.searchParams.set("key", PIXABAY_KEY);
    url.searchParams.set("q", query);
    url.searchParams.set("per_page", String(Math.min(15, count + 5)));
    url.searchParams.set("video_type", "all");
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    const out: Clip[] = [];
    for (const v of data.hits || []) {
      const vids = v.videos || {};
      const file = vids.medium?.url || vids.small?.url || vids.tiny?.url;
      if (!file) continue;
      out.push({
        url: String(file),
        poster: String(v.picture_id ? `https://i.vimeocdn.com/video/${v.picture_id}_295x166.jpg` : ""),
        duration: Number(v.duration || 0),
        source: "pixabay",
        width: vids.medium?.width || vids.small?.width || 0,
        height: vids.medium?.height || vids.small?.height || 0,
      });
      if (out.length >= count) break;
    }
    return out;
  } catch (err) {
    console.error("[broll] pixabay failed:", err);
    return [];
  }
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
    const query = String(body.query || "").trim();
    const count = Math.max(1, Math.min(5, Number(body.count || 3)));
    const orientation = (body.orientation === "landscape" || body.orientation === "square")
      ? body.orientation : "portrait";

    if (!query) {
      return new Response(JSON.stringify({ error: "query required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Try Pexels first; if it returns nothing usable, fall back to Pixabay
    let clips = await searchPexels(query, count, orientation);
    if (clips.length === 0) {
      clips = await searchPixabay(query, count);
    }

    return new Response(JSON.stringify({ query, count: clips.length, clips }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fetch-broll error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
