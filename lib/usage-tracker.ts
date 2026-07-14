import type { Prisma } from "@prisma/client";
import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export type ApiUsageContext = {
  judgmentId?: string;
  deepDiveId?: string;
  jobId?: string;
  operation: string;
};

export type ApiUsageInput = ApiUsageContext & {
  provider: string;
  providerType?: "SEARCH" | "GENERATION";
  credentialSource?: "PLATFORM" | "USER_PROVIDED";
  credentialId?: string | null;
  model?: string;
  inputText?: string;
  outputText?: string;
  inputTokens?: number;
  outputTokens?: number;
  requestCount?: number;
  creditsUsed?: number;
  durationMs?: number;
  success?: boolean;
  errorCode?: string;
  estimated?: boolean;
};

export async function recordApiUsage(input: ApiUsageInput) {
  const inputTokens = input.inputTokens ?? estimateTokens(input.inputText ?? "");
  const outputTokens = input.outputTokens ?? estimateTokens(input.outputText ?? "");
  const rawEstimatedCostCny = isBillableUsage(input.success ?? true, input.errorCode)
    ? estimateKimiCostCny(input.provider, inputTokens, outputTokens)
    : 0;
  const estimatedPlatformCostCny = input.credentialSource === "USER_PROVIDED" ? 0 : rawEstimatedCostCny;

  try {
    await prisma.apiUsageRecord.create({
      data: {
        judgmentId: input.judgmentId,
        deepDiveId: input.deepDiveId,
        jobId: input.jobId,
        provider: input.provider,
        providerType: input.providerType ?? "GENERATION",
        credentialSource: input.credentialSource ?? "PLATFORM",
        credentialId: input.credentialId ?? undefined,
        operation: input.operation,
        model: input.model,
        inputTokens,
        outputTokens,
        requestCount: input.requestCount ?? 1,
        creditsUsed: input.creditsUsed as unknown as Prisma.Decimal,
        estimatedCostCny: estimatedPlatformCostCny as unknown as Prisma.Decimal,
        estimatedPlatformCostCny: estimatedPlatformCostCny as unknown as Prisma.Decimal,
        durationMs: input.durationMs,
        success: input.success ?? true,
        errorCode: input.errorCode,
        estimated: input.estimated ?? true
      }
    });
  } catch {
    // Cost tracking must never hide the primary technical outcome from the user.
  }
}

export function estimateTokens(text: string) {
  if (!text) return 0;
  const chineseChars = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const latinWords = text.match(/[A-Za-z0-9_]+/g)?.length ?? 0;
  const otherChars = Math.max(0, text.length - chineseChars);
  return Math.ceil(chineseChars * 0.9 + latinWords * 1.25 + otherChars / 4);
}

export function estimateKimiCostCny(provider: string, inputTokens: number, outputTokens: number) {
  if (!provider.toLowerCase().includes("kimi") && !provider.toLowerCase().includes("moonshot")) return 0;
  const env = getServerEnv();
  return (inputTokens / 1_000_000) * env.kimiInputPricePerMillion + (outputTokens / 1_000_000) * env.kimiOutputPricePerMillion;
}

export function isBillableUsage(success: boolean, errorCode?: string | null) {
  if (success) return true;
  return !["HTTP_400", "NETWORK_ERROR"].includes(errorCode ?? "");
}
