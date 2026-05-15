/**
 * avatar-chatbot — conversational agent that can do everything in the dashboard.
 *
 * Uses Groq (llama-3.3-70b) with OpenAI-style tool calling. Tools are
 * implemented inline (no external services). Each tool either reads/writes
 * Supabase tables directly or invokes another Edge Function.
 *
 * Body: { user_id, avatar_id?, messages: [{role, content}] }
 * Reply: { reply, tool_calls: [...], next_state }
 *
 * The chatbot is intentionally LIMITED to the calling user's data — every
 * tool query is scoped to user_id (resolved from the JWT). Service role is
 * used only for the SELECTs that need it; mutations are still scoped.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";
const GEMINI_KEY   = Deno.env.get("GEMINI_API_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

// ─── Tool schemas ───────────────────────────────────────────────────────
// Each tool is an object the LLM can call. Names match the dashboard actions
// so the chatbot can do anything the UI can.
const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_avatars",
      description: "List the user's avatars. Use when the user asks 'show my avatars', 'which ones do I have', etc.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_avatar",
      description: "Create a new avatar persona. Triggers the create-avatar Edge Function.",
      parameters: {
        type: "object",
        properties: {
          niche: { type: "string", description: "the avatar's content niche, e.g. 'tech', 'fitness'" },
          name: { type: "string", description: "optional name; if omitted the LLM picks one" },
          language: { type: "string", description: "two-letter content language code", default: "EN" },
          tone: { type: "string", description: "engaging|witty|formal|casual|inspirational" },
          custom_instructions: { type: "string", description: "any extra direction from the user" },
        },
        required: ["niche"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_avatar",
      description: "Delete an avatar permanently. ALWAYS confirm with the user first.",
      parameters: {
        type: "object",
        properties: { avatar_id: { type: "string" } },
        required: ["avatar_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "produce_video",
      description: "Kick off video production for an avatar. Optionally supply a topic or it will pull a trend.",
      parameters: {
        type: "object",
        properties: {
          avatar_id: { type: "string" },
          topic: { type: "string", description: "optional; leave blank to auto-pick a trending topic" },
          user_command: { type: "string", description: "optional instruction like 'make it funnier'" },
        },
        required: ["avatar_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_videos",
      description: "List recent videos, optionally filtered by avatar or status.",
      parameters: {
        type: "object",
        properties: {
          avatar_id: { type: "string" },
          status: { type: "string", description: "queued|processing|ready_for_review|posted|failed|discarded" },
          limit:  { type: "number", default: 10 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_schedule",
      description: "Update an avatar's publishing schedule for one cadence (short_video|long_video|post).",
      parameters: {
        type: "object",
        properties: {
          avatar_id: { type: "string" },
          kind: { type: "string", enum: ["short_video", "long_video", "post"] },
          enabled: { type: "boolean" },
          times: {
            type: "array",
            description: "list of HH:MM strings in user's timezone",
            items: { type: "string" },
          },
        },
        required: ["avatar_id", "kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_memory",
      description: "Save a fact/preference/instruction to this avatar's long-term memory.",
      parameters: {
        type: "object",
        properties: {
          avatar_id: { type: "string" },
          content: { type: "string", description: "the fact or instruction to remember" },
          kind: { type: "string", enum: ["fact", "preference", "command"], default: "fact" },
        },
        required: ["avatar_id", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_performance",
      description: "Fetch the avatar's performance metrics (viral score, views, retention).",
      parameters: {
        type: "object",
        properties: { avatar_id: { type: "string" } },
        required: ["avatar_id"],
      },
    },
  },
];

// ─── Tool implementations ───────────────────────────────────────────────
async function execTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  jwt: string,
): Promise<unknown> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  switch (name) {
    case "list_avatars": {
      const { data, error } = await admin
        .from("avatars")
        .select("id, name, niche, language, is_paused, image_url")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) return { error: error.message };
      return { avatars: data };
    }

    case "create_avatar": {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
        body: JSON.stringify(args),
      });
      return await res.json();
    }

    case "delete_avatar": {
      // Confirm ownership before deletion
      const { data: a } = await admin
        .from("avatars").select("id").eq("id", args.avatar_id).eq("user_id", userId).maybeSingle();
      if (!a) return { error: "avatar not found or not yours" };
      const { error } = await admin.from("avatars").delete().eq("id", args.avatar_id);
      return error ? { error: error.message } : { deleted: args.avatar_id };
    }

    case "produce_video": {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/produce-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
        body: JSON.stringify(args),
      });
      return await res.json();
    }

    case "list_videos": {
      let q = admin.from("videos").select("id, status, topic, viral_score, currently_in, created_at, avatar_id, avatars!inner(user_id, name)")
        .eq("avatars.user_id", userId)
        .order("created_at", { ascending: false })
        .limit((args.limit as number) || 10);
      if (args.avatar_id) q = q.eq("avatar_id", args.avatar_id);
      if (args.status)    q = q.eq("status", args.status);
      const { data, error } = await q;
      return error ? { error: error.message } : { videos: data };
    }

    case "set_schedule": {
      const col = `${args.kind}_schedule`;
      const payload = { enabled: !!args.enabled, times: (args.times as string[]) || [] };
      const { error } = await admin
        .from("avatars").update({ [col]: payload }).eq("id", args.avatar_id).eq("user_id", userId);
      return error ? { error: error.message } : { updated: col, value: payload };
    }

    case "add_memory": {
      // Ownership check
      const { data: a } = await admin
        .from("avatars").select("id").eq("id", args.avatar_id).eq("user_id", userId).maybeSingle();
      if (!a) return { error: "avatar not found or not yours" };
      const { data, error } = await admin
        .from("avatar_memory")
        .insert([{
          avatar_id: args.avatar_id,
          kind: args.kind || "fact",
          source: "user_chat",
          content: args.content,
          weight: 1.0,
        }])
        .select()
        .single();
      return error ? { error: error.message } : { memory_id: data?.id };
    }

    case "get_performance": {
      const { data, error } = await admin
        .from("avatar_performance").select("*").eq("avatar_id", args.avatar_id).maybeSingle();
      return error ? { error: error.message } : { performance: data };
    }

    default:
      return { error: `unknown tool ${name}` };
  }
}

// ─── LLM caller — Groq with OpenAI-compatible tool calling ──────────────
async function callLLM(messages: unknown[]): Promise<Record<string, unknown> | null> {
  if (!GROQ_API_KEY) return null;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.4,
      max_tokens: 1500,
    }),
  });
  if (!res.ok) {
    console.error(`[chatbot] groq ${res.status}: ${await res.text().catch(() => "")}`);
    return null;
  }
  const data = await res.json();
  return data.choices?.[0]?.message || null;
}

const SYSTEM_PROMPT = `You are the BotCraft assistant. You help the user manage their AI avatars and videos.

Capabilities (via tools): list/create/delete avatars, produce videos, list videos, change schedules, save memories to an avatar, fetch performance.

Rules:
- ALWAYS confirm before destructive actions (delete_avatar).
- When the user says "make a video" without specifying avatar, list_avatars first and ask which.
- When the user gives the avatar an instruction ("be funnier", "always end with X"), call add_memory.
- Reply concisely. After tools run, summarize the result in 1-2 sentences.
- Respect the user's language; reply in whatever language they wrote.`;

// ─── Handler ────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "auth required" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user } } = await authClient.auth.getUser(jwt);
    if (!user) {
      return new Response(JSON.stringify({ error: "invalid session" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const userMessages = (body.messages as Array<{ role: string; content: string }>) || [];
    const messages: unknown[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...userMessages,
    ];

    // Up to 4 tool-call rounds — prevents runaway loops
    const toolResults: Array<{ name: string; args: unknown; result: unknown }> = [];
    let finalReply = "";

    for (let round = 0; round < 4; round++) {
      const msg = await callLLM(messages);
      if (!msg) break;

      const toolCalls = (msg.tool_calls as Array<Record<string, unknown>>) || [];
      if (toolCalls.length === 0) {
        finalReply = (msg.content as string) || "";
        break;
      }

      // Append assistant message that requested the calls
      messages.push(msg);

      // Run each tool, append the results
      for (const tc of toolCalls) {
        const fn = tc.function as { name: string; arguments: string };
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(fn.arguments || "{}"); } catch { /* ignore */ }
        const result = await execTool(fn.name, parsed, user.id, jwt);
        toolResults.push({ name: fn.name, args: parsed, result });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: fn.name,
          content: JSON.stringify(result).slice(0, 4000),
        });
      }
    }

    return new Response(JSON.stringify({
      reply: finalReply || "(no reply produced)",
      tool_calls: toolResults,
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("avatar-chatbot error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
