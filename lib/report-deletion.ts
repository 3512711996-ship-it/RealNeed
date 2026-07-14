import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type ReportDeletionSource = "USER_REQUEST" | "RETENTION_POLICY" | "ADMIN_REQUEST";

export async function anonymizeReport(judgmentId: string, source: ReportDeletionSource) {
  return prisma.$transaction(async (tx) => {
    const judgment = await tx.ideaJudgmentRecord.findUnique({
      where: { id: judgmentId },
      select: {
        id: true,
        deletedAt: true,
        deepDiveReport: { select: { id: true } },
        jobs: { select: { id: true } }
      }
    });
    if (!judgment) return { found: false, alreadyDeleted: false } as const;
    if (judgment.deletedAt) return { found: true, alreadyDeleted: true } as const;

    const deepDiveId = judgment.deepDiveReport?.id;
    const jobIds = judgment.jobs.map((job) => job.id);
    const revokedLinks = deepDiveId
      ? await tx.reportAccessLink.updateMany({
          where: { deepDiveReportId: deepDiveId, status: "ACTIVE" },
          data: { status: "REVOKED", revokedAt: new Date() }
        })
      : { count: 0 };
    const deletedEvents = jobIds.length ? await tx.jobEvent.deleteMany({ where: { jobId: { in: jobIds } } }) : { count: 0 };
    const deletedSources = await tx.sourceRecord.deleteMany({ where: { judgmentId } });

    await tx.analyticsEvent.deleteMany({
      where: { OR: [{ judgmentId }, ...(deepDiveId ? [{ deepDiveReportId: deepDiveId }] : [])] }
    });
    await tx.apiUsageRecord.updateMany({
      where: { OR: [{ judgmentId }, ...(deepDiveId ? [{ deepDiveId }] : [])] },
      data: { judgmentId: null, deepDiveId: null }
    });
    await tx.evidenceCluster.deleteMany({ where: { judgmentId } });
    await tx.searchRequestRecord.deleteMany({ where: { judgmentId } });
    await tx.judgmentRun.deleteMany({ where: { judgmentId } });
    await tx.job.updateMany({
      where: { entityId: judgmentId },
      data: { progressJson: {}, lastErrorMessage: null }
    });
    const deletedDeepDive = await tx.deepDiveReport.deleteMany({ where: { judgmentId } });
    await tx.ideaJudgmentRecord.update({
      where: { id: judgmentId },
      data: {
        originalIdea: "[deleted]",
        interpretedIdea: null,
        interpretedIdeaJson: {},
        judgmentJson: {},
        deepDiveEligibilityJson: {},
        technicalOutcome: "PROCESSING_FAILED",
        marketVerdict: "NOT_AVAILABLE",
        confidence: "VERY_LOW",
        generationError: null,
        recoveryTokenHash: null,
        deliveryStatus: "REVOKED",
        deletedAt: new Date()
      }
    });
    await tx.reportDeletionAudit.create({
      data: {
        subjectHash: hashSubject(judgmentId),
        source,
        revokedLinkCount: revokedLinks.count,
        deletedDeepDiveCount: deletedDeepDive.count,
        deletedSourceCount: deletedSources.count,
        deletedEventCount: deletedEvents.count
      }
    });

    return {
      found: true,
      alreadyDeleted: false,
      revokedLinkCount: revokedLinks.count,
      deletedDeepDiveCount: deletedDeepDive.count,
      deletedSourceCount: deletedSources.count,
      deletedEventCount: deletedEvents.count
    } as const;
  });
}

function hashSubject(judgmentId: string) {
  return createHash("sha256").update(`realneed-deletion:${judgmentId}`).digest("hex");
}
