# apps/api — NestJS Backend

Layered modular NestJS app. See `../../doc/ARCHITECTURE.md`.

## Structure

- `src/common/` — guards (JWT, RBAC), interceptors (metrics logging, timeout), filters, pipes, shared pagination DTOs
- `src/config/` — env validation (fail-fast) + typed config
- `src/health/` — `/health/live`, `/health/ready`
- `src/metrics/` — `/metrics` (Prometheus)
- `src/prisma/` — PrismaService (lazy connect)
- `src/modules/<domain>/` — controller → service → repository; reference: `src/modules/users`
- `src/modules/auth/` — JWT access + refresh rotation (httpOnly cookie), RBAC decorators/guards
- `prisma/` — schema + seed (`npm run db:seed`)

## Scripts

| Script                                     | What it does                                  |
| ------------------------------------------ | --------------------------------------------- |
| `npm run dev`                              | watch mode on :3001                           |
| `npm run prisma:migrate` / `prisma:deploy` | dev / production migrations                   |
| `npm run db:seed`                          | seed admin + sample buyer/seller (idempotent) |
| `npm run gen:openapi`                      | dump swagger JSON for `packages/shared-types` |
| `npm test` / `test:cov`                    | Jest (unit + e2e, no DB needed — FakePrisma)  |

Swagger UI: http://localhost:3001/docs — the schema is the contract source of truth.

Rules: DTOs validated with class-validator (`whitelist`, `forbidNonWhitelisted`);
services own transactions and hand the tx client to repositories; every response
error uses the uniform filter shape with a request id.

## Auth

Public identity is **phone + OTP** (login-or-register — no registration endpoint):

1. `POST /auth/otp/request` with `{ "phone": "09120000001" }` — sends a 6-digit SMS code.
   Per-phone send caps (3/hour, 5/day) plus a stricter route throttle (5/min/IP).
2. `POST /auth/otp/verify` with `{ "phone": "09120000001", "code": "123456" }` — verifies the
   single-use code, creates the account on first login, and returns the standard session
   (access token + httpOnly refresh cookie) with an `onboardingCompleted` routing flag.

`POST /auth/login` (email + password) is the retained **admin-only** path — non-admin accounts
are rejected with 403; regular users have no password at all. `POST /auth/refresh` /
`POST /auth/logout` / `GET /auth/me` are unchanged.

### Dev OTP mode

With `OTP_DEV_MODE=true` in `.env`, the API skips SMS delivery and the `/auth/otp/request`
response carries the code as `devCode` (codes are never logged). The API **refuses to boot**
when `OTP_DEV_MODE=true` meets `NODE_ENV=production`. Other OTP knobs (`OTP_TTL_MS`,
`OTP_MAX_ATTEMPTS`, `OTP_SEND_HOURLY`, `OTP_SEND_DAILY`) are documented in `.env.example`.

### Seeded accounts

`npm run db:seed` upserts by phone — idempotent, safe to re-run (it also strips the legacy
email/password from the sample buyer on databases seeded before the phone switch):

| Phone       | Role  | accountRoles | Login                                                        |
| ----------- | ----- | ------------ | ------------------------------------------------------------ |
| 09120000000 | ADMIN | —            | email `admin@monorepo.local` + password `admin-password-123` |
| 09120000001 | USER  | BUYER        | phone OTP (enable `OTP_DEV_MODE=true` locally)               |
| 09120000002 | USER  | SELLER       | phone OTP (enable `OTP_DEV_MODE=true` locally)               |
