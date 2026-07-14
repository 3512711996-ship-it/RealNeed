import { AsyncLocalStorage } from "node:async_hooks";
import type { ApiCredentialKind, Job } from "@prisma/client";
import { decryptCredentialForCall, markCredentialUsed } from "@/lib/credential-vault";
import { getServerEnv } from "@/lib/env";
import { parseGenerationExecutionConfig, parseSearchExecutionConfig, type GenerationExecutionConfig, type SearchExecutionConfig } from "@/lib/providers/execution-config";
import { ProviderExecutionError } from "@/lib/providers/shared-errors";
import { prisma } from "@/lib/prisma";

export type ProviderExecutionContext = {
  jobId: string;
  ownerSessionHash: string | null;
  search: SearchExecutionConfig;
  generation: GenerationExecutionConfig;
};

const storage = new AsyncLocalStorage<ProviderExecutionContext>();

export function runWithProviderExecutionContext<T>(job: Job, task: () => Promise<T>) {
  return storage.run({
    jobId: job.id,
    ownerSessionHash: job.ownerSessionHash,
    search: parseSearchExecutionConfig(job.searchExecutionConfig),
    generation: parseGenerationExecutionConfig(job.generationExecutionConfig)
  }, task);
}

export function getProviderExecutionContext() {
  return storage.getStore();
}

export async function resolveSearchCredential() {
  const context = storage.getStore();
  const config = context?.search ?? parseSearchExecutionConfig(null);
  if (config.credentialSource === "PLATFORM") {
    const apiKey = getServerEnv().tavilyApiKey;
    if (config.provider !== "TAVILY" || !apiKey) {
      throw new ProviderExecutionError("PLATFORM_API_UNAVAILABLE", config.provider, "SEARCH", "RealNeed 平台搜索 API 暂时不可用。", false, false, 424);
    }
    return { apiKey, config, credentialId: null };
  }
  if (!context?.ownerSessionHash || !config.credentialId) throw missingBinding(config.provider, "SEARCH");
  await assertBinding(context.jobId, config.credentialId, "SEARCH", config.provider, config.configurationVersion);
  const decrypted = await decryptCredentialForCall({ credentialId: config.credentialId, ownerSessionHash: context.ownerSessionHash, kind: "SEARCH", provider: config.provider });
  return { apiKey: decrypted.apiKey, config, credentialId: decrypted.credentialId };
}

export async function resolveGenerationCredential() {
  const context = storage.getStore();
  const env = getServerEnv();
  const config = context?.generation ?? { credentialSource: "PLATFORM" as const, provider: "MOONSHOT" as const, model: env.moonshotModel, credentialId: null, configurationVersion: 1 };
  if (config.credentialSource === "PLATFORM") {
    if (config.provider !== "MOONSHOT" || !env.moonshotApiKey) {
      throw new ProviderExecutionError("PLATFORM_API_UNAVAILABLE", config.provider, "GENERATION", "RealNeed 平台生成模型暂时不可用。", false, false, 424);
    }
    return { apiKey: env.moonshotApiKey, config: { ...config, model: env.moonshotModel }, credentialId: null };
  }
  if (!context?.ownerSessionHash || !config.credentialId) throw missingBinding(config.provider, "GENERATION");
  await assertBinding(context.jobId, config.credentialId, "GENERATION", config.provider, config.configurationVersion);
  const decrypted = await decryptCredentialForCall({ credentialId: config.credentialId, ownerSessionHash: context.ownerSessionHash, kind: "GENERATION", provider: config.provider });
  return { apiKey: decrypted.apiKey, config, credentialId: decrypted.credentialId };
}

export async function releaseCredentialAfterCall(credentialId: string | null) {
  if (credentialId) await markCredentialUsed(credentialId);
}

async function assertBinding(jobId: string, credentialId: string, purpose: "SEARCH" | "GENERATION", provider: string, configurationVersion: number) {
  const binding = await prisma.jobCredentialBinding.findUnique({ where: { jobId_purpose: { jobId, purpose } } });
  if (!binding || binding.credentialId !== credentialId || binding.providerSnapshot !== provider || binding.configurationVersion !== configurationVersion) {
    throw missingBinding(provider, purpose);
  }
}

function missingBinding(provider: string, kind: ApiCredentialKind) {
  return new ProviderExecutionError("USER_CREDENTIAL_REVOKED", provider, kind, "任务没有可用的 API 连接绑定，请重新选择连接后继续。", false, true, 409);
}
