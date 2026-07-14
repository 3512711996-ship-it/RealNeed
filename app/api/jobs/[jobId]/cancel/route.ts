import { NextResponse } from "next/server";
import { requireAnonymousSession } from "@/lib/anonymous-session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const session = await requireAnonymousSession(request, { requireCsrf: true });
    const { jobId } = await params;
    const updated = await prisma.job.updateMany({
      where: { id: jobId, ownerSessionHash: session.ownerSessionHash, status: { in: ["QUEUED", "RUNNING", "WAITING_FOR_CREDENTIAL"] } },
      data: { status: "CANCELLED", stage: "cancelled_by_user", completedAt: new Date(), lockedAt: null, lockedBy: null, leaseExpiresAt: null, heartbeatAt: null, timeoutAt: null, lastErrorCode: "CANCELLED_BY_USER", lastErrorMessage: "用户已取消任务。" }
    });
    if (updated.count !== 1) return NextResponse.json({ message: "任务不存在、已完成，或不属于当前会话。" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : 500;
    return NextResponse.json({ message: error instanceof Error ? error.message.slice(0, 180) : "无法取消任务。" }, { status });
  }
}
