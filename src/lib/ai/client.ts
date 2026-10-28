import ZAI from "z-ai-web-dev-sdk";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Shared backend AI client.
 * z-ai-web-dev-sdk is backend-only. It exposes:
 *  - chat.completions.create        → text LLM (CV parsing, scoring, justification)
 *  - chat.completions.createVision  → multimodal vision (interview video frames)
 *  - audio.asr.create               → speech-to-text (interview transcripts)
 *
 * In a production deployment each of these maps 1:1 to OpenAI GPT-4o,
 * GPT-4o Vision, and Whisper/Google STT respectively.
 */

let _zai: ZAI | null = null;

/**
 * Client resolution order:
 *  1. ZAI_BASE_URL + ZAI_API_KEY env vars — used on serverless/edge hosts
 *     (e.g. Cloudflare Workers) where no config file can be read.
 *  2. The SDK default — reads .z-ai-config from the project/home dir (sandbox,
 *     full-server deployments).
 */
async function zaiCredentials(): Promise<Record<string, string> | null> {
  // Full-config secret (recommended for deployments): JSON with baseUrl, apiKey,
  // and any of chatId/token/userId the service requires.
  const rawJson = process.env.ZAI_CONFIG_JSON;
  if (rawJson) {
    try {
      const cfg = JSON.parse(rawJson) as Record<string, string>;
      if (cfg.baseUrl && cfg.apiKey) return cfg;
    } catch {
      console.error("[ai] ZAI_CONFIG_JSON is not valid JSON");
    }
  }
  const base = process.env.ZAI_BASE_URL;
  const key = process.env.ZAI_API_KEY;
  if (base && key) return { baseUrl: base, apiKey: key };
  // On Workers, env vars live in bindings — OpenNext doesn't always mirror
  // them onto process.env, so check the request context too.
  try {
    const env = getCloudflareContext().env as Record<string, string | undefined> | undefined;
    if (env?.ZAI_CONFIG_JSON) {
      try {
        const cfg = JSON.parse(env.ZAI_CONFIG_JSON) as Record<string, string>;
        if (cfg.baseUrl && cfg.apiKey) return cfg;
      } catch {}
    } else if (env?.ZAI_BASE_URL && env?.ZAI_API_KEY) {
      return { baseUrl: env.ZAI_BASE_URL, apiKey: env.ZAI_API_KEY };
    }
  } catch {
    /* not on Cloudflare */
  }
  return null;
}

export async function getZAI(): Promise<ZAI> {
  if (_zai) return _zai;
  const cfg = await zaiCredentials();
  let client: ZAI;
  if (cfg) {
    // The SDK's types mark the constructor private, but it is the documented
    // way to pass config programmatically (needed where no config file exists).
    const ZAIWithCtor = ZAI as unknown as new (config: Record<string, string>) => ZAI;
    client = new ZAIWithCtor(cfg);
  } else {
    client = await ZAI.create();
  }
  _zai = client;
  return client;
}

export async function llmText(system: string, user: string, retries = 2): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const zai = await getZAI();
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "assistant", content: system },
          { role: "user", content: user },
        ],
        thinking: { type: "disabled" },
      });
      const content = completion.choices[0]?.message?.content;
      if (!content || !content.trim()) throw new Error("Empty LLM response");
      return content;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("LLM call failed");
}

/**
 * Models love wrapping JSON in ```json fences or prose. This extractor
 * finds the outermost JSON object/array and parses it defensively.
 */
export function extractJson<T>(raw: string): T | null {
  if (!raw) return null;
  let text = raw.trim();
  // strip code fences
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // direct parse
  try {
    return JSON.parse(text) as T;
  } catch {
    /* keep trying */
  }
  // scan for outermost braces/brackets
  for (const [open, close] of [
    ["{", "}"],
    ["[", "]"],
  ] as const) {
    const start = text.indexOf(open);
    if (start === -1) continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = !inStr;
      if (inStr) continue;
      if (ch === open) depth++;
      if (ch === close) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1)) as T;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

export async function llmJson<T>(system: string, user: string, retries = 2): Promise<T> {
  const raw = await llmText(
    system + "\nRespond with valid JSON only. No prose, no markdown fences.",
    user,
    retries
  );
  const parsed = extractJson<T>(raw);
  if (!parsed) throw new Error("AI returned unparseable JSON");
  return parsed;
}
