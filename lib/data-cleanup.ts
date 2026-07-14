import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { anonymizeReport } from "@/lib/report-deletion";

export type DataCleanupResult = {
  dryRun: boolean;
  protectedReportCount: number;
  deletedReportCount: number;
  anonymizedReportCount: number;
  clearedSourceContentCount: number;
  deletedAnalyticsCount: number;
  deletedApiUsageCount: number;
  revokedLinkCount: number;
  clearedJobPayloadCount: number;
  deletedAdminSessionCount: number;
  clearedApiCredentialCount: number;
  errorCount: number;
  errorSummary: string[];
};

export async function executeDataCleanup(options: { dryRun: boolean; jobId?: string; now?: Date }): Promise<DataCleanupResult> {
  const env = getServerEnv();
  const now = options.now ?? new Date();
  const sourceCutoff = daysBefore(now, env.sourceContentRetentionDays);
  const analyticsCutoff = daysBefore(now, env.analyticsRetentionDays);
  const apiUsageCutoff = daysBefore(now, env.apiUsageRetentionDays);
  const jobEventCutoff = daysBefore(now, env.jobEventRetentionDays);
  const credentialCutoff = hoursBefore(now, env.apiCredentialRetentionHours);
  const expiredReports = await prisma.ideaJudgmentRecord.findMany({
    where: { expiresAt: { lt: now }, deletedAt: null },
    select: { id: true, paymentStatus: true, legacyPaymentReadOnly: true, generationStatus: true }
  });
  const protectedReports = expiredReports.filter(isProtectedOrder);
  const reportCandidates = expiredReports.filter((record) => !isProtectedOrder(record));
  const sourceCandidates = await prisma.sourceRecord.count({
    where: {
      createdAt: { lt: sourceCutoff },
      OR: [{ rawContent: { not: null } }, { excerpt: { not: null } }, { qualifyingExcerpt: { not: null } }]
    }
  });
  const verificationCacheCandidates = await prisma.sourceVerificationCache.count({
    where: { checkedAt: { lt: sourceCutoff }, excerpt: { not: null } }
  });
  const analyticsCandidates = await prisma.analyticsEvent.count({ where: { createdAt: { lt: analyticsCutoff } } });
  const apiUsageCandidates = await prisma.apiUsageRecord.count({ where: { createdAt: { lt: apiUsageCutoff } } });
  const linkCandidates = await prisma.reportAccessLink.count({ where: { status: "ACTIVE", expiresAt: { lt: now } } });
  const oldJobs = await prisma.job.findMany({
    where: { status: { in: ["SUCCEEDED", "FAILED", "CANCELLED"] }, completedAt: { lt: jobEventCutoff } },
    select: { id: true, progressJson: true }
  });
  const jobPayloadCandidates = oldJobs.filter((job) => !isEmptyJsonObject(job.progressJson));
  const adminSessionCandidates = await prisma.adminSession.count({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        { revokedAt: { lt: daysBefore(now, 7) } }
      ]
    }
  });
  const credentialCandidates = await prisma.apiCredential.count({
    where: {
      encryptedSecret: { not: null },
      OR: [
        { expiresAt: { lt: now } },
        { status: { in: ["REVOKED", "EXPIRED", "INVALID"] }, updatedAt: { lt: credentialCutoff } }
      ]
    }
  });

  const result: DataCleanupResult = {
    dryRun: options.dryRun,
    protectedReportCount: protectedReports.length,
    deletedReportCount: 0,
    anonymizedReportCount: reportCandidates.length,
    clearedSourceContentCount: sourceCandidates + verificationCacheCandidates,
    deletedAnalyticsCount: analyticsCandidates,
    deletedApiUsageCount: apiUsageCandidates,
    revokedLinkCount: linkCandidates,
    clearedJobPayloadCount: jobPayloadCandidates.length,
    deletedAdminSessionCount: adminSessionCandidates,
    clearedApiCredentialCount: credentialCandidates,
    errorCount: 0,
    errorSummary: []
  };

  if (options.dryRun) return result;

  const existingRun = options.jobId ? await prisma.dataCleanupRun.findUnique({ where: { jobId: options.jobId } }) : null;
  if (existingRun?.status === "SUCCEEDED") return cleanupRunToResult(existingRun);
  const run = existingRun
    ? await prisma.dataCleanupRun.update({
        where: { id: existingRun.id },
        data: { status: "RUNNING", startedAt: now, completedAt: null, errorCount: 0, errorSummary: [] }
      })
    : await prisma.dataCleanupRun.create({ data: { jobId: options.jobId, mode: "RUN", status: "RUNNING", startedAt: now } });

  const errors: string[] = [];
  const step = async (name: string, action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message.slice(0, 180) : "unknown error"}`);
    }
  };

  await step("revoke_expired_links", async () => {
    const updated = await prisma.reportAccessLink.updateMany({
      where: { status: "ACTIVE", expiresAt: { lt: now } },
      data: { status: "REVOKED", revokedAt: now }
    });
    result.revokedLinkCount = updated.count;
  });
  await step("clear_source_content", async () => {
    const [sources, cache] = await Promise.all([
      prisma.sourceRecord.updateMany({
        where: {
          createdAt: { lt: sourceCutoff },
          OR: [{ rawContent: { not: null } }, { excerpt: { not: null } }, { qualifyingExcerpt: { not: null } }]
        },
        data: { rawContent: null, excerpt: null, qualifyingExcerpt: null }
      }),
      prisma.sourceVerificationCache.updateMany({
        where: { checkedAt: { lt: sourceCutoff }, excerpt: { not: null } },
        data: { excerpt: null }
      })
    ]);
    result.clearedSourceContentCount = sources.count + cache.count;
  });
  await step("delete_analytics", async () => {
    result.deletedAnalyticsCount = (await prisma.analyticsEvent.deleteMany({ where: { createdAt: { lt: analyticsCutoff } } })).count;
  });
  await step("delete_api_usage", async () => {
    result.deletedApiUsageCount = (await prisma.apiUsageRecord.deleteMany({ where: { createdAt: { lt: apiUsageCutoff } } })).count;
  });
  await step("clear_job_payloads", async () => {
    if (!jobPayloadCandidates.length) {
      result.clearedJobPayloadCount = 0;
      return;
    }
    const ids = jobPayloadCandidates.map((job) => job.id);
    await prisma.job.updateMany({ where: { id: { in: ids } }, data: { progressJson: {} } });
    await prisma.jobEvent.deleteMany({ where: { jobId: { in: oldJobs.map((job) => job.id) }, createdAt: { lt: jobEventCutoff } } });
    result.clearedJobPayloadCount = ids.length;
  });
  await step("delete_expired_admin_sessions", async () => {
    result.deletedAdminSessionCount = (
      await prisma.adminSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { revokedAt: { lt: daysBefore(now, 7) } }
          ]
        }
      })
    ).count;
  });
  await step("clear_expired_api_credentials", async () => {
    const expired = await prisma.apiCredential.updateMany({
      where: {
        encryptedSecret: { not: null },
        expiresAt: { lt: now },
        status: { in: ["ACTIVE", "PENDING_VERIFICATION"] }
      },
      data: { status: "EXPIRED", encryptedSecret: null, encryptionIv: null, encryptionAuthTag: null }
    });
    const stale = await prisma.apiCredential.updateMany({
      where: {
        encryptedSecret: { not: null },
        status: { in: ["REVOKED", "EXPIRED", "INVALID"] },
        updatedAt: { lt: credentialCutoff }
      },
      data: { encryptedSecret: null, encryptionIv: null, encryptionAuthTag: null }
    });
    result.clearedApiCredentialCount = expired.count + stale.count;
  });

  let anonymizedCount = 0;
  for (const candidate of reportCandidates) {
    await step(`anonymize_report:${candidate.id}`, async () => {
      const deletion = await anonymizeReport(candidate.id, "RETENTION_POLICY");
      if (deletion.found && !deletion.alreadyDeleted) anonymizedCount += 1;
    });
  }
  result.anonymizedReportCount = anonymizedCount;
  result.errorCount = errors.length;
  result.errorSummary = errors;

  await prisma.dataCleanupRun.update({
    where: { id: run.id },
    data: {
      status: errors.length ? "PARTIAL" : "SUCCEEDED",
      completedAt: new Date(),
      deletedReportCount: result.deletedReportCount,
      anonymizedReportCount: result.anonymizedReportCount,
      clearedSourceContentCount: result.clearedSourceContentCount,
      deletedAnalyticsCount: result.deletedAnalyticsCount,
      deletedApiUsageCount: result.deletedApiUsageCount,
      revokedLinkCount: result.revokedLinkCount,
      clearedJobPayloadCount: result.clearedJobPayloadCount,
      deletedAdminSessionCount: result.deletedAdminSessionCount,
      clearedApiCredentialCount: result.clearedApiCredentialCount,
      errorCount: result.errorCount,
      errorSummary: result.errorSummary
    }
  });
  return result;
}

function isProtectedOrder(record: { paymentStatus: "UNPAID" | "PAID" | "REFUNDED"; legacyPaymentReadOnly: boolean; generationStatus: "NOT_STARTED" | "QUEUED" | "GENERATING" | "READY" | "FAILED" }) {
  // Legacy paid records are retained for audit. New free reports are protected
  // only while a Worker is actively processing them.
  return record.legacyPaymentReadOnly || record.paymentStatus === "PAID" || record.generationStatus === "QUEUED" || record.generationStatus === "GENERATING";
}

function daysBefore(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function hoursBefore(now: Date, hours: number) {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function isEmptyJsonObject(value: unknown) {
  if (value == null) return true;
  return Boolean(typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0);
}

function cleanupRunToResult(run: {
  deletedReportCount: number;
  anonymizedReportCount: number;
  clearedSourceContentCount: number;
  deletedAnalyticsCount: number;
  deletedApiUsageCount: number;
  revokedLinkCount: number;
  clearedJobPayloadCount: number;
  deletedAdminSessionCount: number;
  clearedApiCredentialCount: number;
  errorCount: number;
  errorSummary: unknown;
}) {
  return {
    dryRun: false,
    protectedReportCount: 0,
    deletedReportCount: run.deletedReportCount,
    anonymizedReportCount: run.anonymizedReportCount,
    clearedSourceContentCount: run.clearedSourceContentCount,
    deletedAnalyticsCount: run.deletedAnalyticsCount,
    deletedApiUsageCount: run.deletedApiUsageCount,
    revokedLinkCount: run.revokedLinkCount,
    clearedJobPayloadCount: run.clearedJobPayloadCount,
    deletedAdminSessionCount: run.deletedAdminSessionCount,
    clearedApiCredentialCount: run.clearedApiCredentialCount,
    errorCount: run.errorCount,
    errorSummary: Array.isArray(run.errorSummary) ? run.errorSummary.filter((item): item is string => typeof item === "string") : []
  };
}
