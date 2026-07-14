import type { ZodType } from "zod";
import { markCredentialInvalid } from "@/lib/credential-vault";
import { getServerEnv } from "@/lib/env";
import { getJobAbortSignal } from "@/lib/job-abort-context";
import { buildProviderCallKey, withProviderCallCache } from "@/lib/provider-call-cache";
import { releaseCredentialAfterCall, resolveGenerationCredential } from "@/lib/provider-execution-context";
import { getGenerationProviderAdapter } from "@/lib/providers/generation/registry";
import type { StructuredGenerationResult } from "@/lib/providers/generation/types";
import { ProviderExecutionError } from "@/lib/providers/shared-errors";
import { recordApiUsage, type ApiUsageContext } from "@/lib/usage-tracker";

export class KimiApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KimiApiError";
  }
}

// Compatibility name for existing product modules. Execution is provider-neutral.
export async function callKimiJson<T>({
  schema,
  system,
  user,
  temperature = 0.2,
  usage
}: {
  schema: ZodType<T>;
  system: string;
  user: string;
  temperature?: number;
  usage?: ApiUsageContext;
}): Promise<T> {
  const resolved = await resolveGenerationCredential();
  const endpoint = resolved.config.provider === "MOONSHOT" && resolved.config.credentialSource === "PLATFORM"
    ? `${getServerEnv().moonshotBaseUrl.replace(/\/$/, "")}/chat/completions`
    : undefined;
  const adapter = getGenerationProviderAdapter(resolved.config.provider, { moonshotEndpoint: endpoint });
  const operation = usage?.operation ?? "structured_generation";
  const callKey = buildProviderCallKey(operation, {
    provider: resolved.config.provider,
    model: resolved.config.model,
    system,
    user,
    temperature
  });

  try {
    const result = await withProviderCallCache<StructuredGenerationResult<T>>({
      callKey,
      provider: resolved.config.provider,
      providerType: "GENERATION",
      execute: async () => executeGeneration({ adapter, resolved, schema, system, user, temperature, usage, operation })
    });
    return result.data;
  } catch (error) {
    if (
      resolved.credentialId &&
      error instanceof ProviderExecutionError &&
      ["USER_API_KEY_INVALID", "USER_MODEL_NOT_ALLOWED", "USER_MODEL_NOT_FOUND"].includes(error.code)
    ) {
      await markCredentialInvalid(resolved.credentialId);
    }
    throw error;
  } finally {
    await releaseCredentialAfterCall(resolved.credentialId);
  }
}

async function executeGeneration<T>({
  adapter,
  resolved,
  schema,
  system,
  user,
  temperature,
  usage,
  operation
}: {
  adapter: ReturnType<typeof getGenerationProviderAdapter>;
  resolved: Awaited<ReturnType<typeof resolveGenerationCredential>>;
  schema: ZodType<T>;
  system: string;
  user: string;
  temperature: number;
  usage?: ApiUsageContext;
  operation: string;
}) {
  const startedAt = Date.now();
  try {
    const generated = await adapter.generateStructured({
      apiKey: resolved.apiKey,
      model: resolved.config.model,
      systemPrompt: system,
      userPrompt: user,
      schema,
      schemaName: operation,
      maxOutputTokens: 3000,
      temperature,
      signal: getJobAbortSignal(),
      credentialSource: resolved.config.credentialSource
    });
    if (usage) {
      await recordApiUsage({
        ...usage,
        provider: generated.provider,
        providerType: "GENERATION",
        credentialSource: resolved.config.credentialSource,
        credentialId: resolved.credentialId,
        model: generated.model,
        inputText: `${system}\n${user}`,
        inputTokens: generated.usage.inputTokens ?? undefined,
        outputTokens: generated.usage.outputTokens ?? undefined,
        durationMs: generated.durationMs,
        success: true,
        estimated: generated.usage.inputTokens == null || generated.usage.outputTokens == null
      });
    }
    return generated;
  } catch (error) {
    if (usage) {
      await recordApiUsage({
        ...usage,
        provider: resolved.config.provider,
        providerType: "GENERATION",
        credentialSource: resolved.config.credentialSource,
        credentialId: resolved.credentialId,
        model: resolved.config.model,
        inputText: `${system}\n${user}`,
        durationMs: Date.now() - startedAt,
        success: false,
        errorCode: getErrorCode(error),
        estimated: true
      });
    }
    throw error;
  }
}

function getErrorCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    return String((error as { code?: unknown }).code ?? "GENERATION_FAILED");
  }
  return error instanceof Error ? error.name : "GENERATION_FAILED";
}
