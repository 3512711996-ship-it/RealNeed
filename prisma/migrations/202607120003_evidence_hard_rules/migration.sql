ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'SUPPORT_REQUEST';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'COMMUNITY_POST';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'USER_COMPLAINT';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'TUTORIAL';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'MEDIA_REVIEW';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'TOOL_COMPARISON';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'AFFILIATE_PAGE';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'MARKET_REPORT_SUMMARY';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'VENDOR_DOCUMENTATION';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'LANDING_PAGE';

CREATE TYPE "EvidenceEligibility" AS ENUM (
  'ELIGIBLE_USER_EVIDENCE',
  'BACKGROUND_ONLY',
  'COMPETITOR_ONLY',
  'IRRELEVANT',
  'UNVERIFIED'
);

ALTER TABLE "SourceRecord"
  ADD COLUMN "modelSuggestedStrength" "RecordEvidenceStrength" NOT NULL DEFAULT 'NOT_CLASSIFIED',
  ADD COLUMN "finalEvidenceStrength" "RecordEvidenceStrength" NOT NULL DEFAULT 'NOT_CLASSIFIED',
  ADD COLUMN "evidenceEligibility" "EvidenceEligibility" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "hardRuleReasonCodes" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "qualifyingExcerpt" TEXT,
  ADD COLUMN "qualifyingSignals" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "EvidenceCluster" ADD COLUMN "isQualifying" BOOLEAN NOT NULL DEFAULT false;

UPDATE "SourceRecord"
SET
  "modelSuggestedStrength" = "evidenceStrength",
  "finalEvidenceStrength" = CASE
    WHEN "origin" = 'USER_PASTED' AND "evidenceStrength" = 'STRONG' THEN 'MEDIUM'::"RecordEvidenceStrength"
    WHEN "origin" = 'USER_PASTED' THEN "evidenceStrength"
    WHEN "evidenceStrength" IN ('STRONG', 'MEDIUM') THEN 'WEAK'::"RecordEvidenceStrength"
    ELSE "evidenceStrength"
  END,
  "evidenceStrength" = CASE
    WHEN "origin" = 'USER_PASTED' AND "evidenceStrength" = 'STRONG' THEN 'MEDIUM'::"RecordEvidenceStrength"
    WHEN "origin" = 'SEARCH_PROVIDER' AND "evidenceStrength" IN ('STRONG', 'MEDIUM') THEN 'WEAK'::"RecordEvidenceStrength"
    ELSE "evidenceStrength"
  END,
  "evidenceEligibility" = CASE
    WHEN "origin" = 'USER_PASTED' THEN 'ELIGIBLE_USER_EVIDENCE'::"EvidenceEligibility"
    ELSE 'UNVERIFIED'::"EvidenceEligibility"
  END,
  "hardRuleReasonCodes" = CASE
    WHEN "origin" = 'USER_PASTED' THEN '[]'::jsonb
    ELSE '["DIRECT_VERIFICATION_REQUIRED"]'::jsonb
  END;

CREATE INDEX "SourceRecord_evidenceEligibility_idx" ON "SourceRecord"("evidenceEligibility");
CREATE INDEX "SourceRecord_finalEvidenceStrength_idx" ON "SourceRecord"("finalEvidenceStrength");
CREATE INDEX "EvidenceCluster_isQualifying_idx" ON "EvidenceCluster"("isQualifying");

