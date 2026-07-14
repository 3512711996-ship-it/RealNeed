-- Remove legacy job enum values that were not implemented as production features.
-- Existing rows are converted to the closest real job type before the enum is recreated.

UPDATE "Job"
SET "type" = 'JUDGMENT'
WHERE "type" IN ('CONTINUE_EVIDENCE', 'CONTINUE_VERIFICATION');

UPDATE "Job"
SET "type" = 'DATA_CLEANUP'
WHERE "type" = 'DELETE_EXPIRED_DATA';

ALTER TYPE "JobType" RENAME TO "JobType_old";

CREATE TYPE "JobType" AS ENUM ('JUDGMENT', 'DEEP_DIVE', 'DATA_CLEANUP');

ALTER TABLE "Job"
ALTER COLUMN "type" TYPE "JobType"
USING ("type"::text::"JobType");

DROP TYPE "JobType_old";
