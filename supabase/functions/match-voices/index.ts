/**
 * match-voices — ElevenLabs voice matcher
 *
 * Fetches all ElevenLabs voices, scores them against the avatar's
 * traits (physical_description, tone, language, niche), and returns
 * the top 5 candidates with audio sample URLs.
 *
 * Input: { avatar_id }
 * Output: { candidates: [{ voice_id, name, score, gender, age, accent, use_case, preview_url, sample_text }] }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

// ─────────────────────────────────────────────────────────────
// Voice scoring against avatar traits
// ─────────────────────────────────────────────────────────────
interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  preview_url?: string;
  labels?: {
    gender?: string;
    age?: string;
    accent?: string;
    use_case?: string;
    descriptive?: string;
  };
  description?: string;
  category?: string;
}

function inferGender(physical: string): string | null {
  const p = physical.toLowerCase();
  if (/\b(woman|female|girl|she\b|her\b|ms\.|mrs\.)/.test(p)) return "female";
  if (/\b(man|male|guy|he\b|his\b|him\b|mr\.)/.test(p)) return "male";
  return null;
}

function inferAge(physical: string, lifeStory: string): string | null {
  const text = `${physical} ${lifeStory}`.toLowerCase();
  const ageMatch = text.match(/(\d{2})[- ](?:year|yrs?|y\/o)/);
  if (ageMatch) {
    const age = parseInt(ageMatch[1]);
    if (age < 25) return "young";
    if (age < 45) return "middle_aged";
    return "old";
  }
  if (/\b(teen|young|youth)\b/.test(text)) return "young";
  if (/\b(elderly|senior|old)\b/.test(text)) return "old";
  return "young";  // default to young for content creators
}

function scoreVoice(voice: ElevenLabsVoice, avatar: Record<string, unknown>): number {
  let score = 50;  // baseline
  const labels = voice.labels || {};
  const brand = (avatar.brand_identity || {}) as Record<string, unknown>;
  const physical = String(brand.physical_description || "");
  const tone = String(avatar.tone || "").toLowerCase();

  // Gender match
  const wantedGender = inferGender(physical);
  if (wantedGender && labels.gender) {
    if (labels.gender.toLowerCase() === wantedGender) score += 25;
    else score -= 30;
  }

  // Age match
  const wantedAge = inferAge(physical, String(avatar.life_story || ""));
  if (wantedAge && labels.age) {
    const labelAge = labels.age.toLowerCase().replace(/-/g, "_");
    if (labelAge.includes(wantedAge) || wantedAge.includes(labelAge)) score += 15;
  }

  // Tone match against descriptive tag + use case
  const descriptive = (labels.descriptive || "").toLowerCase();
  const useCase = (labels.use_case || "").toLowerCase();
  const toneMap: Record<string, string[]> = {
    engaging:      ["warm", "friendly", "expressive", "narration", "social"],
    witty:         ["expressive", "playful", "casual", "characters"],
    formal:        ["calm", "professional", "narration", "news"],
    casual:        ["casual", "conversational", "social", "young"],
    inspirational: ["confident", "motivational", "narration"],
  };
  const wanted = toneMap[tone] || [];
  for (const keyword of wanted) {
    if (descriptive.includes(keyword) || useCase.includes(keyword)) score += 4;
  }

  // Voice category — prefer premade/professional over cloned
  if (voice.category === "premade" || voice.category === "professional") score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
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
    const { avatar_id } = body as { avatar_id?: string };
    if (!avatar_id) {
      return new Response(JSON.stringify({ error: "avatar_id required" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Auth
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

    // Load avatar
    const { data: avatar } = await supabase
      .from("avatars")
      .select("*")
      .eq("id", avatar_id)
      .eq("user_id", user.id)
      .single();
    if (!avatar) {
      return new Response(JSON.stringify({ error: "Avatar not found" }), {
        status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Pollinations OpenAI-audio voices (always available as a fallback)
    const pollinationsVoices: ElevenLabsVoice[] = [
      { voice_id: "poll:alloy",    name: "Alloy",    labels: { gender: "neutral", age: "young", descriptive: "balanced", use_case: "narration" } },
      { voice_id: "poll:echo",     name: "Echo",     labels: { gender: "male",    age: "young", descriptive: "warm casual", use_case: "social" } },
      { voice_id: "poll:fable",    name: "Fable",    labels: { gender: "male",    age: "middle_aged", accent: "british", descriptive: "calm narration", use_case: "narration" } },
      { voice_id: "poll:onyx",     name: "Onyx",     labels: { gender: "male",    age: "middle_aged", descriptive: "deep confident", use_case: "narration" } },
      { voice_id: "poll:nova",     name: "Nova",     labels: { gender: "female",  age: "young", descriptive: "warm expressive", use_case: "social" } },
      { voice_id: "poll:shimmer",  name: "Shimmer",  labels: { gender: "female",  age: "young", descriptive: "energetic playful", use_case: "social" } },
      { voice_id: "poll:coral",    name: "Coral",    labels: { gender: "female",  age: "young", descriptive: "warm friendly", use_case: "narration" } },
      { voice_id: "poll:ash",      name: "Ash",      labels: { gender: "male",    age: "young", descriptive: "casual conversational", use_case: "social" } },
      { voice_id: "poll:ballad",   name: "Ballad",   labels: { gender: "neutral", age: "young", descriptive: "smooth melodic", use_case: "narration" } },
      { voice_id: "poll:sage",     name: "Sage",     labels: { gender: "neutral", age: "middle_aged", descriptive: "calm professional", use_case: "professional" } },
    ];

    let voicesPool: ElevenLabsVoice[] = pollinationsVoices;
    let provider = "pollinations";
    let providerError: string | null = null;

    // Try ElevenLabs first
    if (ELEVENLABS_API_KEY) {
      const elRes = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      });
      if (elRes.ok) {
        const elJson = await elRes.json();
        if (elJson.voices && elJson.voices.length > 0) {
          voicesPool = elJson.voices;
          provider = "elevenlabs";
        }
      } else {
        const errBody = await elRes.text();
        providerError = `ElevenLabs ${elRes.status}: ${errBody.slice(0, 150)}`;
        console.log(providerError);
      }
    }

    // Score + rank + take top 5
    const scored = voicesPool
      .map((v) => ({
        voice_id: v.voice_id,
        name: v.name,
        score: scoreVoice(v, avatar),
        gender: v.labels?.gender || "—",
        age: v.labels?.age || "—",
        accent: v.labels?.accent || "—",
        use_case: v.labels?.use_case || "—",
        descriptive: v.labels?.descriptive || "—",
        preview_url: v.preview_url,
        category: v.category,
        provider,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Sample text in the avatar's language (just the first line of life_story or bio)
    const sampleText = String(avatar.bio || avatar.life_story || `Hi, I'm ${avatar.name}.`).slice(0, 100);

    return new Response(JSON.stringify({
      candidates: scored,
      sample_text: sampleText,
      currently_selected: avatar.voice_id || null,
      provider,
      provider_error: providerError,
    }), {
      status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("match-voices error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
