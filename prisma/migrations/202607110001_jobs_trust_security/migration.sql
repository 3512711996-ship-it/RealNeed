CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "PaymentStatus_new" AS ENUM ('UNPAID', 'PAID', 'REFUNDED');
CREATE TYPE "GenerationStatus" AS ENUM ('NOT_STARTED', 'QUEUED', 'GENERATING', 'READY', 'FAILED');
CREATE TYPE "DeliveryStatus" AS ENUM ('NOT_SENT', 'SENT', 'REVOKED');
CREATE TYPE "JobType" AS ENUM ('JUDGMENT', 'CONTINUE_VERIFICATION', 'DEEP_DIVE', 'DELETE_EXPIRED_DATA');
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "TechnicalOutcome" AS ENUM ('READY', 'SEARCH_FAILED', 'VERIFICATION_INCOMPLETE', 'SOURCES_BLOCKED', 'INSUFFICIENT_EVIDENCE', 'PROCESSING_FAILED');
CREATE TYPE "MarketVerdict" AS ENUM ('BUILD_SMALL_MVP', 'VALIDATE_FIRST', 'TALK_TO_USERS', 'KILL_OR_REFRAME', 'NOT_AVAILABLE');
CREATE TYPE "JudgmentConfidence" AS ENUM ('VERY_LOW', 'LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "ClusterType" AS ENUM ('SAME_URL', 'SAME_THREAD', 'SAME_DISCUSSION', 'SAME_CONTENT', 'SAME_CLAIM');
CREATE TYPE "SourceAccessStatus" AS ENUM ('ACCESSIBLE', 'BLOCKED', 'RATE_LIMITED', 'NOT_FOUND', 'TIMEOUT', 'NETWORK_ERROR', 'INVALID_URL', 'UNSUPPORTED_CONTENT', 'UNVERIFIED');
CREATE TYPE "SourceType" AS ENUM ('USER_DISCUSSION', 'USER_REVIEW', 'QUESTION_ANSWER', 'MARKETPLACE_LISTING', 'PAID_SERVICE', 'OFFICIAL_PRODUCT_PAGE', 'COMMERCIAL_PROMOTION', 'SEO_ARTICLE', 'NEWS_ARTICLE', 'UNKNOWN');
CREATE TYPE "RecordEvidenceStrength" AS ENUM ('STRONG', 'MEDIUM', 'WEAK', 'IRRELEVANT', 'NOT_CLASSIFIED');
CREATE TYPE "PaymentSignalLevel" AS ENUM ('NONE', 'WEAK', 'MEDIUM', 'STRONG', 'EXPLICIT');
CREATE TYPE "MarketScope" AS ENUM ('DOMESTIC', 'OVERSEAS', 'CROSS_MARKET', 'UNKNOWN');
CREATE TYPE "ReportAccessStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

ALTER TABLE "IdeaJudgmentRecord" ADD COLUMN "recoveryTokenHash" TEXT;
ALTER TABLE "IdeaJudgmentRecord" ADD COLUMN "interpretedIdeaJson" JSONB;
ALTER TABLE "IdeaJudgmentRecord" ADD COLUMN "technicalOutcome" "TechnicalOutcome" NOT NULL DEFAULT 'PROCESSING_FAILED';
ALTER TABLE "IdeaJudgmentRecord" ADD COLUMN "marketVerdict" "MarketVerdict" NOT NULL DEFAULT 'NOT_AVAILABLE';
ALTER TABLE "IdeaJudgmentRecord" ADD COLUMN "confidence" "JudgmentConfidence" NOT NULL DEFAULT 'VERY_LOW';
ALTER TABLE "IdeaJudgmentRecord" ADD COLUMN "generationStatus" "GenerationStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "IdeaJudgmentRecord" ADD COLUMN "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'NOT_SENT';
ALTER TABLE "IdeaJudgmentRecord" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "IdeaJudgmentRecord" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "IdeaJudgmentRecord" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "IdeaJudgmentRecord" ADD COLUMN "paymentStatus_new" "PaymentStatus_new" NOT NULL DEFAULT 'UNPAID';
UPDATE "IdeaJudgmentRecord"
SET
  "paymentStatus_new" = CASE
    WHEN "paymentStatus"::TEXT IN ('GENERATING', 'GENERATED', 'GENERATION_FAILED', 'DELIVERED') THEN 'PAID'::"PaymentStatus_new"
    ELSE 'UNPAID'::"PaymentStatus_new"
  END,
  "generationStatus" = CASE
    WHEN "paymentStatus"::TEXT = 'GENERATING' THEN 'GENERATING'::"GenerationStatus"
    WHEN "paymentStatus"::TEXT IN ('GENERATED', 'DELIVERED') THEN 'READY'::"GenerationStatus"
    WHEN "paymentStatus"::TEXT = 'GENERATION_FAILED' THEN 'FAILED'::"GenerationStatus"
    ELSE 'NOT_STARTED'::"GenerationStatus"
  END,
  "deliveryStatus" = CASE
    WHEN "paymentStatus"::TEXT = 'DELIVERED' THEN 'SENT'::"DeliveryStatus"
    ELSE 'NOT_SENT'::"DeliveryStatus"
  END,
  "paidAt" = CASE
    WHEN "paymentStatus"::TEXT IN ('GENERATING', 'GENERATED', 'GENERATION_FAILED', 'DELIVERED') THEN COALESCE("updatedAt", "createdAt")
    ELSE NULL
  END,
  "technicalOutcome" = CASE
    WHEN ("judgmentJson"->>'technicalOutcome') IN ('READY','SEARCH_FAILED','VERIFICATION_INCOMPLETE','SOURCES_BLOCKED','INSUFFICIENT_EVIDENCE','PROCESSING_FAILED')
      THEN ("judgmentJson"->>'technicalOutcome')::"TechnicalOutcome"
    ELSE 'PROCESSING_FAILED'::"TechnicalOutcome"
  END,
  "marketVerdict" = CASE
    WHEN ("judgmentJson"->>'marketVerdict') IN ('BUILD_SMALL_MVP','VALIDATE_FIRST','TALK_TO_USERS','KILL_OR_REFRAME','NOT_AVAILABLE')
      THEN ("judgmentJson"->>'marketVerdict')::"MarketVerdict"
    WHEN ("judgmentJson"->>'verdict') IN ('BUILD_SMALL_MVP','VALIDATE_FIRST','TALK_TO_USERS','KILL_OR_REFRAME')
      THEN ("judgmentJson"->>'verdict')::"MarketVerdict"
    ELSE 'NOT_AVAILABLE'::"MarketVerdict"
  END,
  "confidence" = CASE
    WHEN ("judgmentJson"->>'confidence') IN ('VERY_LOW','LOW','MEDIUM','HIGH')
      THEN ("judgmentJson"->>'confidence')::"JudgmentConfidence"
    ELSE 'VERY_LOW'::"JudgmentConfidence"
  END,
  "expiresAt" = COALESCE("expiresAt", "createdAt" + INTERVAL '30 days');

DROP INDEX IF EXISTS "IdeaJudgmentRecord_paymentStatus_idx";
ALTER TABLE "IdeaJudgmentRecord" DROP COLUMN "paymentStatus";
ALTER TABLE "IdeaJudgmentRecord" RENAME COLUMN "paymentStatus_new" TO "paymentStatus";
DROP TYPE "PaymentStatus";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";

ALTER TABLE "DeepDiveReport" ALTER COLUMN "publicToken" DROP NOT NULL;
ALTER TABLE "DeepDiveReport" ADD COLUMN "generatedAt" TIMESTAMP(3);
UPDATE "DeepDiveReport" SET "generatedAt" = COALESCE("generatedAt", "createdAt");

CREATE TABLE "Job" (
  "id" TEXT NOT NULL,
  "type" "JobType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
  "stage" TEXT NOT NULL DEFAULT 'QUEUED',
  "progressJson" JSONB,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 2,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobEvent" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventJson" JSONB NOT NULL,
  "sequence" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JudgmentRun" (
  "id" TEXT NOT NULL,
  "judgmentId" TEXT NOT NULL,
  "jobId" TEXT,
  "stage" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "verificationCoverage" JSONB,
  "independentEvidenceCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  CONSTRAINT "JudgmentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidenceCluster" (
  "id" TEXT NOT NULL,
  "judgmentId" TEXT NOT NULL,
  "clusterType" "ClusterType" NOT NULL,
  "canonicalKey" TEXT NOT NULL,
  "representativeSourceId" TEXT,
  "sourceCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvidenceCluster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SourceRecord" (
  "id" TEXT NOT NULL,
  "judgmentId" TEXT NOT NULL,
  "originalUrl" TEXT NOT NULL,
  "normalizedUrl" TEXT,
  "canonicalUrl" TEXT,
  "host" TEXT,
  "sourceType" "SourceType" NOT NULL DEFAULT 'UNKNOWN',
  "accessStatus" "SourceAccessStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "evidenceStrength" "RecordEvidenceStrength" NOT NULL DEFAULT 'NOT_CLASSIFIED',
  "paymentSignalLevel" "PaymentSignalLevel" NOT NULL DEFAULT 'NONE',
  "marketScope" "MarketScope" NOT NULL DEFAULT 'UNKNOWN',
  "verificationOrigin" TEXT,
  "httpStatus" INTEGER,
  "title" TEXT,
  "excerpt" TEXT,
  "contentHash" TEXT,
  "discussionClusterId" TEXT,
  "promptInjectionDetected" BOOLEAN NOT NULL DEFAULT false,
  "durationMs" INTEGER,
  "checkedAt" TIMESTAMP(3),
  "classifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportAccessLink" (
  "id" TEXT NOT NULL,
  "deepDiveReportId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "ReportAccessStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastAccessedAt" TIMESTAMP(3),
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportAccessLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiUsageRecord" (
  "id" TEXT NOT NULL,
  "judgmentId" TEXT,
  "deepDiveId" TEXT,
  "jobId" TEXT,
  "provider" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "model" TEXT,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "requestCount" INTEGER NOT NULL DEFAULT 1,
  "estimatedCostCny" DECIMAL(12,6),
  "durationMs" INTEGER,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "errorCode" TEXT,
  "estimated" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiUsageRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsEvent" (
  "id" TEXT NOT NULL,
  "anonymousSessionId" TEXT,
  "eventType" TEXT NOT NULL,
  "judgmentId" TEXT,
  "deepDiveReportId" TEXT,
  "propertiesJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdeaJudgmentRecord_recoveryTokenHash_key" ON "IdeaJudgmentRecord"("recoveryTokenHash");
CREATE INDEX "IdeaJudgmentRecord_paymentStatus_idx" ON "IdeaJudgmentRecord"("paymentStatus");
CREATE INDEX "IdeaJudgmentRecord_generationStatus_idx" ON "IdeaJudgmentRecord"("generationStatus");
CREATE INDEX "IdeaJudgmentRecord_deliveryStatus_idx" ON "IdeaJudgmentRecord"("deliveryStatus");
CREATE INDEX "IdeaJudgmentRecord_technicalOutcome_idx" ON "IdeaJudgmentRecord"("technicalOutcome");
CREATE INDEX "IdeaJudgmentRecord_marketVerdict_idx" ON "IdeaJudgmentRecord"("marketVerdict");
CREATE INDEX "IdeaJudgmentRecord_expiresAt_idx" ON "IdeaJudgmentRecord"("expiresAt");

CREATE INDEX "Job_type_status_idx" ON "Job"("type", "status");
CREATE INDEX "Job_entityId_idx" ON "Job"("entityId");
CREATE INDEX "Job_lockedAt_idx" ON "Job"("lockedAt");
CREATE INDEX "Job_createdAt_idx" ON "Job"("createdAt");

CREATE UNIQUE INDEX "JobEvent_jobId_sequence_key" ON "JobEvent"("jobId", "sequence");
CREATE INDEX "JobEvent_jobId_sequence_idx" ON "JobEvent"("jobId", "sequence");
CREATE INDEX "JobEvent_eventType_idx" ON "JobEvent"("eventType");

CREATE INDEX "JudgmentRun_judgmentId_idx" ON "JudgmentRun"("judgmentId");
CREATE INDEX "JudgmentRun_jobId_idx" ON "JudgmentRun"("jobId");
CREATE INDEX "JudgmentRun_stage_idx" ON "JudgmentRun"("stage");
CREATE INDEX "JudgmentRun_status_idx" ON "JudgmentRun"("status");

CREATE UNIQUE INDEX "EvidenceCluster_judgmentId_clusterType_canonicalKey_key" ON "EvidenceCluster"("judgmentId", "clusterType", "canonicalKey");
CREATE INDEX "EvidenceCluster_judgmentId_idx" ON "EvidenceCluster"("judgmentId");
CREATE INDEX "EvidenceCluster_clusterType_idx" ON "EvidenceCluster"("clusterType");
CREATE INDEX "EvidenceCluster_canonicalKey_idx" ON "EvidenceCluster"("canonicalKey");

CREATE INDEX "SourceRecord_judgmentId_idx" ON "SourceRecord"("judgmentId");
CREATE INDEX "SourceRecord_accessStatus_idx" ON "SourceRecord"("accessStatus");
CREATE INDEX "SourceRecord_sourceType_idx" ON "SourceRecord"("sourceType");
CREATE INDEX "SourceRecord_evidenceStrength_idx" ON "SourceRecord"("evidenceStrength");
CREATE INDEX "SourceRecord_paymentSignalLevel_idx" ON "SourceRecord"("paymentSignalLevel");
CREATE INDEX "SourceRecord_marketScope_idx" ON "SourceRecord"("marketScope");
CREATE INDEX "SourceRecord_canonicalUrl_idx" ON "SourceRecord"("canonicalUrl");
CREATE INDEX "SourceRecord_contentHash_idx" ON "SourceRecord"("contentHash");

CREATE UNIQUE INDEX "ReportAccessLink_tokenHash_key" ON "ReportAccessLink"("tokenHash");
CREATE INDEX "ReportAccessLink_deepDiveReportId_idx" ON "ReportAccessLink"("deepDiveReportId");
CREATE INDEX "ReportAccessLink_status_idx" ON "ReportAccessLink"("status");
CREATE INDEX "ReportAccessLink_expiresAt_idx" ON "ReportAccessLink"("expiresAt");

CREATE INDEX "ApiUsageRecord_judgmentId_idx" ON "ApiUsageRecord"("judgmentId");
CREATE INDEX "ApiUsageRecord_deepDiveId_idx" ON "ApiUsageRecord"("deepDiveId");
CREATE INDEX "ApiUsageRecord_jobId_idx" ON "ApiUsageRecord"("jobId");
CREATE INDEX "ApiUsageRecord_provider_operation_idx" ON "ApiUsageRecord"("provider", "operation");
CREATE INDEX "ApiUsageRecord_createdAt_idx" ON "ApiUsageRecord"("createdAt");

CREATE INDEX "AnalyticsEvent_anonymousSessionId_idx" ON "AnalyticsEvent"("anonymousSessionId");
CREATE INDEX "AnalyticsEvent_eventType_idx" ON "AnalyticsEvent"("eventType");
CREATE INDEX "AnalyticsEvent_judgmentId_idx" ON "AnalyticsEvent"("judgmentId");
CREATE INDEX "AnalyticsEvent_deepDiveReportId_idx" ON "AnalyticsEvent"("deepDiveReportId");
CREATE INDEX "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");

ALTER TABLE "Job" ADD CONSTRAINT "Job_judgment_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "IdeaJudgmentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobEvent" ADD CONSTRAINT "JobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JudgmentRun" ADD CONSTRAINT "JudgmentRun_judgmentId_fkey" FOREIGN KEY ("judgmentId") REFERENCES "IdeaJudgmentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JudgmentRun" ADD CONSTRAINT "JudgmentRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceCluster" ADD CONSTRAINT "EvidenceCluster_judgmentId_fkey" FOREIGN KEY ("judgmentId") REFERENCES "IdeaJudgmentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_judgmentId_fkey" FOREIGN KEY ("judgmentId") REFERENCES "IdeaJudgmentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_discussionClusterId_fkey" FOREIGN KEY ("discussionClusterId") REFERENCES "EvidenceCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReportAccessLink" ADD CONSTRAINT "ReportAccessLink_deepDiveReportId_fkey" FOREIGN KEY ("deepDiveReportId") REFERENCES "DeepDiveReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiUsageRecord" ADD CONSTRAINT "ApiUsageRecord_judgmentId_fkey" FOREIGN KEY ("judgmentId") REFERENCES "IdeaJudgmentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApiUsageRecord" ADD CONSTRAINT "ApiUsageRecord_deepDiveId_fkey" FOREIGN KEY ("deepDiveId") REFERENCES "DeepDiveReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApiUsageRecord" ADD CONSTRAINT "ApiUsageRecord_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_judgmentId_fkey" FOREIGN KEY ("judgmentId") REFERENCES "IdeaJudgmentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_deepDiveReportId_fkey" FOREIGN KEY ("deepDiveReportId") REFERENCES "DeepDiveReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ReportAccessLink" ("id", "deepDiveReportId", "tokenHash", "status", "createdAt")
SELECT gen_random_uuid()::TEXT, "id", encode(digest("publicToken", 'sha256'), 'hex'), 'ACTIVE'::"ReportAccessStatus", NOW()
FROM "DeepDiveReport"
WHERE "publicToken" IS NOT NULL
ON CONFLICT ("tokenHash") DO NOTHING;
