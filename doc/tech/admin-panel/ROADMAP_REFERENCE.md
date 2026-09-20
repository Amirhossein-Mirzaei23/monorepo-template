# Admin Panel Roadmap Reference

This document is shared by every task in [ROADMAP.md](ROADMAP.md).

## 1. Current contract inventory (live Swagger, 2026-09-20)

| Capability                            | Current endpoint       | State                                                | Planning consequence                                                                 |
| ------------------------------------- | ---------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Admin password login                  | `POST /auth/login`     | Implemented; returns access token and refresh cookie | Add dedicated admin web form/BFF reuse; do not expose password login to normal users |
| Session restore                       | `POST /auth/refresh`   | Implemented                                          | Restore only when refresh cookie exists; verify role after restore                   |
| Current identity                      | `GET /auth/me`         | Implemented                                          | Use as the authoritative role check after the client receives an access token        |
| User list/detail/create/update/delete | `/users`, `/users/:id` | Implemented and `ADMIN` guarded                      | Replace destructive/unsafe operational semantics before exposing broadly in UI       |
| Public category tree                  | `GET /categories`      | Implemented; active rows only                        | Add admin read endpoint that includes inactive rows, counts, and ordering metadata   |
| Category writes                       | `/admin/categories/**` | Implemented and `ADMIN` guarded                      | Build BFF, generated validators, editor, conflict handling                           |
| Lot owner/public APIs                 | `/lots/**`             | Implemented                                          | Do not misuse owner endpoints for moderation; add explicit `/admin/lots/**`          |
| Deals participant APIs                | `/deals/**`            | Implemented                                          | Add admin read models; participant response intentionally lacks admin-only evidence  |
| Reports                               | —                      | Missing                                              | Build domain, user intake, lifecycle, queue, audit                                   |
| Verification                          | —                      | Missing                                              | Build domain, public embedding, admin grant/revoke                                   |
| Overview                              | —                      | Missing                                              | Build bounded aggregate endpoint                                                     |
| Audit log                             | —                      | Missing                                              | Must precede privileged workflows                                                    |

Swagger annotations are not themselves authorization proof. Some public lot operations inherit class-level bearer documentation while runtime `@Public()` allows anonymous access. Tests must verify guards, not infer permissions only from `security` in OpenAPI.

## 2. Canonical route map

### Web

- `/admin/login`
- `/admin`
- `/admin/users`
- `/admin/users/[id]`
- `/admin/categories`
- `/admin/lots`
- `/admin/lots/[id]`
- `/admin/reports`
- `/admin/verifications`
- `/admin/deals`
- `/admin/deals/[code]`
- `/admin/audit`

### BFF

Mirror admin paths under `/api/admin/**`. BFF handlers forward `Authorization`, accept only explicit methods, preserve upstream status/body/request-id, and never forward browser cookies to unrelated public APIs.

### API

- `GET /admin/overview`
- `GET /admin/users`, `GET /admin/users/:id`, `PATCH /admin/users/:id/status`, `PATCH /admin/users/:id/role`, `POST /admin/users/:id/revoke-sessions`
- `GET /admin/categories`, plus existing create/update/reorder endpoints
- `GET /admin/lots`, `GET /admin/lots/:id`, `POST /admin/lots/:id/{approve|reject|pause|remove|feature}`
- `GET /admin/reports`, `GET /admin/reports/:id`, `PATCH /admin/reports/:id`
- `GET /admin/verifications`, `POST /admin/verifications`, `PATCH /admin/verifications/:id`
- `GET /admin/deals`, `GET /admin/deals/:code`, and dispute resolution only after its state-machine task lands
- `GET /admin/investigations/conversations/:id` (read-only, reason required and access audited)
- `GET /admin/audit`

Avoid retaining two competing admin user APIs. Task 05 must either move the existing `/users` behavior to `/admin/users` with compatibility tests or document a staged deprecation and share one service implementation.

## 3. Permission matrix

| Surface/action                   | Anonymous               | USER                             | ADMIN                                                |
| -------------------------------- | ----------------------- | -------------------------------- | ---------------------------------------------------- |
| `/admin/login`                   | allow                   | redirect away if regular session | redirect to `/admin`                                 |
| `/admin/**` pages                | redirect to admin login | deny without revealing data      | allow                                                |
| Admin BFF/API reads              | 401                     | 403                              | allow                                                |
| Category create/update/reorder   | 401                     | 403                              | allow + audit                                        |
| User status/role/session actions | 401                     | 403                              | allow with self-action and last-admin guards + audit |
| Lot moderation actions           | 401                     | 403                              | allow only legal transition + audit                  |
| Report/verification decisions    | 401                     | 403                              | allow only legal transition + audit                  |
| Deal investigation               | 401                     | 403                              | read allow + access audit                            |
| Conversation evidence            | 401                     | 403                              | read allow only with explicit reason + access audit  |
| Audit log                        | 401                     | 403                              | read allow; immutable                                |

Role checks must exist at API guard/service boundaries. Middleware and client redirects are UX optimizations, not authorization.

## 4. Admin session model

The existing access token remains memory-only and the refresh token remains an HTTP-only cookie. The server cannot authorize an admin layout solely from the access token because it cannot read client memory. Therefore:

1. Middleware gates `/admin/:path*` on refresh-cookie presence only.
2. `AdminAuthProvider`/the root auth provider restores through `/api/auth/refresh`.
3. The admin layout waits for restored identity and requires `user.role === 'ADMIN'`.
4. The API remains authoritative and returns 403 for a valid non-admin token.
5. A 401 clears local auth state and redirects to `/admin/login?next=...`; a 403 shows a neutral access-denied page or redirects home.

Do not place role claims in a JS-readable cookie merely to make middleware convenient.

## 5. Domain/state invariants

- Category depth remains at most two levels; disabling does not delete historical references.
- User operational deletion is soft (`User.status=DELETED`, `deletedAt`) rather than the current hard-delete behavior. Never hard-delete a user with marketplace history.
- Admin cannot block, delete, demote, or revoke all sessions of itself in a way that strands the system; protect the last active admin.
- Lot moderation is an explicit state machine. Approve only `PENDING_REVIEW`; reject only `PENDING_REVIEW` with a 10–500 character reason; pause only visible states; removal is soft; feature/unfeature is idempotent.
- Reports are append-retained and move `OPEN → REVIEWING → RESOLVED|REJECTED`; resolution has actor, note, and timestamp.
- Verification is append/history-safe and uniquely active per `(subjectType, subjectId, type)`; revoke rather than delete.
- Deal and conversation evidence is read-only for admins unless a separately specified state-machine transition exists.
- Every privileged mutation and sensitive evidence read writes `AuditLog` in the same transaction where possible.

## 6. API/error contract

Use the existing global envelope: `{ statusCode, error, message, code?, requestId, timestamp }`.

Add machine codes for admin conflicts, including:

- `ADMIN_SELF_ACTION_FORBIDDEN`
- `LAST_ADMIN_GUARD`
- `ILLEGAL_USER_STATUS_TRANSITION`
- `ILLEGAL_LOT_MODERATION_TRANSITION`
- `REJECTION_REASON_REQUIRED`
- `REPORT_ALREADY_DECIDED`
- `VERIFICATION_ALREADY_ACTIVE`
- `INVESTIGATION_REASON_REQUIRED`

List endpoints use `Paginated<T>` and deterministic sorting. Admin filters use URL state so queues are linkable and browser navigation works.

## 7. Frontend conventions

- `app/` files remain thin route/layout composition.
- Business UI and network code live under `apps/web/src/features/admin/` and are exported through `index.ts`.
- Use TanStack Query for interactive tables/actions; include the filter object in query keys.
- Use React Hook Form + Zod for login and decision dialogs.
- Normalize API payloads once at the feature boundary; do not parse raw errors in components.
- Persian/RTL by default; identifiers, phone, email, codes, and money inputs use deliberate `dir="ltr"` where needed.
- Tables need a narrow-screen fallback (cards or horizontal contained scroll), keyboard focus, labelled actions, and confirmation dialogs for destructive operations.
- Do not introduce a heavy table library for P0 unless existing primitives cannot satisfy sorting/filter/pagination accessibly.

## 8. Shared validation commands

Focused examples:

```bash
npm test -w @monorepo/api -- --runInBand <focused-spec>
npm test -w @monorepo/web -- --runInBand <focused-test>
npm run gen:types
npm run typecheck -w @monorepo/api
npm run typecheck -w @monorepo/web
```

Task completion:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run format:check
git diff --check
```

Runtime checks must include direct 401/403/admin-success calls using separate anonymous, USER, and ADMIN identities. Browser acceptance must test refresh, direct deep links, logout, and expired sessions.

## 9. Major risks and decisions

1. **Current user delete is hard delete.** Do not expose it in the admin UI until converted to a history-safe status transition.
2. **Current user update accepts role/password broadly.** Split operational actions into explicit DTOs; protect self and last-admin invariants.
3. **No admin read for inactive categories.** Public tree cannot power the editor.
4. **No moderation endpoint.** Direct database activation is development-only and must not become an operational workflow.
5. **No AuditLog model.** This blocks safe rollout of moderation, verification, reports, and sensitive evidence reads.
6. **Server role gating is constrained by memory-only access tokens.** Preserve token security and use client role confirmation plus API authorization; do not weaken cookie policy.
7. **Admin evidence can expose private contact/address/chat data.** Return purpose-built admin DTOs, require investigation reasons, redact list rows, and audit detail access.
8. **Generated contracts currently have weak paginated documentation for some endpoints.** Add explicit envelope DTOs or schema registration where generation cannot infer response types.

## 10. Open decisions to resolve in Task 01

- Whether `/users` is immediately replaced by `/admin/users` or kept temporarily as a deprecated alias.
- Whether the last-admin guard counts `ACTIVE` only or all non-deleted admins (recommended: ACTIVE only).
- Whether suspended users may refresh existing sessions (recommended: no; revoke sessions on suspension/block).
- Whether a rejected report can be reopened (recommended P0: no, create a new report).
- Whether `feature` is in P0 merchandising or hidden behind a configuration flag.
- Retention/access policy for admin conversation evidence and audit logs.
