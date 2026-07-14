import { z } from "zod";
import { ProviderExecutionError, providerResponseInvalid } from "@/lib/providers/shared-errors";
import type { GenerationProviderAdapter, StructuredGenerationInput, StructuredGenerationResult } from "@/lib/providers/generation/types";
import { getSupportedModel } from "@/lib/providers/generation/model-catalog";
import { normalizeMaxTokens, normalizeTemperature, parseStructuredOutput, repairPrompts, requestGenerationJson, safeSchemaName, schemaToJsonSchema } from "@/lib/providers/generation/utils";

const endpoint = "https://api.anthropic.com/v1/messages";
const responseSchema = z.object({ id: z.string().nullish(), content: z.array(z.union([z.object({ type: z.literal("tool_use"), input: z.unknown() }).passthrough(), z.object({ type: z.literal("text"), text: z.string() }).passthrough()])), usage: z.object({ input_tokens: z.number().nullish(), output_tokens: z.number().nullish() }).nullish() }).passthrough();

export class AnthropicGenerationAdapter implements GenerationProviderAdapter {
  readonly provider = "ANTHROPIC" as const;
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}
  getCapabilities(model: string) { return getSupportedModel(this.provider, model)?.capabilities ?? unsupported(); }
  async testConnection(input: { apiKey: string; model: string; signal?: AbortSignal }) {
    const schema = z.object({ connected: z.literal(true) }).strict();
    const result = await this.generateStructured({ apiKey: input.apiKey, model: input.model, systemPrompt: "Use the required tool.", userPrompt: "Confirm the connection.", schema, schemaName: "connection_test", maxOutputTokens: 64, temperature: 0, signal: input.signal, credentialSource: "USER_PROVIDED" });
    return { connected: result.data.connected, provider: this.provider, model: input.model, providerRequestId: result.providerRequestId, durationMs: result.durationMs };
  }
  async generateStructured<T>(input: StructuredGenerationInput<T>): Promise<StructuredGenerationResult<T>> {
    assertSupported(this.provider, input.model);
    const startedAt = Date.now();
    const first = await this.call(input, input.systemPrompt, input.userPrompt);
    try { return result(input.model, first, startedAt, parseStructuredOutput(this.provider, first.output, input.schema)); }
    catch (error) {
      if (!(error instanceof ProviderExecutionError) || error.code !== "PROVIDER_RESPONSE_INVALID") throw error;
      const repair = repairPrompts(first.output, input.schemaName);
      const second = await this.call(input, repair.systemPrompt, repair.userPrompt);
      return result(input.model, second, startedAt, parseStructuredOutput(this.provider, second.output, input.schema));
    }
  }
  private async call<T>(input: StructuredGenerationInput<T>, systemPrompt: string, userPrompt: string) {
    const toolName = safeSchemaName(input.schemaName);
    const raw = await requestGenerationJson({ provider: this.provider, url: endpoint, credentialSource: input.credentialSource, fetchImpl: this.fetchImpl,
      init: { method: "POST", headers: { "x-api-key": input.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, signal: input.signal,
        body: JSON.stringify({ model: input.model, system: systemPrompt, messages: [{ role: "user", content: userPrompt }], max_tokens: normalizeMaxTokens(input.maxOutputTokens), temperature: normalizeTemperature(input.temperature), tools: [{ name: toolName, description: "Return the validated RealNeed structured result.", input_schema: schemaToJsonSchema(input.schema) }], tool_choice: { type: "tool", name: toolName } }) } });
    const parsed = responseSchema.safeParse(raw.payload);
    if (!parsed.success) throw providerResponseInvalid(this.provider, "GENERATION");
    const toolUse = parsed.data.content.find((item) => item.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") throw providerResponseInvalid(this.provider, "GENERATION");
    return { output: toolUse.input, requestId: raw.requestId ?? parsed.data.id ?? null, inputTokens: parsed.data.usage?.input_tokens ?? null, outputTokens: parsed.data.usage?.output_tokens ?? null };
  }
}
type Raw = { output: unknown; requestId: string | null; inputTokens: number | null; outputTokens: number | null };
function result<T>(model: string, raw: Raw, startedAt: number, data: T): StructuredGenerationResult<T> { return { provider: "ANTHROPIC", model, data, usage: { inputTokens: raw.inputTokens, outputTokens: raw.outputTokens }, providerRequestId: raw.requestId, durationMs: Date.now() - startedAt }; }
function unsupported() { return { structuredOutput: false, nativeJsonSchema: false, jsonMode: false, longContext: false, streaming: false, toolCalling: false, testedByRealNeed: false }; }
function assertSupported(provider: "ANTHROPIC", model: string) { if (!getSupportedModel(provider, model)) throw new ProviderExecutionError("USER_MODEL_UNSUPPORTED", provider, "GENERATION", "RealNeed 尚未验证这个模型的结构化输出能力。", false, true, 422); }
