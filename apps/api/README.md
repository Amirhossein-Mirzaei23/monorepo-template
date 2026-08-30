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
| `npm run db:seed`                          | seed admin + demo user                        |
| `npm run gen:openapi`                      | dump swagger JSON for `packages/shared-types` |
| `npm test` / `test:cov`                    | Jest (unit + e2e, no DB needed — FakePrisma)  |

Swagger UI: http://localhost:3001/docs — the schema is the contract source of truth.

Rules: DTOs validated with class-validator (`whitelist`, `forbidNonWhitelisted`);
services own transactions and hand the tx client to repositories; every response
error uses the uniform filter shape with a request id.
