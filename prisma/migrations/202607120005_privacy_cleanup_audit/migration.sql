CREATE TABLE "DataCleanupRun" (
  "id" TEXT NOT NULL,
  "jobId" TEXT,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "deletedReportCount" INTEGER NOT NULL DEFAULT 0,
  "anonymizedReportCount" INTEGER NOT NULL DEFAULT 0,
  "clearedSourceContentCount" INTEGER NOT NULL DEFAULT 0,
  "deletedAnalyticsCount" INTEGER NOT NULL DEFAULT 0,
  "deletedApiUsageCount" INTEGER NOT NULL DEFAULT 0,
  "revokedLinkCount" INTEGER NOT NULL DEFAULT 0,
  "clearedJobPayloadCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "errorSummary" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataCleanupRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportDeletionAudit" (
  "id" TEXT NOT NULL,
  "subjectHash" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "revokedLinkCount" INTEGER NOT NULL DEFAULT 0,
  "deletedDeepDiveCount" INTEGER NOT NULL DEFAULT 0,
  "deletedSourceCount" INTEGER NOT NULL DEFAULT 0,
  "deletedEventCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportDeletionAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DataCleanupRun_jobId_key" ON "DataCleanupRun"("jobId");
CREATE INDEX "DataCleanupRun_status_idx" ON "DataCleanupRun"("status");
CREATE INDEX "DataCleanupRun_startedAt_idx" ON "DataCleanupRun"("startedAt");
CREATE INDEX "ReportDeletionAudit_subjectHash_idx" ON "ReportDeletionAudit"("subjectHash");
CREATE INDEX "ReportDeletionAudit_createdAt_idx" ON "ReportDeletionAudit"("createdAt");
