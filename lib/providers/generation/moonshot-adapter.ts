import { z } from "zod";
import { ProviderExecutionError, providerResponseInvalid } from "@/lib/providers/shared-errors";
import type { GenerationProviderAdapter, StructuredGenerationInput, StructuredGenerationResult } from "@/lib/providers/generation/types";
import { getSupportedModel } from "@/lib/providers/generation/model-catalog";
import { normalizeMaxTokens, normalizeTemperature, parseStructuredOutput, repairPrompts, requestGenerationJson } from "@/lib/providers/generation/utils";

const officialEndpoints = new Set(["https://api.moonshot.ai/v1/chat/completions", "https://api.moonshot.cn/v1/chat/completions"]);
const responseSchema = z.object({
  id: z.string().nullish(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullish() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number().nullish(), completion_tokens: z.number().nullish() }).nullish()
}).passthrough();
const modelListSchema = z.object({
  data: z.array(z.object({ id: z.string() })).min(1)
}).passthrough();

export class MoonshotGenerationAdapter implements GenerationProviderAdapter {
  readonly provider = "MOONSHOT" as const;
  private readonly endpoint: string;

  constructor(private readonly fetchImpl: typeof fetch = fetch, endpoint = "https://api.moonshot.cn/v1/chat/completions") {
    if (!officialEndpoints.has(endpoint)) throw new Error("Moonshot endpoint is not in the server allowlist.");
    this.endpoint = endpoint;
  }

  getCapabilities(model: string) {
    return getSupportedModel(this.provider, model)?.capabilities ?? { structuredOutput: false, nativeJsonSchema: false, jsonMode: false, longContext: false, streaming: false, toolCalling: false, testedByRealNeed: false };
  }

  async testConnection(input: { apiKey: string; model: string; signal?: AbortSignal }) {
    const startedAt = Date.now();
    const raw = await requestGenerationJson({
      provider: this.provider,
      url: this.endpoint.replace("/chat/completions", "/models"),
      credentialSource: "USER_PROVIDED",
      fetchImpl: this.fetchImpl,
      init: { method: "GET", headers: { Authorization: `Bearer ${input.apiKey}` }, signal: input.signal }
    });
    const parsed = modelListSchema.safeParse(raw.payload);
    if (!parsed.success) throw providerResponseInvalid(this.provider, "GENERATION");
    if (!parsed.data.data.some((model) => model.id === input.model)) {
      throw new ProviderExecutionError("USER_MODEL_NOT_ALLOWED", this.provider, "GENERATION", "当前 API Key 无权使用所选模型，请在 Kimi 开放平台确认项目与模型权限。", false, true, 403);
    }
    return { connected: true, provider: this.provider, model: input.model, providerRequestId: raw.requestId, durationMs: Date.now() - startedAt };
  }

  async generateStructured<T>(input: StructuredGenerationInput<T>): Promise<StructuredGenerationResult<T>> {
    assertModel(this.provider, input.model);
    const startedAt = Date.now();
    const first = await this.call(input, input.systemPrompt, input.userPrompt);
    try {
      return this.result(input, first, startedAt, parseStructuredOutput(this.provider, first.content, input.schema));
    } catch (error) {
      if (!(error instanceof ProviderExecutionError) || error.code !== "PROVIDER_RESPONSE_INVALID") throw error;
      const repair = repairPrompts(first.content, input.schemaName);
      const second = await this.call(input, repair.systemPrompt, repair.userPrompt);
      return this.result(input, second, startedAt, parseStructuredOutput(this.provider, second.content, input.schema));
    }
  }

  private async call<T>(input: StructuredGenerationInput<T>, systemPrompt: string, userPrompt: string) {
    const requiresDefaultSampling = input.model === "kimi-k2.5" || input.model === "kimi-k2.6";
    const raw = await requestGenerationJson({
      provider: this.provider, url: this.endpoint, credentialSource: input.credentialSource, fetchImpl: this.fetchImpl,
      init: { method: "POST", headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" }, signal: input.signal,
        body: JSON.stringify({
          model: input.model,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
          max_completion_tokens: normalizeMaxTokens(input.maxOutputTokens),
          response_format: { type: "json_object" },
          ...(requiresDefaultSampling ? {} : { temperature: normalizeTemperature(input.temperature) })
        }) }
    });
    const parsed = responseSchema.safeParse(raw.payload);
    if (!parsed.success) throw providerResponseInvalid(this.provider, "GENERATION");
    const content = parsed.data.choices[0]?.message.content;
    if (!content) throw providerResponseInvalid(this.provider, "GENERATION");
    return { content, requestId: raw.requestId ?? parsed.data.id ?? null, inputTokens: parsed.data.usage?.prompt_tokens ?? null, outputTokens: parsed.data.usage?.completion_tokens ?? null };
  }

  private result<T>(input: StructuredGenerationInput<T>, raw: Awaited<ReturnType<MoonshotGenerationAdapter["call"]>>, startedAt: number, data: T): StructuredGenerationResult<T> {
    return { provider: this.provider, model: input.model, data, usage: { inputTokens: raw.inputTokens, outputTokens: raw.outputTokens }, providerRequestId: raw.requestId, durationMs: Date.now() - startedAt };
  }
}

function assertModel(provider: "MOONSHOT", model: string) {
  if (!getSupportedModel(provider, model)) throw new ProviderExecutionError("USER_MODEL_UNSUPPORTED", provider, "GENERATION", "RealNeed 尚未验证这个模型的结构化输出能力。", false, true, 422);
}
