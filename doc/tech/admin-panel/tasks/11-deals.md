# Task 11 — Admin Deals and Dispute Investigation

**Phase:** D — Investigation, accountability, launch  
**Objective:** Give admins a privacy-scoped read model for tracing deals and, only when specified, resolving disputes through the canonical state machine.

## Files

- Create: admin deals controller/read DTOs/service/repository methods/tests
- Reuse: existing deal timeline mapper where fields are safe
- Create: admin deals BFF/routes/API/hooks/components/tests
- If dispute resolution is promoted: modify `deals.constants.ts`/service tests before adding action endpoints

## Required read behavior

List filters: code, status, buyer/seller phone, lot code, date range; deterministic updated-desc pagination. Detail: terms, stage timestamps, timeline, participant business/contact fields explicitly approved for support, lot summary, offer/conversation references, payment confirmation and commission fields. Detail access is audited.

## Steps (TDD)

1. Write failing admin read tests proving USER gets 403 and private fields appear only in the purpose-built admin DTO.
2. Implement bounded list/detail queries without weakening participant endpoints.
3. Add Swagger/BFF and a searchable table plus detail timeline reusing exported deal UI pieces.
4. Show dispute/cancellation reasons and evidence links; do not permit arbitrary status editing.
5. If implementing DEAL-007, first write the full DISPUTED→COMPLETED|CANCELLED admin matrix tests, require resolution reason, apply completion/cancellation side effects transactionally, and audit.
6. Add browser tests for deep links and missing/deleted related entities.

## Verification

```bash
npm test -w @monorepo/api -- --runInBand src/modules/deals
npm test -w @monorepo/web -- --runInBand src/features/admin src/features/deals
npm run gen:types
```

## Completion checklist

- [ ] Participant APIs remain privacy-minimal.
- [ ] Admin detail reads are audited.
- [ ] No free-form status setter exists.
- [ ] Any dispute action follows tested canonical side effects.
