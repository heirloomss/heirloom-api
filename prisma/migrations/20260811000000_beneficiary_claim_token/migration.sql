-- Give every beneficiary an unguessable claim token — the only key to their
-- public Legacy Capsule at /claim/:token. Holding the token lets someone VIEW
-- the capsule; it can never move funds (claiming needs the beneficiary's own
-- Freighter signature from the wallet recorded on-chain).

-- 1. Add the column (nullable while we backfill existing rows).
ALTER TABLE "Beneficiary" ADD COLUMN "claimToken" TEXT;

-- 2. Backfill existing beneficiaries with 256 bits of entropy. Two v4 UUIDs
--    (122 random bits each) concatenated, hyphens stripped → a 64-char hex-ish
--    token. pgcrypto/gen_random_uuid is available on the target Postgres; fall
--    back is unnecessary because Prisma writes fresh tokens for all new rows.
UPDATE "Beneficiary"
SET "claimToken" = replace(gen_random_uuid()::text, '-', '')
                || replace(gen_random_uuid()::text, '-', '')
WHERE "claimToken" IS NULL;

-- 3. Enforce uniqueness so a token always resolves to at most one beneficiary.
CREATE UNIQUE INDEX "Beneficiary_claimToken_key" ON "Beneficiary"("claimToken");
