# Task 09 — Reports Domain, User Intake, and Admin Queue

**Phase:** C — Marketplace trust operations  
**Objective:** Create a durable abuse-report lifecycle from public/authenticated surfaces to an audited admin decision queue.

## Files

- Modify: Prisma schema + one migration
- Create: `apps/api/src/modules/reports/` and tests
- Create: authenticated `POST /reports` and admin `/admin/reports` endpoints
- Create: reusable web `report-dialog` and wire lot/seller/chat surfaces
- Create: admin reports routes/BFF/API/hooks/components/tests

## Domain contract

Subject types: LOT, USER, CONVERSATION, MESSAGE. Reasons follow the existing TRS-003 card. Dedupe same reporter+subject while OPEN/REVIEWING. Lifecycle: OPEN→REVIEWING→RESOLVED|REJECTED. Resolution requires note and actor; linked moderation actions call their real services rather than duplicating mutations.

## Steps (TDD)

1. Write failing schema/service tests for subject existence, ownership/privacy, dedupe, throttle, and lifecycle.
2. Add migration/indexes and repository/service with retained history.
3. Add `POST /reports` and admin list/detail/decision endpoints with role matrix and audit.
4. Regenerate types and build the reusable report dialog; anonymous users route to login.
5. Build admin queue with filters, subject preview/tombstone state, decision drawer, and links to lot/user/conversation investigation.
6. Add linked actions as separate confirmed calls; resolution audit metadata references linked audit IDs rather than pretending one action did both.
7. Test report→queue→remove lot→resolve end-to-end.

## Verification

```bash
npm test -w @monorepo/api -- --runInBand src/modules/reports
npm test -w @monorepo/web -- --runInBand src/features/admin src/components
npm run gen:types
```

## Completion checklist

- [ ] Duplicates and missing/private subjects are handled safely.
- [ ] Reports are never deleted.
- [ ] Resolution and linked actions are independently audited.
- [ ] Deleted subjects render tombstones, not crashes.
