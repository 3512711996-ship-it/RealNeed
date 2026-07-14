import { NextResponse } from "next/server";
import { hashToken } from "@/lib/crypto-tokens";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIp, isRateLimitError, RateLimitError } from "@/lib/rate-limit";
import { anonymizeReport } from "@/lib/report-deletion";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    await assertRateLimit({ key: `delete-report:${getClientIp(request)}`, limit: 12, windowMs: 60 * 60 * 1000, message: "删除请求过于频繁。" });
    const { reportId } = await params;
    const payload = (await request.json().catch(() => ({}))) as { recoveryToken?: string };
    const recoveryToken = payload.recoveryToken?.trim();

    if (!recoveryToken) {
      return NextResponse.json({ message: "删除报告需要提供恢复 token。" }, { status: 400 });
    }

  const record = await prisma.ideaJudgmentRecord.findFirst({
    where: { id: reportId, recoveryTokenHash: hashToken(recoveryToken), deletedAt: null },
    select: { id: true }
  });

    if (!record) {
      return NextResponse.json({ message: "恢复 token 无效，无法删除这份报告。" }, { status: 403 });
    }

    await anonymizeReport(reportId, "USER_REQUEST");

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isRateLimitError(error)) {
      const headers = error instanceof RateLimitError ? { "Retry-After": String(error.retryAfterSeconds) } : undefined;
      return NextResponse.json({ message: error.message }, { status: error.status, headers });
    }
    return NextResponse.json({ message: "删除服务暂时不可用，请稍后再试。" }, { status: 503 });
  }
}
