/**
 * direct-video — The AI Director
 *
 * One LLM call orchestrates the entire video:
 *   - hook style & timing
 *   - section-by-section script with per-section animations + b-roll
 *   - music search query, energy, swells
 *   - thumbnail prompt + facial expression + text overlay
 *   - transitions & color grade
 *   - viral score prediction (why it'll work)
 *
 * Pulls full context:
 *   - Avatar full DNA (life_story, blueprint, brand)
 *   - Performance history (last 5 posted videos with their viral_score)
 *   - Real YouTube viral references (top 3 for this niche, today)
 *   - User command (optional refinement)
 *
 * Stores the plan in videos.directors_plan and returns it.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";
const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

const LANG_NAMES: Record<string, string> = {
  EN: "English", HE: "Hebrew", ES: "Spanish", FR: "French",
  DE: "German", PT: "Portuguese", IT: "Italian", AR: "Arabic",
  JA: "Japanese", ZH: "Chinese",
};

// ─────────────────────────────────────────────────────────────
// Context gathering — what the Director sees
// ─────────────────────────────────────────────────────────────

/** Top viral references from YouTube for this niche right now */
async function fetchViralReferences(niche: string, region = "US"): Promise<unknown[]> {
  if (!YOUTUBE_API_KEY) return [];
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("q", niche);
    url.searchParams.set("type", "video");
    url.searchParams.set("order", "viewCount");
    url.searchParams.set("publishedAfter", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());
    url.searchParams.set("regionCode", region);
    url.searchParams.set("maxResults", "5");
    url.searchParams.set("key", YOUTUBE_API_KEY);
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const json = await res.json();
    return (json.items || []).slice(0, 3).map((v: Record<string, unknown>) => {
      const sn = v.snippet as Record<string, unknown>;
      return {
        title: sn?.title,
        channel: sn?.channelTitle,
        description: String(sn?.description || "").slice(0, 120),
      };
    });
  } catch (err) {
    console.error("[director] YouTube fetch failed:", err);
    return [];
  }
}

/** Past videos' performance — what's working for this specific avatar */
async function fetchPerformanceHistory(avatarId: string) {
  const { data } = await supabase
    .from("videos")
    .select("topic, viral_score, status, directors_plan")
    .eq("avatar_id", avatarId)
    .in("status", ["posted", "ready_for_review"])
    .order("created_at", { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return [];

  return data.map((v) => ({
    topic: v.topic,
    score: v.viral_score,
    hook_type: (v.directors_plan as Record<string, unknown>)?.hook
      ? ((v.directors_plan as { hook: { type?: string } }).hook.type || null)
      : null,
  }));
}

// ─────────────────────────────────────────────────────────────
// The Director's prompt
// ─────────────────────────────────────────────────────────────
function buildDirectorPrompt(args: {
  avatar: Record<string, unknown>;
  topic: string;
  userCommand?: string;
  performance: unknown[];
  viralRefs: unknown[];
}): string {
  const { avatar, topic, userCommand, performance, viralRefs } = args;
  const lang = String(avatar.language || "EN").toUpperCase();
  const langName = LANG_NAMES[lang] || "English";
  const blueprint = (avatar.production_blueprint || {}) as Record<string, unknown>;
  const brand = (avatar.brand_identity || {}) as Record<string, unknown>;

  return `You are an elite short-form video DIRECTOR for an AI content creator.
Your one job: produce a single JSON plan that drives the ENTIRE video so it has the highest viral chance.

═══ CREATOR DNA ═══
Name: ${avatar.name}
Niche: ${avatar.niche}
Tone: ${avatar.tone || "engaging"}
Language: ${langName}
Bio: ${avatar.bio || "—"}
Life story excerpt: ${String(avatar.life_story || "").slice(0, 500)}
Brand palette: ${JSON.stringify(brand.palette || ["#7C3AED", "#06B6D4"])}
Voice traits: ${JSON.stringify(brand.voice_traits || [avatar.tone])}

═══ BASELINE BLUEPRINT (use as default, override if a better idea fits the topic) ═══
${JSON.stringify(blueprint, null, 2).slice(0, 1500)}

═══ TOPIC ═══
${topic}

═══ PERFORMANCE HISTORY (what's worked before — lean into it) ═══
${performance.length ? JSON.stringify(performance, null, 2) : "(no history yet — pick the highest-confidence hook)"}

═══ VIRAL REFERENCES from YouTube right now (study these vibes, don't copy) ═══
${viralRefs.length ? JSON.stringify(viralRefs, null, 2) : "(no fresh references available)"}

${userCommand ? `═══ USER COMMAND (override priority — respect this above all) ═══\n"${userCommand}"\n` : ""}

═══ TASK ═══
Return STRICT JSON with this exact schema. Be specific, concrete, and opinionated.
No filler text. Each field must be intentional.

{
  "concept": "1-2 sentences explaining WHY this video will work — your viral hypothesis",
  "title": "Final title (in ${langName}, max 80 chars, scroll-stopping)",
  "hook": {
    "text": "The first 3-5 seconds, spoken aloud (in ${langName})",
    "type": "one of: shocking_stat | bold_claim | absurd_observation | provocative_question | story_cliffhanger",
    "duration_sec": 3-6,
    "animation": "one of: zoom_punch_in | freeze_frame_pop | whip_pan | text_explode | slow_dolly_in",
    "captions_style": "one of: highlighted_word_yellow | kinetic_bouncing | bold_outline | none",
    "rationale": "1 sentence: why THIS hook for THIS topic"
  },
  "sections": [
    {
      "type": "one of: context | proof | payoff | reveal | story_beat",
      "text": "Spoken text in ${langName}",
      "duration_sec": number,
      "animation": "specific camera/motion (e.g., slow_pan_right, hard_cut_montage, slow_dolly_in)",
      "b_roll": {
        "source": "pexels | unsplash | pollinations | none",
        "query": "search query (English) — what footage/image to fetch"
      },
      "overlay_graphics": ["e.g., 'stat:24%'", "icon:trending", "lower_third:Name"],
      "emphasis_words": ["words to stress in TTS"]
    }
  ],
  "cta": {
    "text": "Call to action in ${langName}",
    "duration_sec": 3-6,
    "animation": "logo_pop | text_slide_in | freeze_frame"
  },
  "music": {
    "search_query": "specific pixabay-friendly search like 'lo-fi tech curious' or 'cinematic build epic'",
    "energy": "high | mid | low",
    "volume_db": -10 to -20,
    "ducks_on_voice": true,
    "swells_at_seconds": [array of timestamps where music should swell]
  },
  "thumbnail": {
    "prompt": "Detailed Pollinations prompt (English) for a 9:16 thumbnail that includes the creator's face. Match brand palette.",
    "text_overlay": "Big bold text on the thumbnail (in ${langName}, max 8 words)",
    "facial_expression": "shocked | excited | curious | smug | intense | smile",
    "color_emphasis": "hex color from brand palette"
  },
  "transitions": ["array of 2-3 transition names used between sections, e.g., 'whip_pan', 'hard_cut', 'match_cut'"],
  "color_grade": "warm_vibrant | cinematic_cool | high_contrast | clean_bright | vintage_film",
  "viral_score_prediction": 0-100,
  "tags": ["array of 5-8 trending hashtags for ${langName} ${avatar.niche} content"]
}

═══ RULES ═══
1. Total video length: aim for 30-55 seconds (sum all duration_sec).
2. Hook MUST work in the first 3 seconds — assume the viewer is scrolling.
3. Use the creator's tone (${avatar.tone}) and voice traits authentically.
4. ${performance.length > 0 ? "Reference what's worked before — but innovate if scores are low." : "First video — go bold."}
5. ${userCommand ? "User command overrides defaults." : ""}
6. Return JSON ONLY. No markdown, no commentary.`;
}

// ─────────────────────────────────────────────────────────────
// LLM call (Groq)
// ─────────────────────────────────────────────────────────────
async function callDirector(prompt: string): Promise<Record<string, unknown> | null> {
  if (!GROQ_API_KEY) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",     // bigger model for orchestration quality
        messages: [
          { role: "system", content: "You are an elite viral video director. Return only valid JSON." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.85,
        max_tokens: 3000,
      }),
    });
    if (!res.ok) {
      // Fall back to smaller model if 70b is rate-limited
      const small = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.85,
          max_tokens: 3000,
        }),
      });
      if (!small.ok) return null;
      const data = await small.json();
      return JSON.parse(data.choices[0].message.content);
    }
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (err) {
    console.error("[director] LLM failed:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Fallback plan (when LLM isn't available)
// ─────────────────────────────────────────────────────────────
function fallbackPlan(avatar: Record<string, unknown>, topic: string): Record<string, unknown> {
  return {
    concept: `Quick take on ${topic} matching ${avatar.tone || "engaging"} tone.`,
    title: topic,
    hook: {
      text: `Here's why ${topic} matters right now.`,
      type: "bold_claim",
      duration_sec: 4,
      animation: "zoom_punch_in",
      captions_style: "highlighted_word_yellow",
      rationale: "Direct claim grabs scrollers in <3s",
    },
    sections: [
      { type: "context", text: `Most people get this wrong about ${topic}.`, duration_sec: 10,
        animation: "slow_pan_right", b_roll: { source: "pexels", query: String(topic) },
        overlay_graphics: [], emphasis_words: ["wrong"] },
      { type: "payoff", text: `Here's the truth.`, duration_sec: 25,
        animation: "hard_cut_montage", b_roll: { source: "pexels", query: `${topic} explained` },
        overlay_graphics: [], emphasis_words: ["truth"] },
    ],
    cta: { text: "Follow for more.", duration_sec: 4, animation: "logo_pop" },
    music: { search_query: `${avatar.music_genre || "lo-fi"} ${avatar.niche || "engaging"}`,
      energy: "mid", volume_db: -16, ducks_on_voice: true, swells_at_seconds: [4, 39] },
    thumbnail: {
      prompt: `Photorealistic vertical thumbnail. ${avatar.name} ${avatar.niche} creator looking at camera, dramatic lighting.`,
      text_overlay: String(topic).slice(0, 40),
      facial_expression: "intense",
      color_emphasis: "#7C3AED",
    },
    transitions: ["whip_pan", "hard_cut"],
    color_grade: "warm_vibrant",
    viral_score_prediction: 55,
    tags: [`#${String(avatar.niche || "trending").replace(/\s+/g, "")}`, "#viral", "#shorts"],
  };
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
    const { video_id, user_command } = body as { video_id?: string; user_command?: string };

    if (!video_id) {
      return new Response(JSON.stringify({ error: "video_id required" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Load video + avatar (no auth check — called internally by produce-video)
    const { data: video, error: vErr } = await supabase
      .from("videos")
      .select("*, avatars!inner(*)")
      .eq("id", video_id)
      .single();
    if (vErr || !video) {
      return new Response(JSON.stringify({ error: "video not found" }), {
        status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const avatar = video.avatars;
    const topic = video.topic || `${avatar.niche} insights`;
    const command = user_command || video.user_command;

    // Gather context in parallel
    const [performance, viralRefs] = await Promise.all([
      fetchPerformanceHistory(avatar.id),
      fetchViralReferences(avatar.niche),
    ]);

    // Build prompt + call director
    const prompt = buildDirectorPrompt({ avatar, topic, userCommand: command, performance, viralRefs });
    const plan = (await callDirector(prompt)) || fallbackPlan(avatar, topic);

    // Save plan + viral_score
    await supabase
      .from("videos")
      .update({
        directors_plan: plan,
        viral_score: (plan.viral_score_prediction as number) || null,
        topic: plan.title || topic,
        user_command: command || null,
      })
      .eq("id", video_id);

    return new Response(JSON.stringify({ video_id, plan }), {
      status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("direct-video error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
