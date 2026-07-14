ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'CONTINUE_EVIDENCE';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'DATA_CLEANUP';

ALTER TYPE "TechnicalOutcome" ADD VALUE IF NOT EXISTS 'SEARCH_NOT_CONFIGURED';
ALTER TYPE "TechnicalOutcome" ADD VALUE IF NOT EXISTS 'NO_SEARCH_RESULTS';
ALTER TYPE "TechnicalOutcome" ADD VALUE IF NOT EXISTS 'EXTRACTION_INCOMPLETE';
ALTER TYPE "TechnicalOutcome" ADD VALUE IF NOT EXISTS 'ANALYSIS_FAILED';
ALTER TYPE "TechnicalOutcome" ADD VALUE IF NOT EXISTS 'DATABASE_FAILED';

CREATE TYPE "SourceOrigin" AS ENUM ('SEARCH_PROVIDER', 'USER_PASTED', 'USER_URL', 'MANUAL_IMPORT', 'UNTRUSTED_LEGACY_SOURCE');
CREATE TYPE "EvidenceAvailability" AS ENUM ('CONFIRMED_CONTENT', 'SEARCH_LEAD', 'NO_EVIDENCE');

ALTER TABLE "Job" ADD COLUMN "nextEventSequence" INTEGER NOT NULL DEFAULT 0;
UPDATE "Job"
SET "nextEventSequence" = COALESCE((
  SELECT MAX("sequence") FROM "JobEvent" WHERE "JobEvent"."jobId" = "Job"."id"
), 0);

ALTER TABLE "SourceRecord" ADD COLUMN "searchRequestId" TEXT;
ALTER TABLE "SourceRecord" ADD COLUMN "origin" "SourceOrigin" NOT NULL DEFAULT 'UNTRUSTED_LEGACY_SOURCE';
ALTER TABLE "SourceRecord" ADD COLUMN "provider" TEXT;
ALTER TABLE "SourceRecord" ADD COLUMN "providerRequestId" TEXT;
ALTER TABLE "SourceRecord" ADD COLUMN "evidenceAvailability" "EvidenceAvailability" NOT NULL DEFAULT 'NO_EVIDENCE';
ALTER TABLE "SourceRecord" ADD COLUMN "rawContent" TEXT;
ALTER TABLE "SourceRecord" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "SourceRecord" ADD COLUMN "sourceAnomaly" TEXT;

CREATE TABLE "SearchRequestRecord" (
  "id" TEXT NOT NULL,
  "judgmentId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerRequestId" TEXT,
  "query" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "resultCount" INTEGER NOT NULL DEFAULT 0,
  "creditsUsed" DECIMAL(12,6),
  "durationMs" INTEGER,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchRequestRecord_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ApiUsageRecord" ADD COLUMN "creditsUsed" DECIMAL(12,6);

CREATE INDEX "SourceRecord_searchRequestId_idx" ON "SourceRecord"("searchRequestId");
CREATE INDEX "SourceRecord_origin_idx" ON "SourceRecord"("origin");
CREATE INDEX "SourceRecord_provider_idx" ON "SourceRecord"("provider");
CREATE INDEX "SourceRecord_providerRequestId_idx" ON "SourceRecord"("providerRequestId");
CREATE INDEX "SourceRecord_evidenceAvailability_idx" ON "SourceRecord"("evidenceAvailability");

CREATE INDEX "SearchRequestRecord_judgmentId_idx" ON "SearchRequestRecord"("judgmentId");
CREATE INDEX "SearchRequestRecord_provider_operation_idx" ON "SearchRequestRecord"("provider", "operation");
CREATE INDEX "SearchRequestRecord_providerRequestId_idx" ON "SearchRequestRecord"("providerRequestId");
CREATE INDEX "SearchRequestRecord_createdAt_idx" ON "SearchRequestRecord"("createdAt");

ALTER TABLE "SearchRequestRecord" ADD CONSTRAINT "SearchRequestRecord_judgmentId_fkey" FOREIGN KEY ("judgmentId") REFERENCES "IdeaJudgmentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_searchRequestId_fkey" FOREIGN KEY ("searchRequestId") REFERENCES "SearchRequestRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
