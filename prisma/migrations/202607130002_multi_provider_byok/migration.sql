ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_CREDENTIAL';

CREATE TYPE "CredentialSource" AS ENUM ('PLATFORM', 'USER_PROVIDED');
CREATE TYPE "ProviderType" AS ENUM ('SEARCH', 'GENERATION');
CREATE TYPE "ApiCredentialKind" AS ENUM ('SEARCH', 'GENERATION');
CREATE TYPE "ApiCredentialStatus" AS ENUM ('ACTIVE', 'INVALID', 'EXPIRED', 'REVOKED', 'PENDING_VERIFICATION');

ALTER TABLE "Job"
  ADD COLUMN "ownerSessionHash" TEXT,
  ADD COLUMN "searchExecutionConfig" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "generationExecutionConfig" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "executionCheckpointJson" JSONB NOT NULL DEFAULT '{}';

UPDATE "Job"
SET
  "searchExecutionConfig" = jsonb_build_object('credentialSource', 'PLATFORM', 'provider', 'TAVILY', 'credentialId', NULL, 'configurationVersion', 1),
  "generationExecutionConfig" = jsonb_build_object('credentialSource', 'PLATFORM', 'provider', 'MOONSHOT', 'model', 'moonshot-v1-8k', 'credentialId', NULL, 'configurationVersion', 1)
WHERE "searchExecutionConfig" = '{}'::jsonb OR "generationExecutionConfig" = '{}'::jsonb;

ALTER TABLE "ApiUsageRecord"
  ADD COLUMN "providerType" "ProviderType" NOT NULL DEFAULT 'GENERATION',
  ADD COLUMN "credentialSource" "CredentialSource" NOT NULL DEFAULT 'PLATFORM',
  ADD COLUMN "credentialId" TEXT,
  ADD COLUMN "estimatedPlatformCostCny" DECIMAL(12,6);

UPDATE "ApiUsageRecord"
SET
  "providerType" = CASE WHEN LOWER("provider") IN ('tavily', 'brave', 'exa', 'perplexity_search') THEN 'SEARCH'::"ProviderType" ELSE 'GENERATION'::"ProviderType" END,
  "estimatedPlatformCostCny" = "estimatedCostCny";

ALTER TABLE "DataCleanupRun" ADD COLUMN "clearedApiCredentialCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AnonymousSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "csrfTokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnonymousSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiCredential" (
  "id" TEXT NOT NULL,
  "ownerSessionHash" TEXT NOT NULL,
  "kind" "ApiCredentialKind" NOT NULL,
  "provider" TEXT NOT NULL,
  "encryptedSecret" TEXT,
  "encryptionIv" TEXT,
  "encryptionAuthTag" TEXT,
  "encryptionKeyVersion" INTEGER NOT NULL,
  "keyLastFour" TEXT NOT NULL,
  "selectedModel" TEXT,
  "status" "ApiCredentialStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "lastVerifiedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobCredentialBinding" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "purpose" "ProviderType" NOT NULL,
  "providerSnapshot" TEXT NOT NULL,
  "modelSnapshot" TEXT,
  "credentialSource" "CredentialSource" NOT NULL,
  "configurationVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobCredentialBinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobProviderCall" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "callKey" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerType" "ProviderType" NOT NULL,
  "resultJson" JSONB NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobProviderCall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnonymousSession_tokenHash_key" ON "AnonymousSession"("tokenHash");
CREATE INDEX "AnonymousSession_expiresAt_idx" ON "AnonymousSession"("expiresAt");
CREATE INDEX "AnonymousSession_revokedAt_idx" ON "AnonymousSession"("revokedAt");
CREATE INDEX "ApiCredential_ownerSessionHash_idx" ON "ApiCredential"("ownerSessionHash");
CREATE INDEX "ApiCredential_kind_provider_idx" ON "ApiCredential"("kind", "provider");
CREATE INDEX "ApiCredential_expiresAt_idx" ON "ApiCredential"("expiresAt");
CREATE INDEX "ApiCredential_status_idx" ON "ApiCredential"("status");
CREATE UNIQUE INDEX "JobCredentialBinding_jobId_purpose_key" ON "JobCredentialBinding"("jobId", "purpose");
CREATE INDEX "JobCredentialBinding_credentialId_idx" ON "JobCredentialBinding"("credentialId");
CREATE UNIQUE INDEX "JobProviderCall_jobId_callKey_key" ON "JobProviderCall"("jobId", "callKey");
CREATE INDEX "JobProviderCall_jobId_providerType_idx" ON "JobProviderCall"("jobId", "providerType");
CREATE INDEX "Job_ownerSessionHash_idx" ON "Job"("ownerSessionHash");
CREATE INDEX "ApiUsageRecord_credentialId_idx" ON "ApiUsageRecord"("credentialId");
CREATE INDEX "ApiUsageRecord_providerType_credentialSource_idx" ON "ApiUsageRecord"("providerType", "credentialSource");

ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_ownerSessionHash_fkey" FOREIGN KEY ("ownerSessionHash") REFERENCES "AnonymousSession"("tokenHash") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobCredentialBinding" ADD CONSTRAINT "JobCredentialBinding_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobCredentialBinding" ADD CONSTRAINT "JobCredentialBinding_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "ApiCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobProviderCall" ADD CONSTRAINT "JobProviderCall_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiUsageRecord" ADD CONSTRAINT "ApiUsageRecord_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "ApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
