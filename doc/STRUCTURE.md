# Repository Structure

Map of the monorepo: what lives where, and where new code goes.
Layer rules and boundaries: [ARCHITECTURE.md](ARCHITECTURE.md). Naming and code style: [CONVENTIONS.md](CONVENTIONS.md).

npm workspaces; node >= 20 (`.nvmrc` pins the dev version). No new top-level folders.

## Top level

```
.
├── apps/                    # deployable applications (see below)
├── packages/                # shared libraries consumed by apps (see below)
├── doc/                     # single source of truth for docs (this file lives here)
├── scripts/                 # plop generators + templates (gen:module, gen:feature)
├── .github/
│   ├── workflows/ci.yml     # lint → typecheck → test → build, drift gate, audit
│   └── dependabot.yml       # npm + github-actions updates
├── .husky/                  # git hooks: pre-commit (lint-staged), commit-msg (commitlint)
├── docker-compose.yml       # local Postgres (npm run docker:up)
├── package.json             # workspaces: apps/*, packages/* + root scripts
├── eslint.config.mjs        # re-exports @monorepo/eslint-config
├── commitlint.config.mjs    # conventional commits
├── .prettierrc.json / .prettierignore
├── .lintstagedrc.json
├── .editorconfig / .nvmrc / .env.example
├── .gitignore / .dockerignore
├── AGENTS.md                # instructions for coding agents
└── README.md
```

## Workspaces

| Workspace                 | Path                     | Purpose                                                                               |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------------- |
| `@monorepo/api`           | `apps/api`               | NestJS 11 REST API: controller → service → repository, Prisma, JWT + refresh rotation |
| `@monorepo/web`           | `apps/web`               | Next.js 16 App Router SPA-ish frontend, feature-based structure                       |
| `@monorepo/shared-types`  | `packages/shared-types`  | API contract: TS types + zod schemas generated from the swagger schema                |
| `@monorepo/ui`            | `packages/ui`            | Design-system primitives (Button, Input, Dialog) + design tokens                      |
| `@monorepo/eslint-config` | `packages/eslint-config` | Shared ESLint flat configs: `base`, `node`, `web`, `react-tests`                      |
| `@monorepo/tsconfig`      | `packages/tsconfig`      | Shared tsconfig presets: `base.json`, `nest.json`, `next.json`                        |

Dependency direction: `apps/*` → `packages/*`; packages never depend on apps.

## `apps/api` (NestJS)

```
apps/api/
├── Dockerfile               # multi-stage, distroless runtime
├── .env.example
├── nest-cli.json / jest.config.js / eslint.config.mjs
├── tsconfig.json / tsconfig.build.json
├── prisma/
│   ├── schema.prisma        # DB schema (source of truth for migrations)
│   └── seed.ts              # local dev seed (npm run db:seed -w @monorepo/api)
└── src/
    ├── main.ts              # bootstrap: helmet, CORS, pipes, swagger at /docs
    ├── app.module.ts        # root module — registers all modules
    ├── instrumentation.ts   # OpenTelemetry entrypoint
    ├── swagger.ts           # swagger setup shared by server + dump script
    ├── common/              # cross-cutting primitives, no business logic
    │   ├── decorators/      # @CurrentUser(), @Public(), @Roles()
    │   ├── dto/             # shared pagination-query DTO
    │   ├── filters/         # global http-exception filter
    │   ├── guards/          # jwt-auth, roles
    │   ├── interceptors/    # logging, timeout
    │   └── pipes/           # validation
    ├── config/              # env validation (fail-fast) + typed configuration
    ├── health/              # /health/live, /health/ready
    ├── metrics/             # /metrics Prometheus endpoint
    ├── modules/             # ★ domain modules live here
    │   ├── auth/            # login/register, token.service (refresh rotation)
    │   └── users/           # reference domain — mirror this for new modules
    ├── prisma/              # PrismaService (global Prisma module)
    ├── scripts/             # dump-swagger.ts (feeds gen:types), env-defaults.ts
    └── test/                # shared test helpers: create-test-app, fake-prisma, set-env
```

Each `modules/<domain>/` contains: `<domain>.module.ts`, controller, service, repository, `dto/`, `__tests__/` (service unit + controller e2e).

## `apps/web` (Next.js)

```
apps/web/
├── Dockerfile / .env.example
├── next.config.ts           # security headers via headers()
├── jest.config.mjs / jest.setup.ts / eslint.config.mjs
├── tsconfig.json
├── public/                  # static assets (robots.txt)
└── src/
    ├── app/                 # routes only — thin, delegates to features
    │   ├── layout.tsx       # root layout (providers)
    │   ├── (auth)/          # auth route group: layout, error boundary, login/page
    │   ├── (dashboard)/     # dashboard route group: layout, error boundary, page
    │   └── api/auth/        # BFF route handlers: login, logout, me, refresh
    ├── features/            # ★ feature-based core
    │   └── auth/            # reference feature — mirror this for new features
    │       ├── index.ts     # public API (barrel); cross-feature imports only via this
    │       ├── components/  # login-form
    │       ├── hooks/       # use-login, use-me (react-query)
    │       ├── api/         # auth-api fetchers + query keys
    │       ├── schemas/     # zod schemas (login-schema)
    │       ├── types.ts
    │       └── __tests__/
    ├── components/          # app-level shared components
    │   ├── auth-header.tsx
    │   └── ui/              # wraps @monorepo/ui, app-themed (button, input, toast)
    ├── lib/                 # api-client (typed ApiError), bff helpers, config, logger, utils
    ├── providers/           # providers.tsx root + auth, query, theme providers
    ├── styles/              # globals.css (token contract with @monorepo/ui)
    ├── types/               # ambient types (env.d.ts)
    ├── middleware.ts        # route protection before rendering
    └── instrumentation.ts   # OpenTelemetry entrypoint
```

## `packages/*`

```
packages/
├── shared-types/
│   ├── openapi.json             # swagger snapshot the generator reads
│   ├── scripts/generate.mjs     # openapi-typescript generation (npm run gen:types)
│   └── src/
│       ├── generated/           # ★ generated — never hand-edit (schema.d.ts, schema.zod.ts)
│       ├── index.ts             # public exports
│       └── __tests__/
├── ui/
│   ├── tokens.css / ui.css      # design tokens + primitive styles
│   └── src/
│       ├── components/          # button, dialog, input
│       ├── index.ts
│       └── __tests__/
├── eslint-config/               # base.js, node.js, web.js, react-tests.js
└── tsconfig/                    # base.json, nest.json, next.json
```

## `scripts/` (generators)

```
scripts/
├── plopfile.mjs            # gen:module / gen:feature entrypoints
└── templates/
    ├── module/             # NestJS domain module template set
    └── feature/            # web feature template set
```

## Where does new code go?

| Adding                         | Location                                                                    | How                   |
| ------------------------------ | --------------------------------------------------------------------------- | --------------------- |
| API domain (orders, billing…)  | `apps/api/src/modules/<domain>/`                                            | `npm run gen:module`  |
| Web feature                    | `apps/web/src/features/<feature>/`                                          | `npm run gen:feature` |
| Cross-cutting API concern      | `apps/api/src/common/<guards                                                | interceptors          | filters | pipes | decorators>/` | manual |
| App-level shared web component | `apps/web/src/components/` (or `components/ui/` if wrapping `@monorepo/ui`) | manual                |
| Design-system primitive        | `packages/ui/src/components/`                                               | manual                |
| API contract change            | `apps/api` DTOs → regenerate `shared-types`                                 | `npm run gen:types`   |
| DB schema change               | `apps/api/prisma/schema.prisma`                                             | `prisma migrate dev`  |
| Documentation                  | `doc/`                                                                      | manual                |

## Do-not-touch (generated or managed)

- `packages/shared-types/src/generated/` and `openapi.json` — regenerate with `npm run gen:types`.
- `apps/web/next-env.d.ts`, `tsconfig.tsbuildinfo` — tool-generated.
- `.husky/_/` — husky internals; edit hooks in `.husky/` only.
- `package-lock.json` — only via intentional dependency changes.

## Keeping this doc accurate

This file describes the tree as committed. When structure changes (new module, feature,
package, or top-level tooling), update the relevant tree here in the same PR.
