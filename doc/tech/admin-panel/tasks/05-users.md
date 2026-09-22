# Task 05 — Safe Admin User Management

**Phase:** B — Existing operational surfaces  
**Objective:** Replace the generic CRUD surface with safe operational account management and a usable search/detail UI.

## Critical current gap

`DELETE /users/:id` currently hard-deletes and `PATCH /users/:id` can change role/password generically. Do not expose those actions unchanged.

## Files

- Modify: `apps/api/src/modules/users/` DTO/service/repository/controller/tests
- Add or migrate to: `/admin/users` controller paths
- Modify: Prisma only if a suspension/block reason or actor stamp is required
- Create: `apps/web/src/app/api/admin/users/**`
- Create: `apps/web/src/app/(admin)/admin/users/page.tsx` and `[id]/page.tsx`
- Create: admin users API/hooks/schemas/components/tests

## Required API behavior

- Paginated search by phone, name, email, business name; filters for role, accountRole, status, onboarding state.
- Detail: allowlisted user, profile summary, lot/deal/report counts; no password hashes or refresh tokens.
- Explicit actions: status transition, role transition, revoke sessions.
- Soft delete uses `DELETED` and `deletedAt`; suspension/block revokes active refresh sessions.
- Self-action and last-active-admin guards.
- Reason required for suspend/block/delete and written to audit.

## Steps (TDD)

1. Write failing state-transition/self-action/last-admin tests before changing DTOs.
2. Replace hard-delete operational behavior with explicit status transitions in one transaction with session revocation and audit.
3. Split role/status/session actions into narrow DTOs; stop accepting password changes through generic admin update.
4. Expand repository search using deterministic pagination; join only bounded summaries.
5. Add admin endpoints, Swagger schemas, role e2e tests, and generate types.
6. Build filterable URL-driven table/card layout and detail page with confirmation/reason dialogs.
7. Add component tests for 409 guard errors, optimistic-disabled actions, and cache invalidation.

## Verification

```bash
npm test -w @monorepo/api -- --runInBand src/modules/users
npm test -w @monorepo/web -- --runInBand src/features/admin
npm run gen:types
```

## Completion checklist

- [x] No UI path performs hard delete.
- [x] Self and last-admin protections pass.
- [x] Suspension/block prevents refresh and revokes sessions.
- [x] Every mutation is audited with reason.
- [x] Search/filter/pagination are linkable and deterministic.
