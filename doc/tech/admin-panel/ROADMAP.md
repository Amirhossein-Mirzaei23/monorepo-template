# Rakdsho Admin Panel Roadmap

> **For Hermes:** Execute one linked task per session, using test-driven development and the repository's controller → service → repository and feature-boundary rules.

**Goal:** Build a role-gated Persian/RTL admin workspace that lets marketplace operators authenticate, monitor workload, manage users and categories, moderate lots and reports, review verification requests and deals, and audit every privileged action.

**Architecture:** Keep the admin UI in the existing Next.js application under `app/(admin)/admin/**` and its business UI in one `features/admin` public API. Add admin-specific NestJS read/write surfaces under `/admin/*`; reuse domain repositories/services where invariants already exist, and add an append-only `AuditLog` for privileged mutations. Swagger remains the contract source and `packages/shared-types` must only change through `npm run gen:types`.

**Tech stack:** Next.js 16 App Router, React 19, TanStack Query, React Hook Form + Zod, NestJS 11, Prisma/PostgreSQL, generated OpenAPI types, Jest.

---

## Source evidence

This roadmap was reconciled against the live Swagger document at `GET http://localhost:3001/docs-json` on 2026-09-20 and the current repository. The document exposed 47 paths and 60 schemas.

Currently usable by an admin:

- `POST /auth/login` — admin-only email/password session.
- `GET /auth/me` — current identity and role.
- `GET|POST /users`, `GET|PATCH|DELETE /users/:id` — guarded by `ADMIN`, but not yet shaped as a safe operational user-management API.
- `POST /admin/categories`, `PATCH /admin/categories/:id`, `PATCH /admin/categories/:id/reorder`.
- `GET /categories` — public active tree, useful for reads but insufficient for an admin editor because inactive rows are absent.

Not present in the live Swagger contract: admin overview, admin lot queue/actions, reports, verification, admin deal reads/resolution, audit log, admin media investigation, and all admin web/BFF routes.

Existing product intent is in [`../tasks/trust-admin.md`](../tasks/trust-admin.md), especially TRS-001/003/005 and ADM-001..008. These task files refine that intent against what is actually implemented now.

## Scope and non-goals

P0 operator flows:

1. Dedicated admin password login and session restoration.
2. Defense-in-depth route/role gating and an RTL admin shell.
3. Workload overview.
4. Safe user search, detail, status/role actions, and session revocation.
5. Full category tree management, including inactive categories.
6. Lot moderation: queue, evidence review, approve/reject/pause/remove/feature.
7. Report intake and resolution queue.
8. Manual user/lot verification grants and revocations, reflected publicly.
9. Read-only deal investigation with dispute handoff.
10. Append-only audit history for every privileged mutation.
11. Permission, state-machine, accessibility, and browser-level acceptance tests.

Deferred unless its prerequisite task is explicitly promoted:

- Physical inspection workflow (TRS-007).
- Automated KYC/fraud scoring.
- Payment custody, refunds, or gateway operations.
- Editing or deleting chat history; admin investigation is read-only and access is audited.
- Marketplace analytics beyond operational counts.

## Execution order and gates

### Phase A — Secure foundation

1. [Task 01 — Contract baseline and admin acceptance matrix](tasks/01-contract-baseline.md)
2. [Task 02 — Audit log and privileged-action safety](tasks/02-audit-and-safety.md)
3. [Task 03 — Admin authentication, route gate, and shell](tasks/03-admin-auth-shell.md)

Exit gate: an anonymous user cannot enter `/admin`; a regular authenticated user receives a non-oracular denial; an admin can sign in, refresh, navigate, and sign out; every privileged write has actor/request metadata available for auditing.

### Phase B — Existing operational surfaces

4. [Task 04 — Admin overview](tasks/04-overview.md)
5. [Task 05 — User management](tasks/05-users.md)
6. [Task 06 — Category management](tasks/06-categories.md)

Exit gate: staff can monitor work, safely find/manage accounts, and maintain the complete category tree without Swagger or direct SQL.

### Phase C — Marketplace trust operations

7. [Task 07 — Lot moderation API](tasks/07-lot-moderation-api.md)
8. [Task 08 — Lot moderation UI](tasks/08-lot-moderation-ui.md)
9. [Task 09 — Reports domain and admin queue](tasks/09-reports.md)
10. [Task 10 — Verification domain, public badges, and admin review](tasks/10-verifications.md)

Exit gate: submit→review→approve/reject→resubmit works end-to-end, user reports can be resolved with linked actions, and admin verification changes appear on public seller/lot surfaces.

### Phase D — Investigation, accountability, launch

11. [Task 11 — Admin deals and disputes](tasks/11-deals.md)
12. [Task 12 — Read-only investigation and audit explorer](tasks/12-investigation-audit-ui.md)
13. [Task 13 — End-to-end QA, security, accessibility, and operations](tasks/13-qa-launch.md)

Exit gate: an admin can trace a deal and its evidence without bypassing privacy boundaries; privileged actions are searchable; the full role matrix and critical admin journeys pass in CI and in a production-like browser run.

## Global completion rules

Every task that changes behavior must:

1. Add a failing test first and run it to observe the intended failure.
2. Implement the smallest coherent vertical slice.
3. Run the focused test, then relevant package tests.
4. Run `npm run gen:types` whenever API DTOs or Swagger operations change.
5. Run `npm run lint && npm run typecheck && npm run test && npm run build` before task completion.
6. Verify runtime effects by calling the exact endpoint or browser surface.
7. Never hand-edit `packages/shared-types`.
8. Avoid modifying `package-lock.json` unless an intentional dependency is added.
9. Do not mark the corresponding ADM/TRS card complete until its acceptance criteria and phase gate pass.

Shared contracts, permission matrix, risks, and open decisions: [ROADMAP_REFERENCE.md](ROADMAP_REFERENCE.md).
