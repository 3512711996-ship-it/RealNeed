import { z } from "zod";
import { describe, expect, it } from "vitest";
import { MoonshotGenerationAdapter } from "../lib/providers/generation/moonshot-adapter";

describe("MoonshotGenerationAdapter", () => {
  it("uses the official model list endpoint for a K2.5 credential check", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const adapter = new MoonshotGenerationAdapter(async (url, init) => {
      calls.push({ url: String(url), init });
      return modelListResponse();
    });

    await adapter.testConnection({ apiKey: "test-key-for-contract", model: "kimi-k2.5" });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.moonshot.cn/v1/models");
    expect(calls[0]?.init?.method).toBe("GET");
    expect(calls[0]?.init?.body).toBeUndefined();
  });

  it("omits temperature for Kimi K2.5, which only accepts its fixed sampling settings", async () => {
    const requests: Record<string, unknown>[] = [];
    const adapter = new MoonshotGenerationAdapter(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return response();
    });

    await generate(adapter, "kimi-k2.5");

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ model: "kimi-k2.5", max_completion_tokens: 64, response_format: { type: "json_object" } });
    expect(requests[0]).not.toHaveProperty("temperature");
  });

  it("keeps configurable temperature for legacy Moonshot V1 models", async () => {
    const requests: Record<string, unknown>[] = [];
    const adapter = new MoonshotGenerationAdapter(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return response();
    });

    await generate(adapter, "moonshot-v1-8k");

    expect(requests[0]).toMatchObject({ model: "moonshot-v1-8k", temperature: 0 });
  });
});

function response() {
  return new Response(JSON.stringify({
    id: "request-test",
    choices: [{ message: { content: "{\"connected\":true}" } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 }
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function modelListResponse() {
  return new Response(JSON.stringify({ data: [{ id: "kimi-k2.5" }] }), { status: 200, headers: { "content-type": "application/json" } });
}

function generate(adapter: MoonshotGenerationAdapter, model: "kimi-k2.5" | "moonshot-v1-8k") {
  return adapter.generateStructured({
    apiKey: "test-key-for-contract",
    model,
    systemPrompt: "Return JSON only.",
    userPrompt: "Return an object with connected set to true.",
    schema: z.object({ connected: z.literal(true) }).strict(),
    schemaName: "connection_test",
    maxOutputTokens: 32,
    temperature: 0,
    credentialSource: "USER_PROVIDED"
  });
}
