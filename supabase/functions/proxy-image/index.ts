/**
 * proxy-image — proxy any image URL through Supabase Edge.
 *
 * Solves the Pollinations CORS/Origin block — browsers get 403 when fetching
 * Pollinations directly, but server-side fetch works fine.
 *
 * Usage: GET /proxy-image?url=https://image.pollinations.ai/prompt/...
 * Returns: the image bytes with proper Content-Type.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

// Allowlist of upstream domains (security: prevent SSRF)
const ALLOWED_HOSTS = [
  "image.pollinations.ai",
  "pollinations.ai",
  "images.unsplash.com",
  "images.pexels.com",
  "pixabay.com",
  "cdn.pixabay.com",
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("url");
    if (!target) {
      return new Response(JSON.stringify({ error: "url query parameter required" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Validate target URL
    let targetUrl: URL;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response(JSON.stringify({ error: "invalid url" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
      return new Response(JSON.stringify({ error: `host not allowed: ${targetUrl.hostname}` }), {
        status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Fetch server-side (no Origin header → Pollinations accepts)
    const upstream = await fetch(targetUrl.toString(), {
      headers: {
        // Identify as a server-side fetch
        "User-Agent": "BotCraft/1.0 (+https://botcraft.app)",
        "Accept": "image/*",
      },
    });

    if (!upstream.ok) {
      return new Response(JSON.stringify({
        error: `upstream returned ${upstream.status}`,
      }), {
        status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const body = await upstream.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (error) {
    console.error("proxy-image error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
