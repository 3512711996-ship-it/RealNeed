CREATE TABLE "SourceVerificationCache" (
    "id" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "finalUrl" TEXT,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "title" TEXT,
    "contentType" TEXT,
    "excerpt" TEXT,
    "failureReason" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceVerificationCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceVerificationCache_normalizedUrl_key" ON "SourceVerificationCache"("normalizedUrl");
CREATE INDEX "SourceVerificationCache_status_idx" ON "SourceVerificationCache"("status");
CREATE INDEX "SourceVerificationCache_checkedAt_idx" ON "SourceVerificationCache"("checkedAt");
