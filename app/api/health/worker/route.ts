import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/safe-logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const env = getServerEnv();
    const [worker, activeJobCount, recentSuccess, recentFailure] = await Promise.all([
    prisma.workerNode.findFirst({ orderBy: { heartbeatAt: "desc" } }),
    prisma.job.count({ where: { status: "RUNNING", leaseExpiresAt: { gt: new Date() } } }),
    prisma.job.findFirst({ where: { status: "SUCCEEDED" }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
    prisma.job.findFirst({ where: { status: "FAILED" }, orderBy: { completedAt: "desc" }, select: { completedAt: true } })
  ]);
    const freshnessMs = Math.max(60_000, env.jobLockTimeoutSeconds * 2000);
    const heartbeatFresh = Boolean(worker && Date.now() - worker.heartbeatAt.getTime() <= freshnessMs);
    const healthy = env.jobExecutionMode === "worker" && heartbeatFresh;

    return NextResponse.json(
      {
        status: healthy ? "ok" : "unhealthy",
        mode: env.jobExecutionMode,
        worker: worker
          ? {
              id: worker.id,
              startedAt: worker.startedAt.toISOString(),
              heartbeatAt: worker.heartbeatAt.toISOString(),
              lastClaimedAt: worker.lastClaimedAt?.toISOString() ?? null,
              currentJobActive: Boolean(worker.currentJobId)
            }
          : null,
        activeJobCount,
        lastSucceededAt: recentSuccess?.completedAt?.toISOString() ?? null,
        lastFailedAt: recentFailure?.completedAt?.toISOString() ?? null
      },
      {
        status: healthy ? 200 : 503,
        headers: { "Cache-Control": "no-store" }
      }
    );
  } catch (error) {
    const errorId = logServerError("worker_health_failed", error);
    return NextResponse.json(
      { status: "unhealthy", errorId },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } }
    );
  }
}
