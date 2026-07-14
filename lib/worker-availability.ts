import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

/** Inline execution is only a local development capability. Production requires a fresh Worker heartbeat. */
export async function isWorkerAvailable() {
  const env = getServerEnv();
  if (env.jobExecutionMode === "inline" && process.env.NODE_ENV !== "production") return true;
  const latest = await prisma.workerNode.findFirst({ orderBy: { heartbeatAt: "desc" }, select: { heartbeatAt: true } });
  const freshnessMs = Math.max(60_000, env.jobLockTimeoutSeconds * 2_000);
  return Boolean(latest && Date.now() - latest.heartbeatAt.getTime() <= freshnessMs);
}
