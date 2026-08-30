# Deployment & Environments

## Environments

| Env     | API URL                 | Deploy                | Notes                |
| ------- | ----------------------- | --------------------- | -------------------- |
| local   | `http://localhost:3001` | docker-compose        | seeded Postgres      |
| dev     | `https://api.dev.<org>` | auto from `main`      | ephemeral migrations |
| staging | `https://api.stg.<org>` | auto from release tag | prod parity          |
| prod    | `https://api.<org>`     | manual approval       | migration gate       |

## Images

Multi-stage builds with distroless runtimes (task 5.4):

- `apps/api/Dockerfile` → `gcr.io/distroless/nodejs22-debian12`, runs `apps/api/dist/main.js`
- `apps/web/Dockerfile` → standalone Next output (`output: 'standalone'`), runs `apps/web/server.js`

Build from the repo root (context includes workspace manifests):

```bash
docker build -f apps/api/Dockerfile -t monorepo-api .
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t monorepo-web .
```

Full local stack: `docker compose --profile apps up --build`.

> Prisma note: the query engine needs `libssl`; the distroless debian12 base ships it.
> If you change the base image and see engine-load failures, fall back to `node:22-bookworm-slim`.

## Migrations

- Local: `npm run prisma:migrate -w @monorepo/api` (creates + applies dev migrations)
- CI/CD: `npm run prisma:deploy -w @monorepo/api` (`prisma migrate deploy` — applies committed
  migrations only; **never** runs in the request path)
- Gate: deploys wait for `migrate deploy` to succeed before switching traffic (see the
  commented `migration-gate` job in `.github/workflows/ci.yml` for a template)

## Release flow

1. `main` is always deployable; conventional commits keep the history greppable.
2. dev deploys automatically from `main`; staging from release tags (`v*`).
3. prod requires manual approval; the migration gate runs first.
4. Rollback = redeploy the previous image; Prisma migrations are forward-only —
   write them reversibly (expand/contract pattern) when dropping columns.

## Secrets & config

- Secrets live in env vars only; CI uses GitHub Actions secrets; `.env.example` files
  document every variable (api and web each own their `.env`, never at the root).
- The API validates env at boot and fails fast (`src/config/env.validation.ts`).
- The web BFF reads `API_URL` server-side; `NEXT_PUBLIC_API_URL` is baked at build time.

## CI (`.github/workflows/ci.yml`)

install → lint → typecheck → test → build → contract drift gate → `npm audit`, on a
node 20/22 matrix. The drift gate regenerates `packages/shared-types` and fails if the
committed types are stale.
