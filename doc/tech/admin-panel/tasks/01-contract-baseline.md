# Task 01 — Contract Baseline and Admin Acceptance Matrix

**Phase:** A — Secure foundation  
**Objective:** Freeze a truthful admin contract baseline from live Swagger and repository behavior before new endpoints or UI are built.

## Prerequisites

- Read `doc/ARCHITECTURE.md`, `doc/CONVENTIONS.md`, [ROADMAP_REFERENCE.md](../ROADMAP_REFERENCE.md), and `doc/tech/tasks/trust-admin.md`.
- API and PostgreSQL are running.

## Files

- Create: `doc/tech/admin-panel/ADMIN_CONTRACT.md`
- Create: `apps/api/src/test/admin-permissions.e2e-spec.ts`
- Modify if needed: Swagger decorators on controllers whose documented security differs from runtime behavior
- Test: existing auth/users/categories controller e2e specs

## Steps (TDD)

1. Write a parameterized e2e permission test for every currently privileged operation: anonymous→401, normal USER→403, ADMIN→success/non-auth business result.
2. Run the focused test and observe missing matrix coverage or documentation mismatches.
3. Export `GET /docs-json` and record method/path, auth, DTO, response, and current implementation status in `ADMIN_CONTRACT.md`; do not commit generated temporary JSON.
4. Correct only inaccurate Swagger annotations needed to make the baseline truthful. Note that runtime `@Public()` overrides class-level bearer documentation.
5. Decide and document the `/users`→`/admin/users` migration strategy and the open decisions listed in the shared reference.
6. Run `npm run gen:types` if decorators/DTO exposure changed.

## Verification

```bash
npm test -w @monorepo/api -- --runInBand src/test/admin-permissions.e2e-spec.ts
npm run gen:types
npm run typecheck -w @monorepo/api
npm run typecheck -w @monorepo/web
```

Expected: the matrix proves API guards rather than trusting OpenAPI metadata; the contract document lists implemented, missing, and proposed admin capabilities.

## Completion checklist

- [x] All existing privileged endpoints appear in the matrix.
- [x] Public-vs-auth Swagger discrepancies are documented or fixed.
- [x] Endpoint migration decisions are explicit.
- [x] Generated contracts are clean.
