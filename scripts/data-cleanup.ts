import { executeDataCleanup } from "@/lib/data-cleanup";
import { queueDataCleanup } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const enqueue = process.argv.includes("--enqueue");
  if (enqueue) {
    const queued = await queueDataCleanup();
    console.log(JSON.stringify({ mode: "enqueue", ...queued }, null, 2));
    return;
  }
  const result = await executeDataCleanup({ dryRun });
  console.log(JSON.stringify(result, null, 2));
  if (!dryRun && result.errorCount > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Data cleanup failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
