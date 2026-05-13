/**
 * voice-preview — generate a short audio sample
 *
 * Tries ElevenLabs first (if voice_id starts with EL: or is a real ElevenLabs ID).
 * Falls back to Pollinations TTS (free, OpenAI voices) for voice IDs prefixed with "poll:".
 *
 * Output: audio/mpeg
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

async function tryElevenLabs(voiceId: string, text: string): Promise<ArrayBuffer | null> {
  if (!ELEVENLABS_API_KEY) return null;
  try {
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
          text: text.slice(0, 200),
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );
    if (!res.ok) {
      const errBody = await res.text();
      console.log(`[voice-preview] ElevenLabs ${res.status}: ${errBody.slice(0, 100)}`);
      return null;
    }
    return await res.arrayBuffer();
  } catch (err) {
    console.error("[voice-preview] ElevenLabs error:", err);
    return null;
  }
}

async function tryPollinations(voice: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://text.pollinations.ai/${encodeURIComponent(text.slice(0, 200))}?model=openai-audio&voice=${voice}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`[voice-preview] Pollinations ${res.status}`);
      return null;
    }
    return await res.arrayBuffer();
  } catch (err) {
    console.error("[voice-preview] Pollinations error:", err);
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { voice_id, text } = body as { voice_id?: string; text?: string };
    if (!voice_id || !text) {
      return new Response(JSON.stringify({ error: "voice_id and text required" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let audio: ArrayBuffer | null = null;

    // Pollinations voice IDs are prefixed with "poll:"
    if (voice_id.startsWith("poll:")) {
      const voice = voice_id.slice(5);
      audio = await tryPollinations(voice, text);
    } else {
      // ElevenLabs first, then Pollinations as fallback
      audio = await tryElevenLabs(voice_id, text);
      if (!audio) {
        // Fallback: pick a sensible Pollinations voice based on voice_id length parity
        const fallbackVoice = voice_id.length % 2 === 0 ? "nova" : "onyx";
        audio = await tryPollinations(fallbackVoice, text);
      }
    }

    if (!audio || audio.byteLength < 100) {
      return new Response(JSON.stringify({
        error: "All TTS providers failed",
        hint: "ElevenLabs free tier may be blocked. Pollinations had issues too.",
      }), {
        status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(audio, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("voice-preview error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
