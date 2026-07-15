import { z } from "zod";
import { ProviderExecutionError, providerResponseInvalid } from "@/lib/providers/shared-errors";
import type { GenerationProviderAdapter, StructuredGenerationInput, StructuredGenerationResult } from "@/lib/providers/generation/types";
import { getSupportedModel } from "@/lib/providers/generation/model-catalog";
import { normalizeMaxTokens, normalizeTemperature, parseStructuredOutput, requestGenerationJson } from "@/lib/providers/generation/utils";

const officialEndpoints = new Set(["https://api.moonshot.ai/v1/chat/completions", "https://api.moonshot.cn/v1/chat/completions"]);
const responseSchema = z.object({
  id: z.string().nullish(),
  choices: z.array(z.object({
    finish_reason: z.string().nullish(),
    message: z.object({
      content: z.union([
        z.string(),
        z.array(z.object({ type: z.string().optional(), text: z.string().optional() }).passthrough())
      ]).nullish()
    }).passthrough()
  })).min(1),
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
    // A model-list response only proves authentication. Probe JSON mode too, so a
    // connection cannot be saved when its selected model cannot complete a RealNeed task.
    const probe = await this.generateStructured({
      apiKey: input.apiKey,
      model: input.model,
      systemPrompt: "Return one JSON object only.",
      userPrompt: "Return exactly {\"connected\":true}.",
      schema: z.object({ connected: z.literal(true) }).strict(),
      schemaName: "connection_test",
      maxOutputTokens: 64,
      temperature: 0,
      signal: input.signal,
      credentialSource: "USER_PROVIDED"
    });
    return { connected: true, provider: this.provider, model: input.model, providerRequestId: probe.providerRequestId ?? raw.requestId, durationMs: Date.now() - startedAt };
  }

  async generateStructured<T>(input: StructuredGenerationInput<T>): Promise<StructuredGenerationResult<T>> {
    assertModel(this.provider, input.model);
    const startedAt = Date.now();
    const first = await this.call(input, input.systemPrompt, input.userPrompt);
    if (first.finishReason === "length") {
      throw new ProviderExecutionError(
        "PROVIDER_RESPONSE_INVALID",
        this.provider,
        "GENERATION",
        "Kimi 输出因达到长度限制而被截断，本次任务已停止，没有使用模板或本地规则补全。",
        false,
        true,
        422
      );
    }

    // JSON mode is a hard contract. Do not ask a second model call to rewrite an
    // invalid answer: that could alter evidence-bearing claims without a source.
    return this.result(input, first, startedAt, parseStructuredOutput(this.provider, first.content, input.schema));
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
          // K2.5/K2.6 enable thinking by default. Structured RealNeed tasks need
          // the final JSON, not a reasoning trace that can consume the output cap.
          ...(requiresDefaultSampling ? { thinking: { type: "disabled" } } : { temperature: normalizeTemperature(input.temperature) })
        }) }
    });
    const parsed = responseSchema.safeParse(raw.payload);
    if (!parsed.success) throw providerResponseInvalid(this.provider, "GENERATION");
    const choice = parsed.data.choices[0];
    const content = normalizeContent(choice?.message.content);
    if (!content) throw providerResponseInvalid(this.provider, "GENERATION");
    return { content, finishReason: choice?.finish_reason ?? null, requestId: raw.requestId ?? parsed.data.id ?? null, inputTokens: parsed.data.usage?.prompt_tokens ?? null, outputTokens: parsed.data.usage?.completion_tokens ?? null };
  }

  private result<T>(input: StructuredGenerationInput<T>, raw: Awaited<ReturnType<MoonshotGenerationAdapter["call"]>>, startedAt: number, data: T): StructuredGenerationResult<T> {
    return { provider: this.provider, model: input.model, data, usage: { inputTokens: raw.inputTokens, outputTokens: raw.outputTokens }, providerRequestId: raw.requestId, durationMs: Date.now() - startedAt };
  }
}

function normalizeContent(content: z.infer<typeof responseSchema>["choices"][number]["message"]["content"]) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;

  const text = content
    .map((part) => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  return text || null;
}

function assertModel(provider: "MOONSHOT", model: string) {
  if (!getSupportedModel(provider, model)) throw new ProviderExecutionError("USER_MODEL_UNSUPPORTED", provider, "GENERATION", "RealNeed 尚未验证这个模型的结构化输出能力。", false, true, 422);
}
