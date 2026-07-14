import { assertProductionConfiguration, verifyProductionDependencies } from "@/lib/production-config";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/safe-logger";

async function main() {
  assertProductionConfiguration("web");
  await verifyProductionDependencies({ requireWorkerHeartbeat: process.argv.includes("--require-worker") });
  console.log("RealNeed production preflight: PASS");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    logServerError("production_preflight_failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
