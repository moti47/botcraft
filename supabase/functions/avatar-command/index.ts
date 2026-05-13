/**
 * avatar-command — Edge Function
 *
 * Takes a natural-language command and applies it to an existing avatar.
 * Examples:
 *   "change music to hip-hop"
 *   "make her more energetic"
 *   "use blue and orange colors"
 *   "regenerate the portrait"
 *   "switch to cartoon style"
 *
 * The LLM decides which fields to change and returns a partial avatar object.
 * Then we update the DB and optionally regenerate the portrait.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

interface RequestBody {
  avatar_id: string;
  command: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

// ─────────────────────────────────────────────────────────────
// Heuristic interpreter — works without GROQ as fallback
// ─────────────────────────────────────────────────────────────
function heuristicInterpret(command: string): Record<string, unknown> {
  const c = command.toLowerCase();
  const updates: Record<string, unknown> = {};

  // Music
  const musicMatch = c.match(/(lo-?fi|electronic|cinematic|ambient|hip[- ]?hop|jazz|rock|pop|classical)/);
  if (musicMatch) updates.music_genre = musicMatch[1].replace(/\s/g, "-");

  // Tone
  const toneMap: Record<string, string> = {
    engaging: "engaging", witty: "witty", funny: "witty",
    formal: "formal", professional: "formal",
    casual: "casual", inspirational: "inspirational",
    energetic: "casual", calm: "engaging", serious: "formal",
  };
  for (const [keyword, tone] of Object.entries(toneMap)) {
    if (c.includes(keyword)) { updates.tone = tone; break; }
  }

  // Style
  const styleMatch = c.match(/(realistic|cartoon|anime|3d|3-d)/);
  if (styleMatch) {
    updates.avatar_style = styleMatch[1].replace("-", "");
  }

  // Regenerate flag
  if (/(regenerate|new|different|change).*(portrait|image|photo|face|picture)/.test(c)) {
    updates.regenerate_image = true;
  }

  // Pause/activate
  if (/(pause|stop|disable)/.test(c)) updates.is_paused = true;
  if (/(resume|activate|enable|unpause|start)/.test(c)) updates.is_paused = false;

  return updates;
}

// ─────────────────────────────────────────────────────────────
// LLM interpreter (Groq llama 3.1) — better understanding
// ─────────────────────────────────────────────────────────────
async function llmInterpret(command: string, currentAvatar: Record<string, unknown>) {
  if (!GROQ_API_KEY) return heuristicInterpret(command);

  try {
    const prompt = `You are updating an AI avatar based on a user command.

Current avatar:
${JSON.stringify({
  name: currentAvatar.name,
  niche: currentAvatar.niche,
  tone: currentAvatar.tone,
  music_genre: currentAvatar.music_genre,
  avatar_style: currentAvatar.avatar_style,
  bio: currentAvatar.bio,
}, null, 2)}

User command: "${command}"

Return a JSON object with ONLY the fields that should change. Possible fields:
  name (string)
  bio (string, max 120 chars)
  tone (one of: engaging, witty, formal, casual, inspirational)
  music_genre (one of: lo-fi, electronic, cinematic, ambient, hip-hop, jazz, rock, pop)
  avatar_style (one of: realistic, cartoon, anime, 3d)
  is_paused (boolean)
  regenerate_image (boolean — set true if user asks for new portrait)
  brand_identity (object with palette: [2 hex colors], voice_traits: [3 words]) — set if user mentions colors or vibe

Return JSON only, no markdown. Empty object if command is unclear.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 400,
      }),
    });

    if (!res.ok) return heuristicInterpret(command);
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (err) {
    console.error("[avatar-command] LLM failed, falling back to heuristic:", err);
    return heuristicInterpret(command);
  }
}

// ─────────────────────────────────────────────────────────────
// Portrait regenerator (Pollinations Flux)
// ─────────────────────────────────────────────────────────────
function buildImageUrl(name: string, niche: string, style: string): string {
  const styleDescriptor: Record<string, string> = {
    realistic: "photorealistic headshot photograph, professional DSLR, 85mm lens, natural skin texture, sharp focus, studio lighting, shallow depth of field",
    cartoon: "cartoon illustration, Pixar-style 3D character, bold colors, friendly proportions",
    anime: "anime portrait, Studio Ghibli aesthetic, soft lighting, vibrant colors, detailed",
    "3d": "high-end 3D render, octane render, hyper-detailed, cinematic lighting, ultra realistic",
  };
  const styleText = styleDescriptor[style] || styleDescriptor.realistic;
  const prompt = `${styleText}, portrait of a person named ${name}, ${niche} content creator, looking directly at camera, high resolution, 1:1 aspect ratio, no text, no watermark`;
  const seed = Math.floor(Math.random() * 1_000_000);
  const params = new URLSearchParams({
    model: "flux", width: "512", height: "512",
    seed: seed.toString(), nologo: "true", enhance: "true",
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const body: RequestBody = await req.json();
    const { avatar_id, command } = body;

    if (!avatar_id || !command?.trim()) {
      return new Response(JSON.stringify({ error: "avatar_id and command required" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Verify user
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

    // Fetch current avatar (RLS would also limit, but we check user_id explicitly)
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

    // Interpret command
    const updates = await llmInterpret(command, avatar);
    const regenerate = !!updates.regenerate_image;
    delete updates.regenerate_image;

    // Apply image regeneration if requested OR if style/name changed
    const newStyle = (updates.avatar_style as string) || avatar.avatar_style;
    const newName = (updates.name as string) || avatar.name;
    if (regenerate || updates.avatar_style || updates.name) {
      updates.image_url = buildImageUrl(newName, avatar.niche, newStyle);
    }

    // Save changes
    if (Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({
        avatar,
        message: "No changes — the command was unclear. Try being more specific.",
      }), {
        status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: updated, error: updateError } = await admin
      .from("avatars")
      .update(updates)
      .eq("id", avatar_id)
      .select()
      .single();

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      avatar: updated,
      changes: updates,
      message: `Applied: ${Object.keys(updates).join(", ")}`,
    }), {
      status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("avatar-command error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
