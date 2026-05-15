/**
 * create-avatar — Edge Function
 *
 * Creates a new avatar persona. Fields you provide are used as-is;
 * fields you omit are auto-filled by an LLM. An avatar portrait
 * is generated via Pollinations (free, no API key needed).
 *
 * Required input: niche (text)
 * Optional: name, language, tone, avatar_style, bio, music_genre,
 *           generate_image (default true)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

interface RequestBody {
  niche: string;
  name?: string | null;
  language?: string;
  ui_language?: string;
  tone?: string;
  avatar_style?: string;
  bio?: string | null;
  music_genre?: string | null;
  custom_instructions?: string | null;
  palette?: string[] | null;             // user-chosen brand colors [primary, accent]
  image_seed?: number;
  preview_only?: boolean;
  generate_image?: boolean;
  // Locked-in values from a previous preview. When supplied, save skips the
  // life-story LLM call so the persisted avatar matches the preview exactly.
  life_story?: string | null;
  physical_description?: string | null;
  short_bio?: string | null;
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
// LLM (Groq → llama 3.1 8B, free). Falls back to safe defaults.
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// Life story — full multi-paragraph biography in user's UI language
// Also returns physical_description that drives the portrait.
// ─────────────────────────────────────────────────────────────
const LANG_NAMES: Record<string, string> = {
  EN: "English", HE: "Hebrew", ES: "Spanish", FR: "French",
  DE: "German", PT: "Portuguese", IT: "Italian", AR: "Arabic",
  JA: "Japanese", ZH: "Chinese",
};

// Random diversity factors injected per-avatar so 5 creators in the same
// niche don't end up looking like 5 copies. Each pool is curated so the
// combinations feel plausible (no "60-year-old Pixar character", etc.).
const ETHNICITIES = [
  "East Asian", "South Asian", "Southeast Asian", "Black", "Afro-Caribbean",
  "Hispanic / Latina", "Middle Eastern", "North African", "Mediterranean",
  "Northern European", "Slavic", "Mixed Asian-European", "Mixed African-European",
  "Indigenous American", "Pacific Islander",
];
const AGE_RANGES = [
  "early 20s", "mid 20s", "late 20s",
  "early 30s", "mid 30s", "late 30s",
  "early 40s", "mid 40s",
];
const BODY_TYPES = [
  "slim athletic", "lean toned", "average build", "stocky muscular",
  "curvy", "tall and lanky", "compact and fit", "broad-shouldered",
];
const STYLE_VIBES = [
  "minimalist street style", "studio-polished editorial", "cozy indie creator",
  "urban high-fashion", "athleisure clean", "vintage retro layered",
  "techwear modern", "warm earth-tone bohemian", "preppy academic",
];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

async function generateLifeStory(
  input: RequestBody,
  baseName: string,
): Promise<{ life_story: string; physical_description: string; short_bio: string }> {
  const uiLang = input.ui_language || input.language || "EN";
  const langName = LANG_NAMES[uiLang] || "English";

  // Sprinkle random diversity factors so two avatars in the same niche
  // don't look interchangeable. The LLM gets these as a starting palette
  // but is free to riff if the niche calls for a different vibe.
  const diversity = {
    ethnicity: pick(ETHNICITIES),
    age: pick(AGE_RANGES),
    body: pick(BODY_TYPES),
    style: pick(STYLE_VIBES),
    gender_hint: Math.random() < 0.5 ? "female" : "male",
  };

  const fallback = {
    life_story: `${baseName} is a content creator focused on ${input.niche}. They share insights, tips, and stories that resonate with their audience daily.`,
    physical_description: `young adult, friendly approachable look, modern outfit fitting the ${input.niche} world`,
    short_bio: `Your daily dose of ${input.niche}.`,
  };

  if (!GROQ_API_KEY) return fallback;

  const prompt = `Create a detailed life story for an AI content creator.

CHARACTER:
  name: ${baseName}
  niche: ${input.niche}
  tone: ${input.tone || "engaging"}
  ${input.custom_instructions ? `extra: ${input.custom_instructions}` : ""}

DIVERSITY SEED (use these — they were drawn to make this avatar feel distinct from others):
  ethnicity: ${diversity.ethnicity}
  age range: ${diversity.age}
  body type: ${diversity.body}
  style vibe: ${diversity.style}
  gender lean: ${diversity.gender_hint}

Return STRICT JSON with these fields:

{
  "life_story": "3-4 short paragraphs in ${langName}. Cover: full name and exact age (within ${diversity.age}), where they grew up, where they live now, how they got into ${input.niche}, their personality and quirks, what motivates them to create content. Honor the diversity seed above — make this person FEEL ${diversity.ethnicity}, ${diversity.age}, with a ${diversity.style} vibe. Feel like a REAL human with a coherent story, not a generic creator.",
  "physical_description": "A SINGLE English sentence describing what they LOOK like — be visually SPECIFIC and DISTINCTIVE: exact age, ${diversity.gender_hint} gender, ${diversity.ethnicity} features (skin tone, eye shape, hair texture/color/style), one or two distinguishing features (freckles, dimples, scar, septum ring, glasses, beard, etc.), ${diversity.body} build, ${diversity.style} outfit fitting ${input.niche}, and a specific setting. This is fed verbatim into a photorealistic image generator so name concrete visual nouns, not adjectives.",
  "short_bio": "ONE sentence in ${langName}, max 100 chars, like a social-media tagline."
}

The life_story MUST be in ${langName}. The physical_description MUST be in English (for the image generator) and MUST honor the diversity seed. Return JSON only, no markdown.`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.85,
        max_tokens: 900,
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    return {
      life_story: parsed.life_story || fallback.life_story,
      physical_description: parsed.physical_description || fallback.physical_description,
      short_bio: parsed.short_bio || fallback.short_bio,
    };
  } catch (err) {
    console.error("[create-avatar] life story LLM failed:", err);
    return fallback;
  }
}

async function fillMissingFields(input: RequestBody) {
  // Curated name pools per niche so fallback doesn't look like "TechBot"
  const nameByNiche: Record<string, string[]> = {
    tech: ["Kai", "Nova", "Zane", "Lyra", "Axel"],
    fitness: ["Max", "Riley", "Jordan", "Sage", "Drew"],
    comedy: ["Charlie", "Sam", "Jamie", "Toby", "Casey"],
    cooking: ["Chef Leo", "Mia", "Bruno", "Sienna", "Theo"],
    gaming: ["Vex", "Echo", "Ace", "Pixel", "Ryze"],
    fashion: ["Coco", "Luna", "Vera", "Stella", "Jett"],
    finance: ["Morgan", "Wesley", "Quinn", "Harper", "Reese"],
    travel: ["Cleo", "Finn", "Hazel", "Atlas", "Sky"],
    beauty: ["Belle", "Aria", "Mila", "Iris", "Jade"],
    education: ["Sage", "Ellis", "Robin", "Quinn", "Wren"],
    music: ["Rio", "Reign", "Indie", "Phoenix", "Bowie"],
    sports: ["Blake", "Cody", "Spencer", "Hayden", "Tatum"],
    wellness: ["Sol", "Aurora", "Luna", "Wren", "Lila"],
    lifestyle: ["Eden", "Skye", "Avery", "Reese", "Sloane"],
    business: ["Vaughn", "Camden", "Sterling", "Hudson", "Quinn"],
  };
  const pool = nameByNiche[input.niche.toLowerCase()] || ["Nova", "Sage", "River", "Jordan", "Kai"];
  const fallbackName = pool[Math.floor(Math.random() * pool.length)];

  const defaults = {
    name: input.name || fallbackName,
    bio: input.bio || `Your daily dose of ${input.niche} — short, sharp, and a little addictive.`,
    music_genre: input.music_genre || "lo-fi",
    brand_identity: {
      palette: ["#7C3AED", "#06B6D4"],
      voice_traits: [input.tone || "engaging"],
    },
  };

  if (!GROQ_API_KEY) return defaults;

  // Only call the LLM if something is missing
  const needsLLM = !input.name || !input.bio || !input.music_genre;
  if (!needsLLM) return defaults;

  try {
    const prompt = `Generate a persona JSON for an AI avatar.

Niche: ${input.niche}
${input.name ? `Name (use as-is): ${input.name}` : "Name: invent a catchy ONE-word name"}
${input.bio ? `Bio (use as-is): ${input.bio}` : "Bio: write one engaging sentence"}
${input.music_genre ? `Music genre (use as-is): ${input.music_genre}` : "Music: choose lo-fi / electronic / cinematic / ambient / hip-hop"}
Language: ${input.language || "EN"}
Tone: ${input.tone || "engaging"}

Return JSON with these exact keys:
  name (string, 1 word),
  bio (string, 1 sentence, max 120 chars),
  music_genre (string, one of the options above),
  brand_identity: {
    palette: [2 hex color strings],
    voice_traits: [3 short adjectives]
  }

No markdown, no commentary — JSON only.`;

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
        temperature: 0.8,
        max_tokens: 300,
      }),
    });

    if (!res.ok) return defaults;
    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    return {
      name: input.name || parsed.name || defaults.name,
      bio: input.bio || parsed.bio || defaults.bio,
      music_genre: input.music_genre || parsed.music_genre || defaults.music_genre,
      brand_identity: parsed.brand_identity || defaults.brand_identity,
    };
  } catch (err) {
    console.error("[create-avatar] LLM failed:", err);
    return defaults;
  }
}

// ─────────────────────────────────────────────────────────────
// Avatar portrait via Pollinations (free, no auth needed)
// Uses the Flux model for photorealistic results by default.
// ─────────────────────────────────────────────────────────────
function generateAvatarImageUrl(
  name: string,
  niche: string,
  style: string,
  options: {
    appearance?: string | null;
    custom_instructions?: string | null;
    tone?: string | null;
    seed?: number;
  } = {},
): string {
  // Build a style-specific prompt — realistic by default. The realistic
  // descriptor is loaded with concrete photographic nouns so Pollinations
  // (flux model) produces a believable human face, not a "shiny AI" face.
  const styleDescriptor: Record<string, string> = {
    realistic: "RAW photo, photorealistic candid headshot, shot on Canon EOS R5 with 85mm f/1.4 prime, natural pore-level skin texture with subtle imperfections, individual eyelashes and catchlights visible, sharp focus on eyes, soft three-point studio lighting with subtle rim light, shallow depth of field bokeh, neutral color grade, unretouched photographic look",
    cartoon: "cartoon illustration, Pixar-style 3D character, bold colors, friendly proportions",
    anime: "anime portrait, Studio Ghibli aesthetic, soft lighting, vibrant colors, detailed",
    "3d": "high-end 3D render, octane render, hyper-detailed, cinematic lighting, ultra realistic",
  };
  const styleText = styleDescriptor[style] || styleDescriptor.realistic;

  // Niche-driven scene cues so the avatar visually matches its theme
  const nicheVibes: Record<string, string> = {
    tech: "wearing modern smart-casual attire, soft tech-office bokeh background, confident look",
    fitness: "athletic build, gym attire, energetic pose, vibrant lighting",
    comedy: "warm friendly smile, casual outfit, expressive face",
    cooking: "chef's apron, warm kitchen background, inviting expression",
    gaming: "headphones around neck, RGB-lit gamer setup behind, focused gaze",
    fashion: "stylish modern outfit, fashion-editorial lighting, confident pose",
    finance: "smart business attire, clean modern office background",
    travel: "outdoor adventurer look, sunny natural backdrop",
    beauty: "flawless makeup, soft glowing skin, beauty-shot lighting",
    education: "warm approachable look, library or classroom background",
    music: "trendy musician style, moody concert lighting, headphones",
    sports: "athletic apparel, action-ready stance, stadium-like bokeh",
    wellness: "calm serene expression, soft pastel colors, natural light",
    lifestyle: "casual chic style, soft daylight, lifestyle-magazine aesthetic",
    business: "executive look, professional studio backdrop, confident smile",
  };
  const nicheText = nicheVibes[niche.toLowerCase()] || `${niche} content creator vibe, themed outfit and background`;

  // Optional appearance details from the user
  const appearance = options.appearance?.trim()
    ? `, ${options.appearance.trim()}`
    : "";

  // Personality cue mapped to facial expression so the portrait matches the persona
  const personalityCue: Record<string, string> = {
    engaging: ", warm friendly smile, approachable expression",
    witty: ", subtle smirk, mischievous eyes",
    formal: ", composed confident look, slight smile",
    casual: ", relaxed natural expression, candid feel",
    inspirational: ", passionate confident gaze, uplifting energy",
  };
  const personalityText = personalityCue[options.tone || ""] || ", confident natural expression";

  // Free-form custom instructions from the user (appended to the prompt)
  const customText = options.custom_instructions?.trim()
    ? `, ${options.custom_instructions.trim()}`
    : "";

  // physical_description (from life-story LLM, English) leads the prompt
  // so the diversity seed actually shows up in the rendered face. Generic
  // descriptors come AFTER so they can't overwrite the specific features.
  const subject = appearance.replace(/^,\s*/, "") || `a real person named ${name}`;
  const prompt = `${styleText}, portrait of ${subject}${nicheText ? `, ${nicheText}` : ""}${personalityText}${customText}, looking directly at camera, natural authentic human appearance, photorealistic, hyper-detailed, 1:1 aspect ratio, no text, no watermark, no logos, no caption, not AI-looking, not airbrushed, not plastic skin`;

  const seed = options.seed ?? Math.floor(Math.random() * 1_000_000);
  const params = new URLSearchParams({
    model: "flux",       // flux-realism would be even better but isn't always available
    width: "768",
    height: "768",
    seed: seed.toString(),
    nologo: "true",
    enhance: "true",
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
}

// ─────────────────────────────────────────────────────────────
// Download the Pollinations image and persist it to Supabase Storage.
// Pollinations URLs can break or rate-limit; the Storage URL is durable.
// Returns the public Storage URL, or the Pollinations URL as fallback.
// ─────────────────────────────────────────────────────────────
async function persistAvatarImage(
  pollinationsUrl: string,
  avatarSlug: string,
): Promise<string> {
  try {
    const res = await fetch(pollinationsUrl, {
      headers: { "User-Agent": "BotCraft/1.0 (+supabase-edge)" },
    });
    if (!res.ok) {
      console.warn(`[create-avatar] pollinations fetch ${res.status}, falling back to direct URL`);
      return pollinationsUrl;
    }
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength < 1024) {
      // Sub-1KB usually means an error page, not a real image
      console.warn(`[create-avatar] pollinations returned ${bytes.byteLength} bytes, falling back`);
      return pollinationsUrl;
    }
    const path = `avatars/${avatarSlug}-${crypto.randomUUID()}.${ext}`;
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: up, error: upErr } = await supabaseAdmin.storage
      .from("video-assets")
      .upload(path, bytes, { contentType, upsert: false });
    if (upErr) {
      console.error("[create-avatar] storage upload failed:", upErr);
      return pollinationsUrl;
    }
    const { data: pub } = supabaseAdmin.storage
      .from("video-assets")
      .getPublicUrl(up.path);
    return pub.publicUrl;
  } catch (err) {
    console.error("[create-avatar] persistAvatarImage error:", err);
    return pollinationsUrl;
  }
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
    const {
      niche,
      language = "EN",
      tone = "engaging",
      generate_image = true,
      preview_only = false,
      custom_instructions = null,
      palette = null,
      image_seed,
    } = body;

    if (!niche?.trim()) {
      return new Response(JSON.stringify({ error: "niche is required" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Auth required for save, optional for preview
    let user: { id: string } | null = null;
    let jwt = "";
    if (!preview_only) {
      const authHeader = req.headers.get("Authorization") || "";
      jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!jwt) {
        return new Response(JSON.stringify({ error: "Not authenticated - please sign in" }), {
          status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      const authClient = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: { user: u }, error: userError } = await authClient.auth.getUser(jwt);
      if (userError || !u) {
        return new Response(JSON.stringify({
          error: "Invalid session - please sign in again",
          details: userError?.message,
        }), {
          status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      user = u;
    }

    // Fill missing fields via LLM (or fallbacks) → name, music, palette
    const persona = await fillMissingFields(body);

    // If the caller already has a life-story + physical_description from a
    // preview, USE THEM AS-IS. This keeps "preview → save" producing the
    // identical image (same prompt + same seed → same portrait). Without
    // this, a fresh LLM call would draw different random diversity factors
    // and the saved avatar would look unlike the preview.
    const story = (body.life_story && body.physical_description)
      ? {
          life_story: body.life_story,
          physical_description: body.physical_description,
          short_bio: body.short_bio || body.bio || `Your daily dose of ${niche}.`,
        }
      : await generateLifeStory(body, persona.name);

    // Build portrait — always realistic, driven by physical_description.
    // For preview_only we keep the raw Pollinations URL (faster, no storage
    // round-trip). For real saves we download + upload to Storage so the
    // image is durable even if Pollinations rate-limits or expires the URL.
    const pollinationsUrl = generate_image
      ? generateAvatarImageUrl(persona.name, niche, "realistic", {
          appearance: story.physical_description,
          custom_instructions,
          tone,
          seed: image_seed,
        })
      : null;

    const image_url = pollinationsUrl && !preview_only
      ? await persistAvatarImage(
          pollinationsUrl,
          persona.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "avatar",
        )
      : pollinationsUrl;

    // Apply user-chosen palette if provided (override AI suggestion)
    const finalPalette = palette && palette.length === 2
      ? palette
      : (persona.brand_identity?.palette || ["#7C3AED", "#06B6D4"]);

    // ── Preview mode: return persona + image without DB write
    if (preview_only) {
      return new Response(JSON.stringify({
        preview: {
          name: persona.name,
          bio: story.short_bio,
          life_story: story.life_story,
          physical_description: story.physical_description,
          music_genre: persona.music_genre,
          brand_identity: { ...persona.brand_identity, palette: finalPalette },
          tone,
          avatar_style: "realistic",
          image_url,
          niche,
          language,
          ui_language: body.ui_language || language,
        },
      }), {
        status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── Save mode: insert into DB
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: avatar, error: insertError } = await admin
      .from("avatars")
      .insert([{
        user_id: user!.id,
        name: persona.name,
        niche,
        language,
        ui_language: body.ui_language || language,
        tone,
        avatar_style: "realistic",      // forced
        bio: story.short_bio,
        life_story: story.life_story,
        music_genre: persona.music_genre,
        brand_identity: {
          ...persona.brand_identity,
          palette: finalPalette,
          physical_description: story.physical_description,
          custom_instructions: custom_instructions || undefined,
        },
        image_url,
        is_active: true,
        is_paused: false,
      }])
      .select()
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Auto-generate production blueprint in the background (non-blocking)
    // Fire-and-forget: don't await; user sees avatar immediately, blueprint
    // appears moments later via realtime.
    fetch(`${SUPABASE_URL}/functions/v1/generate-blueprint`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
      },
      body: JSON.stringify({ avatar_id: avatar.id }),
    }).catch((err) => console.error("[create-avatar] blueprint trigger failed:", err));

    return new Response(JSON.stringify({ avatar }), {
      status: 201, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("create-avatar error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
