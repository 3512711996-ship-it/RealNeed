import { getServerEnv, assertNoPublicApiKeys } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { checkRateLimitHealth } from "@/lib/rate-limit";

export type ProductionRole = "web" | "worker" | "scheduler" | "migration";

export function collectProductionConfigurationErrors(
  role: ProductionRole,
  env: NodeJS.ProcessEnv = process.env
) {
  const errors: string[] = [];
  const required = [
    "DATABASE_URL",
    "API_CREDENTIAL_ENCRYPTION_KEY",
    "REDIS_URL",
    "PUBLIC_APP_URL",
    "REPORT_RETENTION_DAYS",
    "SOURCE_CONTENT_RETENTION_DAYS",
    "ANALYTICS_RETENTION_DAYS"
  ];
  if (role === "migration") required.splice(1);
  for (const name of required) {
    if (!env[name]?.trim()) errors.push(`MISSING_${name}`);
  }
  if (role !== "migration") {
    if (env.RATE_LIMIT_PROVIDER !== "redis") errors.push("RATE_LIMIT_PROVIDER_MUST_BE_REDIS");
    if (env.JOB_EXECUTION_MODE !== "worker") errors.push("JOB_EXECUTION_MODE_MUST_BE_WORKER");
    validateUrlProtocol(env.PUBLIC_APP_URL, ["https:"], "PUBLIC_APP_URL_MUST_USE_HTTPS", errors);
    validateUrlProtocol(env.REDIS_URL, ["redis:", "rediss:"], "REDIS_URL_INVALID", errors);
  }
  validateUrlProtocol(env.DATABASE_URL, ["postgres:", "postgresql:"], "DATABASE_URL_INVALID", errors);
  if (role === "worker" && !env.WORKER_ID?.trim()) errors.push("MISSING_WORKER_ID");
  return Array.from(new Set(errors));
}

export function assertProductionConfiguration(role: ProductionRole) {
  if (process.env.NODE_ENV !== "production") return;
  assertNoPublicApiKeys();
  const errors = collectProductionConfigurationErrors(role);
  if (errors.length) {
    throw Object.assign(new Error(`生产配置校验失败：${errors.join(", ")}`), {
      code: "PRODUCTION_CONFIG_INVALID"
    });
  }
}

export async function verifyProductionDependencies(options: { requireWorkerHeartbeat?: boolean } = {}) {
  await prisma.$queryRaw`SELECT 1`;
  await checkRateLimitHealth();
  if (options.requireWorkerHeartbeat) {
    const env = getServerEnv();
    const worker = await prisma.workerNode.findFirst({ orderBy: { heartbeatAt: "desc" } });
    const freshnessMs = Math.max(60_000, env.jobLockTimeoutSeconds * 2000);
    if (!worker || Date.now() - worker.heartbeatAt.getTime() > freshnessMs) {
      throw Object.assign(new Error("生产 Worker 心跳不新鲜。"), { code: "WORKER_HEARTBEAT_STALE" });
    }
  }
}

function validateUrlProtocol(value: string | undefined, protocols: string[], errorCode: string, errors: string[]) {
  if (!value?.trim()) return;
  try {
    if (!protocols.includes(new URL(value).protocol)) errors.push(errorCode);
  } catch {
    errors.push(errorCode);
  }
}
