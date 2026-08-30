# Agent Instructions

- Monorepo: `apps/api` (NestJS), `apps/web` (Next.js, feature-based), `packages/*`
- Before coding: read `doc/ARCHITECTURE.md` and `doc/CONVENTIONS.md`
- Task backlog: `doc/TASKS.md` (one task per session, check off when done)
- Reference patterns: `apps/api/src/modules/users`, `apps/web/src/features/auth`
- Prefer generators (`npm run gen:module`, `gen:feature`) once Phase 10 lands; never hand-edit generated `packages/shared-types`
- Verify before finishing: `npm run lint && npm run typecheck && npm run test`
- Do not create new top-level folders; do not modify package-lock.json unless dependencies change intentionally
