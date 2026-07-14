import type { ZodType } from "zod";
import type { GenerationModelCapabilities, GenerationProviderName } from "@/lib/providers/generation/capabilities";

export type GenerationConnectionTestResult = {
  connected: boolean;
  provider: GenerationProviderName;
  model: string;
  providerRequestId: string | null;
  durationMs: number;
};

export type StructuredGenerationResult<T> = {
  provider: GenerationProviderName;
  model: string;
  data: T;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
  };
  providerRequestId: string | null;
  durationMs: number;
};

export type StructuredGenerationInput<T> = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodType<T>;
  schemaName: string;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  credentialSource?: "PLATFORM" | "USER_PROVIDED";
};

export interface GenerationProviderAdapter {
  readonly provider: GenerationProviderName;
  getCapabilities(model: string): GenerationModelCapabilities;
  testConnection(input: { apiKey: string; model: string; signal?: AbortSignal }): Promise<GenerationConnectionTestResult>;
  generateStructured<T>(input: StructuredGenerationInput<T>): Promise<StructuredGenerationResult<T>>;
}

export type RawGenerationResponse = {
  output: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
  providerRequestId: string | null;
};
