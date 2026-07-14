CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'GENERATING', 'GENERATED', 'GENERATION_FAILED', 'DELIVERED');

CREATE TABLE "IdeaJudgmentRecord" (
  "id" TEXT NOT NULL,
  "reportCode" TEXT NOT NULL,
  "originalIdea" TEXT NOT NULL,
  "interpretedIdea" TEXT,
  "judgmentJson" JSONB NOT NULL,
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
  "generationError" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IdeaJudgmentRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeepDiveReport" (
  "id" TEXT NOT NULL,
  "judgmentId" TEXT NOT NULL,
  "publicToken" TEXT NOT NULL,
  "reportJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeepDiveReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdeaJudgmentRecord_reportCode_key" ON "IdeaJudgmentRecord"("reportCode");
CREATE INDEX "IdeaJudgmentRecord_paymentStatus_idx" ON "IdeaJudgmentRecord"("paymentStatus");
CREATE INDEX "IdeaJudgmentRecord_createdAt_idx" ON "IdeaJudgmentRecord"("createdAt");
CREATE UNIQUE INDEX "DeepDiveReport_judgmentId_key" ON "DeepDiveReport"("judgmentId");
CREATE UNIQUE INDEX "DeepDiveReport_publicToken_key" ON "DeepDiveReport"("publicToken");

ALTER TABLE "DeepDiveReport"
  ADD CONSTRAINT "DeepDiveReport_judgmentId_fkey"
  FOREIGN KEY ("judgmentId") REFERENCES "IdeaJudgmentRecord"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
