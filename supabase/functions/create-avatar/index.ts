/**
 * create-avatar — Edge Function
 *
 * Creates a new avatar persona for the authenticated user.
 * Uses an LLM to generate brand identity (bio, voice traits, music genre).
 *
 * Request body: { niche: string, language?: string, tone?: string, avatar_style?: string }
 * Returns: 201 with the created avatar row.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

interface RequestBody {
  niche: string;
  language?: string;
  tone?: string;
  avatar_style?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";

// ─────────────────────────────────────────────────────────────
// Tiny LLM call (Groq → free, fast). Falls back gracefully.
// ─────────────────────────────────────────────────────────────
async function generatePersona(niche: string, language: string, tone: string) {
  const fallback = {
    name: niche.charAt(0).toUpperCase() + niche.slice(1) + "Bot",
    bio: `AI persona that creates engaging ${niche} content`,
    music_genre: "lo-fi",
    brand_identity: { palette: ["#7C3AED", "#06B6D4"], voice_traits: [tone] },
  };

  if (!GROQ_API_KEY) return fallback;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{
          role: "user",
          content: `Generate a JSON object for an AI avatar persona.
Niche: ${niche}
Language: ${language}
Tone: ${tone}
Required JSON fields: name (catchy 1-word), bio (1 sentence),
music_genre (one of: lo-fi, electronic, cinematic, ambient, hip-hop),
brand_identity (object with palette: [2 hex colors], voice_traits: [3 short words]).
Return JSON only, no markdown.`,
        }],
        response_format: { type: "json_object" },
        temperature: 0.8,
        max_tokens: 300,
      }),
    });

    if (!res.ok) return fallback;
    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    return { ...fallback, ...parsed };
  } catch (err) {
    console.error("[create-avatar] LLM failed:", err);
    return fallback;
  }
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
    const body: RequestBody = await req.json();
    const { niche, language = "EN", tone = "engaging", avatar_style = "realistic" } = body;

    if (!niche?.trim()) {
      return new Response(JSON.stringify({ error: "niche required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    // Get authenticated user from the JWT (forwarded by Supabase)
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUser = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseUser.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }

    // Generate persona via LLM
    const persona = await generatePersona(niche, language, tone);

    // Insert (service role bypasses RLS; trigger fills user_id from auth.uid if set)
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: avatar, error } = await supabase
      .from("avatars")
      .insert([{
        user_id: user.id,
        name: persona.name,
        niche,
        language,
        tone,
        avatar_style,
        bio: persona.bio,
        music_genre: persona.music_genre,
        brand_identity: persona.brand_identity,
        is_active: true,
        is_paused: false,
      }])
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ avatar }), {
      status: 201, headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("create-avatar error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
