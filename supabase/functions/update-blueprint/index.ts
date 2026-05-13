/**
 * update-blueprint — Edge Function
 *
 * Patches the avatar's production_blueprint with user-provided changes.
 * Accepts either a full blueprint or a partial section.
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
    const { avatar_id, blueprint, section, value } = body as {
      avatar_id?: string;
      blueprint?: Record<string, unknown>;
      section?: string;
      value?: unknown;
    };

    if (!avatar_id) {
      return new Response(JSON.stringify({ error: "avatar_id required" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (!blueprint && !(section && value !== undefined)) {
      return new Response(JSON.stringify({ error: "Either `blueprint` or (`section` + `value`) required" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user }, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: avatar, error: fetchError } = await admin
      .from("avatars")
      .select("production_blueprint")
      .eq("id", avatar_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !avatar) {
      return new Response(JSON.stringify({ error: "Avatar not found" }), {
        status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const currentBlueprint = avatar.production_blueprint || {};
    const newBlueprint = blueprint
      ? { ...currentBlueprint, ...blueprint }
      : { ...currentBlueprint, [section!]: value };

    const { data: updated, error: updateError } = await admin
      .from("avatars")
      .update({ production_blueprint: newBlueprint })
      .eq("id", avatar_id)
      .select()
      .single();

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ blueprint: newBlueprint, avatar: updated }), {
      status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("update-blueprint error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
