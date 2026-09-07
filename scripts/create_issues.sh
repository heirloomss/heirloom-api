#!/usr/bin/env bash
# Create the planned issue backlog for heirloom-api in one run.
# Requires: gh auth login with `repo` scope on heirloomss/heirloom-api.
set -euo pipefail
REPO=heirloomss/heirloom-api

label() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null; }
label "type: feature"      "1d76db" "New capability"
label "type: test"         "0e8a16" "Test coverage"
label "type: chore"        "fef2c0" "Tooling / CI / housekeeping"
label "type: docs"         "5319e7" "Documentation"
label "complexity: small"  "c2e0c6" "< 1 day"
label "complexity: medium" "fbca04" "1-3 days"
label "complexity: large"  "d93f0b" "> 3 days"
label "area: stellar"      "bfd4f2" "On-chain integration"
label "area: archive"      "d4c5f9" "Encrypted storage"
label "area: notifications" "c5def5" "Email / reminders"
label "area: auth"         "fad8c7" "Auth & sessions"

mk() { gh issue create --repo "$REPO" --title "$1" --label "$2" --body "$3"; }

mk "feat(stellar): index legacy contract events into the Family Timeline" \
"type: feature,complexity: large,area: stellar" \
"## Summary
Poll Soroban RPC \`getEvents\` for the legacy contract and turn \`created/deposited/approved/verified/released/claimed/refunded/cancelled\` into ActivityLog entries, so the timeline reflects on-chain truth rather than only app actions.

## Acceptance criteria
- [ ] Cursor persisted (last processed ledger) in Postgres
- [ ] Idempotent: replaying a ledger range creates no duplicates
- [ ] Backfill command for a fresh DB
- [ ] Unit tests with a mocked RPC event page
- [ ] Runs on the existing BullMQ scheduler

## Tech stack
NestJS, @stellar/stellar-sdk \`rpc.Server.getEvents\`, Prisma, BullMQ"

mk "feat(claim): rate-limit and audit capsule token access" \
"type: feature,complexity: medium,area: auth" \
"## Summary
\`GET /api/claim/:token\` and its media sub-routes are the only guard on capsule contents. Add per-token and per-IP rate limiting and an access log (without logging the token).

## Acceptance criteria
- [ ] Throttle guard on all \`/claim/:token*\` routes
- [ ] Access recorded as ActivityLog for the owner ('Sarah opened her capsule')
- [ ] Token never appears in logs or error messages
- [ ] Tests for limit exceeded + log written

## Tech stack
NestJS @nestjs/throttler, Prisma"

mk "feat(notifications): domain-verified sender and templated emails" \
"type: feature,complexity: medium,area: notifications" \
"## Summary
Move off the Resend test sender. Add HTML templates for guardian invite, check-in reminder, cascade notice, and capsule link, built from \`WEB_ORIGIN\`.

## Acceptance criteria
- [ ] \`EMAIL_FROM\` uses a verified domain in production
- [ ] One template per message type, plain-text fallback
- [ ] \`/claim/<token>\` links built from \`WEB_ORIGIN\`
- [ ] Unit tests assert the right template + recipient per trigger
- [ ] Still logs-and-skips when \`RESEND_API_KEY\` is unset

## Tech stack
NestJS, Resend SDK"

mk "feat(archive): hardened multipart upload (size + type limits, streaming)" \
"type: feature,complexity: medium,area: archive" \
"## Summary
Bound archive/message-media uploads: max size, content-type allowlist, stream to R2 rather than buffering, encrypt in a transform stream.

## Acceptance criteria
- [ ] Configurable \`ARCHIVE_MAX_BYTES\`; 413 when exceeded
- [ ] Content-type allowlist per document category
- [ ] AES-256-GCM applied as a stream (no full-file buffer)
- [ ] Tests: oversize rejected, disallowed type rejected, happy path round-trips

## Tech stack
NestJS, @aws-sdk/client-s3 (R2), Node streams, crypto"

mk "test(activity): e2e for the missed-check-in cascade" \
"type: test,complexity: medium,area: notifications" \
"## Summary
Cover reminder -> two missed reminders -> guardian notice using fake timers, asserting no 'instantly gone' path.

## Acceptance criteria
- [ ] Jest fake timers drive \`CHECK_IN_REMINDER_GAP_HOURS\`
- [ ] Asserts email sequence and that guardians are only notified after the window
- [ ] No real queue or SMTP

## Tech stack
Jest, BullMQ test utils"

mk "feat(auth): Redis-backed challenge nonce store with expiry" \
"type: feature,complexity: small,area: auth" \
"## Summary
Wallet challenge nonces should be single-use and expire (e.g. 5 min) so a signed challenge cannot be replayed.

## Acceptance criteria
- [ ] Nonce written to Redis with TTL on \`/auth/wallet/challenge\`
- [ ] \`/auth/wallet/verify\` consumes and deletes it; second use fails
- [ ] Tests for expiry and replay

## Tech stack
NestJS, ioredis"

mk "chore(ci): add a Postgres service and prisma migrate check" \
"type: chore,complexity: small" \
"## Summary
CI currently runs unit tests (Prisma mocked). Add a job that spins up Postgres and runs \`prisma migrate deploy\` + \`prisma migrate status\` to catch broken migrations.

## Acceptance criteria
- [ ] \`services: postgres\` in the workflow
- [ ] \`prisma migrate deploy\` then \`prisma migrate status\` must be clean
- [ ] Job name added to branch protection required checks

## Tech stack
GitHub Actions, Prisma"

mk "feat(health): readiness probe reporting integration wiring" \
"type: feature,complexity: small,area: stellar" \
"## Summary
Extend \`/api/health\` (or add \`/api/health/ready\`) to report whether Stellar, R2, and Resend are configured and reachable, for the hosting platform's health check.

## Acceptance criteria
- [ ] Reports per-integration status without leaking secrets
- [ ] 200 only when required integrations are wired
- [ ] Documented in heirloom-docs

## Tech stack
NestJS"
