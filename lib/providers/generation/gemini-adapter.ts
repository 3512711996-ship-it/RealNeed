import { z } from "zod";
import { ProviderExecutionError, providerResponseInvalid } from "@/lib/providers/shared-errors";
import type { GenerationProviderAdapter, StructuredGenerationInput, StructuredGenerationResult } from "@/lib/providers/generation/types";
import { getSupportedModel } from "@/lib/providers/generation/model-catalog";
import { normalizeMaxTokens, normalizeTemperature, parseStructuredOutput, repairPrompts, requestGenerationJson, schemaToJsonSchema } from "@/lib/providers/generation/utils";

const apiRoot = "https://generativelanguage.googleapis.com/v1beta/models";
const responseSchema = z.object({
  responseId: z.string().nullish(),
  candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().nullish() }).passthrough()) }) }).passthrough()).min(1),
  usageMetadata: z.object({ promptTokenCount: z.number().nullish(), candidatesTokenCount: z.number().nullish() }).nullish()
}).passthrough();

export class GeminiGenerationAdapter implements GenerationProviderAdapter {
  readonly provider = "GOOGLE_GEMINI" as const;
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}
  getCapabilities(model: string) { return getSupportedModel(this.provider, model)?.capabilities ?? unsupported(); }
  async testConnection(input: { apiKey: string; model: string; signal?: AbortSignal }) {
    const schema = z.object({ connected: z.literal(true) }).strict();
    const output = await this.generateStructured({ apiKey: input.apiKey, model: input.model, systemPrompt: "Return JSON only.", userPrompt: "Confirm the connection.", schema, schemaName: "connection_test", maxOutputTokens: 32, temperature: 0, signal: input.signal, credentialSource: "USER_PROVIDED" });
    return { connected: output.data.connected, provider: this.provider, model: input.model, providerRequestId: output.providerRequestId, durationMs: output.durationMs };
  }
  async generateStructured<T>(input: StructuredGenerationInput<T>): Promise<StructuredGenerationResult<T>> {
    assertSupported(this.provider, input.model);
    const startedAt = Date.now();
    const first = await this.call(input, input.systemPrompt, input.userPrompt);
    try { return makeResult(input.model, first, startedAt, parseStructuredOutput(this.provider, first.content, input.schema)); }
    catch (error) {
      if (!(error instanceof ProviderExecutionError) || error.code !== "PROVIDER_RESPONSE_INVALID") throw error;
      const repair = repairPrompts(first.content, input.schemaName);
      const second = await this.call(input, repair.systemPrompt, repair.userPrompt);
      return makeResult(input.model, second, startedAt, parseStructuredOutput(this.provider, second.content, input.schema));
    }
  }
  private async call<T>(input: StructuredGenerationInput<T>, systemPrompt: string, userPrompt: string) {
    const modelPath = encodeURIComponent(input.model);
    const raw = await requestGenerationJson({ provider: this.provider, url: `${apiRoot}/${modelPath}:generateContent`, credentialSource: input.credentialSource, fetchImpl: this.fetchImpl,
      init: { method: "POST", headers: { "x-goog-api-key": input.apiKey, "Content-Type": "application/json" }, signal: input.signal,
        body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: "user", parts: [{ text: userPrompt }] }], generationConfig: { temperature: normalizeTemperature(input.temperature), maxOutputTokens: normalizeMaxTokens(input.maxOutputTokens), responseMimeType: "application/json", responseJsonSchema: schemaToJsonSchema(input.schema) } }) } });
    const parsed = responseSchema.safeParse(raw.payload);
    if (!parsed.success) throw providerResponseInvalid(this.provider, "GENERATION");
    const content = parsed.data.candidates[0]?.content.parts.map((part) => part.text ?? "").join("").trim();
    if (!content) throw providerResponseInvalid(this.provider, "GENERATION");
    return { content, requestId: raw.requestId ?? parsed.data.responseId ?? null, inputTokens: parsed.data.usageMetadata?.promptTokenCount ?? null, outputTokens: parsed.data.usageMetadata?.candidatesTokenCount ?? null };
  }
}
type Raw = { content: string; requestId: string | null; inputTokens: number | null; outputTokens: number | null };
function makeResult<T>(model: string, raw: Raw, startedAt: number, data: T): StructuredGenerationResult<T> { return { provider: "GOOGLE_GEMINI", model, data, usage: { inputTokens: raw.inputTokens, outputTokens: raw.outputTokens }, providerRequestId: raw.requestId, durationMs: Date.now() - startedAt }; }
function unsupported() { return { structuredOutput: false, nativeJsonSchema: false, jsonMode: false, longContext: false, streaming: false, toolCalling: false, testedByRealNeed: false }; }
function assertSupported(provider: "GOOGLE_GEMINI", model: string) { if (!getSupportedModel(provider, model)) throw new ProviderExecutionError("USER_MODEL_UNSUPPORTED", provider, "GENERATION", "RealNeed 尚未验证这个模型的结构化输出能力。", false, true, 422); }
