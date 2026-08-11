-- Add per-user notification preferences (nullable JSON).
-- Null means "not yet chosen"; the application treats every essential channel
-- as on by default so a missing preference never silently drops a safety email.
ALTER TABLE "User" ADD COLUMN "notificationPrefs" JSONB;
