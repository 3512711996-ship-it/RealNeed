import { NextResponse } from "next/server";
import { requireAnonymousSession } from "@/lib/anonymous-session";
import { executionSelectionSchema } from "@/lib/api-connections-schema";
import { resumeJobWithCredential } from "@/lib/jobs";
import { assertRateLimit, getClientIp, RateLimitError } from "@/lib/rate-limit";
import { logServerError } from "@/lib/safe-logger";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    const session = await requireAnonymousSession(request, { requireCsrf: true });
    await assertRateLimit({
      key: `job-resume:${session.ownerSessionHash}:${getClientIp(request)}`,
      limit: 10,
      windowMs: 60 * 60 * 1000,
      message: "任务恢复请求过于频繁，请稍后再试。"
    });
    const body = await request.json();
    const parsed = executionSelectionSchema.safeParse(body?.execution);
    if (!parsed.success) {
      throw Object.assign(new Error(parsed.error.issues[0]?.message ?? "API 供应商选择无效，请重新选择连接。"), { status: 400 });
    }

    const result = await resumeJobWithCredential(jobId, session.ownerSessionHash, parsed.data);
    return NextResponse.json(result, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = getErrorStatus(error);
    if (status >= 500) logServerError("job_resume_failed", error);
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (error instanceof RateLimitError) headers["Retry-After"] = String(error.retryAfterSeconds);
    return NextResponse.json(
      {
        status: "error",
        message: status >= 500 ? "任务恢复失败，请稍后重试。" : error instanceof Error ? error.message : "任务恢复失败。"
      },
      { status, headers }
    );
  }
}

function getErrorStatus(error: unknown) {
  if (error instanceof RateLimitError) return error.status;
  if (typeof error === "object" && error && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }
  return 500;
}
