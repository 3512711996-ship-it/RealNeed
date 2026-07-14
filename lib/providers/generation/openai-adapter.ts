import { z } from "zod";
import { ProviderExecutionError, providerResponseInvalid } from "@/lib/providers/shared-errors";
import type { GenerationProviderAdapter, StructuredGenerationInput, StructuredGenerationResult } from "@/lib/providers/generation/types";
import { getSupportedModel } from "@/lib/providers/generation/model-catalog";
import { normalizeMaxTokens, normalizeTemperature, parseStructuredOutput, repairPrompts, requestGenerationJson, safeSchemaName, schemaToJsonSchema } from "@/lib/providers/generation/utils";

const endpoint = "https://api.openai.com/v1/chat/completions";
const responseSchema = z.object({ id: z.string().nullish(), choices: z.array(z.object({ message: z.object({ content: z.string().nullish() }) })).min(1), usage: z.object({ prompt_tokens: z.number().nullish(), completion_tokens: z.number().nullish() }).nullish() }).passthrough();

export class OpenAIGenerationAdapter implements GenerationProviderAdapter {
  readonly provider = "OPENAI" as const;
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}
  getCapabilities(model: string) { return getSupportedModel(this.provider, model)?.capabilities ?? unsupported(); }
  async testConnection(input: { apiKey: string; model: string; signal?: AbortSignal }) {
    const schema = z.object({ connected: z.literal(true) }).strict();
    const result = await this.generateStructured({ apiKey: input.apiKey, model: input.model, systemPrompt: "Return JSON only.", userPrompt: "Confirm the connection.", schema, schemaName: "connection_test", maxOutputTokens: 32, temperature: 0, signal: input.signal, credentialSource: "USER_PROVIDED" });
    return { connected: result.data.connected, provider: this.provider, model: input.model, providerRequestId: result.providerRequestId, durationMs: result.durationMs };
  }
  async generateStructured<T>(input: StructuredGenerationInput<T>): Promise<StructuredGenerationResult<T>> {
    assertSupported(this.provider, input.model);
    const startedAt = Date.now();
    const first = await this.call(input, input.systemPrompt, input.userPrompt);
    try { return makeResult(this.provider, input.model, first, startedAt, parseStructuredOutput(this.provider, first.content, input.schema)); }
    catch (error) {
      if (!(error instanceof ProviderExecutionError) || error.code !== "PROVIDER_RESPONSE_INVALID") throw error;
      const repair = repairPrompts(first.content, input.schemaName);
      const second = await this.call(input, repair.systemPrompt, repair.userPrompt);
      return makeResult(this.provider, input.model, second, startedAt, parseStructuredOutput(this.provider, second.content, input.schema));
    }
  }
  private async call<T>(input: StructuredGenerationInput<T>, systemPrompt: string, userPrompt: string) {
    const raw = await requestGenerationJson({ provider: this.provider, url: endpoint, credentialSource: input.credentialSource, fetchImpl: this.fetchImpl,
      init: { method: "POST", headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" }, signal: input.signal,
        body: JSON.stringify({ model: input.model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: normalizeTemperature(input.temperature), max_tokens: normalizeMaxTokens(input.maxOutputTokens), response_format: { type: "json_schema", json_schema: { name: safeSchemaName(input.schemaName), strict: true, schema: schemaToJsonSchema(input.schema) } } }) } });
    const parsed = responseSchema.safeParse(raw.payload);
    if (!parsed.success || !parsed.data.choices[0]?.message.content) throw providerResponseInvalid(this.provider, "GENERATION");
    return { content: parsed.data.choices[0].message.content, requestId: raw.requestId ?? parsed.data.id ?? null, inputTokens: parsed.data.usage?.prompt_tokens ?? null, outputTokens: parsed.data.usage?.completion_tokens ?? null };
  }
}

type Raw = { content: string; requestId: string | null; inputTokens: number | null; outputTokens: number | null };
function makeResult<T>(provider: "OPENAI", model: string, raw: Raw, startedAt: number, data: T): StructuredGenerationResult<T> { return { provider, model, data, usage: { inputTokens: raw.inputTokens, outputTokens: raw.outputTokens }, providerRequestId: raw.requestId, durationMs: Date.now() - startedAt }; }
function unsupported() { return { structuredOutput: false, nativeJsonSchema: false, jsonMode: false, longContext: false, streaming: false, toolCalling: false, testedByRealNeed: false }; }
function assertSupported(provider: "OPENAI", model: string) { if (!getSupportedModel(provider, model)) throw new ProviderExecutionError("USER_MODEL_UNSUPPORTED", provider, "GENERATION", "RealNeed 尚未验证这个模型的结构化输出能力。", false, true, 422); }
