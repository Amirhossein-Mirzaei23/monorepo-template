# Admin API Contract Baseline

**Baseline date:** 2026-09-20  
**Source of truth:** Nest controllers and the OpenAPI document produced by `buildOpenApiDocument` (`GET /docs-json` when the API is running)  
**Authorization proof:** `apps/api/src/test/admin-permissions.e2e-spec.ts`; OpenAPI security metadata is documentation, not an authorization boundary.

## Status vocabulary

- **Implemented:** route and runtime behavior exist now.
- **Missing:** no current API route exists.
- **Proposed:** reserved for a later admin-panel task; not part of this baseline implementation.
- **Unsafe to expose:** implemented legacy behavior whose lifecycle or audit invariants are not suitable for the admin UI yet.

## Authentication and session contract

| Method and path      | Runtime auth                                        | Request DTO/input                | Success response                                                          | Status      | Notes                                                                                                                                        |
| -------------------- | --------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/login`   | Public route; service accepts `ADMIN` accounts only | `LoginDto` (`email`, `password`) | `200 LoginResponseDto`; sets the rotated HTTP-only `refresh_token` cookie | Implemented | Dedicated admin password-login entry point. Normal users authenticate through OTP.                                                           |
| `POST /auth/refresh` | Public route with required refresh cookie           | HTTP-only `refresh_token` cookie | `200 LoginResponseDto`; rotates cookie                                    | Implemented | A missing, invalid, revoked, or expired cookie returns `401`. Suspended-user refresh policy is decided below but not implemented in Task 01. |
| `GET /auth/me`       | Bearer access token                                 | None                             | `200 MeResponseDto`                                                       | Implemented | Authoritative identity and role check after restoring a session.                                                                             |
| `POST /auth/logout`  | Public route with required refresh cookie           | HTTP-only `refresh_token` cookie | `204`                                                                     | Implemented | Revokes the presented refresh session and clears the cookie.                                                                                 |

The access token remains memory-only in the web app. The refresh token remains an HTTP-only cookie scoped to `/auth`. Admin web middleware may use cookie presence only as an initial gate; it must not infer the role from a JavaScript-readable cookie. The restored `/auth/me` identity and API RBAC remain authoritative.

## Current privileged operations

Every row below is covered by the parameterized permission matrix: anonymous callers receive `401`, authenticated `USER` callers receive `403`, and an `ADMIN` receives the listed success status (or, for other valid inputs, a non-authentication business response).

| Method and path                       | Runtime auth     | Request DTO/input                                                            | Success response                 | Current status / constraint                                                                                                               |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /users`                          | Bearer + `ADMIN` | `UsersQueryDto`: pagination/sort plus exact `phone`, `email`, `role` filters | `200 Paginated<UserResponseDto>` | Implemented at legacy path. Pagination envelope is described but not structurally typed in OpenAPI.                                       |
| `GET /users/:id`                      | Bearer + `ADMIN` | Path `id`                                                                    | `200 UserResponseDto`            | Implemented at legacy path.                                                                                                               |
| `POST /users`                         | Bearer + `ADMIN` | `CreateUserDto`                                                              | `201 UserResponseDto`            | Implemented; can set role and password. Do not expose broadly before Task 05 hardening.                                                   |
| `PATCH /users/:id`                    | Bearer + `ADMIN` | `UpdateUserDto`                                                              | `200 UserResponseDto`            | Implemented; broad role/password mutation and no self/last-admin invariant. Unsafe to expose.                                             |
| `DELETE /users/:id`                   | Bearer + `ADMIN` | Path `id`                                                                    | `204`                            | Implemented as hard delete. Unsafe to expose for operational administration.                                                              |
| `POST /admin/categories`              | Bearer + `ADMIN` | `CreateCategoryDto`                                                          | `201 CategoryResponseDto`        | Implemented. Depth is limited to two levels; slug conflicts return `409`. Audit logging is not available yet.                             |
| `PATCH /admin/categories/:id`         | Bearer + `ADMIN` | `UpdateCategoryDto`                                                          | `200 CategoryResponseDto`        | Implemented. `isActive: false` is the lifecycle operation; category deletion is intentionally absent. Audit logging is not available yet. |
| `PATCH /admin/categories/:id/reorder` | Bearer + `ADMIN` | `ReorderCategoryDto` (`siblingId`)                                           | `200 CategoryResponseDto`        | Implemented as a sibling `sortOrder` swap. Audit logging is not available yet.                                                            |

`UserResponseDto` exposes `id`, `phone`, nullable `email`, `name`, `role`, `status`, `accountRoles`, `createdAt`, and `updatedAt`; it never exposes `passwordHash`. `CategoryResponseDto` exposes `id`, `nameFa`, nullable `nameEn`, `slug`, nullable `parentId`, `sortOrder`, and `isActive`.

## Implemented public and owner APIs relevant to admin planning

These routes exist but are **not admin operations** and must not be reused as moderation or investigation APIs:

| Surface                           | Current behavior                                                    | Admin consequence                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /categories`                 | Public, active-only two-level tree                                  | Cannot power the editor because inactive rows, counts, and complete ordering metadata are absent. A purpose-built admin read endpoint is still missing. |
| `/lots/**`                        | Public browse/detail plus authenticated owner create/edit/lifecycle | Owner routes enforce seller/ownership semantics. Add explicit `/admin/lots/**`; do not bypass ownership through these routes.                           |
| `/deals/**`                       | Authenticated participant contract                                  | Add purpose-built admin read DTOs; participant payloads are not evidence/investigation payloads.                                                        |
| `/conversations/**`, `/offers/**` | Authenticated participant/actor contracts                           | Do not expose as admin evidence APIs. A future investigation endpoint must require a reason and audit access.                                           |

## Swagger truthfulness notes

- The current privileged routes above have bearer documentation and runtime `@Roles(UserRole.ADMIN)` metadata. Their security documentation agrees with runtime behavior.
- `LotsController` has class-level `@ApiBearerAuth('access-token')`, while `GET /lots` is runtime `@Public()`. The generated OpenAPI therefore overstates authentication for the public list.
- The shared `GET /lots/:key` route is conditional: an 8-character public code is anonymous, while an owner cuid requires bearer authentication through `LotKeyAccessGuard`. OpenAPI cannot accurately express that branch-dependent rule with one ordinary bearer annotation; the operation description records both branches.
- Runtime `@Public()` metadata overrides the global JWT guard even when class-level Swagger metadata still displays bearer security. Consumers must not infer authorization solely from an OpenAPI `security` field.
- No Swagger decorator was changed in Task 01: admin documentation is already accurate, and changing the mixed lot documentation without a route split would replace one incomplete representation with another.
- **Generated-contract decision/result:** Task 01 changes no controller decorator or DTO exposure, so no shared contract change is expected. `npm run gen:types` was nevertheless run as verification and produced no generated diff.

## `/users` to `/admin/users` migration decision

Use a **staged deprecated alias backed by one service implementation**, not an immediate breaking replacement:

1. Task 05 adds the canonical `/admin/users` read surface and explicit status, role, and session-revocation actions.
2. Both route families temporarily call the same hardened `UsersService` operations; no duplicated business logic or divergent DTO mapping is allowed.
3. Mark legacy `/users` operations deprecated in OpenAPI once canonical routes exist and add compatibility tests for any retained behavior.
4. Do not expose legacy `PATCH /users/:id` or `DELETE /users/:id` in the admin UI. Replace broad update/hard delete with explicit history-safe actions first.
5. Remove `/users` only after the web/BFF and external consumers have migrated in a separately reviewed breaking-change task.

## Missing and proposed admin capabilities

| Capability                   | Proposed API                                                                     | Status / prerequisite                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Overview                     | `GET /admin/overview`                                                            | Missing; later overview task.                                                                                     |
| Hardened user administration | `GET /admin/users`, `GET /admin/users/:id`, explicit status/role/session actions | Missing; Task 05. Requires soft lifecycle, self-action guard, last-active-admin guard, session policy, and audit. |
| Complete category read model | `GET /admin/categories`                                                          | Missing; must include inactive rows, ordering metadata, and lot counts.                                           |
| Lot moderation               | `GET /admin/lots`, detail, approve/reject/pause/remove/feature actions           | Missing; requires explicit transition rules and audit.                                                            |
| Reports                      | Admin queue/detail/decision routes                                               | Missing; report domain and audit prerequisite.                                                                    |
| Verification                 | Admin queue/grant/revoke routes                                                  | Missing; verification domain and audit prerequisite.                                                              |
| Deals investigation          | `GET /admin/deals`, `GET /admin/deals/:code`                                     | Missing; purpose-built redacted list/detail DTOs required.                                                        |
| Conversation evidence        | `GET /admin/investigations/conversations/:id`                                    | Missing; explicit reason, retention/access policy, and access audit required.                                     |
| Audit log                    | `GET /admin/audit`                                                               | Missing; immutable audit domain must precede privileged workflow rollout.                                         |

## Task 01 decisions

1. **Legacy users route:** staged deprecated alias as described above; `/admin/users` becomes canonical.
2. **Last-admin guard:** count only `ACTIVE` admins. A role/status action may not leave zero active admins.
3. **Suspended sessions:** suspended or blocked users may not refresh. The state transition revokes their refresh sessions; existing short-lived access tokens must also be rejected when authoritative status checks are introduced.
4. **Rejected reports:** cannot be reopened in P0. A new concern creates a new report, preserving decision history.
5. **Featuring lots:** keep the API/UI capability hidden behind a configuration flag until P0 merchandising is explicitly enabled. No feature endpoint is added by Task 01.
6. **Conversation evidence retention/access:** access is least-privilege, read-only, reason-required, and audit-recorded. Retain the access audit at least as long as the referenced conversation/deal plus the applicable legal/support retention period; exact durations require product/legal approval before the endpoint ships. Audit records are immutable and available only to authorized admins; exports and deletion require a separately approved retention process.

## Acceptance baseline

- API guards, not Swagger metadata, prove the current permission matrix.
- The eight existing privileged operations are enumerated above and covered by e2e tests.
- Existing destructive/broad user semantics are recorded as unsafe and are not normalized or exposed by this task.
- Missing capabilities remain missing; Task 01 adds no Task 02+ endpoint, schema, BFF, or UI behavior.
