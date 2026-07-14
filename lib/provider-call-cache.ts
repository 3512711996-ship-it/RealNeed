import { createHash } from "node:crypto";
import type { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProviderExecutionContext } from "@/lib/provider-execution-context";

export function buildProviderCallKey(operation: string, payload: unknown) {
  return `${operation}:${createHash("sha256").update(stableStringify(payload)).digest("hex")}`;
}

export async function withProviderCallCache<T>(input: { callKey: string; provider: string; providerType: ProviderType; execute: () => Promise<T> }): Promise<T> {
  const context = getProviderExecutionContext();
  if (!context) return input.execute();
  const existing = await prisma.jobProviderCall.findUnique({ where: { jobId_callKey: { jobId: context.jobId, callKey: input.callKey } }, select: { resultJson: true } });
  if (existing) return existing.resultJson as T;
  const result = await input.execute();
  await prisma.jobProviderCall.upsert({
    where: { jobId_callKey: { jobId: context.jobId, callKey: input.callKey } },
    create: { jobId: context.jobId, callKey: input.callKey, provider: input.provider, providerType: input.providerType, resultJson: result as object },
    update: {}
  });
  return result;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
