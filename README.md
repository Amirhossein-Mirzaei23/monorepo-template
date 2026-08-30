# monorepo-template

npm-workspaces monorepo with a **NestJS API**, a **feature-based Next.js web app**, and
**shared packages** — designed to be enterprise-friendly (tooling, CI, conventions,
governance) and agent-friendly (predictable structure, explicit docs, task backlog).

- Architecture: [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md)
- Structure: [doc/STRUCTURE.md](doc/STRUCTURE.md)
- Conventions: [doc/CONVENTIONS.md](doc/CONVENTIONS.md)
- Task backlog: [doc/TASKS.md](doc/TASKS.md)
- Contributing: [doc/CONTRIBUTING.md](doc/CONTRIBUTING.md)
- Deployment: [doc/DEPLOYMENT.md](doc/DEPLOYMENT.md)
- Agent guide: [doc/AGENT-GUIDE.md](doc/AGENT-GUIDE.md)

## Quickstart

```bash
nvm use                 # node 22 (see .nvmrc)
npm ci                  # installs all workspaces, generates the prisma client
npm run docker:up       # local Postgres (docker-compose)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

npm run prisma:migrate -w @monorepo/api   # create schema
npm run db:seed -w @monorepo/api          # admin@monorepo.local / admin-password-123

npm run dev             # api on :3001 (swagger at /docs), web on :3000
```

Sign in at http://localhost:3000/login with the seeded admin account.

## Scripts (root)

| Script                              | What it does                                                   |
| ----------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                       | Run api + web concurrently                                     |
| `npm run build`                     | Build all workspaces (dependency order)                        |
| `npm run lint`                      | ESLint per workspace (shared flat configs)                     |
| `npm run typecheck`                 | `tsc --noEmit` per workspace                                   |
| `npm run test` / `test:cov`         | Jest per workspace (coverage thresholds enforced)              |
| `npm run format` / `format:check`   | Prettier                                                       |
| `npm run gen:types`                 | Regenerate `packages/shared-types` from the API swagger schema |
| `npm run gen:module`                | Scaffold an API domain module (plop)                           |
| `npm run gen:feature`               | Scaffold a web feature (plop)                                  |
| `npm run docker:up` / `docker:down` | Local Postgres lifecycle                                       |

## Structure

```
apps/
  api/        NestJS — controller → service → repository, Prisma, JWT + refresh rotation
  web/        Next.js App Router — feature-based (features/<f> owns UI/hooks/api/schemas)
packages/
  shared-types/   API contract: types + zod generated from the swagger schema
  ui/             Design-system primitives + tokens
  eslint-config/  Shared ESLint flat configs (web / node / react-tests)
  tsconfig/       Shared tsconfig presets (base / nest / next)
doc/          Single source of truth for architecture, conventions, tasks
.github/      CI (lint → typecheck → test → build, drift gate, audit) + Dependabot
```

## Reference patterns

New backend domains mirror `apps/api/src/modules/users`; new frontend features mirror
`apps/web/src/features/auth` (or use the plop generators above). Agents: read
[AGENTS.md](AGENTS.md) first.
