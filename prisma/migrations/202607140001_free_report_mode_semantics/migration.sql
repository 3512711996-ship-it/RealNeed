-- New reports are free and authorized by a user-owned API connection. Keep the
-- old purchasedDeepDiveMode column unchanged for read-only historical audits.
ALTER TABLE "IdeaJudgmentRecord"
ADD COLUMN IF NOT EXISTS "deepDiveMode" "DeepDiveMode";

UPDATE "IdeaJudgmentRecord"
SET "deepDiveMode" = "purchasedDeepDiveMode"
WHERE "deepDiveMode" IS NULL
  AND "purchasedDeepDiveMode" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "IdeaJudgmentRecord_deepDiveMode_idx"
ON "IdeaJudgmentRecord"("deepDiveMode");
