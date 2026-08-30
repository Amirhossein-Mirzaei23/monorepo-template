# Agent Guide

Principles that make this repo work well with AI coding agents (Codex, Claude Code, ZCode, Cursor…).

## Repository affordances

- `AGENTS.md` at repo root — canonical entry point; agents must read it first.
- `doc/ARCHITECTURE.md` — where things live and why.
- `doc/TASKS.md` — machine-readable checklist (`- [ ]`) for incremental work.
- Reference implementations: `apps/api/src/modules/users` (backend pattern) and `apps/web/src/features/auth` (frontend pattern). Agents copy these patterns for new domains/features.
- Deterministic naming and barrel boundaries make retrieval and edits predictable.

## Rules for agents

1. Read `AGENTS.md`, then the `doc/` page relevant to the app you touch.
2. One task from `TASKS.md` per session; check it off when done.
3. Never create top-level folders; extend existing structure.
4. New backend domain → mirror `users` module. New frontend feature → mirror `auth` feature with a public `index.ts`. Once Phase 10 lands, use `npm run gen:module` / `gen:feature` instead of copying manually.
5. Never hand-edit generated files (`packages/shared-types` output after Phase 10) — change the swagger source and regenerate.
6. Keep changes compiling: run `npm run lint && npm run typecheck && npm run test` before finishing.
7. Update `doc/TASKS.md` and affected READMEs in the same change.

## Suggested AGENTS.md content (root)

```md
# Agent Instructions

- Monorepo: apps/api (NestJS), apps/web (Next.js feature-based), packages/*
- Before coding: read doc/ARCHITECTURE.md and doc/CONVENTIONS.md
- Patterns: apps/api/src/modules/users, apps/web/src/features/auth
- Verify with: npm run lint && npm run typecheck && npm run test
- Do not modify package-lock.json unless dependencies change intentionally
```
