// AI probe worker — empirically determines the correct @cf/openai/whisper
// input shape from inside the edge runtime. Deploys standalone (no routes),
// callable via /?what=text|vision and /?shape=N (POST {wavB64}).

const TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const VISION_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const ASR_MODEL = "@cf/openai/whisper";

interface Env { AI: { run(model: string, input: unknown): Promise<unknown> } }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const shape = url.searchParams.get("shape") || "1";

    try {
      if (url.searchParams.get("what") === "text") {
        const out = await env.AI.run(TEXT_MODEL, {
          messages: [{ role: "user", content: "Say OK" }],
          max_tokens: 8,
        });
        return Response.json({ ok: true, out });
      }
      if (url.searchParams.get("what") === "vision") {
        // 1x1 red PNG
        const png =
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        const out = await env.AI.run(VISION_MODEL, {
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Describe this image in 5 words." },
                { type: "image_url", image_url: { url: `data:image/png;base64,${png}` } },
              ],
            },
          ],
          max_tokens: 32,
        });
        return Response.json({ ok: true, out });
      }

      const body = req.method === "POST" ? (await req.json() as { wavB64?: string }) : {};
      const wavB64 = body.wavB64 || "";
      if (!wavB64) return Response.json({ error: "POST {wavB64} required for ASR probes" }, { status: 400 });

      const bytes = Uint8Array.from(atob(wavB64), (c) => c.charCodeAt(0));
      let input: unknown;
      switch (shape) {
        case "1": input = { audio: wavB64 }; break;                      // base64 string
        case "2": input = { audio: bytes }; break;                       // Uint8Array
        case "3": input = { audio: Array.from(bytes) }; break;           // number[]
        case "4": input = wavB64; break;                                 // raw string root
        case "5": input = { audio: wavB64, task: "transcribe" }; break;  // with task hint
        default: return Response.json({ error: "unknown shape" }, { status: 400 });
      }
      const out = await env.AI.run(ASR_MODEL, input);
      return Response.json({ ok: true, shape, out });
    } catch (e) {
      return Response.json({ ok: false, shape, error: String(e).slice(0, 500) }, { status: 200 });
    }
  },
};
