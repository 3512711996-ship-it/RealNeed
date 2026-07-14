ALTER TABLE "Job"
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "heartbeatAt" TIMESTAMP(3),
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "timeoutAt" TIMESTAMP(3);

CREATE TABLE "WorkerNode" (
  "id" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastClaimedAt" TIMESTAMP(3),
  "lastSucceededAt" TIMESTAMP(3),
  "lastFailedAt" TIMESTAMP(3),
  "currentJobId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkerNode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Job_status_nextAttemptAt_createdAt_idx" ON "Job"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "Job_status_leaseExpiresAt_idx" ON "Job"("status", "leaseExpiresAt");
CREATE INDEX "WorkerNode_heartbeatAt_idx" ON "WorkerNode"("heartbeatAt");
