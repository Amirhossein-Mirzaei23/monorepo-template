# Task 02 — Audit Log and Privileged-Action Safety

**Phase:** A — Secure foundation  
**Objective:** Introduce an immutable audit spine and reusable actor/request context before exposing additional privileged actions.

## Files

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_admin_audit_log/migration.sql`
- Create: `apps/api/src/modules/audit/` (module, repository, service, DTOs, tests)
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/common/decorators/current-user.decorator.ts` only if actor context lacks required fields
- Modify: existing category admin service/controller to write audit records
- Test: `apps/api/src/modules/audit/__tests__/audit.service.spec.ts`
- Test: category admin e2e spec

## Contract

`AuditLog`: actorId nullable only for system jobs, action, entityType, entityId, metadata JSON, requestId, IP, createdAt. No update/delete methods. Index `(entityType, entityId, createdAt)`, `(actorId, createdAt)`, and `createdAt`.

## Steps (TDD)

1. Write a failing service test proving a category update and its audit row commit in one transaction.
2. Add the schema/migration and regenerate Prisma.
3. Implement repository-only create/list methods and a service helper accepting the caller's transaction client.
4. Thread actor ID and sanitized request metadata into category admin actions; never store authorization headers, cookies, passwords, tokens, or full uploaded content.
5. Add rollback coverage: if audit creation fails, the privileged mutation must roll back.
6. Add paginated `GET /admin/audit` only after write invariants pass; filter by actor/action/entity/date.
7. Add Swagger DTOs and regenerate shared types.

## Verification

```bash
npm test -w @monorepo/api -- --runInBand src/modules/audit src/modules/categories/__tests__/categories-admin.controller.e2e-spec.ts
npm run gen:types
npm run typecheck -w @monorepo/api
```

## Constraints

- Audit rows are immutable and never cascaded away with domain entities.
- Sensitive fields are allowlisted, not blindly serialized.
- All later task actions must use this same service/transaction pattern.

## Completion checklist

- [x] Migration is expand-only and indexed.
- [x] Category privileged writes are audited.
- [x] Rollback behavior is proven.
- [x] Read API is ADMIN-only and paginated.
