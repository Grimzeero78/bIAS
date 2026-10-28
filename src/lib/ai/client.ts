import ZAI from "z-ai-web-dev-sdk";

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

export async function getZAI(): Promise<ZAI> {
  if (!_zai) _zai = await ZAI.create();
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
