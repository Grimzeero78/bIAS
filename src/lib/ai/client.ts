import ZAI from "z-ai-web-dev-sdk";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Shared backend AI client with a PLUGGABLE PROVIDER LAYER.
 *
 * Every provider is normalised to the same tiny surface the pipeline uses:
 *  - chat.completions.create        → text LLM (CV parsing, scoring, fusion)
 *  - chat.completions.createVision  → multimodal vision (interview frames)
 *  - audio.asr.create               → speech-to-text (interview transcript)
 *
 * PROVIDER RESOLUTION ORDER
 *  1. ZAI_CONFIG_JSON / ZAI_BASE_URL+ZAI_API_KEY — any OpenAI-compatible
 *     gateway the owner pastes in (OpenAI, xAI Grok, Google Gemini, Groq,
 *     OpenRouter, Z.ai GLM public API, …). Takes priority so a real key
 *     always wins when provided.
 *  2. Cloudflare Workers AI binding (env.AI) — ZERO-CONFIG default on
 *     production: Llama 3.3 70B (text), Llama 4 Scout (vision), Whisper
 *     (ASR) running inside the owner's own Cloudflare account on its free
 *     daily allocation. No third-party signup, no API key.
 *  3. z-ai-web-dev-sdk default — sandbox / full-server dev (reads the
 *     platform config file).
 */

/** Minimal runtime shape of the Workers AI binding we rely on. */
interface AIRunBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

interface TextContentItem {
  type: "text";
  text: string;
}
interface ImageContentItem {
  type: "image_url";
  image_url: { url: string };
}
export type MultimodalContentItem = TextContentItem | ImageContentItem;

interface ChatMessage {
  role: string;
  content: string;
}
interface VisionMessage {
  role: string;
  content: string | MultimodalContentItem[];
}

/** The provider-neutral client contract (mirrors the z-ai SDK surface). */
export interface MeritAIClient {
  chat: {
    completions: {
      create(body: { messages: ChatMessage[]; thinking?: unknown }): Promise<{ choices: { message: { content: string } }[] }>;
      createVision(body: { messages: VisionMessage[]; thinking?: unknown }): Promise<{ choices: { message: { content: string } }[] }>;
    };
  };
  audio: {
    asr: {
      create(body: { file_base64: string }): Promise<{ text: string }>;
    };
  };
}

// ─────────────────────────────────────────────────────────────
// Provider 1 — generic OpenAI-compatible HTTP gateway
// ─────────────────────────────────────────────────────────────

interface GenericProviderConfig {
  baseUrl: string;
  apiKey: string;
  model?: string;        // text model, default gpt-4o-mini
  visionModel?: string;  // vision model, default = model
  asrModel?: string;     // transcription model, default whisper-1
  maxTokens?: number;
}

export class GenericOpenAIAdapter implements MeritAIClient {
  constructor(private cfg: GenericProviderConfig) {}

  private async chat(body: { messages: unknown[] }, model: string, maxTokens: number): Promise<{ choices: { message: { content: string } }[] }> {
    const res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages: body.messages, max_tokens: maxTokens }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`AI gateway ${res.status}: ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { choices: (json.choices ?? []).map((c) => ({ message: { content: c.message?.content ?? "" } })) };
  }

  async create(body: { messages: ChatMessage[] }) {
    // The pipeline speaks the platform SDK dialect (assistant-first system
    // prompt + SDK-only `thinking` field). Generic gateways expect a
    // standard `system` role and reject unknown params — normalise both.
    const messages = body.messages.map((m, i) => ({
      role: i === 0 && m.role === "assistant" ? "system" : m.role,
      content: m.content,
    }));
    return this.chat({ messages }, this.cfg.model || "gpt-4o-mini", this.cfg.maxTokens || 3072);
  }

  async createVision(body: { messages: VisionMessage[] }) {
    return this.chat({ messages: body.messages }, this.cfg.visionModel || this.cfg.model || "gpt-4o-mini", this.cfg.maxTokens || 2048);
  }

  async asr(body: { file_base64: string }): Promise<{ text: string }> {
    const bytes = Buffer.from(body.file_base64, "base64");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: "audio/wav" }), "chunk.wav");
    form.append("model", this.cfg.asrModel || "whisper-1");
    const res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`ASR ${res.status}: ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as { text?: string };
    return { text: json.text ?? "" };
  }

  get client(): MeritAIClient {
    return {
      chat: {
        completions: {
          create: (b) => this.create(b as { messages: ChatMessage[] }),
          createVision: (b) => this.createVision(b as { messages: VisionMessage[] }),
        },
      },
      audio: { asr: { create: (b) => this.asr(b as { file_base64: string }) } },
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Provider 2 — Cloudflare Workers AI binding (zero-config)
// ─────────────────────────────────────────────────────────────

const WA_TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const WA_VISION_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const WA_ASR_MODEL = "@cf/openai/whisper";

export class WorkersAIAdapter implements MeritAIClient {
  constructor(private ai: AIRunBinding) {}

  /** Normalise any Workers AI text response into the OpenAI choices shape. */
  private static toChoices(out: unknown): { choices: { message: { content: string } }[] } {
    // Current Workers AI chat models return the OpenAI completion shape:
    // { choices: [{ message: { content } }] }
    const o = out as { choices?: { message?: { content?: string } }[] } | null;
    if (o && Array.isArray(o.choices) && o.choices.length > 0) {
      return {
        choices: o.choices.map((c) => ({ message: { content: c.message?.content ?? "" } })),
      };
    }
    // Legacy/other shapes: { response } | { description } | { text } | string
    return { choices: [{ message: { content: WorkersAIAdapter.responseText(out) } }] };
  }

  private static responseText(out: unknown): string {
    if (typeof out === "string") return out;
    if (out && typeof out === "object") {
      const o = out as Record<string, unknown>;
      if (typeof o.response === "string") return o.response;
      if (typeof o.description === "string") return o.description;
      // whisper ASR returns { text }
      if (typeof o.text === "string") return o.text;
      if (o.output && typeof o.output === "object") {
        const oo = o.output as Record<string, unknown>;
        if (typeof oo.text === "string") return oo.text;
      }
    }
    return "";
  }

  async create(body: { messages: ChatMessage[] }) {
    // strip SDK-only fields (thinking) — Workers AI rejects unknown params
    const messages = body.messages.map((m) => ({ role: m.role, content: m.content }));
    const out = await this.ai.run(WA_TEXT_MODEL, { messages, max_tokens: 3072 });
    return WorkersAIAdapter.toChoices(out);
  }

  async createVision(body: { messages: VisionMessage[] }) {
    const msg = body.messages[0];
    const parts: MultimodalContentItem[] =
      typeof msg.content === "string"
        ? [{ type: "text", text: msg.content }]
        : (msg.content as MultimodalContentItem[]);
    const text = parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
    const images = parts.filter((p) => p.type === "image_url").map((p) => p.image_url.url);

    // Modern path: OpenAI-style multimodal messages (llama-4-scout)
    try {
      const out = await this.ai.run(WA_VISION_MODEL, {
        messages: [{ role: "user", content: parts }],
        max_tokens: 2048,
      });
      const res = WorkersAIAdapter.toChoices(out);
      if (res.choices[0]?.message?.content?.trim()) return res;
      throw new Error("empty vision response");
    } catch {
      // Legacy path: prompt + image_url array (llama-3.2-vision schema)
      const out = await this.ai.run(WA_VISION_MODEL, {
        prompt: text,
        image_url: images,
        max_tokens: 2048,
      });
      return WorkersAIAdapter.toChoices(out);
    }
  }

  async asr(body: { file_base64: string }): Promise<{ text: string }> {
    // @cf/openai/whisper rejects base64 strings (oneOf schema mismatch:
    // "Type mismatch of '/audio', 'array' not in 'string'") — the binding's
    // validated input shape is a plain ARRAY OF BYTES.
    const bytes = Uint8Array.from(atob(body.file_base64), (c) => c.charCodeAt(0));
    const out = await this.ai.run(WA_ASR_MODEL, { audio: Array.from(bytes) });
    const text = WorkersAIAdapter.responseText(out);
    return { text };
  }

  get client(): MeritAIClient {
    return {
      chat: {
        completions: {
          create: (b) => this.create(b as { messages: ChatMessage[] }),
          createVision: (b) => this.createVision(b as { messages: VisionMessage[] }),
        },
      },
      audio: { asr: { create: (b) => this.asr(b as { file_base64: string }) } },
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Resolution
// ─────────────────────────────────────────────────────────────

let _zai: MeritAIClient | null = null;

async function genericCredentials(): Promise<GenericProviderConfig | null> {
  // The sandbox's internal gateway is unreachable from public runtimes
  // (Workers edge cannot resolve it) — never route production AI through it.
  const INTERNAL_GATEWAY = "internal-api.z.ai";
  const usable = (cfg: GenericProviderConfig | null): GenericProviderConfig | null => {
    if (!cfg) return null;
    try {
      if (new URL(cfg.baseUrl).hostname.endsWith(INTERNAL_GATEWAY)) return null;
    } catch {
      return null;
    }
    return cfg;
  };

  const rawJson = process.env.ZAI_CONFIG_JSON;
  if (rawJson) {
    try {
      const cfg = JSON.parse(rawJson) as GenericProviderConfig;
      if (cfg.baseUrl && cfg.apiKey) {
        const ok = usable(cfg);
        if (ok) return ok;
        console.warn("[ai] ignoring sandbox-internal gateway from ZAI_CONFIG_JSON — falling back to Workers AI");
      }
    } catch {
      console.error("[ai] ZAI_CONFIG_JSON is not valid JSON");
    }
  }
  const base = process.env.ZAI_BASE_URL;
  const key = process.env.ZAI_API_KEY;
  if (base && key) {
    const ok = usable({ baseUrl: base, apiKey: key });
    if (ok) return ok;
  }
  // On Workers, secrets live in bindings — check the request context too.
  try {
    const env = getCloudflareContext().env as Record<string, string | undefined> | undefined;
    if (env?.ZAI_CONFIG_JSON) {
      try {
        const cfg = JSON.parse(env.ZAI_CONFIG_JSON) as GenericProviderConfig;
        if (cfg.baseUrl && cfg.apiKey) {
          const ok = usable(cfg);
          if (ok) return ok;
        }
      } catch {}
    } else if (env?.ZAI_BASE_URL && env?.ZAI_API_KEY) {
      const ok = usable({ baseUrl: env.ZAI_BASE_URL, apiKey: env.ZAI_API_KEY });
      if (ok) return ok;
    }
  } catch {
    /* not on Cloudflare */
  }
  return null;
}

async function workersAIBinding(): Promise<AIRunBinding | null> {
  try {
    const env = getCloudflareContext().env as { AI?: AIRunBinding } | undefined;
    return env?.AI ?? null;
  } catch {
    return null;
  }
}

export async function getZAI(): Promise<MeritAIClient> {
  if (_zai) return _zai;

  // 1. Owner-supplied OpenAI-compatible gateway (highest priority)
  const cfg = await genericCredentials();
  if (cfg) {
    _zai = new GenericOpenAIAdapter(cfg).client;
    console.log(`[ai] provider: generic gateway ${cfg.baseUrl}`);
    return _zai;
  }

  // 2. Cloudflare Workers AI — zero-config production default
  const ai = await workersAIBinding();
  if (ai) {
    _zai = new WorkersAIAdapter(ai).client;
    console.log("[ai] provider: Cloudflare Workers AI (llama-3.3-70b / llama-4-scout / whisper)");
    return _zai;
  }

  // 3. Platform SDK default (sandbox / full-server deployments)
  const client = await ZAI.create();
  _zai = client as unknown as MeritAIClient;
  console.log("[ai] provider: z-ai SDK default");
  return _zai;
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
