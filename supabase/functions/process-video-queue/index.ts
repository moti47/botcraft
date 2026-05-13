/**
 * process-video-queue — Edge Function
 *
 * Generates the content of a video so the user can review it before publishing.
 * Triggered EITHER by scheduler-tick cron OR directly by produce-video.
 *
 * Pipeline:
 *   1. Fetch video + avatar (with life_story + production_blueprint)
 *   2. Generate SCRIPT via Groq LLM, guided by blueprint.script_template
 *   3. Build AUDIO URL via Pollinations TTS (free, on-demand)
 *   4. Build THUMBNAIL URL via Pollinations Flux (free, on-demand)
 *   5. Save to videos table with status = 'ready_for_review'
 *
 * Audio/thumbnail URLs are LAZY — Pollinations generates content
 * when the URL is first requested, so the pipeline returns fast.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";

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
// Script generator (Groq LLM)
// ─────────────────────────────────────────────────────────────
async function generateScript(
  avatar: Record<string, unknown>,
  topic: string,
): Promise<{ script: string; caption: string; sections: unknown[] }> {
  const lang = String(avatar.language || "EN").toUpperCase();
  const langName = LANG_NAMES[lang] || "English";

  const blueprint = (avatar.production_blueprint || {}) as Record<string, unknown>;
  const scriptTemplate = (blueprint.script_template || {}) as Record<string, unknown>;
  const structure = (scriptTemplate.structure as Array<Record<string, unknown>>) || [
    { section: "hook", duration_sec: 5, guidance: "grab attention immediately" },
    { section: "body", duration_sec: 35, guidance: "deliver the insight" },
    { section: "cta", duration_sec: 5, guidance: "ask for follow / comment" },
  ];

  const fallback = {
    script: `Hey everyone! Today let's talk about ${topic}. This is something worth knowing. Follow for more!`,
    caption: `${topic} — quick take 🎯`,
    sections: structure,
  };

  if (!GROQ_API_KEY) return fallback;

  const prompt = `You are writing a short-form video script for an AI content creator.

CREATOR:
  name: ${avatar.name}
  niche: ${avatar.niche}
  tone: ${avatar.tone || "engaging"}
  bio: ${avatar.bio || ""}
  life_story_excerpt: ${String(avatar.life_story || "").slice(0, 400)}

TOPIC: ${topic}

SCRIPT STRUCTURE (follow in order, target durations):
${structure.map((s, i) => `  ${i + 1}. ${s.section} (${s.duration_sec}s) — ${s.guidance}`).join("\n")}

Pacing: ${scriptTemplate.pacing || "moderate"}
Vocabulary: ${scriptTemplate.vocabulary || "casual punchy"}
Hook style: ${scriptTemplate.hook_style || "bold question"}

Return STRICT JSON:
{
  "script": "Full spoken script in ${langName}. Plain text only — no labels, no stage directions. ${scriptTemplate.duration_seconds ? `Target ${scriptTemplate.duration_seconds}s.` : "30-50s."} Match the tone (${avatar.tone}).",
  "caption": "Short social caption in ${langName}, max 200 chars, with 2-3 hashtags.",
  "sections": [
    { "section": "hook", "text": "the hook line(s)" },
    { "section": "body", "text": "the body content" },
    { "section": "cta", "text": "the closing CTA" }
  ]
}

Return JSON only.`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.8,
        max_tokens: 1200,
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    return {
      script: parsed.script || fallback.script,
      caption: parsed.caption || fallback.caption,
      sections: parsed.sections || structure,
    };
  } catch (err) {
    console.error("[generate-script] LLM failed:", err);
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────
// Audio URL — ElevenLabs if avatar has voice_id, else Pollinations
// ─────────────────────────────────────────────────────────────
function buildPollinationsAudioUrl(script: string, voice = "nova"): string {
  const params = new URLSearchParams({ model: "openai-audio", voice });
  return `https://text.pollinations.ai/${encodeURIComponent(script)}?${params.toString()}`;
}

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") || "";

/**
 * Generate audio with ElevenLabs and return a temporary data URL OR a file in Storage.
 * For simplicity we return a base64 data URL — works in <audio> directly.
 * Caller falls back to Pollinations URL if this fails or no key.
 */
async function generateElevenLabsAudio(script: string, voiceId: string): Promise<string | null> {
  if (!ELEVENLABS_API_KEY || !voiceId) return null;
  try {
    // Cap text length to keep ElevenLabs usage low
    const safeText = script.slice(0, 2500);
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text: safeText,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );
    if (!res.ok) {
      console.error(`[tts] ElevenLabs ${res.status}`, await res.text().catch(() => ""));
      return null;
    }
    // Upload to Supabase Storage so it has a real URL
    const audioBytes = new Uint8Array(await res.arrayBuffer());
    const filename = `${crypto.randomUUID()}.mp3`;
    const { data: upload, error: upErr } = await supabase.storage
      .from("video-assets")
      .upload(`audio/${filename}`, audioBytes, {
        contentType: "audio/mpeg",
        upsert: false,
      });
    if (upErr) {
      console.error("[tts] storage upload failed:", upErr);
      return null;
    }
    const { data: pub } = supabase.storage
      .from("video-assets")
      .getPublicUrl(upload.path);
    return pub.publicUrl;
  } catch (err) {
    console.error("[tts] generation failed:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Thumbnail URL (Pollinations Flux — lazy, free)
// ─────────────────────────────────────────────────────────────
function buildThumbnailFromPrompt(prompt: string, seed?: number): string {
  const params = new URLSearchParams({
    model: "flux", width: "576", height: "1024",
    seed: String(seed ?? Math.floor(Math.random() * 1_000_000)),
    nologo: "true", enhance: "true",
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
}

function buildThumbnailUrl(avatar: Record<string, unknown>, topic: string, seed?: number): string {
  const brand = (avatar.brand_identity || {}) as Record<string, unknown>;
  const physical = (brand.physical_description as string) || "young adult, friendly";
  const niche = avatar.niche || "general";
  const prompt = `Vertical 9:16 video thumbnail. ${physical}. Topic: "${topic}". ${niche} content creator vibe. Bold readable text overlay. High-contrast color, eye-catching, modern, photorealistic, ultra detailed`;
  const params = new URLSearchParams({
    model: "flux",
    width: "576",
    height: "1024",
    seed: String(seed ?? Math.floor(Math.random() * 1_000_000)),
    nologo: "true",
    enhance: "true",
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
}

// ─────────────────────────────────────────────────────────────
// Per-stage status helper — writes currently_in + render_options.stages
// so the UI can show "currently in: director / script / audio / thumbnail".
// ─────────────────────────────────────────────────────────────
async function setStage(
  videoId: string,
  stage: string,
  extra: Record<string, unknown> = {},
) {
  const now = new Date().toISOString();
  console.log(`[pipeline] ${videoId} → ${stage}`);
  // Read current stages map so we append, not overwrite
  const { data: cur } = await supabase
    .from("videos")
    .select("render_options")
    .eq("id", videoId)
    .single();
  const stages = {
    ...((cur?.render_options as Record<string, unknown>)?.stages || {}),
    [stage]: now,
  };
  await supabase
    .from("videos")
    .update({
      currently_in: stage,
      updated_at: now,
      render_options: { ...(cur?.render_options || {}), stages },
      ...extra,
    })
    .eq("id", videoId);
}

// ─────────────────────────────────────────────────────────────
// Pipeline
// ─────────────────────────────────────────────────────────────
async function runPipeline(videoId: string) {
  console.log(`[pipeline] start ${videoId}`);

  await supabase
    .from("videos")
    .update({
      status: "processing",
      currently_in: "starting",
      stage_error: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoId);

  // 1. Get the Director's Plan first (this orchestrates EVERYTHING)
  await setStage(videoId, "director");
  try {
    const directorRes = await fetch(`${SUPABASE_URL}/functions/v1/direct-video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ video_id: videoId }),
    });
    if (!directorRes.ok) {
      const txt = await directorRes.text().catch(() => "");
      console.error(`[pipeline] director non-OK ${directorRes.status}: ${txt}`);
    }
  } catch (err) {
    console.error("[pipeline] director call failed, will use fallback:", err);
  }

  const { data: video } = await supabase
    .from("videos")
    .select("*, avatars!inner(*)")
    .eq("id", videoId)
    .single();

  if (!video) throw new Error(`video ${videoId} not found`);
  const avatar = video.avatars;
  const topic = video.topic || `${avatar.niche} insights`;
  const plan = (video.directors_plan || {}) as Record<string, unknown>;

  let currentStage = "director";
  try {
    // 2. Assemble the spoken script from the Director's sections
    currentStage = "script";
    await setStage(videoId, currentStage);
    let script: string;
    let caption: string;
    let sections: unknown[];

    if (plan.sections && Array.isArray(plan.sections) && plan.sections.length > 0) {
      // Use Director's plan
      const planSections = plan.sections as Array<{ text?: string }>;
      const hookText = (plan.hook as { text?: string })?.text || "";
      const ctaText = (plan.cta as { text?: string })?.text || "";
      script = [hookText, ...planSections.map((s) => s.text || ""), ctaText]
        .filter(Boolean)
        .join(" ");
      caption = `${plan.title || topic}\n\n${(plan.tags as string[] || []).join(" ")}`;
      sections = planSections;
    } else {
      // Fallback to old generator
      const fallback = await generateScript(avatar, topic);
      script = fallback.script;
      caption = fallback.caption;
      sections = fallback.sections;
    }

    // 3. TTS — pick provider by voice_id prefix:
    //   - "browser:VOICE"   → browser SpeechSynthesis renders client-side; no URL needed.
    //   - "poll:VOICE"      → Pollinations (free, lazy URL).
    //   - bare ElevenLabs   → ElevenLabs (uploads MP3 to storage; may be blocked on free tier).
    //   - none              → default Pollinations "nova".
    currentStage = "audio";
    await setStage(videoId, currentStage);
    let audio_url: string;
    if (avatar.voice_id?.startsWith("browser:")) {
      // Frontend speaks the script via Web SpeechSynthesis — no audio file.
      audio_url = "";
    } else if (avatar.voice_id?.startsWith("poll:")) {
      const voiceName = avatar.voice_id.slice(5);
      audio_url = buildPollinationsAudioUrl(script, voiceName);
    } else if (avatar.voice_id) {
      const elevenAudio = await generateElevenLabsAudio(script, avatar.voice_id);
      audio_url = elevenAudio || buildPollinationsAudioUrl(script);
    } else {
      audio_url = buildPollinationsAudioUrl(script);
    }

    // 4. Thumbnail: use Director's prompt if available
    currentStage = "thumbnail";
    await setStage(videoId, currentStage);
    const thumbPrompt = (plan.thumbnail as { prompt?: string })?.prompt;
    const thumbnail_url = thumbPrompt
      ? buildThumbnailFromPrompt(thumbPrompt)
      : buildThumbnailUrl(avatar, topic);

    currentStage = "finalizing";
    await setStage(videoId, currentStage);
    await supabase
      .from("videos")
      .update({
        script,
        topic,
        audio_url,
        thumbnail_url,
        status: "ready_for_review",
        currently_in: null,
        stage_error: null,
        error_message: null,
        render_options: {
          ...(video.render_options || {}),
          caption,
          sections,
          generated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    await supabase
      .from("video_queue")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("video_id", videoId);

    console.log(`[pipeline] done ${videoId}`);
    return { video_id: videoId, status: "ready_for_review", script, caption };
  } catch (err) {
    console.error(`[pipeline] failed ${videoId} at stage=${currentStage}:`, err);
    await supabase
      .from("videos")
      .update({
        status: "failed",
        currently_in: null,
        stage_error: currentStage,
        error_message: `[${currentStage}] ${String(err)}`,
      })
      .eq("id", videoId);
    await supabase
      .from("video_queue")
      .update({ status: "failed", error_message: `[${currentStage}] ${String(err)}` })
      .eq("video_id", videoId);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    let video_id: string | undefined;
    try {
      const body = await req.json();
      video_id = body.video_id;
    } catch { /* empty body OK */ }

    if (!video_id) {
      const { data: next } = await supabase
        .from("video_queue")
        .select("video_id")
        .eq("status", "queued")
        .lte("scheduled_for", new Date().toISOString())
        .order("scheduled_for", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!next) {
        return new Response(JSON.stringify({ message: "Nothing to process" }), {
          status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
      video_id = next.video_id;
    }

    const result = await runPipeline(video_id!);
    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("process-video-queue error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
