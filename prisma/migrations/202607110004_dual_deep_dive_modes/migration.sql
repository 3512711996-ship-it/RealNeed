CREATE TYPE "DeepDiveMode" AS ENUM ('EVIDENCE_EXECUTION', 'IDEA_SIGNAL_REPAIR');

ALTER TABLE "IdeaJudgmentRecord" ADD COLUMN "purchasedDeepDiveMode" "DeepDiveMode";
ALTER TABLE "IdeaJudgmentRecord" ADD COLUMN "deepDiveEligibilityJson" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "DeepDiveReport" ADD COLUMN "mode" "DeepDiveMode" NOT NULL DEFAULT 'EVIDENCE_EXECUTION';

ALTER TABLE "SourceRecord" ADD COLUMN "sourceDisplayId" TEXT;

ALTER TABLE "SearchRequestRecord" ADD COLUMN "querySource" TEXT;
ALTER TABLE "SearchRequestRecord" ADD COLUMN "market" TEXT;
ALTER TABLE "SearchRequestRecord" ADD COLUMN "intent" TEXT;

CREATE INDEX "IdeaJudgmentRecord_purchasedDeepDiveMode_idx" ON "IdeaJudgmentRecord"("purchasedDeepDiveMode");
CREATE UNIQUE INDEX "SourceRecord_judgmentId_sourceDisplayId_key" ON "SourceRecord"("judgmentId", "sourceDisplayId");
