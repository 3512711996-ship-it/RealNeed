import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { assertProductionConfiguration, verifyProductionDependencies } from "@/lib/production-config";
import { logServerError } from "@/lib/safe-logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    assertProductionConfiguration("web");
    const requireWorkerHeartbeat = getServerEnv().jobExecutionMode === "worker";
    await verifyProductionDependencies({ requireWorkerHeartbeat });
    return NextResponse.json(
      {
        status: "ready",
        checks: {
          database: "ok",
          rateLimit: "ok",
          worker: requireWorkerHeartbeat ? "ok" : "not_required_in_local_mode"
        }
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const errorId = logServerError("readiness_check_failed", error);
    return NextResponse.json(
      { status: "unready", errorId },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } }
    );
  }
}
