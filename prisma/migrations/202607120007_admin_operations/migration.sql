ALTER TABLE "IdeaJudgmentRecord"
  ADD COLUMN "paymentConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "refundedAt" TIMESTAMP(3),
  ADD COLUMN "paymentReference" TEXT,
  ADD COLUMN "customerContactNote" TEXT,
  ADD COLUMN "adminNote" TEXT;

CREATE TABLE "AdminAuditLog" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "orderId" TEXT,
  "oldValue" JSONB,
  "newValue" JSONB,
  "reason" TEXT,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAuditLog_adminId_idx" ON "AdminAuditLog"("adminId");
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");
CREATE INDEX "AdminAuditLog_orderId_idx" ON "AdminAuditLog"("orderId");
CREATE INDEX "AdminAuditLog_requestId_idx" ON "AdminAuditLog"("requestId");
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
