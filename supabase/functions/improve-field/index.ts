/**
 * improve-field — polish a single piece of user-typed text.
 *
 * The user already wrote something. We don't replace it from scratch — we
 * sharpen it. Each field has its own brief explaining what "good" looks
 * like (a name should be punchy, a life story should feel human, a physical
 * description should be concrete and visual for the image gen, etc.).
 *
 * Body: { field, current_text, niche?, tone?, language?, ui_language? }
 * Returns: { improved }
 *
 * Public — no auth required (preview-style). Cheap LLM, small context.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

const LANG_NAMES: Record<string, string> = {
  EN: "English", HE: "Hebrew", ES: "Spanish", FR: "French",
  DE: "German", PT: "Portuguese", IT: "Italian", AR: "Arabic",
  JA: "Japanese", ZH: "Chinese",
};

// Per-field briefs. The LLM gets the brief + the user's current text +
// a strict instruction to RETURN ONLY the improved text (no preamble).
const BRIEFS: Record<string, (ctx: { niche?: string; tone?: string; lang: string }) => string> = {
  name: () => `You polish creator names. Take the user's current name and:
- Keep it ONE word (max 2 if absolutely needed).
- Make it punchy, memorable, easy to say.
- Keep the same vibe / starting letter if reasonable so the user's original idea is honored.
- No quotes, no explanation.`,
  bio: (ctx) => `You polish creator bios. The bio is a one-line tagline (max 120 chars, ideally 60-90)
for a ${ctx.niche || "content"} creator with a ${ctx.tone || "engaging"} tone.
Sharpen the user's bio: more concrete, more hook-y, less generic. Same language.
Return ONLY the improved bio. No quotes, no commentary.`,
  life_story: (ctx) => `You polish creator life-stories. The user wrote a multi-paragraph backstory
for a ${ctx.niche || "content"} creator in ${ctx.lang}. Improve it by:
- Making the character feel like a real human with concrete details (specific city, specific year, specific moment).
- Cutting filler and clichés.
- Keeping the same overall facts the user wrote (don't invent contradictions).
- Same paragraph structure, same language (${ctx.lang}).
Return ONLY the improved life story. No headers, no commentary.`,
  physical_description: (ctx) => `You polish physical descriptions for an image generator. The user wrote
a description for a ${ctx.niche || "content"} creator's portrait. Improve it by:
- Making it MORE VISUAL: concrete nouns, specific colors, specific clothing, exact age, ethnicity, hair, eyes, distinctive features.
- ALWAYS English (this feeds a diffusion model that's English-trained).
- ONE SENTENCE, comma-separated, dense.
- Keep the original intent — don't change ethnicity/age/gender the user specified, just sharpen them.
Return ONLY the improved sentence. No quotes, no commentary.`,
  custom_instructions: () => `You polish "extra instructions for the AI". The user wrote free-form notes.
Sharpen them: clearer, more actionable, no vague adjectives. Same language as the user wrote in.
Keep it short — bullet points or short sentences. Return ONLY the improved text.`,
};

async function callGroq(prompt: string): Promise<string | null> {
  if (!GROQ_API_KEY) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });
    if (!res.ok) {
      console.error(`[improve-field] groq ${res.status}: ${await res.text().catch(() => "")}`);
      return null;
    }
    const data = await res.json();
    let out = data.choices?.[0]?.message?.content as string | undefined;
    if (!out) return null;
    // Strip common LLM preambles even though we forbade them
    out = out.trim()
      .replace(/^(here(?:'s| is)|improved|version|polished)[\s\S]{0,30}?[:\-]\s*/i, "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();
    return out;
  } catch (err) {
    console.error("[improve-field] groq failed:", err);
    return null;
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
    const field = String(body.field || "").trim();
    const currentText = String(body.current_text || "").trim();
    const niche = body.niche ? String(body.niche) : undefined;
    const tone = body.tone ? String(body.tone) : undefined;
    const uiLang = String(body.ui_language || body.language || "EN").toUpperCase();
    const langName = LANG_NAMES[uiLang] || "English";

    if (!field || !BRIEFS[field]) {
      return new Response(JSON.stringify({ error: `unknown field: ${field}` }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    if (!currentText) {
      return new Response(JSON.stringify({ error: "current_text is empty — nothing to improve" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const brief = BRIEFS[field]({ niche, tone, lang: langName });
    const prompt = `${brief}

USER'S CURRENT TEXT:
"""
${currentText}
"""

Return ONLY the improved version. No prefix, no quotes, no commentary.`;

    const improved = await callGroq(prompt);
    if (!improved) {
      return new Response(JSON.stringify({ error: "improvement failed", improved: currentText }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ improved, field }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("improve-field error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
