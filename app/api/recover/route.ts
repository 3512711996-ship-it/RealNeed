import { NextResponse } from "next/server";
import { z } from "zod";
import { hashToken } from "@/lib/crypto-tokens";
import { ensureAnonymousSession } from "@/lib/anonymous-session";
import { buildDeepDiveEligibility } from "@/lib/deep-dive-eligibility";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIp, isRateLimitError, RateLimitError } from "@/lib/rate-limit";
import { hydrateJudgmentSourceAudit } from "@/lib/source-record-hydrator";
import type { IdeaJudgment } from "@/lib/types";

export const runtime = "nodejs";

const RecoverSchema = z.object({ token: z.string().min(20).max(240) });

export async function POST(request: Request) {
  try {
    await assertRateLimit({ key: `recover:${getClientIp(request)}`, limit: 30, windowMs: 60 * 60 * 1000, message: "恢复请求过于频繁。" });
    const parsed = RecoverSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: "恢复链接无效。" }, { status: 400 });
    const record = await prisma.ideaJudgmentRecord.findFirst({
    where: { recoveryTokenHash: hashToken(parsed.data.token), deletedAt: null },
    select: {
      id: true,
      reportCode: true,
      expiresAt: true,
      judgmentJson: true,
      technicalOutcome: true,
      marketVerdict: true,
      confidence: true,
      paymentStatus: true,
      generationStatus: true,
      deliveryStatus: true,
      generationError: true,
      deepDiveMode: true,
      purchasedDeepDiveMode: true,
      sources: true
    }
  });
    if (!record) return NextResponse.json({ message: "恢复链接无效或已被删除。" }, { status: 404 });
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) return NextResponse.json({ message: "恢复链接已过期。" }, { status: 410 });
    const session = await ensureAnonymousSession();
    // The recovery token is the owner proof. A resumed job must still receive
    // new credentials because old encrypted credentials remain session-bound.
    await prisma.job.updateMany({ where: { entityId: record.id }, data: { ownerSessionHash: session.ownerSessionHash } });

  const judgment = hydrateJudgmentSourceAudit(
    {
      ...(record.judgmentJson as unknown as IdeaJudgment),
      judgmentId: record.id,
      reportCode: record.reportCode,
      technicalOutcome: record.technicalOutcome,
      marketVerdict: record.marketVerdict,
      confidence: record.confidence,
      paymentStatus: record.paymentStatus,
      generationStatus: record.generationStatus,
      deliveryStatus: record.deliveryStatus,
      generationError: record.generationError,
      deepDiveMode: record.deepDiveMode ?? record.purchasedDeepDiveMode
    } satisfies IdeaJudgment,
    record.sources
  );
  const deepDiveOffer = buildDeepDiveEligibility(judgment);
    return NextResponse.json({
      judgmentId: record.id,
      reportCode: record.reportCode,
      judgment: { ...judgment, deepDiveOffer }
    });
  } catch (error) {
    if (isRateLimitError(error)) {
      const headers = error instanceof RateLimitError ? { "Retry-After": String(error.retryAfterSeconds) } : undefined;
      return NextResponse.json({ message: error.message }, { status: error.status, headers });
    }
    return NextResponse.json({ message: "恢复服务暂时不可用，请稍后再试。" }, { status: 503 });
  }
}
