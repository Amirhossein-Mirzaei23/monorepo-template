# Architecture Review & Improvement Plan

Review date: 2026-08-28
Scope: `doc/` planning set + proposed repository structure (no code yet).

## Scoring

| Dimension                          | Score      | Notes                                                                                                   |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| Frontend structure (feature-based) | 8/10       | Solid boundaries and barrel rule; missing error/state/animation conventions                             |
| Backend structure (NestJS)         | 7/10       | Clean layering; no CQRS, transactions, or repository abstraction strategy defined                       |
| Enterprise readiness               | 6/10       | CI, lint, env validation planned; security, observability, migrations, i18n, a11y absent                |
| Agent friendliness                 | 8/10       | AGENTS.md, reference patterns, checklist; could add machine-readable manifests and codegen              |
| Scalability & ops                  | 5/10       | Docker + compose only planned as task 5.4; no environments/deploy/K8s strategy                          |
| Testing strategy                   | 6/10       | Unit/e2e named; coverage thresholds planned (task 5.3) but not defined per package; no contract testing |
| **Overall**                        | **6.7/10** | Good skeleton; needs depth in security, observability, data layer, ops                                  |

## Strengths (keep as-is)

1. Feature-based frontend with enforced public barrels — the single best decision for long-term maintainability.
2. Reference patterns (`users` module, `auth` feature) — planned as the canonical templates (tasks 2.6 / 3.5); folders scaffolded, code pending.
3. Shared `tsconfig` / `eslint-config` packages — consistency without duplication.
4. Fail-fast env validation, health endpoints, conventional commits, phased task backlog.

## Gaps & Improvement Plan

### Priority 1 — Security (blocks production)

- Add auth strategy section to ARCHITECTURE.md: JWT access/refresh rotation, refresh-token storage (httpOnly cookies via Next BFF), RBAC guard usage.
- Helmet, CORS allowlist, rate limiting (`@nestjs/throttler`) in API global setup.
- Web: CSP headers via `next.config` `headers()`, `middleware.ts` for route protection.
- Secrets: `.env` per app, never in root; document vault usage for CI (GitHub Actions secrets).
- Dependency auditing: `npm audit` + Dependabot/Renovate config.

### Priority 2 — Data layer

- Choose and document ORM (recommend Prisma) with migration workflow (`prisma migrate dev/deploy`) and a `docker-compose.yml` Postgres for local dev.
- Define transaction boundary rule: services own transactions, repositories stay unit-of-work agnostic.
- Pagination, filtering, and sorting DTO conventions.

### Priority 3 — Observability

- Structured logging with pino + request-id correlation (already planned — extend to web).
- OpenTelemetry tracing plan for api and web; /metrics endpoint (Prometheus).
- Error tracking slot (Sentry) with sourcemap upload in CI.

### Priority 4 — Frontend depth

- Error handling convention: error boundaries per route group, toast/inline pattern from `components/ui`.
- Loading & caching rules: react-query defaults (staleTime, retry), SSR vs client fetching decision table.
- Form strategy (react-hook-form + zod resolvers) documented once in CONVENTIONS.md.
- Design tokens contract between `packages/ui` and `apps/web/styles`.
- Accessibility gate: eslint-plugin-jsx-a11y in web config.

### Priority 5 — Ops & environments

- Multi-stage Dockerfiles, distroless runtime images.
- Define environments (local/dev/staging/prod) and config-per-environment table.
- Deployment targets (at least one documented option, e.g. ECS/Fly/Vercel) and release/versioning policy.

### Priority 6 — API contract & codegen

- Single source of truth for types: generate `packages/shared-types` from Nest swagger schema (or use ts-rest/tRPC-style contract) instead of hand-written duplication.
- Contract tests in CI: schema diff check to prevent breaking web builds.
- ⚠️ Note: this supersedes ARCHITECTURE.md's original hand-authored `shared-types` description. **Adopted 2026-08-28**: ARCHITECTURE.md and task 4.1 now describe the codegen approach; implementation remains pending (Phase 10).

### Priority 7 — Agent enablement extras

- Per-feature `README.md` template listing endpoints/props touched.
- `doc/TASKS.md` → consider machine-readable `tasks.json` if agents need structured state.
- Add a `feature` generator script (plop) so humans and agents scaffold identically.

## Revised Phase Additions (append to TASKS.md)

- **Phase 7 — Security hardening**: auth module, helmet/CORS/throttler, CSP, audit pipeline
- **Phase 8 — Data layer**: Prisma, migrations, seed, local Postgres compose
- **Phase 9 — Observability**: OTel, metrics, Sentry
- **Phase 10 — Codegen & generators**: swagger → shared-types, plop generators

## Verdict

The plan is a strong, opinionated skeleton (6.7/10) whose structure decisions are sound and should not be re-litigated. The gap is depth in production concerns. Completing Priorities 1–3 raises the design to ~8.5/10 enterprise-grade; Priorities 4–7 push agent-friendliness and DX further.

## Verification log (2026-08-28)

Claims cross-checked against PLAN.md, ARCHITECTURE.md, TASKS.md, CONVENTIONS.md, and the scaffolded structure. Corrections applied:

1. **Ops scorecard note** — said "beyond a compose file"; no compose file exists, Docker/compose is only _planned_ (task 5.4). Fixed.
2. **Testing scorecard note** — said "no coverage targets"; task 5.3 plans coverage thresholds. Corrected to "planned but not defined per package". Score unchanged (contract testing still absent).
3. **Strengths wording** — reference `users`/`auth` implementations are empty scaffolds; code is pending tasks 2.6/3.5. Reworded to "planned".
4. **Priority 6 conflict flagged** — swagger codegen contradicts ARCHITECTURE.md's hand-authored shared-types section; added an explicit note to update both docs together.

Verified as accurate: score math ((8+7+6+8+5+6)/6 = 6.7), pino/request-id claim, health-endpoint and env-validation claims, CI matrix claim, commit-convention claim, barrel/boundary rules description.
