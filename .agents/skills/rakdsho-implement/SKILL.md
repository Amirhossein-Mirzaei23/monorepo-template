---
name: rakdsho-implement
description: Implements exactly one Rakdsho task card from doc/tech/tasks/ in this monorepo (NestJS API + Next.js web). Use whenever the user asks to implement, build, or execute a Rakdsho task — by ID ("implement AUTH-003", "do LOT-004", "task MKT-009 را انجام بده"), asks for the next Rakdsho task, or wants to continue the Rakdsho build. Enforces mobile-first commerce-app UI with WhatsApp-style negotiation chat, a minimal modern palette, a PostgreSQL relational spine (users → lots → conversations → offers → deals), layered REST APIs, TanStack Query for all frontend data fetching, and strict single-task scope (never other tasks, never other products).
---

# Rakdsho Task Implementation

Rakdsho (راکدشو) is a mobile-first B2B liquidation marketplace. The full plan lives in
`doc/tech/rakdsho-plan.md`; every feature is decomposed into task cards in `doc/tech/tasks/`.
This skill executes **exactly one card per session** — the cards are the unit of work.

## Scope guard — read before anything

- Implement ONLY the current card: its Goal, Backend/Frontend/Database work, API, Validation,
  Acceptance criteria, and DoD define the full allowed scope.
- If you discover work that belongs to a _different_ card (a missing endpoint, a schema field, a
  UI section another card owns), do NOT implement it. Note it in the session summary as a
  follow-up for that card and build the current card so it works without the missing piece
  (progressive enhancement is fine — cards are ordered that way on purpose).
- No drive-by refactors of unrelated code, no new dependencies unless the card names them
  (cards mark intentional `package-lock.json` changes), no features "while you're in there".
- This skill applies to this repository's Rakdsho plan only. Never generalize it to other
  projects, products, or task backlogs.
- One card = one conventional commit scope (`feat(<area>): <task-id> …`).

## Workflow

### 1. Resolve the task

- Argument is a task ID (e.g. `AUTH-003`, `lot-4`, `mkt-009`) → normalize to uppercase
  `AREA-NNN`.
- No ID given: propose the first unchecked task in the execution order in
  `doc/tech/tasks/README.md` (P0 first) and confirm with the user before implementing.
- Find the card: `grep -l "### <ID>" doc/tech/tasks/*.md`, then read the whole card.
- IDs ending in `-002` style with "(folded" or placeholder cards (P2 spikes) are not executable —
  say so and stop.

### 2. Read context (always)

- `AGENTS.md` and `doc/CONVENTIONS.md` (repo rules).
- The card's lines in `doc/tech/rakdsho-plan.md`: §3 domain model row, §11 API surface, §12 DB
  design — these are the contract; the card plus plan must agree, and the plan wins on conflicts
  (if they genuinely contradict, stop and report).
- The reference pattern implementations: `apps/api/src/modules/users` (every new module mirrors
  it) and `apps/web/src/features/auth` (every new feature mirrors it).

### 3. Verify dependencies are done

Every dependency listed in the card header must already exist in the codebase. Check the
artifact, not the checkbox: e.g. for `Deps: MEDIA-001` confirm `apps/api/src/modules/media/`
exists with the storage service; for a schema dep confirm the Prisma model is in
`apps/api/prisma/schema.prisma`. If a dependency is missing, STOP and report which card is
missing — do not implement around it.

### 4. Load the pattern references

Read these before writing code — they encode the product's non-negotiable style:

- Any UI work in the card (pages, components, forms, chat) → read `references/ui-patterns.md`.
- Any backend work (modules, endpoints, schema, jobs) → read `references/backend.md`.
- Any frontend data work (fetching, mutations, lists) → read `references/frontend-data.md`.

Most cards need two of the three.

### 5. Implement

- Scaffold with the generators, never by hand: `npm run gen:module` (api domains) and
  `npm run gen:feature` (web features). Register modules in `app.module.ts` yourself.
- Follow the card field by field: Backend → Database → API → Frontend → Validation → Error
  states → Permissions.
- Persian copy and RTL are the default, not an add-on (helpers in `apps/web/src/lib/format.ts`).
- Prisma schema changes: edit `schema.prisma`, create ONE migration for this task, keep it
  expand/contract.

### 6. Verify (all must pass)

```
npm run lint && npm run typecheck && npm run test
```

Plus, when the card touched API DTOs: `npm run gen:types` and commit the regenerated
`packages/shared-types` (CI's drift gate fails otherwise). Write the tests the card's
"Testing" field demands — service unit tests with `src/test/fakes/fake-prisma.ts`, controller
e2e with `src/test/utils/create-test-app.ts`, component tests for new web features.

### 7. Close out

- Mark the card done: in its area file change the heading `### <ID> — Title` to
  `### <ID> ✅ — Title`, and prefix the README.md task-table row title with `✅ `.
- Session summary must state: what was built, verification results, follow-ups belonging to
  other cards (from the scope guard), and the next task in execution order.

## Non-negotiables (the product's shape)

| Dimension     | Rule                                                                                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI feel       | Modern commerce app + WhatsApp-style negotiation — never a classifieds/directory website. See `references/ui-patterns.md`.                                                                   |
| Palette       | Minimal modern: one brand accent + zinc neutrals + semantic states, set once in `styles/globals.css` tokens. No gradients, no extra color families.                                          |
| Data spine    | PostgreSQL + Prisma relational model centered on `users → lots → conversations → offers → deals` with explicit FKs and lifecycle enums. No Elasticsearch/Redis/microservices/wallet/auction. |
| API           | Layered REST: thin controller → service (business rules + transactions) → repository (data access only). Validated DTOs, paginated lists, swagger-annotated, `gen:types` after changes.      |
| Frontend data | ALL server state through feature-scoped TanStack Query hooks — no `useEffect` fetching, no ad-hoc fetch calls in components.                                                                 |
| Scope         | One card per session; no extensions into other tasks or products.                                                                                                                            |
