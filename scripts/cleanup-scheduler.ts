import { getServerEnv } from "@/lib/env";
import { queueDataCleanup } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";
import { assertProductionConfiguration, verifyProductionDependencies } from "@/lib/production-config";
import { logServerError } from "@/lib/safe-logger";
import { sendOperationalAlert } from "@/lib/alerts";

async function main() {
  assertProductionConfiguration("scheduler");
  await verifyProductionDependencies();
  const intervalMs = getServerEnv().cleanupIntervalHours * 60 * 60 * 1000;
  await enqueue();
  setInterval(() => void enqueue(), intervalMs);
  await new Promise(() => undefined);
}

async function enqueue() {
  try {
    const result = await queueDataCleanup();
    console.log(JSON.stringify({ event: "cleanup_enqueued", reused: result.reused, at: new Date().toISOString() }));
  } catch (error) {
    logServerError("cleanup_scheduler_failed", error);
    await sendOperationalAlert({
      event: "cleanup_scheduler_failed",
      errorCode: "CLEANUP_SCHEDULER_FAILED",
      severity: "critical"
    });
  }
}

main().catch(async (error) => {
  logServerError("cleanup_scheduler_fatal", error);
  await prisma.$disconnect();
  process.exit(1);
});
