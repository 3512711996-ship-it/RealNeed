ALTER TYPE "SourceAccessStatus" ADD VALUE IF NOT EXISTS 'REDIRECTED_ACCESSIBLE';
ALTER TYPE "SourceAccessStatus" ADD VALUE IF NOT EXISTS 'BODY_TOO_LARGE';
ALTER TYPE "SourceAccessStatus" ADD VALUE IF NOT EXISTS 'REDIRECT_BLOCKED';

ALTER TABLE "SourceVerificationCache"
  ADD COLUMN "errorCode" TEXT,
  ADD COLUMN "errorMessage" TEXT,
  ADD COLUMN "redirectCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "durationMs" INTEGER;

ALTER TABLE "SourceRecord"
  ADD COLUMN "redirectCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "verificationErrorCode" TEXT,
  ADD COLUMN "searchDiscoveredAt" TIMESTAMP(3),
  ADD COLUMN "contentExtractedAt" TIMESTAMP(3),
  ADD COLUMN "contentExtractionStatus" TEXT,
  ADD COLUMN "extractionFailureReason" TEXT;

-- Existing SEARCH_PROVIDER rows were marked ACCESSIBLE from Tavily Extract alone.
-- They remain traceable search/extract records, but are reset to direct-verification
-- unknown so old data cannot masquerade as a live HTTP check.
UPDATE "SourceRecord"
SET
  "searchDiscoveredAt" = COALESCE("createdAt", NOW()),
  "contentExtractedAt" = CASE WHEN "evidenceAvailability" = 'CONFIRMED_CONTENT' THEN COALESCE("checkedAt", "createdAt") ELSE NULL END,
  "contentExtractionStatus" = CASE
    WHEN "evidenceAvailability" = 'CONFIRMED_CONTENT' THEN 'CONTENT_EXTRACTED'
    WHEN "evidenceAvailability" = 'SEARCH_LEAD' THEN 'INSUFFICIENT_TEXT'
    ELSE 'NOT_RUN'
  END,
  "accessStatus" = 'UNVERIFIED',
  "httpStatus" = NULL,
  "verificationOrigin" = NULL,
  "checkedAt" = NULL,
  "durationMs" = NULL,
  "failureReason" = CASE
    WHEN "failureReason" IS NOT NULL THEN "failureReason"
    ELSE '旧记录未执行独立直接 URL 验证'
  END
WHERE "origin" = 'SEARCH_PROVIDER';

