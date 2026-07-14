import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

async function main() {
  const env = getServerEnv();
  const [queued, running, failed, workers] = await Promise.all([
    prisma.job.count({ where: { status: "QUEUED" } }),
    prisma.job.count({ where: { status: "RUNNING" } }),
    prisma.job.count({ where: { status: "FAILED" } }),
    prisma.workerNode.findMany({ orderBy: { heartbeatAt: "desc" }, take: 5 })
  ]);

  console.log("RealNeed Worker status");
  console.log(`mode=${env.jobExecutionMode}`);
  console.log(`queued=${queued}`);
  console.log(`running=${running}`);
  console.log(`failed=${failed}`);
  for (const worker of workers) {
    console.log(
      `worker=${worker.id} heartbeatAt=${worker.heartbeatAt.toISOString()} currentJob=${worker.currentJobId ? "yes" : "no"}`
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Worker status check failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
