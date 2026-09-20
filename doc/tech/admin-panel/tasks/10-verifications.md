# Task 10 — Verification Domain, Public Badges, and Admin Review

**Phase:** C — Marketplace trust operations  
**Objective:** Let admins grant/revoke explicit user/lot trust badges and make effective badges visible in public contracts.

## Files

- Modify: Prisma schema + migration
- Create: `apps/api/src/modules/verifications/` and tests
- Add admin verification endpoints and repository helpers consumed by profile/lot queries
- Modify: public/owner DTO mappers only with allowlisted badge arrays
- Create: shared web badge component and admin verification page/components/tests

## Steps (TDD)

1. Write failing tests for unique active badge, grant/reject/revoke history, wrong subject/type combinations, and effective-badge query.
2. Add Verification enums/model/indexes and transactional service with audit.
3. Add admin queue/search/grant/revoke endpoints. Keep `PHONE_VERIFIED` system-only if retained.
4. Embed effective badges in seller list/profile, lot card/detail, and conversation counterpart contracts without N+1 queries.
5. Regenerate types; replace hard-coded `verified: false` placeholders with derived truth.
6. Build admin subject search, badge picker, notes/history, and revoke confirmation.
7. Build public badge rendering with exhaustive known labels and safe handling for unknown future types.
8. Verify grant in admin→badge on public page→revoke→badge disappears.

## Verification

```bash
npm test -w @monorepo/api -- --runInBand src/modules/verifications src/modules/profiles src/modules/lots
npm test -w @monorepo/web -- --runInBand src/features/admin src/components
npm run gen:types
```

## Completion checklist

- [ ] Badge truth is database-derived, not a frontend placeholder.
- [ ] No N+1 badge lookup on lists.
- [ ] Grant/revoke history is retained and audited.
- [ ] Public surfaces update end-to-end.
