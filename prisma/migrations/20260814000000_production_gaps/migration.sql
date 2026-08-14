-- Production gaps vs the PRD: asset labels, Life Check-In reminder cascade,
-- Legacy Journey timestamps/events, beneficiary date of birth, Will category.

ALTER TABLE "Asset" ADD COLUMN "label" TEXT;
UPDATE "Asset" SET "label" = "assetCode" WHERE "label" IS NULL;

ALTER TABLE "CheckIn" ADD COLUMN "upcomingReminderSent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CheckIn" ADD COLUMN "missedReminderCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CheckIn" ADD COLUMN "lastReminderAt" TIMESTAMP(3);

ALTER TABLE "LegacyPlan" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "LegacyPlan" ADD COLUMN "releasedAt" TIMESTAMP(3);
ALTER TABLE "LegacyPlan" ADD COLUMN "confirmedEvents" JSONB;

ALTER TABLE "Beneficiary" ADD COLUMN "dateOfBirth" TIMESTAMP(3);

ALTER TYPE "DocumentCategory" ADD VALUE 'WILL';
