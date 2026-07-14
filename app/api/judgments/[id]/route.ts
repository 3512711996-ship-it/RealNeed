import { NextResponse } from "next/server";
import { buildDeepDiveEligibility } from "@/lib/deep-dive-eligibility";
import { prisma } from "@/lib/prisma";
import { hydrateJudgmentSourceAudit } from "@/lib/source-record-hydrator";
import { requireAnonymousSession } from "@/lib/anonymous-session";
import { listCredentials } from "@/lib/credential-vault";
import { buildReportGenerationEligibility } from "@/lib/report-generation-eligibility";
import { isWorkerAvailable } from "@/lib/worker-availability";
import type { IdeaJudgment } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let session: Awaited<ReturnType<typeof requireAnonymousSession>>;
  try {
    session = await requireAnonymousSession(_request);
  } catch {
    return NextResponse.json({ message: "匿名会话已失效，请使用恢复链接重新打开报告。" }, { status: 401 });
  }
  const record = await prisma.ideaJudgmentRecord.findFirst({
    where: { id, deletedAt: null },
    include: {
      sources: true,
      clusters: true,
      apiUsageRecords: true,
      jobs: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, type: true, status: true, stage: true, lastErrorMessage: true, createdAt: true, completedAt: true }
      }
    }
  });

  if (!record) {
    return NextResponse.json({ message: "没有找到这份判断报告。" }, { status: 404 });
  }

  const ownerJob = await prisma.job.findFirst({
    where: { entityId: record.id, ownerSessionHash: session.ownerSessionHash },
    select: { id: true }
  });
  if (!ownerJob) {
    return NextResponse.json({ message: "这份报告不属于当前会话。请使用原恢复链接重新打开。" }, { status: 404 });
  }

  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ message: "这份报告已过期。" }, { status: 410 });
  }

  const usageCostCny = record.apiUsageRecords.reduce((sum, item) => sum + Number(item.estimatedCostCny ?? 0), 0);
  const judgment = hydrateJudgmentSourceAudit({
    ...(record.judgmentJson as unknown as IdeaJudgment),
    judgmentId: record.id,
    reportCode: record.reportCode,
    paymentStatus: record.paymentStatus,
    generationStatus: record.generationStatus,
    deliveryStatus: record.deliveryStatus,
    generationError: record.generationError,
    deepDiveMode: record.deepDiveMode ?? record.purchasedDeepDiveMode,
    technicalOutcome: record.technicalOutcome,
    marketVerdict: record.marketVerdict,
    confidence: record.confidence
  } satisfies IdeaJudgment, record.sources);
  const deepDiveOffer = buildDeepDiveEligibility(judgment);
  const credentials = await listCredentials(session.ownerSessionHash);
  const generation = credentials.find((item) => item.kind === "GENERATION" && item.status === "ACTIVE")
    ? "ACTIVE"
    : credentials.some((item) => item.kind === "GENERATION" && item.status === "EXPIRED")
      ? "EXPIRED"
      : credentials.some((item) => item.kind === "GENERATION" && item.status === "INVALID")
        ? "INVALID"
        : "MISSING";
  const reportGenerationEligibility = buildReportGenerationEligibility(judgment, generation, { workerAvailable: await isWorkerAvailable() });

  return NextResponse.json({
    id: record.id,
    reportCode: record.reportCode,
    originalIdea: record.originalIdea,
    interpretedIdea: record.interpretedIdea,
    technicalOutcome: record.technicalOutcome,
    marketVerdict: record.marketVerdict,
    confidence: record.confidence,
    paymentStatus: record.paymentStatus,
    generationStatus: record.generationStatus,
    deliveryStatus: record.deliveryStatus,
    generationError: record.generationError,
    expiresAt: record.expiresAt,
    deepDiveMode: record.deepDiveMode ?? record.purchasedDeepDiveMode,
    deepDiveOffer,
    judgment: {
      ...judgment,
      deepDiveOffer,
      reportGenerationEligibility
    },
    sourceAudit: {
      total: record.sources.length,
      accessible: record.sources.filter((source) => source.accessStatus === "ACCESSIBLE" || source.accessStatus === "REDIRECTED_ACCESSIBLE").length,
      blocked: record.sources.filter((source) => source.accessStatus === "BLOCKED" || source.accessStatus === "RATE_LIMITED").length,
      clusters: record.clusters.length,
      promptInjectionDetected: record.sources.filter((source) => source.promptInjectionDetected).length
    },
    usage: {
      requestCount: record.apiUsageRecords.reduce((sum, item) => sum + item.requestCount, 0),
      estimatedCostCny: Number(usageCostCny.toFixed(6))
    },
    jobs: record.jobs
  });
}
