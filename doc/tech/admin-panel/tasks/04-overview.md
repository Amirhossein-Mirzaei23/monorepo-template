# Task 04 — Admin Overview

**Phase:** B — Existing operational surfaces  
**Objective:** Provide one bounded endpoint and dashboard showing actionable operational workload.

## Files

- Create: `apps/api/src/modules/admin/admin.module.ts`
- Create: `apps/api/src/modules/admin/admin-overview.controller.ts`
- Create: `apps/api/src/modules/admin/admin-overview.service.ts`
- Create: `apps/api/src/modules/admin/admin-overview.repository.ts`
- Create: overview response DTO and tests
- Create: `apps/web/src/app/api/admin/overview/route.ts`
- Create: `apps/web/src/features/admin/api/overview-api.ts`, hook, schema, components, tests
- Modify: `apps/web/src/app/(admin)/admin/page.tsx`

## Response scope

Counts: pending-review lots, open reports (0 until Task 09), pending verifications (0 until Task 10), disputed deals, ACTIVE/SUSPENDED/BLOCKED users, and users created in the last 7 days. Quick queues: five oldest pending lots and five oldest open reports. Omit GMV/revenue until analytics has a defined contract.

## Steps (TDD)

1. Write failing repository/service tests for counts, zero-state behavior, and oldest-first quick queues.
2. Implement bounded aggregate queries; use one consistent `now` and no unbounded row loads.
3. Add `GET /admin/overview`, `@Roles(ADMIN)`, Swagger DTO, e2e role matrix.
4. Regenerate types and add BFF pass-through.
5. Build count cards, queue summaries, empty/error/loading states, and links preserving filter intent.
6. Add page/component tests for zero and populated states.

## Verification

```bash
npm test -w @monorepo/api -- --runInBand src/modules/admin
npm test -w @monorepo/web -- --runInBand src/features/admin
npm run gen:types
```

## Completion checklist

- [ ] No placeholder/random metrics.
- [ ] Queries are bounded and indexed by existing status/date indexes where possible.
- [ ] 401/403/admin success proven.
- [ ] Dashboard links enter the intended queue filter.
