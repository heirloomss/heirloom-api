<!-- Add a banner image here (upload to a GitHub comment, paste the
     user-attachments URL) to match the approved-repo convention. -->
<p align="center">
  <strong>heirloom-api</strong><br />
  The off-chain service for Heirloom — a digital legacy platform on Stellar.
</p>

<p align="center">
  <a href="https://github.com/heirloomss/heirloom-api/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/heirloomss/heirloom-api/actions/workflows/ci.yml/badge.svg" /></a>
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-11-e0234e.svg" />
  <img alt="Node" src="https://img.shields.io/badge/node-22-339933.svg" />
  <img alt="Prisma" src="https://img.shields.io/badge/prisma-6-2d3748.svg" />
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green.svg" />
</p>

<p align="center">
  <strong>🌐 Live app: <a href="https://heirloome.vercel.app">heirloome.vercel.app</a></strong>
</p>

<p align="center">
  <a href="https://github.com/heirloomss/heirloom-contracts">Contracts repo</a> ·
  <a href="https://github.com/heirloomss/heirloom-web">Web repo</a> ·
  <a href="#api-overview">API overview</a> ·
  <a href="#environment-variables">Environment</a>
</p>

---

## What this is

This NestJS service owns all application and business logic for **Heirloom**:
accounts, beneficiaries, guardians, the encrypted Digital Archive, personal
messages, Life Check-Ins, notifications, the Family Timeline activity feed, and
the glue that drives the on-chain Soroban contract.

The blockchain ([`heirloom-contracts`](https://github.com/heirloomss/heirloom-contracts))
handles only what must be trustless — custody of protected assets, guardian
approval thresholds, and claims. Everything else lives here. **The API never
holds a Stellar signing key**: on-chain state changes are built as unsigned XDR
and signed client-side in Freighter.

## Maintainers · [Telegram](https://t.me/cjay)

<table align="center">
  <tr>
    <td align="center">
      <img src="https://github.com/Cjay-Cyber-2.png" width="120" alt="Cjay" /><br /><br />
      <strong>Cjay — Maintainer</strong><br /><br />
      <a href="https://github.com/Cjay-Cyber-2">Cjay-Cyber-2</a><br />
      <a href="https://t.me/cjay">Telegram</a><br />
      <a href="mailto:chijiokejoseph2022@gmail.com">Email</a>
    </td>
  </tr>
</table>

## Contents

- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [API overview](#api-overview)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Deployment (Render)](#deployment-render)
- [Contributing](#contributing)
- [Security](#security)
- [Contributors](#contributors)
- [License](#license)

## Tech stack

- **NestJS 11** (TypeScript, strict)
- **Prisma 6** ORM + **PostgreSQL 16**
- **JWT** session auth — issued after a Freighter wallet-signature challenge
  (email/password is preserved in the code but disabled on purpose)
- **BullMQ + Redis 7** — the Life Check-In scheduler
- **AES-256-GCM** encryption for documents and message media
- **@stellar/stellar-sdk** — unsigned Soroban transaction builder
- **Jest**, **ESLint**, **Prettier**
- Node **22**, pnpm **11.1.2** (pinned via `packageManager`)

## Quick start

```bash
corepack enable
pnpm install                    # postinstall runs `prisma generate`
docker compose up -d            # postgres:16 on 5432, redis:7 on 6379
cp .env.example .env            # fill in real values
pnpm run prisma:deploy          # apply migrations
pnpm run start:dev              # http://localhost:4000/api
```

Health check: `GET http://localhost:4000/api/health`.

## Environment variables

See [`.env.example`](./.env.example) for the annotated list.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (Prisma) |
| `JWT_SECRET` | Auth token signing secret (32+ chars) |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d` |
| `ENCRYPTION_KEY` | 64-hex-char AES-256-GCM key for at-rest encryption |
| `REDIS_URL` | BullMQ queue for check-in scheduling |
| `CHECK_IN_REMINDER_GAP_HOURS` | Hours between missed-check-in reminders (`168` prod, `1` to demo the cascade) |
| `STELLAR_NETWORK` / `STELLAR_RPC_URL` | Soroban network endpoint |
| `HEIRLOOM_CONTRACT_ID` | Deployed `legacy` contract id (`C…`). If unset, on-chain endpoints return HTTP **503** — the API never fabricates transaction hashes |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_ENDPOINT` | Cloudflare R2 for the encrypted archive. Uploads/downloads return **503** until set |
| `RESEND_API_KEY` / `EMAIL_FROM` | Transactional email. Invites and claim links are skipped (and logged) until set |
| `WEB_ORIGIN` | CORS origin(s) for `heirloom-web` |
| `PORT` | HTTP port (default `4000`) |

> Never commit real secrets. `.env` is gitignored. There is **no**
> `STELLAR_SECRET_KEY` — the API does not sign.

## API overview

All routes are mounted under `/api` and (except auth + health) require a JWT via
`Authorization: Bearer <token>`. Every mutation records an `ActivityLog` entry
that powers the Family Timeline.

| Area | Routes |
| --- | --- |
| Health | `GET /api/health` |
| Auth | `POST /api/auth/wallet/challenge` · `POST /api/auth/wallet/verify` (Freighter sign-in) · wallet linking. Email/password `register`/`login` are preserved but disabled. |
| Users | `GET /api/users/me` · `PATCH /api/users/me` |
| Beneficiaries | `GET/POST /api/beneficiaries` · `GET/PATCH/DELETE /api/beneficiaries/:id` |
| Guardians | `GET/POST /api/guardians` · `GET/PATCH/DELETE /api/guardians/:id` |
| Assets | `GET/POST /api/assets` · `GET/PATCH/DELETE /api/assets/:id` |
| Archive | `POST /api/archive` (multipart) · `GET /api/archive` · `GET /api/archive/:id/download` · `DELETE /api/archive/:id` |
| Messages | `GET/POST /api/messages` · `GET/PATCH/DELETE /api/messages/:id` |
| Legacy | `GET /api/legacy` · `GET /api/legacy/journey` · `GET /api/legacy/claims` · verification & claim orchestration (unsigned XDR) |
| Claim (public) | `GET /api/claim/:token` and media/release/submit sub-routes — the beneficiary capsule, gated by an unguessable token |
| Activity | `GET /api/activity` — Family Timeline feed |

Documents and message media are encrypted with AES-256-GCM before storage;
downloads decrypt and stream on the server so raw storage URLs are never
exposed.

## Project structure

```
src/
├── auth/            # Freighter wallet sign-in, JWT, wallet linking
├── users/           # profile, check-in preferences
├── beneficiaries/   # the people who matter most
├── guardians/       # trusted verifiers (threshold rules)
├── assets/          # protected Stellar assets
├── archive/         # encrypted document vault + StorageService (R2)
├── messages/        # letters, voice, video, photos
├── legacy/          # Legacy Journey + claim orchestration + public capsule
├── activity/        # Family Timeline feed + Life Check-In service
├── notifications/   # Resend email
├── scheduler/       # BullMQ Life Check-In jobs
├── stellar/         # unsigned Soroban tx builder (503 until HEIRLOOM_CONTRACT_ID set)
├── encryption/      # AES-256-GCM helpers
├── prisma/          # Prisma service/module
├── common/          # guards, decorators, filters
├── config/          # env validation
└── main.ts
prisma/
└── schema.prisma    # full data model + migrations/
tests/               # jest suites (Prisma mocked)
```

## Testing

```bash
pnpm test          # unit tests (no database needed)
pnpm test:cov      # with coverage
```

## Deployment (Render)

Deploy after PostgreSQL and Redis are provisioned:

1. Provision a Render **PostgreSQL** instance → set `DATABASE_URL` (internal URL).
2. Provision a Render **Redis** instance → set `REDIS_URL` (internal URL).
3. Create a **Web Service** for this repo: build `pnpm install && pnpm run build`,
   start `pnpm run start:prod`.
4. Run `pnpm run prisma:deploy` to apply migrations.
5. Set `WEB_ORIGIN` to the deployed `heirloom-web` URL.

Platform deploy order: PostgreSQL → Redis → heirloom-api → heirloom-web. The
contract is deployed separately to Stellar via `heirloom-contracts`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). `main` is protected — open a PR, keep the
`ci` check green, one logical change per PR.

## Security

Unaudited, testnet-oriented. Report vulnerabilities privately — see
[SECURITY.md](SECURITY.md).

## Contributors

<a href="https://github.com/heirloomss/heirloom-api/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=heirloomss/heirloom-api" />
</a>

## License

MIT
