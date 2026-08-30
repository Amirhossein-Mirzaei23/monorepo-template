# Task List

Ordered, incremental tasks. Check off as completed. Each task is small enough for one PR / one agent session.

## Phase 1 — Workspace bootstrap

- [ ] 1.1 Create root `package.json` with npm workspaces (`apps/*`, `packages/*`) and scripts: `dev`, `build`, `lint`, `format`, `typecheck`, `test`, `test:cov`
- [ ] 1.2 Add `packages/tsconfig` presets (base / nest / next)
- [ ] 1.3 Add `packages/eslint-config` shared flat configs
- [ ] 1.4 Add root `.gitignore`, `.editorconfig`, `.nvmrc`, `.env.example`, Prettier config
- [ ] 1.5 `git init`, initial commit

## Phase 2 — NestJS API (`apps/api`)

- [ ] 2.1 Scaffold Nest app with strict TS
- [ ] 2.2 Env config module with class-validator validation (fail-fast)
- [ ] 2.3 Global setup: ValidationPipe, exception filter, logging interceptor, request-id
- [ ] 2.4 Health module (`/health/live`, `/health/ready`)
- [ ] 2.5 Swagger setup at `/docs`
- [ ] 2.6 Example domain module (`users`) as the reference pattern (controller/service/repository/dto/tests)
- [ ] 2.7 Jest config + first tests

## Phase 3 — Next.js web (`apps/web`)

- [ ] 3.1 Scaffold Next app (App Router, TS strict, no default boilerplate)
- [ ] 3.2 Set up feature-based folder skeleton (`features/`, `components/ui/`, `lib/`, `providers/`)
- [ ] 3.3 Providers: react-query, theme
- [ ] 3.4 API client in `lib/` with base URL from env + typed error handling
- [ ] 3.5 Example feature (`auth`) as reference: components, hooks, api, schemas, barrel `index.ts`
- [ ] 3.6 Route group layouts: `(auth)`, `(dashboard)`
- [ ] 3.7 ESLint bound to shared config; strict `import` boundaries rule (features can't import feature internals)
- [ ] 3.8 Error handling: error boundaries per route group + toast/inline pattern from `components/ui`
- [ ] 3.9 React-query defaults (staleTime, retry) + SSR vs client fetching decision table in `doc/CONVENTIONS.md`
- [ ] 3.10 Forms: react-hook-form + zod resolver pattern documented and applied in `auth` feature
- [ ] 3.11 Accessibility: eslint-plugin-jsx-a11y enabled in web eslint config

## Phase 4 — Shared packages

- [ ] 4.1 `packages/shared-types`: DTOs + zod schemas consumed by api & web (hand-authored initially; superseded by Phase 10 codegen)
- [ ] 4.2 `packages/ui`: primitives + tokens

## Phase 5 — Quality gates

- [ ] 5.1 GitHub Actions CI: install → lint → typecheck → test → build (matrix node 20/22)
- [ ] 5.2 Husky: pre-commit lint-staged, commit-msg commitlint (conventional commits)
- [ ] 5.3 Coverage thresholds enforced (define per-package targets)
- [ ] 5.4 Multi-stage Dockerfiles for api and web (distroless runtime); root `docker-compose.yml` with Postgres for local dev
- [ ] 5.5 Dependabot config (npm + github-actions)
- [ ] 5.6 Environments table (local/dev/staging/prod) + deploy strategy doc in `doc/`

## Phase 6 — Docs & agent enablement

- [ ] 6.1 Root README (quickstart, scripts, structure)
- [ ] 6.2 `AGENTS.md` (see AGENT-GUIDE.md)
- [ ] 6.3 `doc/CONTRIBUTING.md`: branch naming, PR checklist
- [ ] 6.4 Per-app READMEs

## Phase 7 — Security hardening

- [ ] 7.1 Auth module: JWT access (short-lived) + refresh rotation; refresh token stored in httpOnly cookie, exchanged via web BFF route handler
- [ ] 7.2 RBAC: roles guard + `@Roles()` decorator on api; `middleware.ts` route protection on web
- [ ] 7.3 API hardening: helmet, env-driven CORS allowlist, `@nestjs/throttler` rate limits
- [ ] 7.4 Web hardening: CSP + security headers via `next.config` `headers()`
- [ ] 7.5 Dependency auditing: `npm audit` gate in CI + Dependabot alerts

## Phase 8 — Data layer

- [ ] 8.1 Prisma setup (`apps/api/prisma/schema.prisma`) with `users` reference domain
- [ ] 8.2 Migration workflow (`prisma migrate dev`/`deploy`) documented; local Postgres via docker-compose
- [ ] 8.3 Seed script for local dev
- [ ] 8.4 Transaction rule enforced: services own transactions, repositories accept a tx client
- [ ] 8.5 Shared pagination/filter/sort DTO conventions in `common/`

## Phase 9 — Observability

- [ ] 9.1 OpenTelemetry tracing (api + web) with request-id propagation
- [ ] 9.2 `/metrics` Prometheus endpoint on api
- [ ] 9.3 Sentry integration + sourcemap upload in CI
- [ ] 9.4 pino structured logging on web route handlers/BFF

## Phase 10 — Contract codegen & generators

- [ ] 10.1 Generate `packages/shared-types` from Nest swagger schema (replaces hand-authored types)
- [ ] 10.2 CI drift gate: fail if generated types are out of sync with api schema
- [ ] 10.3 Plop generators: `gen:feature` (web) and `gen:module` (api) for identical human/agent scaffolding
