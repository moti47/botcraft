/**
 * ingest-file — turn a user-uploaded file into avatar_memory entries.
 *
 * Free path: HuggingFace Inference API for sentence-transformers/all-MiniLM-L6-v2
 *   - 384-dim embeddings, public model, rate-limited but free.
 * Falls back to writing chunks WITHOUT embeddings if HF rate-limits — the
 * Director can still pull recent memories by recency instead of similarity.
 *
 * Body (JSON): { avatar_id, filename, content_b64, mime, source? }
 * For text/markdown we decode directly. PDFs are server-side parsed via
 * `unpdf` (Deno-friendly, no system deps).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.11.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const HF_KEY       = Deno.env.get("HUGGINGFACE_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

const MODEL = "sentence-transformers/all-MiniLM-L6-v2";

async function embed(texts: string[]): Promise<(number[] | null)[]> {
  if (!HF_KEY || texts.length === 0) return texts.map(() => null);
  try {
    const res = await fetch(`https://api-inference.huggingface.co/pipeline/feature-extraction/${MODEL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${HF_KEY}` },
      body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
    });
    if (!res.ok) {
      console.error(`[ingest] HF ${res.status}: ${await res.text().catch(() => "")}`);
      return texts.map(() => null);
    }
    // HF returns either [[…384]] for one input or [[[…]]] depending on the
    // model's pipeline shape. all-MiniLM-L6-v2 returns sentence embeddings
    // directly as number[][].
    const out = await res.json();
    return out as number[][];
  } catch (err) {
    console.error("[ingest] embed failed:", err);
    return texts.map(() => null);
  }
}

/** Crude text chunker: ~600 chars/chunk on sentence boundaries. */
function chunk(text: string, target = 600): string[] {
  const clean = text.replace(/\r/g, "").replace(/\s+\n/g, "\n").trim();
  if (clean.length === 0) return [];
  const sentences = clean.split(/(?<=[.!?])\s+|\n{2,}/);
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + " " + s).length > target && cur.length > 0) {
      out.push(cur.trim());
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((c) => c.length > 30); // skip noise-tiny chunks
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n\n") : String(text);
  } catch (err) {
    console.error("[ingest] pdf extract failed:", err);
    return "";
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
    const { avatar_id, filename, content_b64, mime, source } = body as {
      avatar_id?: string;
      filename?: string;
      content_b64?: string;
      mime?: string;
      source?: string;
    };
    if (!avatar_id || !content_b64) {
      return new Response(JSON.stringify({ error: "avatar_id and content_b64 required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Decode base64 → Uint8Array
    const bin = atob(content_b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    let text = "";
    if ((mime || "").toLowerCase().includes("pdf") || (filename || "").toLowerCase().endsWith(".pdf")) {
      text = await extractPdfText(bytes);
    } else {
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    }
    if (!text || text.trim().length < 20) {
      return new Response(JSON.stringify({ error: "could not extract usable text" }), {
        status: 422, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const chunks = chunk(text);
    if (chunks.length === 0) {
      return new Response(JSON.stringify({ error: "no chunks produced" }), {
        status: 422, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Embed in batches of 16 to stay under HF rate limits
    const embeddings: (number[] | null)[] = [];
    for (let i = 0; i < chunks.length; i += 16) {
      const batch = chunks.slice(i, i + 16);
      const vecs = await embed(batch);
      embeddings.push(...vecs);
    }

    const rows = chunks.map((content, i) => ({
      avatar_id,
      kind: "file",
      source: source || filename || "upload",
      content,
      embedding: embeddings[i] ? `[${embeddings[i]!.join(",")}]` : null,
      weight: 1.0,
      metadata: { filename, mime, chunk_index: i, total_chunks: chunks.length },
    }));

    const { error } = await supabase.from("avatar_memory").insert(rows);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      avatar_id, chunks_ingested: chunks.length,
      embedded: embeddings.filter(Boolean).length,
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("ingest-file error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
