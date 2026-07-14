import { NextResponse } from "next/server";
import { getJobWithEvents } from "@/lib/jobs";
import { requireAnonymousSession } from "@/lib/anonymous-session";
import { logServerError } from "@/lib/safe-logger";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    const session = await requireAnonymousSession(request);
    const { searchParams } = new URL(request.url);
    const after = Number.parseInt(searchParams.get("after") ?? "0", 10);
    const { job, events } = await getJobWithEvents(jobId, session.ownerSessionHash, Number.isFinite(after) ? after : 0);

    if (!job) {
      return NextResponse.json(
        { status: "not_found", message: "没有找到这个后台任务。报告可能已经完成，也可能是任务 ID 已失效。" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        job,
        events: events.map((event) => ({
          id: event.id,
          sequence: event.sequence,
          type: event.eventType,
          payload: event.eventJson,
          createdAt: event.createdAt
        }))
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : 500;
    if (status === 401 || status === 403) {
      return NextResponse.json({ status: "unauthorized", message: "匿名会话已失效，请刷新页面后重试。" }, { status, headers: { "Cache-Control": "no-store" } });
    }
    logServerError("jobs_api_failed", error);
    return NextResponse.json(
      { status: "error", message: "后台进度接口暂时不可用，前端会自动重试。系统没有生成任何 fallback 结果。" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "2" } }
    );
  }
}
