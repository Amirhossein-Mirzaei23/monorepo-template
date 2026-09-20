# Task 08 — Lot Moderation UI

**Phase:** C — Marketplace trust operations  
**Objective:** Build the admin's primary queue for reviewing evidence and executing Task 07 transitions safely.

## Files

- Create: `apps/web/src/app/api/admin/lots/**`
- Create: `apps/web/src/app/(admin)/admin/lots/page.tsx` and `[id]/page.tsx`
- Create: admin lot API/hooks/keys/schemas/components/tests
- Reuse public lot/media presentation only through exported feature APIs

## Steps (TDD)

1. Write failing component tests for pending queue, filters/pagination, full evidence display, approve, reject validation, stale 409 refresh, and media-empty state.
2. Add BFF handlers with an explicit action allowlist and auth forwarding.
3. Implement URL-driven queue and status/date/category/seller filters; default to oldest pending.
4. Build detail/review panel: full text, quantity/pricing/location, seller summary, category, ordered image/video gallery, linked reports.
5. Add approve/reject/pause/remove/feature dialogs; require confirmation and reasons where specified.
6. Add optional keyboard shortcuts only when focus is outside inputs and require confirmation for destructive actions.
7. Invalidate overview/queue/detail/public lot caches after actions; on 409, show conflict and refetch rather than forcing local state.
8. Add responsive contained scrolling/card fallback and keyboard/a11y tests.

## Verification

```bash
npm test -w @monorepo/web -- --runInBand src/features/admin
npm run typecheck -w @monorepo/web
npm run build -w @monorepo/web
```

## Completion checklist

- [ ] Moderator can process a seeded pending lot without Swagger.
- [ ] All media kinds are reviewable.
- [ ] Destructive actions require deliberate confirmation.
- [ ] Conflicts refresh from server truth.
