# Tasks — Authentication (AUTH)

Context: today the API has email+password JWT auth with refresh rotation (`modules/auth`,
`modules/users`) and an unused `modules/sms` IranPayamak OTP sender. These tasks migrate identity
to phone+OTP while keeping the session/refresh machinery and the admin password path.

---

### AUTH-001 ✅ — Prisma migration: phone-based User + OtpCode

**P0 · Phase 1 · Auth · M** — Deps: PLAT-003

- **Goal:** `User` keyed on `phone` (unique) with optional email, account status and buyer/seller roles; `OtpCode` table added.
- **Why:** Phone OTP is the P0 identity; the data model must land before services.
- **User story:** n/a (foundation).
- **Files:** `apps/api/prisma/schema.prisma`, new migration, `src/modules/users/dto/*`, `src/modules/auth/token.service.ts`, `src/common/decorators/current-user.decorator.ts`, `src/common/guards/jwt-auth.guard.ts`.
- **Backend:** schema per plan §3: `phone String @unique`, `email String? @unique`, `passwordHash String?` (admins only), `status UserStatus @default(ACTIVE)`, `accountRoles AccountRole[] @default([])`; `OtpCode { phone, codeHash, purpose, expiresAt, consumedAt?, attempts @default(0), lastSentAt, createdAt }` + partial unique "one active OTP per phone+purpose" + index `(phone, createdAt)`; add `deviceLabel?`, `userAgent?`, `lastUsedAt` to `RefreshToken`.
- **Frontend:** none yet.
- **Database:** expand/contract migration — keep `email`/`passwordHash` nullable, backfill phone for seeded admin (e.g. `09120000000`), drop not-null on email.
- **API:** JWT payload switches `email` → `phone` (+ `role`, `status`); guard/`AuthUser` type updated; `GET /auth/me` returns phone/status/accountRoles.
- **Validation:** phone `^09\d{9}$` (normalized, stored as-is); OTP code 6 digits.
- **Error states:** existing email/password logins for non-admin users start failing here — expected, handled fully in AUTH-003.
- **Permissions:** n/a.
- **Acceptance:** migration applies on seeded DB; token issue/verify round-trip with phone payload; users service compiles against new model (email flows adjusted/gated).
- **Testing:** update `auth.service.spec`, `token.service.spec`, `users.service.spec`; migration tested on a copy of seed data.
- **DoD:** `npm run gen:types` regenerated; all suites green.

### AUTH-002 — OTP service (issue, verify, throttling, dev mode)

**P0 · Phase 1 · Auth · M** — Deps: AUTH-001

- **Goal:** Domain service that issues, rate-limits, verifies and consumes OTP codes via `SmsService`.
- **Why:** Core of login; must be correct (security) before any endpoint is exposed.
- **User story:** n/a (foundation for "I log in with an SMS code").
- **Files:** `apps/api/src/modules/otp/` (new module: service + repository + tests).
- **Backend:** `OtpService.request(phone, purpose)`: enforce send caps (3/hour, 5/day per phone; count `lastSentAt` window), invalidate prior active codes, generate 6-digit code (crypto random), store sha256, call `SmsService.sendOtp`; dev mode (`OTP_DEV_MODE`) logs/returns code instead of SMS. `OtpService.verify(phone, code)`: increment `attempts`, lock after `OTP_MAX_ATTEMPTS` (5), constant-time compare of hash, mark `consumedAt`, return success/failure.
- **Frontend:** none.
- **Database:** none beyond AUTH-001 (prune job in AUTH-003 or jobs task — expired rows cleanup).
- **API:** none yet (AUTH-003 wires controllers).
- **Validation:** phone E.164- Iranian format; code digits-only, length 6.
- **Error states:** `TOO_MANY_REQUESTS` (send cap), `429` with retry-after; wrong code → generic `UNAUTHORIZED`; locked → `LOCKED` until window passes; SMS provider down → `503` (from SmsService).
- **Permissions:** public, heavily throttled (per-phone DB caps + global ThrottlerGuard per-IP).
- **Acceptance:** unit tests prove expiry, attempt lockout, cap enforcement, consume-once; no code value ever logged (masked phone only).
- **Testing:** service unit tests with fake prisma + fake sms; brute-force sequence test.
- **DoD:** module registered; linters/tests green; `OTP_DEV_MODE` refuses to enable in production env (boot check).

### AUTH-003 — OTP endpoints: request + verify (login-or-register)

**P0 · Phase 1 · Auth · M** — Deps: AUTH-002

- **Goal:** `POST /auth/otp/request` and `POST /auth/otp/verify`; verify returns the standard session (access + refresh cookie) creating the user on first login.
- **Why:** The public auth surface of the product.
- **User story:** As a user I enter my phone, receive a code, and I'm logged in (registered automatically on first time).
- **Files:** `apps/api/src/modules/auth/auth.controller.ts`, `auth.service.ts`, `dto/otp-request.dto.ts`, `dto/otp-verify.dto.ts`, `auth.constants.ts`.
- **Backend:** request → `OtpService.request`; verify → `OtpService.verify` then find-or-create user (phone unique, defaults `accountRoles=[]`, status ACTIVE), then existing `issueSession`. Password `login` restricted to `role=ADMIN` (service rejects others). Suspended/blocked users rejected with clear status error. Add response DTO carrying `user` + `onboardingCompleted` flag (profile check) so the web can route.
- **Frontend:** none (AUTH-004).
- **Database:** none.
- **API:** swagger-annotated DTOs; `@Public()`; stricter per-route throttle on request (e.g. 5/min/IP) via `@Throttle`.
- **Validation:** request: `{ phone }`; verify: `{ phone, code }`; clientType optional (`web`|`android`) forwarded to SmsService pattern selection.
- **Error states:** 429 (caps), 401 (bad/locked code), 403 (suspended/blocked), 503 (SMS down).
- **Permissions:** public.
- **Acceptance:** e2e: request → verify → session works with `OTP_DEV_MODE`; second verify with same code fails; non-admin password login 403.
- **Testing:** controller e2e (supertest) incl. rate-limit and lockout paths; `gen:types` regenerated.
- **DoD:** old register/login-with-password user flows removed from swagger for non-admin; suites green.

### AUTH-004 — Web OTP login UI + BFF routes

**P0 · Phase 1 · Auth · M** — Deps: AUTH-003, PLAT-001

- **Goal:** Persian two-step login (phone → code) with resend timer, countdown, error states; BFF proxies; middleware untouched semantics.
- **Why:** Entry point for every user.
- **User story:** As a user I log in on my phone with two taps + one code.
- **Files:** `apps/web/src/features/auth/components/login-form.tsx` (rewrite), `schemas/otp-schema.ts`, `hooks/use-otp-request.ts`, `hooks/use-otp-verify.ts`, `app/api/auth/otp/request/route.ts`, `app/api/auth/otp/verify/route.ts`, `(auth)/login/page.tsx`.
- **Backend:** none.
- **Frontend:** step 1 phone input (fa digits → en normalization, `09xxxxxxxxx` mask hint); step 2 six-digit code input with auto-submit, 120s resend countdown, masked phone display + edit-phone link; route on success to `next` param or `/onboarding` when `onboardingCompleted=false` else `/dashboard`; keep refresh-cookie handling identical to current login BFF route (reuse `upstreamRefreshToken`).
- **Database:** none.
- **API:** BFF routes proxy to `auth/otp/*` (JSON only).
- **Validation:** zod schemas mirroring API rules; client-side digit normalization (`۰۹…` → `09…`).
- **Error states:** inline field errors; toast for 429/503/403 with human fa messages; network error retry.
- **Permissions:** public page.
- **Acceptance:** login journey works on mobile viewport RTL; resend disabled during countdown; wrong-code error clears input.
- **Testing:** component tests (steps, countdown, normalization); hook tests with mocked BFF.
- **DoD:** email/password form deleted; `features/auth` barrel updated; lint/typecheck/test green.

### AUTH-005 — Seed + docs refresh for phone auth

**P0 · Phase 1 · Auth · S** — Deps: AUTH-003

- **Goal:** Seed creates phone-based admin (with password) + sample users; README/env docs updated.
- **Why:** Local dev and agent sessions need deterministic accounts after the identity switch.
- **User story:** n/a (developer task).
- **Files:** `apps/api/prisma/seed.ts`, `apps/api/README.md`, `doc/ARCHITECTURE.md` (security section: phone OTP), `apps/web/README.md`.
- **Backend:** seed: admin `09120000000` + password `admin-password-123` (role ADMIN), two sample users (buyer/seller) with completed profiles (profiles land with ONB-001 — extend then); safe to run repeatedly (upsert by phone).
- **Frontend:** docs only.
- **Database:** seed changes only.
- **API:** none.
- **Acceptance:** `npm run db:seed` idempotent; documented test phone + dev OTP mode instructions.
- **Testing:** seed runs clean on fresh DB (verified via docker-compose).
- **DoD:** docs mention OTP flow + admin password path.

### AUTH-006 — Session & device management

**P1 · Phase 9 · Auth · M** — Deps: AUTH-003

- **Goal:** Users see active sessions (device label, last used) and can revoke one or all.
- **Why:** "Session/device invalidation" requirement; cheap on existing RefreshToken store.
- **User story:** As a user I log out a lost phone from settings.
- **Files:** `apps/api/src/modules/auth/auth.controller.ts` (+ `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `DELETE /auth/sessions`), token.service; `apps/web/src/features/auth/…` settings section (uses DSH-004 page or standalone `/settings/sessions`).
- **Backend:** populate `deviceLabel`/`userAgent`/`lastUsedAt` on refresh exchange; list excludes revoked/expired; revoke-all reuses `revokeAllForUser`.
- **Frontend:** fa list w/ relative last-used (Jalali), revoke buttons + confirm.
- **Database:** fields from AUTH-001 (no migration).
- **API:** swagger DTOs + `gen:types`.
- **Validation:** session id must belong to caller.
- **Error states:** 404 unknown id (or another user's → 404, not 403, to avoid probing).
- **Permissions:** authenticated owner.
- **Acceptance:** revoking a session fails its next refresh attempt; each row shows login activity (device label, created, last used).
- **Testing:** e2e: two sessions, revoke one, other keeps working; unit tests for list filtering.
- **DoD:** settings UI wired; suites green.

### AUTH-007 — Change phone number

**P1 · Phase 9 · Auth · M** — Deps: AUTH-002, AUTH-003

- **Goal:** Authenticated user verifies a new phone via OTP (purpose `PHONE_CHANGE`) and the account switches.
- **Why:** Businesses change numbers; keeps account continuity (history, ratings).
- **Files:** `apps/api/src/modules/auth/…` (`POST /auth/phone-change/request`, `POST /auth/phone-change/confirm`), `OtpService`; web settings form.
- **Backend:** request(newPhone) → OTP to new phone (purpose PHONE_CHANGE, caps enforced); confirm(code) → transaction: uniqueness check, update `User.phone`, revoke all refresh tokens except current family, audit log entry.
- **Frontend:** two-step form in settings (mirror login UX), success → re-login notice.
- **Database:** none.
- **API:** swagger + `gen:types`.
- **Validation:** new phone format + different from current; code purpose must be PHONE_CHANGE (LOGIN codes rejected).
- **Error states:** 409 phone taken; 401 bad code; 429 caps.
- **Permissions:** authenticated.
- **Acceptance:** old phone can no longer log in; new phone logs into same account with history intact; AuditLog row exists.
- **Testing:** e2e happy + conflict paths; purpose-mixing test.
- **DoD:** suites green.

### AUTH-008 — Account deletion

**P1 · Phase 9 · Auth · S** — Deps: AUTH-003, ONB-001

- **Goal:** Soft-delete self-service account with safe data handling.
- **Why:** Required auth feature; must not destroy marketplace data (deals/reviews reference users).
- **Files:** `apps/api/src/modules/auth/…` (`DELETE /auth/account`), users service; web settings (danger zone).
- **Backend:** transaction: set `status=DELETED`, `deletedAt`, anonymize name/`avatar`, null email, keep phone occupied (re-registration with same number → support flow, documented) or release after 30d (pick: keep occupied, document); revoke all sessions; AuditLog.
- **Frontend:** confirm dialog with consequences copy (fa).
- **Database:** none.
- **API:** swagger + `gen:types`.
- **Validation:** requires explicit confirm string in body.
- **Error states:** sellers with ACTIVE lots must pause/remove them first (409 with message) — keeps marketplace clean.
- **Permissions:** authenticated self.
- **Acceptance:** deleted user: login rejected, public profile 404s, past deals keep a «کاربر حذف‌شده» placeholder.
- **Testing:** e2e deletion + access-after tests.
- **DoD:** suites green.
