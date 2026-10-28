/**
 * Unit tests for the AI provider adapters — Workers AI binding + generic
 * OpenAI-compatible gateway. Pure request/response mapping, no network.
 * Run: bun test src-test/unit
 */
import { describe, expect, test } from "bun:test";
import {
  WorkersAIAdapter,
  GenericOpenAIAdapter,
  type MultimodalContentItem,
} from "../../src/lib/ai/client";

function fakeAI(responses: unknown[] | Error[], log: { models: string[]; inputs: Record<string, unknown>[] } = { models: [], inputs: [] }) {
  let i = 0;
  return {
    run(model: string, input: Record<string, unknown>) {
      log.models.push(model);
      log.inputs.push(input);
      const r = responses[Math.min(i++, responses.length - 1)];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r);
    },
  };
}

describe("workers ai adapter", () => {
  test("text: strips thinking field, uses llama-3.3-70b, normalises {response}", async () => {
    const log = { models: [] as string[], inputs: [] as Record<string, unknown>[] };
    const ai = fakeAI([{ response: "  {\"parsed\": true}  " }], log);
    const adapter = new WorkersAIAdapter(ai as never);
    const res = await adapter.create({
      messages: [
        { role: "assistant", content: "system prompt" },
        { role: "user", content: "user text" },
      ],
      thinking: { type: "disabled" },
    });
    expect(log.models[0]).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    const input = log.inputs[0] as { messages: { role: string; content: string }[]; max_tokens: number };
    expect(input.messages).toHaveLength(2);
    expect(JSON.stringify(input.messages)).not.toContain("thinking");
    expect(input.max_tokens).toBeGreaterThan(1000);
    expect(res.choices[0].message.content).toBe("  {\"parsed\": true}  ");
  });


  test("text: passes through OpenAI-shape choices (current Workers AI format)", async () => {
    const log = { models: [] as string[], inputs: [] as Record<string, unknown>[] };
    const ai = fakeAI([{ choices: [{ index: 0, message: { role: "assistant", content: "{\"ok\": 1}" } }] }], log);
    const adapter = new WorkersAIAdapter(ai as never);
    const res = await adapter.create({ messages: [{ role: "user", content: "hi" }] });
    expect(res.choices[0].message.content).toBe("{\"ok\": 1}");
  });

  test("vision: modern multimodal messages path extracts content parts", async () => {
    const log = { models: [] as string[], inputs: [] as Record<string, unknown>[] };
    const ai = fakeAI([{ response: "{\"observations\": []}" }], log);
    const adapter = new WorkersAIAdapter(ai as never);
    const parts: MultimodalContentItem[] = [
      { type: "text", text: "analyse frames" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,BBBB" } },
    ];
    const res = await adapter.createVision({ messages: [{ role: "user", content: parts }] });
    expect(log.models[0]).toBe("@cf/meta/llama-4-scout-17b-16e-instruct");
    const input = log.inputs[0] as { messages: { content: MultimodalContentItem[] }[] };
    expect(input.messages[0].content).toHaveLength(3);
    expect(res.choices[0].message.content).toContain("observations");
  });

  test("vision: falls back to legacy prompt+image_url schema when messages fail", async () => {
    const log = { models: [] as string[], inputs: [] as Record<string, unknown>[] };
    const ai = fakeAI([new Error("schema mismatch"), { description: "legacy output" }], log);
    const adapter = new WorkersAIAdapter(ai as never);
    const res = await adapter.createVision({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "look" },
            { type: "image_url", image_url: { url: "data:image/jpeg;base64,XY" } },
          ] as MultimodalContentItem[],
        },
      ],
    });
    expect(log.models).toHaveLength(2);
    const legacy = log.inputs[1] as { prompt: string; image_url: string[] };
    expect(legacy.prompt).toBe("look");
    expect(legacy.image_url).toEqual(["data:image/jpeg;base64,XY"]);
    expect(res.choices[0].message.content).toBe("legacy output");
  });

  test("asr: passes byte-array audio to whisper, returns {text}", async () => {
    const log = { models: [] as string[], inputs: [] as Record<string, unknown>[] };
    const ai = fakeAI([{ text: "hello interviewer" }], log);
    const adapter = new WorkersAIAdapter(ai as never);
    const res = await adapter.asr({ file_base64: "QUJDRA==" }); // decodes to "ABCD"
    expect(log.models[0]).toBe("@cf/openai/whisper");
    // @cf/openai/whisper's validated input shape is a plain ARRAY OF BYTES —
    // base64 strings are rejected by the model's oneOf schema.
    expect((log.inputs[0] as { audio: number[] }).audio).toEqual([65, 66, 67, 68]);
    expect(res.text).toBe("hello interviewer");
  });

  test("responseText: handles string / response / description / output.text shapes", () => {
    const priv = WorkersAIAdapter["responseText"] as (u: unknown) => string;
    expect(priv("raw")).toBe("raw");
    expect(priv({ response: "a" })).toBe("a");
    expect(priv({ description: "b" })).toBe("b");
    expect(priv({ output: { text: "c" } })).toBe("c");
    expect(priv({ unrelated: true })).toBe("");
  });
});

describe("generic openai-compatible adapter", () => {
  test("create: maps assistant→system, posts model + max_tokens with bearer auth", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      captured = { url: String(url), init: init! };
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    }) as typeof fetch;
    try {
      const adapter = new GenericOpenAIAdapter({ baseUrl: "https://api.x.ai/v1", apiKey: "k-test" });
      const res = await adapter.create({
        messages: [
          { role: "assistant", content: "sys" },
          { role: "user", content: "usr" },
        ],
      });
      const req = captured!;
      expect(req.url).toBe("https://api.x.ai/v1/chat/completions");
      expect((req.init.headers as Record<string, string>)["Authorization"]).toBe("Bearer k-test");
      const body = JSON.parse(String(req.init.body));
      expect(body.model).toBe("gpt-4o-mini");
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[0].content).toBe("sys");
      expect(JSON.stringify(body)).not.toContain("thinking");
      expect(res.choices[0].message.content).toBe("ok");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("asr: posts multipart to /audio/transcriptions with model field", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      captured = { url: String(url), init: init! };
      return new Response(JSON.stringify({ text: "transcribed" }), { status: 200 });
    }) as typeof fetch;
    try {
      const adapter = new GenericOpenAIAdapter({ baseUrl: "https://api.groq.com/openai/v1", apiKey: "k", asrModel: "whisper-large-v3" });
      const res = await adapter.asr({ file_base64: Buffer.from("wav").toString("base64") });
      expect(captured!.url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
      const form = captured!.init.body as FormData;
      expect(form.get("model")).toBe("whisper-large-v3");
      expect(res.text).toBe("transcribed");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("createVision: uses visionModel when set", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      captured = { url: String(url), init: init! };
      return new Response(JSON.stringify({ choices: [{ message: { content: "v" } }] }), { status: 200 });
    }) as typeof fetch;
    try {
      const adapter = new GenericOpenAIAdapter({ baseUrl: "https://api.openai.com/v1", apiKey: "k", model: "gpt-4o-mini", visionModel: "gpt-4o" });
      await adapter.createVision({ messages: [{ role: "user", content: [{ type: "text", text: "x" }, { type: "image_url", image_url: { url: "data:image/png;base64,z" } }] }] });
      expect(JSON.parse(String(captured!.init.body)).model).toBe("gpt-4o");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("http errors surface with status and body detail", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("quota exceeded", { status: 429 })) as typeof fetch;
    try {
      const adapter = new GenericOpenAIAdapter({ baseUrl: "https://api.x.ai/v1", apiKey: "k" });
      let msg = "";
      try {
        await adapter.create({ messages: [{ role: "user", content: "hi" }] });
      } catch (e) {
        msg = e instanceof Error ? e.message : "";
      }
      expect(msg).toContain("429");
      expect(msg).toContain("quota");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
