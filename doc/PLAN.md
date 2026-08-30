# Monorepo Template — Master Plan

NPM workspaces monorepo with a NestJS API and a Next.js web app, designed to be
enterprise-friendly (tooling, CI, conventions, governance) and agent-friendly
(predictable structure, explicit docs, machine-readable metadata).

## Goals

1. **Single source of truth** for architecture, conventions, and tasks (this `doc/` directory).
2. **Feature-based frontend** — each business feature owns its components, hooks, API layer, and tests.
3. **Enterprise-ready defaults** — TypeScript strict mode, lint/format, commit conventions, CI pipeline, env validation, health checks, structured logging.
4. **Agent-friendly** — `AGENTS.md` at root, per-package READMEs, deterministic naming, task list in `doc/TASKS.md`.

## Tech Stack

| Concern         | Choice                                           |
| --------------- | ------------------------------------------------ |
| Package manager | npm (workspaces)                                 |
| Backend         | NestJS 10+ (modular, DI, layered)                |
| Frontend        | Next.js 14+ (App Router)                         |
| Language        | TypeScript 5 (strict)                            |
| Validation      | class-validator / zod (shared DTO package)       |
| Lint / format   | ESLint + Prettier (shared config package)        |
| Tests           | Jest (per package)                               |
| CI              | GitHub Actions (lint → typecheck → test → build) |

## Repository Layout

```
monorepo-template/
├── doc/                     # planning & architecture documents
├── apps/
│   ├── api/                 # NestJS backend (Prisma schema at api/prisma/)
│   └── web/                 # Next.js frontend (feature-based)
├── packages/
│   ├── shared-types/        # generated from api swagger schema (Phase 10)
│   ├── ui/                  # shared design-system components
│   ├── eslint-config/       # shared lint rules
│   └── tsconfig/            # shared tsconfig bases
├── .github/workflows/       # CI pipelines (+ dependabot.yml)
├── docker-compose.yml       # local Postgres + apps
├── AGENTS.md                # instructions for AI coding agents
└── package.json             # workspace root (scripts only, no deps)
```

## Phases (high level — details in TASKS.md)

1. **Phase 0 — Planning** (this document set)
2. **Phase 1 — Workspace bootstrap**: root package.json, workspaces, tooling configs
3. **Phase 2 — NestJS API**: module skeleton, health check, config validation, swagger
4. **Phase 3 — Next.js web**: App Router shell, feature-based structure, design tokens
5. **Phase 4 — Shared packages**: types, UI kit, configs
6. **Phase 5 — Quality gates**: CI, husky hooks, commit lint, coverage thresholds
7. **Phase 6 — Docs & agent enablement**: READMEs, AGENTS.md, contribution guide
8. **Phase 7 — Security hardening**: JWT + refresh rotation via web BFF, RBAC, helmet/CORS/throttler, CSP, dependency auditing
9. **Phase 8 — Data layer**: Prisma, migrations, seed, local Postgres, transaction rules
10. **Phase 9 — Observability**: OpenTelemetry, metrics, Sentry, cross-app logging
11. **Phase 10 — Contract codegen & generators**: swagger → shared-types with CI drift gate, plop scaffolders

Phases 1–6 deliver a working skeleton; 7–10 raise it to enterprise grade (see doc/REVIEW-IMPROVEMENTS.md).

## Key Decisions

- **npm workspaces** over Turborepo/Nx: zero extra infra, adequate for this scale; can migrate later.
- **Feature-based frontend** over type-based (no giant `components/`, `hooks/` buckets).
- **Barrel files (`index.ts`) at feature boundaries only**, not deep inside features, to keep tree-shaking and navigation simple for agents and humans.
- **No business logic in root** — root package.json contains scripts and devDeps only.
- **Prisma** as ORM with `migrate deploy` in CI; services own transactions, repositories stay unit-of-work agnostic.
- **Auth via JWT access + refresh rotation**, refresh token confined to an httpOnly cookie exchanged through the web BFF so it never reaches client JS.
- **Swagger schema is the contract**: `shared-types` is generated from it (never hand-duplicated) with a CI drift gate.
- **Multi-stage distroless Docker images**; local dev on docker-compose Postgres.
- **Dependabot** for dependency updates; conventional commits + PR checklist for governance.
