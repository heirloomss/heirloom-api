# Security Policy

## Audit status

**Heirloom is unaudited.** This service and the wider Heirloom stack have not had
a third-party security review. It is intended for Stellar **testnet** use.

## Reporting a vulnerability

Report security issues **privately**. Do not open a public GitHub issue for
anything that exposes user data, credentials, or funds.

- Email: **chijiokejoseph2022@gmail.com**
- Telegram: **@cjay**

Include: the endpoint or module involved, a description of the issue, steps to
reproduce or a proof-of-concept, and the impact you foresee. You will get an
acknowledgement within **72 hours**. Please allow a reasonable window for a fix
before public disclosure. Reporters are credited on request.

## What this service holds

- Session auth (JWT), issued after a Freighter wallet-signature challenge.
- Personal data: names, relationships, contact emails for beneficiaries and
  guardians.
- **Encrypted** document and message payloads (AES-256-GCM). Ciphertext is
  stored in Cloudflare R2; the key lives only in `ENCRYPTION_KEY`.
- It **never** holds a Stellar signing key. Every on-chain state change is built
  as unsigned XDR and signed client-side in Freighter.

## In scope

- Authentication and session handling (`src/auth`, `src/common/guards`).
- Access-control gaps — any endpoint returning another user's data.
- Encryption handling (`src/encryption`), key exposure, IV reuse.
- Claim-token guessability / the public capsule endpoints (`src/legacy/claim*`).
- Injection, SSRF, and unsafe deserialization.

## Out of scope

- The smart contract — report in `heirloom-contracts`.
- Missing security headers with no demonstrated impact.
- Rate limiting on third-party test endpoints (public Soroban RPC, Resend test
  sender).
- Anything requiring a compromised server host or database.
