-- Payment data is retained for audit only. New Deep Dive reports are free and
-- are authorized solely by BYOK credentials and system health.
ALTER TABLE "IdeaJudgmentRecord"
ADD COLUMN IF NOT EXISTS "legacyPaymentReadOnly" BOOLEAN NOT NULL DEFAULT false;

UPDATE "IdeaJudgmentRecord"
SET "legacyPaymentReadOnly" = true
WHERE "paymentStatus" <> 'UNPAID'
   OR "paidAt" IS NOT NULL
   OR "paymentConfirmedAt" IS NOT NULL
   OR "refundedAt" IS NOT NULL
   OR "paymentReference" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "IdeaJudgmentRecord_legacyPaymentReadOnly_idx"
ON "IdeaJudgmentRecord"("legacyPaymentReadOnly");
