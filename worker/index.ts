import { getServerEnv } from "@/lib/env";
import { heartbeatWorker, processNextJob, recoverStaleJobs } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";
import { assertProductionConfiguration, verifyProductionDependencies } from "@/lib/production-config";
import { logServerError } from "@/lib/safe-logger";
import { sendOperationalAlert } from "@/lib/alerts";

async function main() {
  assertProductionConfiguration("worker");
  await verifyProductionDependencies();
  const env = getServerEnv();
  if (env.jobExecutionMode !== "worker") {
    throw new Error("独立 Worker 要求 JOB_EXECUTION_MODE=worker。inline 仅限本地 Web 开发和测试。");
  }
  console.log(`[RealNeed Worker] started as ${env.workerId}`);
  await heartbeatWorker(env.workerId, null);
  await recoverStaleJobs();

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (true) {
    await heartbeatWorker(env.workerId, null);
    const processed = await processNextJob();
    if (!processed) {
      await sleep(env.jobPollIntervalMs);
    }
  }
}

async function shutdown() {
  console.log("[RealNeed Worker] shutting down");
  await prisma.$disconnect();
  process.exit(0);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(async (error) => {
  logServerError("worker_fatal", error);
  await sendOperationalAlert({
    event: "worker_fatal",
    errorCode: typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "WORKER_FATAL") : "WORKER_FATAL",
    severity: "critical"
  });
  await prisma.$disconnect();
  process.exit(1);
});
