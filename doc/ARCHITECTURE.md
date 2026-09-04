# Architecture

## Backend — `apps/api` (NestJS)

Layered modular architecture. Each domain is a Nest module.

```
apps/api/src/
├── main.ts
├── app.module.ts
├── common/                  # cross-cutting concerns
│   ├── guards/              # auth guards
│   ├── interceptors/        # logging, transform, timeout
│   ├── filters/             # global exception filter
│   ├── pipes/               # validation
│   └── decorators/          # current-user, roles
├── config/                  # env validation (class-validator), typed ConfigService
├── health/                  # health module (liveness/readiness)
└── modules/
    └── <domain>/            # e.g. users, auth, orders
        ├── <domain>.module.ts
        ├── <domain>.controller.ts
        ├── <domain>.service.ts
        ├── <domain>.repository.ts     # data access only
        ├── dto/                       # request/response DTOs
        └── __tests__/
```

Rules:

- Controller → Service → Repository. No skipping layers.
- DTOs validated with class-validator + `ValidationPipe({ whitelist: true, transform: true })`.
- Swagger via `@nestjs/swagger`, DTOs annotated.
- Structured logging (pino), request-id correlation.
- Global hardening: helmet, env-driven CORS allowlist, `@nestjs/throttler` rate limits.
- Services own transactions; repositories accept a tx client (see Data Layer).

## Frontend — `apps/web` (Next.js App Router, feature-based)

```
apps/web/src/
├── app/                     # routes only — thin, delegates to features
│   ├── (auth)/login/page.tsx
│   ├── (dashboard)/layout.tsx
│   └── api/                 # route handlers / BFF proxy to NestJS
├── features/                # ★ feature-based core
│   └── <feature>/           # e.g. auth, users, billing
│       ├── index.ts         # public API (barrel) of the feature
│       ├── components/      # feature-scoped components
│       ├── hooks/
│       ├── api/             # fetchers, react-query keys & hooks
│       ├── schemas/         # zod schemas for API payloads
│       ├── types.ts
│       └── __tests__/
├── components/              # app-level shared components (Button, Modal…)
│   └── ui/                  # shadcn/ui primitives (Tailwind v4, theme tokens in styles/globals.css)
├── lib/                     # utilities, axios/fetch client, constants
├── providers/               # react-query, theme, auth providers
├── styles/                  # globals.css — Tailwind v4 + shadcn theme variables
└── types/                   # ambient/global types
```

Rules:

- A feature may not import from another feature's internals — only via its `index.ts`.
- `app/` contains routing, layouts, and page composition; business UI lives in `features/`.
- Server components by default; `"use client"` only where interactivity is needed.
- API access via feature-scoped react-query hooks; types come from `@monorepo/shared-types`.
- Cross-feature state goes through providers or URL state — never feature internals.
- Error handling: error boundaries per route group; toasts for mutations, inline errors for forms.
- Forms: react-hook-form + zod resolver; schemas live in `features/<f>/schemas/`.
- Accessibility: jsx-a11y lint rules enforced; interactive elements keyboard-navigable.

## Shared

- `packages/shared-types`: generated from the api's swagger schema (Phase 10); hand-authored DTO interfaces + zod schemas only until codegen lands.
- `packages/ui`: legacy design-system primitives — superseded by shadcn/ui + Tailwind v4 in `apps/web` (no longer consumed by the web app).
- `packages/tsconfig`: `base.json`, `nest.json`, `next.json` presets.
- `packages/eslint-config`: flat config presets `web`, `node`, `react-tests`.

## Security

- **Auth**: JWT access tokens (short-lived) + refresh-token rotation. The refresh token is stored in an httpOnly cookie and exchanged only through the web BFF (`app/api/*` route handlers proxying the api) so it never touches client JS.
- **RBAC**: roles guard + `@Roles()` decorator on the api; `middleware.ts` route protection on the web before rendering protected routes.
- **API hardening**: helmet, env-driven CORS allowlist, `@nestjs/throttler` rate limits, `ValidationPipe` whitelist.
- **Web hardening**: CSP and security headers via `next.config` `headers()`.
- **Secrets**: env vars only (never committed); CI uses GitHub Actions secrets. `.env.example` committed, `.env` ignored.

## Data Layer

- **ORM**: Prisma. Schema at `apps/api/prisma/schema.prisma`; migrations via `prisma migrate dev` (local) / `prisma migrate deploy` (CI/CD).
- **Local dev**: Postgres via root `docker-compose.yml`.
- **Transactions**: services own transaction boundaries (`prisma.$transaction`); repositories accept the tx client so they stay unit-of-work agnostic.
- **Conventions**: shared pagination/filter/sort DTOs in `common/`; list endpoints always paginate.

## Observability

- **Logging**: pino structured logs with request-id correlation on both apps.
- **Tracing**: OpenTelemetry (http instrumentation) on api and web; request-id propagated across the BFF hop.
- **Metrics**: `/metrics` Prometheus endpoint on the api.
- **Errors**: Sentry (or equivalent) with sourcemap upload wired into CI.

## API Contract & Codegen

- The Nest swagger schema is the single source of truth for shared types.
- `packages/shared-types` is **generated** from the swagger schema (e.g. openapi-typescript); a CI drift gate fails the build if generated types are stale.
- Web validates API payloads with zod schemas derived from the generated types.

## Environments & Config

| Env     | API URL                 | Deploy                | Notes                |
| ------- | ----------------------- | --------------------- | -------------------- |
| local   | `http://localhost:3001` | docker-compose        | seeded Postgres      |
| dev     | `https://api.dev.<org>` | auto from `main`      | ephemeral migrations |
| staging | `https://api.stg.<org>` | auto from release tag | prod parity          |
| prod    | `https://api.<org>`     | manual approval       | migration gate       |

- `.env.example` committed; `.env` git-ignored.
- API validates env at boot and fails fast.
- Web reads `NEXT_PUBLIC_API_URL` at build time via `lib/config.ts`.
