# Task 12 — Read-Only Investigation and Audit Explorer

**Phase:** D — Investigation, accountability, launch  
**Objective:** Provide controlled evidence access and a searchable audit trail without turning admin access into unrestricted data browsing.

## Files

- Extend: audit list DTO/query/service tests
- Add: purpose-built admin conversation investigation read endpoint/tests
- Create: `/api/admin/audit`, `/api/admin/investigations/**`
- Create: `/admin/audit` and investigation components/tests

## Steps (TDD)

1. Write failing tests that require an investigation reason, ADMIN role, subject existence, and an audit row for every sensitive detail read.
2. Implement read-only conversation/message evidence query with strict pagination, participant/lot context, secure-media references, and no write/delete controls.
3. Add audit filters for actor/action/entity/request/date; default newest-first with bounded pages.
4. Build audit table/detail drawer with sanitized metadata rendering and links to still-existing entities.
5. Build investigation viewer launched from report/deal detail; require a reason modal before loading evidence.
6. Verify deleted actors/entities render retained IDs/tombstones.
7. Add tests proving secrets, auth headers, cookie values, password data, and refresh hashes never appear.

## Verification

```bash
npm test -w @monorepo/api -- --runInBand src/modules/audit src/modules/conversations
npm test -w @monorepo/web -- --runInBand src/features/admin
```

## Completion checklist

- [ ] Sensitive reads require and record purpose.
- [ ] Evidence is read-only and paginated.
- [ ] Audit metadata is safely rendered and secret-free.
- [ ] Historical rows survive related-entity removal.
