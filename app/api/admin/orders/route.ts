import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAdminSession } from "@/lib/admin-auth";
import { buildDeepDiveEligibility } from "@/lib/deep-dive-eligibility";
import { prisma } from "@/lib/prisma";
import { hydrateJudgmentSourceAudit } from "@/lib/source-record-hydrator";
import type { IdeaJudgment } from "@/lib/types";

const orderInclude = {
  deepDiveReport: {
    include: { accessLinks: { orderBy: { createdAt: "desc" as const }, take: 5 } }
  },
  sources: true,
  apiUsageRecords: true,
  jobs: {
    orderBy: { createdAt: "desc" as const },
    take: 8,
    select: {
      id: true,
      type: true,
      status: true,
      stage: true,
      attemptCount: true,
      maxAttempts: true,
      lastErrorCode: true,
      lastErrorMessage: true,
      nextAttemptAt: true,
      createdAt: true,
      completedAt: true
    }
  }
} satisfies Prisma.IdeaJudgmentRecordInclude;

export async function GET(request: Request) {
  if (!(await getAdminSession())) return NextResponse.json({ message: "未登录。" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const reportCode = searchParams.get("reportCode")?.trim().toUpperCase();

  if (reportCode) {
    const record = await prisma.ideaJudgmentRecord.findFirst({ where: { reportCode, legacyPaymentReadOnly: true }, include: orderInclude });
    if (!record) return NextResponse.json({ message: "没有找到这份免费判断报告。" }, { status: 404 });
    const auditLogs = await prisma.adminAuditLog.findMany({ where: { orderId: record.id }, orderBy: { createdAt: "desc" }, take: 20 });
    return NextResponse.json(serializeOrder(record, auditLogs));
  }

  // The route is intentionally a historical audit view. It must never become a
  // control surface for reports created by the free BYOK flow.
  const status = searchParams.get("status") ?? "ALL";
  const query = searchParams.get("q")?.trim();
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 40) || 40));
  const records = await prisma.ideaJudgmentRecord.findMany({
    where: {
      deletedAt: null,
      legacyPaymentReadOnly: true,
      ...statusFilter(status),
      ...(query
        ? {
            OR: [
              { reportCode: { contains: query, mode: "insensitive" } },
              { originalIdea: { contains: query, mode: "insensitive" } },
              { paymentReference: { contains: query, mode: "insensitive" } },
              { customerContactNote: { contains: query, mode: "insensitive" } }
            ]
          }
        : {})
    },
    include: orderInclude,
    orderBy: { createdAt: "desc" },
    take: limit
  });
  const auditLogs = records.length
    ? await prisma.adminAuditLog.findMany({ where: { orderId: { in: records.map((record) => record.id) } }, orderBy: { createdAt: "desc" } })
    : [];
  const auditsByOrder = new Map<string, typeof auditLogs>();
  for (const log of auditLogs) {
    if (!log.orderId) continue;
    const list = auditsByOrder.get(log.orderId) ?? [];
    list.push(log);
    auditsByOrder.set(log.orderId, list);
  }
  return NextResponse.json({
    status,
    count: records.length,
    orders: records.map((record) => serializeOrder(record, (auditsByOrder.get(record.id) ?? []).slice(0, 5)))
  });
}

function serializeOrder(
  record: Prisma.IdeaJudgmentRecordGetPayload<{ include: typeof orderInclude }>,
  auditLogs: { id: string; action: string; reason: string | null; requestId: string; createdAt: Date }[]
) {
  const estimatedCostCny = record.apiUsageRecords.reduce((sum, item) => sum + Number(item.estimatedCostCny ?? 0), 0);
  const activeLink = record.deepDiveReport?.accessLinks.find((link) => link.status === "ACTIVE" && (!link.expiresAt || link.expiresAt.getTime() > Date.now()));
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

  return {
    id: record.id,
    reportCode: record.reportCode,
    originalIdea: record.originalIdea,
    interpretedIdea: record.interpretedIdea,
    judgmentJson: record.judgmentJson,
    technicalOutcome: record.technicalOutcome,
    marketVerdict: record.marketVerdict,
    confidence: record.confidence,
    paymentStatus: record.paymentStatus,
    generationStatus: record.generationStatus,
    deliveryStatus: record.deliveryStatus,
    legacyPurchasedDeepDiveMode: record.purchasedDeepDiveMode,
    deepDiveMode: record.deepDiveMode ?? record.deepDiveReport?.mode ?? null,
    deepDiveOffer,
    generationError: record.generationError,
    createdAt: record.createdAt,
    paidAt: record.paidAt,
    paymentConfirmedAt: record.paymentConfirmedAt,
    refundedAt: record.refundedAt,
    generatedAt: record.deepDiveReport?.generatedAt ?? record.deepDiveReport?.createdAt ?? null,
    deliveredAt: record.deliveredAt,
    paymentReference: record.paymentReference,
    customerContactNote: record.customerContactNote,
    adminNote: record.adminNote,
    sourceAudit: {
      total: record.sources.length,
      accessible: record.sources.filter((source) => source.accessStatus === "ACCESSIBLE" || source.accessStatus === "REDIRECTED_ACCESSIBLE").length,
      strongOrMedium: record.sources.filter((source) => source.finalEvidenceStrength === "STRONG" || source.finalEvidenceStrength === "MEDIUM").length,
      qualifying: record.sources.filter((source) => source.evidenceEligibility === "ELIGIBLE_USER_EVIDENCE").length,
      commercial: record.sources.filter((source) => ["PAID_SERVICE", "OFFICIAL_PRODUCT_PAGE", "COMMERCIAL_PROMOTION", "AFFILIATE_PAGE", "LANDING_PAGE"].includes(source.sourceType)).length
    },
    usage: {
      estimatedCostCny: Number(estimatedCostCny.toFixed(6)),
      requestCount: record.apiUsageRecords.reduce((sum, item) => sum + item.requestCount, 0)
    },
    jobs: record.jobs,
    retryCount: record.jobs.filter((job) => job.type === "DEEP_DIVE").reduce((sum, job) => sum + Math.max(0, job.attemptCount - 1), 0),
    deepDiveId: record.deepDiveReport?.id ?? null,
    accessLinkStatus: activeLink ? "ACTIVE" : record.deepDiveReport?.accessLinks[0]?.status ?? null,
    activeLinkViewCount: activeLink?.viewCount ?? 0,
    hasActiveLink: Boolean(activeLink),
    reportUrl: null,
    auditLogs
  };
}

function statusFilter(status: string): Prisma.IdeaJudgmentRecordWhereInput {
  // Payment filters only apply to immutable historical records.
  if (status === "PENDING_PAYMENT") return { paymentStatus: "UNPAID" };
  if (status === "PAID_PENDING") return { paymentStatus: "PAID", generationStatus: { in: ["NOT_STARTED", "QUEUED"] } };
  if (status === "GENERATING") return { paymentStatus: "PAID", generationStatus: "GENERATING" };
  if (status === "FAILED") return { paymentStatus: "PAID", generationStatus: "FAILED" };
  if (status === "READY_UNDELIVERED") return { paymentStatus: "PAID", generationStatus: "READY", deliveryStatus: "NOT_SENT" };
  if (status === "DELIVERED") return { deliveryStatus: "SENT" };
  if (status === "REFUNDED") return { paymentStatus: "REFUNDED" };
  if (status === "REVOKED") return { deliveryStatus: "REVOKED" };
  return {};
}
