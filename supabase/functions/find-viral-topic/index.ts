import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

interface FindTopicRequest {
  avatar_id: string;
  top_n?: number;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

const groqApiKey = Deno.env.get("GROQ_API_KEY");
const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");

interface TrendSignal {
  topic: string;
  score: number;
  source: string;
}

/**
 * discover_for_avatar: gather trends from YouTube + Google Trends,
 * rank by LLM, save to trend_signals table.
 */
async function discoverForAvatar(
  avatar: any,
  topN: number = 5
): Promise<TrendSignal[]> {
  const niche = avatar.niche || "general";

  // Gather YouTube videos (top 15 by views in last 7 days)
  let youtubeTopics: TrendSignal[] = [];
  if (youtubeApiKey) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(niche)}&order=viewCount&maxResults=15&type=video&key=${youtubeApiKey}&regionCode=US`
      );
      const data = await response.json();
      youtubeTopics = (data.items || []).map((item: any) => ({
        topic: item.snippet.title,
        score: Math.random() * 100, // placeholder: we'd fetch view_count from stats API
        source: "youtube",
      }));
    } catch (e) {
      console.warn("youtube fetch failed:", e);
    }
  }

  // Gather Google Trends (via pytrends simulation)
  // In production, you'd call a py-based service or use a JS lib
  let googleTopics: TrendSignal[] = [];
  // For now, placeholder

  const merged = [...youtubeTopics, ...googleTopics];

  // Rank via LLM
  if (!groqApiKey || merged.length === 0) {
    // Fallback: return top by score
    return merged.sort((a, b) => b.score - a.score).slice(0, topN);
  }

  const topicsText = merged.map((t) => `- ${t.topic} (score: ${t.score.toFixed(1)})`).join("\n");
  const prompt = `
Avatar: ${avatar.name} (niche: ${niche}, tone: ${avatar.persona_dna?.tone || "neutral"})
Trending topics for this avatar:
${topicsText}

Pick the top ${topN} topics that would make the MOST VIRAL short-form video for this avatar.
Reply ONLY with a JSON array of objects: [{"topic": "...", "score": 0.xx}]
`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: "mixtral-8x7b-32768",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });
    const result = await response.json();
    const text = result.choices?.[0]?.message?.content || "[]";
    const ranked = JSON.parse(text);
    return ranked.slice(0, topN);
  } catch (e) {
    console.warn("LLM ranking failed:", e);
    return merged.sort((a, b) => b.score - a.score).slice(0, topN);
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
    const body: FindTopicRequest = await req.json();
    const { avatar_id, top_n = 5 } = body;

    if (!avatar_id) {
      return new Response(JSON.stringify({ error: "avatar_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get avatar
    const { data: avatar, error: avatarError } = await supabase
      .from("avatars")
      .select("*")
      .eq("id", avatar_id)
      .single();

    if (avatarError || !avatar) {
      return new Response(JSON.stringify({ error: `avatar ${avatar_id} not found` }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const signals = await discoverForAvatar(avatar, top_n);

    // Save to trend_signals table
    const now = new Date().toISOString();
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    for (const signal of signals) {
      await supabase
        .from("trend_signals")
        .insert([
          {
            avatar_id,
            topic: signal.topic,
            score: signal.score,
            source: signal.source,
            created_at: now,
            expires_at: tomorrow,
          },
        ])
        .catch(() => null); // non-critical
    }

    return new Response(
      JSON.stringify({
        avatar_id,
        topics: signals,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("find-viral-topic error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
