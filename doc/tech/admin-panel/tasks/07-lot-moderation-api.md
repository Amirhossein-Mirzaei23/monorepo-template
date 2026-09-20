# Task 07 — Lot Moderation API

**Phase:** C — Marketplace trust operations  
**Objective:** Add explicit, audited admin reads and transitions for submitted and live lots.

## Files

- Create: `apps/api/src/modules/lots/lots-admin.controller.ts`
- Add admin moderation methods/DTOs to lots service/repository, preserving controller→service→repository
- Modify: lots module wiring and tests
- Reuse: media/category/profile repositories only through defined interfaces
- Generate: shared contract types

## Required endpoints

- `GET /admin/lots` filters: status, sellerId/phone/business, category, city, date range, hasMedia, hasReports; default pending oldest-first.
- `GET /admin/lots/:id`: owner/private moderation DTO with all media, seller summary, category path, counters, reports summary; exact address shown only if policy approves and detail access is audited.
- `POST /admin/lots/:id/approve`
- `POST /admin/lots/:id/reject` with reason 10–500
- `POST /admin/lots/:id/pause|remove`
- `POST /admin/lots/:id/feature` with explicit `{ featured: boolean }`

## Steps (TDD)

1. Write a table-driven failing state-machine test for every action×status pair.
2. Write e2e loops: submit→approve→public; submit→reject→owner reason→edit/resubmit; admin remove hides public.
3. Implement purpose-built repository list/detail queries with pagination and no N+1 media/seller lookups.
4. Implement transitions with conditional writes where races matter; return 409 when stale.
5. Commit state change and audit row in the same transaction; stamp published/rejection/feature/deletion fields explicitly.
6. Add Swagger DTOs/error codes and role matrix tests; regenerate types.
7. Verify the expiration job and seller lifecycle still respect admin outcomes.

## Verification

```bash
npm test -w @monorepo/api -- --runInBand src/modules/lots
npm run gen:types
npm run typecheck -w @monorepo/api
```

## Completion checklist

- [ ] Every transition has a legal-state table and conflict code.
- [ ] Reject reason reaches owner payload but never public payload.
- [ ] Approve/reject/remove effects are visible through real public/owner endpoints.
- [ ] All actions are audited transactionally.
