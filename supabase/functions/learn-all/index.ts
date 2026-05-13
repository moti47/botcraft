import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

const groqApiKey = Deno.env.get("GROQ_API_KEY");

interface VideoMetrics {
  id: string;
  topic: string;
  status: string;
  views?: number;
  likes?: number;
  avg_watch_pct?: number;
  duration_sec?: number;
  published_at?: string;
  hook?: string;
  script_text?: string;
  visual_director_plan?: any;
}

/**
 * analyze_avatar: extract patterns from recent videos, save to learning_facts
 */
async function analyzeAvatar(
  avatarId: string,
  windowDays: number = 30,
  maxFacts: number = 5
): Promise<any> {
  // Get avatar
  const { data: avatar } = await supabase
    .from("avatars")
    .select("*")
    .eq("id", avatarId)
    .single();

  if (!avatar) return { error: "avatar not found" };

  // Get recent videos
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - windowDays);

  const { data: videos } = await supabase
    .from("videos")
    .select("*")
    .eq("avatar_id", avatarId)
    .eq("status", "ready")
    .gte("created_at", sinceDate.toISOString())
    .order("views", { ascending: false })
    .limit(25);

  if (!videos || videos.length < 3) {
    return { avatar_id: avatarId, facts: [], reason: "not enough videos" };
  }

  // Summarize for LLM
  const videosSummary = videos
    .map((v: VideoMetrics) => {
      const opts = v.render_options || {};
      return `- views=${v.views || 0} likes=${v.likes || 0} watch=${v.avg_watch_pct || "?"}% topic="${
        v.topic || opts.topic || ""
      }"`;
    })
    .join("\n");

  const systemPrompt = `You analyze short-form video performance and extract atomic patterns.
Return ONLY valid JSON. A fact must be specific, quantitative, falsifiable, and actionable.`;

  const userMsg = `AVATAR: ${avatar.name} (${avatar.niche})
Window: last ${windowDays} days, ${videos.length} videos.

VIDEO METRICS:
${videosSummary}

Extract up to ${maxFacts} atomic patterns. Reply with:
{"facts": [{"category": "hook|length|timing|visual|music|cta", "fact": "...", "confidence": 0.0..1.0}]}

If weak data, return {"facts": []}.`;

  if (!groqApiKey) {
    return {
      avatar_id: avatarId,
      facts: [],
      reason: "no LLM configured",
    };
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: "mixtral-8x7b-32768",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
        temperature: 0.4,
        max_tokens: 800,
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '{"facts": []}';
    const parsed = JSON.parse(text);
    const facts = parsed.facts || [];

    // Save to learning_facts
    const now = new Date().toISOString();
    for (const fact of facts) {
      if (fact.confidence >= 0.5) {
        // Only save high-confidence facts
        await supabase
          .from("learning_facts")
          .insert([
            {
              avatar_id: avatarId,
              category: fact.category,
              fact: fact.fact,
              confidence: fact.confidence,
              metric_delta: fact.metric_delta || null,
              created_at: now,
            },
          ])
          .catch(() => null);
      }
    }

    return {
      avatar_id: avatarId,
      facts_count: facts.length,
      facts: facts.filter((f: any) => f.confidence >= 0.5),
    };
  } catch (error) {
    console.error("analyze_avatar error:", error);
    return {
      avatar_id: avatarId,
      facts: [],
      error: String(error),
    };
  }
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Get all active avatars
    const { data: avatars } = await supabase
      .from("avatars")
      .select("id")
      .eq("is_active", true)
      .eq("is_paused", false);

    const results = [];
    for (const avatar of avatars || []) {
      const result = await analyzeAvatar(avatar.id, 30, 5);
      results.push(result);
      // Small delay between avatars to avoid overload
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        avatars_analyzed: results.length,
        results,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("learn-all error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
