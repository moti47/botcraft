/**
 * generate-blueprint — Edge Function
 *
 * For an existing avatar, produces a full Production Blueprint via LLM:
 *   - script_template (format, hook style, structure with per-section guidance)
 *   - edit_style (cut frequency, transitions, captions, music)
 *   - visual_style (shots, framing, lighting)
 *
 * Saves to avatars.production_blueprint and returns it.
 * Accepts optional `section` param to regenerate ONLY one section.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

// ─────────────────────────────────────────────────────────────
// Heuristic defaults per niche (so it works without GROQ key)
// ─────────────────────────────────────────────────────────────
function defaultBlueprint(avatar: Record<string, unknown>) {
  const niche = String(avatar.niche || "general").toLowerCase();
  const tone = String(avatar.tone || "engaging").toLowerCase();

  const presets: Record<string, Record<string, unknown>> = {
    comedy: {
      script_template: {
        format: "setup-punchline-callback",
        hook_style: "absurd observation",
        duration_seconds: 45,
        pacing: "fast",
        vocabulary: "snappy with timing pauses",
        structure: [
          { section: "hook", duration_sec: 4, guidance: "drop the weirdest take in one breath" },
          { section: "setup", duration_sec: 12, guidance: "build context while planting seeds" },
          { section: "punchline", duration_sec: 20, guidance: "deliver the twist with confidence" },
          { section: "callback", duration_sec: 9, guidance: "tie back to hook for a satisfying loop" },
        ],
      },
      edit_style: {
        cut_frequency: "very-high",
        transitions: ["hard-cut", "zoom-punch", "freeze-frame"],
        b_roll_density: "medium",
        captions: { style: "kinetic", color_emphasis: "#F59E0B", position: "center" },
        music: { energy: "mid", volume_db: -16, ducks_on_voice: true },
        color_grade: "warm-vibrant",
      },
      visual_style: { shots: ["close-up", "extreme-close-up"], lighting: "casual-warm", framing: "centered", aspect_ratio: "9:16" },
    },
    tech: {
      script_template: {
        format: "hook-context-payoff-cta",
        hook_style: "shocking stat",
        duration_seconds: 50,
        pacing: "moderate",
        vocabulary: "informed but accessible",
        structure: [
          { section: "hook", duration_sec: 5, guidance: "drop a number that breaks expectations" },
          { section: "context", duration_sec: 12, guidance: "why this matters now" },
          { section: "payoff", duration_sec: 28, guidance: "the insight, concrete and useful" },
          { section: "cta", duration_sec: 5, guidance: "follow for more tech takes" },
        ],
      },
      edit_style: {
        cut_frequency: "high",
        transitions: ["smooth-cut", "zoom-in", "whip-pan"],
        b_roll_density: "heavy",
        captions: { style: "highlighted-word", color_emphasis: "#06B6D4", position: "center-bottom" },
        music: { energy: "mid", volume_db: -14, ducks_on_voice: true },
        color_grade: "clean-cool",
      },
      visual_style: { shots: ["medium-closeup", "screen-overlay"], lighting: "studio-soft", framing: "rule-of-thirds", aspect_ratio: "9:16" },
    },
    fitness: {
      script_template: {
        format: "challenge-method-results",
        hook_style: "transformation claim",
        duration_seconds: 40,
        pacing: "fast",
        vocabulary: "motivational direct",
        structure: [
          { section: "hook", duration_sec: 4, guidance: "promise a concrete win" },
          { section: "method", duration_sec: 24, guidance: "the steps with action shots" },
          { section: "results", duration_sec: 8, guidance: "what changes after week 1/4/12" },
          { section: "cta", duration_sec: 4, guidance: "save and try this week" },
        ],
      },
      edit_style: {
        cut_frequency: "very-high",
        transitions: ["whip-pan", "match-cut", "speed-ramp"],
        b_roll_density: "heavy",
        captions: { style: "highlighted-word", color_emphasis: "#EF4444", position: "top" },
        music: { energy: "high", volume_db: -12, ducks_on_voice: true },
        color_grade: "warm-saturated",
      },
      visual_style: { shots: ["wide-action", "close-up", "low-angle"], lighting: "natural-sunlit", framing: "dynamic", aspect_ratio: "9:16" },
    },
    cooking: {
      script_template: {
        format: "ingredient-process-reveal",
        hook_style: "appetizing close-up",
        duration_seconds: 45,
        pacing: "moderate",
        vocabulary: "warm sensory",
        structure: [
          { section: "hook", duration_sec: 5, guidance: "extreme close-up of the finished bite" },
          { section: "ingredients", duration_sec: 8, guidance: "rapid montage of components" },
          { section: "process", duration_sec: 25, guidance: "clear steps with timing cues" },
          { section: "reveal", duration_sec: 7, guidance: "plated shot + first bite" },
        ],
      },
      edit_style: {
        cut_frequency: "high",
        transitions: ["match-cut", "match-action", "dissolve"],
        b_roll_density: "very-heavy",
        captions: { style: "subtitle", color_emphasis: "#F59E0B", position: "center-bottom" },
        music: { energy: "low", volume_db: -18, ducks_on_voice: false },
        color_grade: "warm-rich",
      },
      visual_style: { shots: ["overhead", "close-up", "macro"], lighting: "natural-window", framing: "centered", aspect_ratio: "9:16" },
    },
  };

  const base = presets[niche] || presets.tech;

  // Tone overrides
  if (tone === "formal") {
    (base.edit_style as Record<string, unknown>).cut_frequency = "moderate";
    (base.script_template as Record<string, unknown>).vocabulary = "polished professional";
  } else if (tone === "witty") {
    (base.edit_style as Record<string, unknown>).cut_frequency = "very-high";
  }

  return base;
}

// ─────────────────────────────────────────────────────────────
// LLM blueprint generator
// ─────────────────────────────────────────────────────────────
async function llmGenerate(avatar: Record<string, unknown>, section?: string) {
  if (!GROQ_API_KEY) return defaultBlueprint(avatar);

  const sectionInstruction = section
    ? `Return ONLY the "${section}" field — do not include the other top-level keys.`
    : `Return ALL THREE fields: script_template, edit_style, visual_style.`;

  const prompt = `You are designing a video production blueprint for an AI avatar.

AVATAR:
  name: ${avatar.name}
  niche: ${avatar.niche}
  tone: ${avatar.tone}
  language: ${avatar.language}
  bio: ${avatar.bio || "(none)"}
  visual style: ${avatar.avatar_style}

Return a STRICT JSON object describing the production directive. Schema:

{
  "script_template": {
    "format": string,                  // e.g. "hook-context-payoff-cta"
    "hook_style": string,              // e.g. "shocking stat"
    "duration_seconds": number,        // total target, 25..90
    "pacing": "fast" | "moderate" | "calm",
    "vocabulary": string,              // e.g. "casual punchy"
    "structure": [
      { "section": string, "duration_sec": number, "guidance": string }
    ]
  },
  "edit_style": {
    "cut_frequency": "very-high" | "high" | "moderate" | "low",
    "transitions": string[],           // 2-4 transition names
    "b_roll_density": "very-heavy" | "heavy" | "medium" | "light",
    "captions": {
      "style": "kinetic" | "highlighted-word" | "subtitle" | "none",
      "color_emphasis": string,        // hex color
      "position": "top" | "center" | "center-bottom" | "bottom"
    },
    "music": {
      "energy": "high" | "mid" | "low",
      "volume_db": number,             // -20..-8
      "ducks_on_voice": boolean
    },
    "color_grade": string
  },
  "visual_style": {
    "shots": string[],
    "framing": string,
    "lighting": string,
    "aspect_ratio": "9:16" | "16:9" | "1:1"
  }
}

${sectionInstruction}

Tailor the blueprint to the niche. Be specific and opinionated — don't be generic.
Return JSON only, no markdown.`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });
    if (!res.ok) return defaultBlueprint(avatar);
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (err) {
    console.error("[generate-blueprint] LLM failed:", err);
    return defaultBlueprint(avatar);
  }
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { avatar_id, section } = body as { avatar_id?: string; section?: string };

    if (!avatar_id) {
      return new Response(JSON.stringify({ error: "avatar_id required" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Auth check
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
      .select("*")
      .eq("id", avatar_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !avatar) {
      return new Response(JSON.stringify({ error: "Avatar not found" }), {
        status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const generated = await llmGenerate(avatar, section);

    // Merge: if section, only update that key; otherwise replace whole blueprint
    let newBlueprint;
    if (section && generated[section]) {
      newBlueprint = { ...(avatar.production_blueprint || {}), [section]: generated[section] };
    } else if (section) {
      // LLM returned the section content directly (without the wrapping key)
      newBlueprint = { ...(avatar.production_blueprint || {}), [section]: generated };
    } else {
      newBlueprint = generated;
    }

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
    console.error("generate-blueprint error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
