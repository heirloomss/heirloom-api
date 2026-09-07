# Contributing to heirloom-api

This is the off-chain service for Heirloom. Application and business logic lives
here; only trust-critical logic lives in
[`heirloom-contracts`](https://github.com/heirloomss/heirloom-contracts).

## Ground rules

- Every change goes through a pull request. `main` is protected.
- One logical change per PR.
- CI (`ci` job) must be green: type-check, lint, test, build.
- TypeScript is `strict`. No `any` without a comment explaining why.
- Never log secrets, tokens, decrypted payloads, or full request bodies.
- The API never signs Stellar transactions and never stores a signing key.
  On-chain calls return unsigned XDR for the client to sign in Freighter.
- Do **not** re-enable email/password auth. It is preserved-but-disabled on
  purpose — keep the `do not delete` banners intact.
- When a required integration is unconfigured (`HEIRLOOM_CONTRACT_ID`, R2,
  Resend), the correct behaviour is a clear `503` or a logged skip — never a
  fabricated success or a fake transaction hash.

## Setup

```bash
corepack enable
pnpm install
docker compose up -d            # postgres:16 on 5432, redis:7 on 6379
cp .env.example .env            # fill in real values
pnpm run prisma:deploy          # apply migrations
pnpm run start:dev
```

Node 22, pnpm 11.1.2 (pinned via `packageManager`).

## Checks

```bash
pnpm exec tsc --noEmit
pnpm exec eslint "{src,tests}/**/*.ts" --max-warnings 0
pnpm test
pnpm run build
```

Unit tests mock Prisma — they do not need a running database.

## Database changes

- Edit `prisma/schema.prisma`, then `pnpm run prisma:migrate -- --name <change>`.
- Commit the generated migration folder under `prisma/migrations/`.
- Never edit an already-applied migration; add a new one.

## Commit format

Conventional commits, scoped by module:

```
feat(legacy): add journey endpoint for the dashboard timeline
fix(auth): reject expired Freighter challenge nonces
test(beneficiaries): assert claim token is minted on create
chore(ci): pin pnpm and cache the store
```

One logical unit per commit, push after each. No `git add .` — stage the files
you changed.

## Pull request checklist

- [ ] `tsc --noEmit` clean
- [ ] `eslint --max-warnings 0` clean
- [ ] `pnpm test` green; new behaviour has tests
- [ ] `pnpm run build` succeeds
- [ ] New endpoints are guarded (`@UseGuards(JwtAuthGuard)`) unless deliberately
      public, and the PR says which
- [ ] No secret, token, or decrypted content added to logs
- [ ] `.env.example` updated if a new variable was introduced

## Reporting bugs

Functional bugs: open a GitHub issue with repro steps.
Security issues: **do not** open an issue — see [SECURITY.md](SECURITY.md).
