import { describe, expect, it } from "vitest";
import { DeepSeekGenerationAdapter } from "../lib/providers/generation/deepseek-adapter";

describe("DeepSeekGenerationAdapter", () => {
  it("uses DeepSeek Chat Completions JSON mode for a real credential check", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const adapter = new DeepSeekGenerationAdapter(async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: "deepseek-request-test", choices: [{ message: { content: '{"connected":true}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
    });

    await adapter.testConnection({ apiKey: "test-key-for-contract", model: "deepseek-v4-flash" });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.deepseek.com/chat/completions");
    expect(calls[0]?.init?.headers).toMatchObject({ Authorization: "Bearer test-key-for-contract", "Content-Type": "application/json" });
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({ model: "deepseek-v4-flash", response_format: { type: "json_object" }, thinking: { type: "disabled" }, max_tokens: 64 });
  });
});
