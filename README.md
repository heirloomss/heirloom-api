# heirloom-api

The off-chain heart of **Heirloome** — the digital legacy platform built on
Stellar. This NestJS service owns all application and business logic:
accounts, beneficiaries, guardians, the encrypted Digital Archive, personal
messages, Life Check-Ins, notifications, the Family Timeline activity feed, and
the glue that drives the on-chain Soroban contract.

The blockchain (see `heirloom-contracts`) handles only what must be trusted
on-chain — protecting assets, guardian approval thresholds, and claims.
Everything else lives here.

## Tech stack

- **NestJS 11** (TypeScript, strict)
- **Prisma 6** ORM + **PostgreSQL**
- **JWT** session auth (Freighter wallet signature; email/password preserved but disabled)
- **BullMQ + Redis** — the Life Check-In scheduler
- **AES-256-GCM** encryption for documents/messages
- **@stellar/stellar-sdk** for Soroban contract interaction
- **Jest** for tests, ESLint + Prettier

## Getting started

### Prerequisites

- Node.js 20+
- pnpm or npm
- PostgreSQL 16 and Redis 7 (or use Docker, below)

### Local services with Docker

```powershell
docker compose up -d    # starts postgres:16 on 5432 and redis:7 on 6379
```

### Install & run

```powershell
cp .env.example .env          # fill in values
pnpm install                    # postinstall runs `prisma generate`
pnpm prisma:migrate             # create the database schema
pnpm start:dev                  # http://localhost:4000/api
```

## Environment variables

See [`.env.example`](./.env.example) for the annotated list. Key variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Prisma) |
| `JWT_SECRET` | Auth token signing secret (32+ chars) |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d` |
| `ENCRYPTION_KEY` | 64-hex-char AES-256-GCM key for at-rest encryption |
| `REDIS_URL` | BullMQ queue for check-in scheduling |
| `STELLAR_NETWORK` / `STELLAR_RPC_URL` | Soroban network endpoint |
| `HEIRLOOM_CONTRACT_ID` | Deployed `legacy` contract id (`C…`). If unset, on-chain endpoints return HTTP 503 — the API never fabricates transaction hashes |
| `R2_*` | Cloudflare R2 credentials for the encrypted archive. Uploads return 503 until set |
| `RESEND_API_KEY` / `EMAIL_FROM` | Transactional email. Invites and claim links are skipped (and logged) until set |
| `WEB_ORIGIN` | CORS origin for `heirloom-web` |
| `PORT` | HTTP port (default `4000`) |

> Security: never commit real secrets. `.env` is gitignored.

## API overview

All routes are mounted under `/api` and (except auth + health) require a JWT
via the `Authorization: Bearer <token>` header. Every mutation also records an
`ActivityLog` entry that powers the Family Timeline.

| Area | Routes |
|---|---|
| Health | `GET /api/health` |
| Auth | `POST /api/auth/wallet/challenge` · `POST /api/auth/wallet/verify` (Freighter sign-in) · wallet linking. Email/password `register`/`login` are preserved in the code but disabled. |
| Users | `GET /api/users/me` · `PATCH /api/users/me` |
| Beneficiaries | `GET/POST /api/beneficiaries` · `GET/PATCH/DELETE /api/beneficiaries/:id` |
| Guardians | `GET/POST /api/guardians` · `GET/PATCH/DELETE /api/guardians/:id` |
| Assets | `GET/POST /api/assets` · `GET/PATCH/DELETE /api/assets/:id` |
| Archive | `POST /api/archive` (multipart) · `GET /api/archive` · `GET /api/archive/:id/download` · `DELETE /api/archive/:id` |
| Messages | `GET/POST /api/messages` · `GET/PATCH/DELETE /api/messages/:id` |
| Legacy | `GET /api/legacy` · `GET /api/legacy/journey` · `GET /api/legacy/claims` · verification & claim orchestration |
| Activity | `GET /api/activity` · timeline/history for the Family Timeline |

Documents are encrypted with AES-256-GCM before storage; `GET
/api/archive/:id/download` decrypts and streams on the server so raw storage
URLs are never exposed.

## Project structure

```
src/
├── auth/            # Freighter wallet sign-in, JWT, wallet linking (email/password preserved but disabled)
├── users/           # profile, check-in preferences
├── beneficiaries/   # the people who matter most
├── guardians/       # trusted verifiers (threshold rules)
├── assets/          # protected Stellar assets
├── archive/         # encrypted document vault
├── messages/        # memory collection
├── legacy/          # Legacy Journey + claim orchestration
├── activity/        # Family Timeline feed
├── notifications/   # email notifications
├── scheduler/       # BullMQ Life Check-In jobs
├── stellar/         # Unsigned Soroban tx builder (503 until HEIRLOOM_CONTRACT_ID is set)
├── encryption/      # AES-256-GCM helpers
├── prisma/          # Prisma service/module
├── common/          # guards, decorators, filters
└── main.ts
prisma/
└── schema.prisma    # full data model
tests/               # jest suites
```

## Testing

```powershell
pnpm test          # unit tests
pnpm test:cov      # with coverage
```

## Deployment (Render)

Deploy after PostgreSQL and Redis are provisioned:

1. Provision a Render **PostgreSQL** instance and set `DATABASE_URL`.
2. Provision a Render **Redis** instance and set `REDIS_URL`.
3. Create a **Web Service** for this repo: build `pnpm install && pnpm build`,
   start `pnpm start:prod`.
4. Run `pnpm prisma:deploy` to apply migrations.

Deploy order for the whole platform: PostgreSQL → Redis → heirloom-api →
heirloom-web. The contract is deployed separately to Stellar via
`heirloom-contracts`.

## License

MIT
