# Tasks — Trust, Moderation & Admin (TRS, ADM, REV)

Context: Trust is a core feature (principle 1). MVP verification is manual/admin; moderation is
the Draft→Review→Live gate; the admin panel lives in the same apps behind `ADMIN` role. All admin
actions write `AuditLog`.

---

### TRS-001 — Verification domain + admin API

**P0 · Phase 7 · Trust · M** — Deps: AUTH-001, LOT-001

- **Goal:** `Verification` model (subject USER|LOT × 8 badge types, status lifecycle) + admin endpoints `GET /admin/verifications`, `PATCH /admin/verifications/:id` (approve/reject/revoke w/ note).
- **Why:** Features #28 — manual trust badges without KYC.
- **User story:** As an admin I mark a seller «فروشنده تأییدشده» after a phone check.
- **Files:** `apps/api/src/modules/verifications/` (module/service/repo/dto), migration, AuditLog writes.
- **Backend:** `PHONE_VERIFIED` auto-granted at OTP signup (system actor); admin grants others; one row per subject+type (upsert semantics); effective badges = status APPROVED and not revoked; public badge read API included (`GET /verifications?subjectType&subjectId` public or embedded in payloads — choose embedded via repository helper consumed by lots/profile queries).
- **Frontend:** none (TRS-002 displays; ADM-006 manages).
- **Database:** migration + indexes (subjectType, subjectId, type), (status).
- **API:** admin `@Roles(ADMIN)`; swagger + gen:types.
- **Validation:** type/subject enums; note ≤ 500 on reject/revoke.
- **Error states:** 404 unknown; 409 duplicate active badge (upsert instead).
- **Permissions:** ADMIN (PHONE_VERIFIED system-only).
- **Acceptance:** grant/revoke reflected in embedded badge queries; AuditLog rows written.
- **Testing:** service unit + e2e rbac.
- **DoD:** suites green.

### TRS-002 — Badge display

**P0 · Phase 7 · Trust · S** — Deps: TRS-001, MKT-005

- **Goal:** `VerifiedBadge` component set (8 types, fa tooltips) shown on: lot card, lot detail, seller profile, chat counterpart, verified filter chip.
- **Why:** Features #3/#4/#15/#16 — badges must be visible to build trust.
- **Files:** `apps/web/src/components/verified-badge.tsx` (app-level shared), api payload embeds (`badges: string[]`) in lot-card/seller/profile/conversation DTOs.
- **Backend:** embed badge arrays in the listed DTOs (join in mappers).
- **Frontend:** icon + label tooltip; RTL-safe; small variant for cards.
- **Database / API:** embedded; `gen:types` regen.
- **Validation:** unknown badge types ignored gracefully.
- **Error states:** none (decorative).
- **Permissions:** public display.
- **Acceptance:** badge appears end-to-end after admin grant (manual QA script).
- **Testing:** component test; payload embed e2e.
- **DoD:** suites green.

### TRS-003 — Reports domain + create API

**P0 · Phase 7 · Trust · M** — Deps: AUTH-001, LOT-001, CHT-001

- **Goal:** `Report` model (9 reasons × 4 subject types) + `POST /reports` (authenticated) + status lifecycle.
- **Why:** Feature #31 — user-driven moderation intake.
- **User story:** As a buyer I report a fake listing with one tap.
- **Files:** `apps/api/src/modules/reports/` (module/service/repo/dto), migration.
- **Backend:** dedupe (same reporter+subject+OPEN → 409 idempotent); subject existence checks; note optional ≤ 1000; status OPEN → REVIEWING → RESOLVED|REJECTED (admin, ADM-004).
- **Frontend:** none (TRS-004).
- **Database:** migration + indexes (status, createdAt), (subjectType, subjectId).
- **API:** authenticated; throttle (5/hour); swagger + gen:types.
- **Validation:** enums; subjectId format per type.
- **Error states:** 404 subject; 409 duplicate open.
- **Permissions:** any authenticated user.
- **Acceptance:** report lands in admin queue (TRS-005 manual verify).
- **Testing:** service unit + e2e.
- **DoD:** suites green.

### TRS-004 — Report UI

**P0 · Phase 7 · Trust · S** — Deps: TRS-003, MKT-009, PROF-002

- **Goal:** Report dialog component (reason radio list fa, optional note) reusable on lot detail, seller profile, chat thread; success toast «گزارش شما ثبت شد».
- **Why:** Feature #31 UX.
- **Files:** `apps/web/src/components/report-dialog.tsx`, wiring in lot-detail/seller-profile/chat features.
- **Backend:** none.
- **Frontend:** shadcn dialog; a11y radio group; submit disabled while pending.
- **Database / API:** consumes TRS-003.
- **Validation:** reason required.
- **Error states:** 409 duplicate → info toast («قبلاً گزارش داده‌اید»).
- **Permissions:** authenticated (anonymous → login redirect).
- **Acceptance:** report from all three surfaces reaches queue.
- **Testing:** component test.
- **DoD:** suites green.

### TRS-005 — Lot moderation queue API

**P0 · Phase 7 · Trust · M** — Deps: LOT-003

- **Goal:** Admin endpoints: `GET /admin/lots?status=PENDING_REVIEW` (w/ media previews, seller summary, report count), `POST /admin/lots/:id/approve|reject|pause|remove|feature`.
- **Why:** Features #33/#34 — the moderation workflow backend.
- **User story:** As an admin I review submitted lots and approve/reject with a reason.
- **Files:** `apps/api/src/modules/admin/` (or lots admin controller), lots service (approve/reject logic), AuditLog.
- **Backend:** approve: PENDING_REVIEW→ACTIVE (+publishedAt, expiresAt set, notification hook); reject: →REJECTED + `rejectionReason` required (fa, shown to seller — feature #34); pause: ACTIVE→PAUSED (admin-initiated, seller sees banner); remove: →REMOVED (soft, hides publicly, reason audited); feature: set/clear `featuredAt` (powers future sections); guards per current status.
- **Frontend:** none (ADM-003).
- **Database:** `featuredAt` (in LOT-001 migration).
- **API:** `@Roles(ADMIN)`; swagger + gen:types.
- **Validation:** reject reason required 10–500; transitions per status.
- **Error states:** 409 illegal state.
- **Permissions:** ADMIN.
- **Acceptance:** submit→approve→live and submit→reject→resubmit loops e2e; audited.
- **Testing:** e2e moderation loop; unit transition guards.
- **DoD:** suites green.

### TRS-006 — Moderation wiring in seller flow

**P0 · Phase 7 · Trust · S** — Deps: TRS-005, LOT-004, LOT-005

- **Goal:** Seller-visible moderation states: «در انتظار بررسی» banner (ETA copy), rejection reason display on lot + my-lots row + edit screen resubmit path.
- **Why:** Feature #34 — seller must understand and recover from rejection.
- **Files:** web `features/lots` banners/status chips; api owner-payload already carries rejectionReason (LOT-002).
- **Backend:** none.
- **Frontend:** status explanation copy; resubmit button (LOT-003 submit on REJECTED).
- **Database / API:** none new.
- **Validation / Errors / Permissions:** per existing.
- **Acceptance:** rejected→edit→resubmit→pending works from UI (manual script).
- **Testing:** component test for reason display.
- **DoD:** suites green.

### TRS-007 — Inspection workflow

**P1 · Phase 9 · Trust · M** — Deps: TRS-001, ADM-003, MEDIA-002

- **Goal:** `Inspection` model + admin recording API + display: admin logs a physical/lot inspection (quantity/condition checked, defects, notes, photos via MediaAsset, result) → grants QUANTITY_CHECKED/CONDITION_CHECKED/LOT_VERIFIED badges accordingly.
- **Why:** Feature #29 — manual inspection network groundwork (admin workflow first).
- **Files:** `apps/api/src/modules/inspections/`, migration, admin UI section in ADM-003 lot detail, lot-detail page inspection block.
- **Backend:** inspector = admin user; result enum; badge side-effects in same transaction; AuditLog.
- **Frontend:** admin form (checkboxes, notes, photo upload reuse); public block on lot detail («بازدید انجام شده — تعداد تأیید شد») with notes-redacted summary.
- **Database:** migration + photoMediaIds relation to MediaAsset.
- **API:** `@Roles(ADMIN)` write; public read embedded in lot detail; swagger + gen:types.
- **Validation:** result required; photos ≤ 10.
- **Error states:** lot not ACTIVE → 409.
- **Permissions:** admin write / public summary read.
- **Acceptance:** inspection shows on lot page + badges update.
- **Testing:** service unit + e2e.
- **DoD:** suites green.

### ADM-001 — Admin shell

**P0 · Phase 7 · Admin · M** — Deps: AUTH-003, PLAT-002

- **Goal:** `(admin)` route group + layout (sidebar nav fa), role gate (middleware + layout server check on `role=ADMIN`, non-admins → 404-style redirect), `/admin` overview dashboard.
- **Why:** Features #33 — one guarded home for all admin tools.
- **Files:** `apps/web/src/app/(admin)/admin/layout.tsx`, `page.tsx`, `src/middleware.ts` (role from me-cache is client-side — do layout-level server check via BFF `/api/auth/me`), `features/admin/`.
- **Backend:** `GET /admin/overview` (counts: pending lots, open reports, pending verifications, active users 7d, deals in dispute, GMV-lite optional P1).
- **Frontend:** desktop-first admin layout (data tables), nav to sections; RTL.
- **Database:** count queries only.
- **API:** `@Roles(ADMIN)`; swagger + gen:types.
- **Validation / Errors:** 403 non-admin.
- **Permissions:** ADMIN.
- **Acceptance:** non-admin gets redirect; overview numbers live.
- **Testing:** e2e rbac on overview.
- **DoD:** suites green.

### ADM-002 — Admin users management

**P0 · Phase 7 · Admin · M** — Deps: ADM-001, TRS-001

- **Goal:** `/admin/users`: search (phone/name/business), detail (profile, stats, lots, deals, reports-against), actions: suspend/reactivate, block/unblock, verify (badges), role changes (grant ADMIN w/ confirm).
- **Why:** Feature #33 Users section.
- **Files:** `features/admin/components/users-table.tsx`, `user-detail.tsx`, api `GET /admin/users`, `PATCH /admin/users/:id`.
- **Backend:** status transitions ACTIVE⇄SUSPENDED (login allowed, listings paused + banner), ACTIVE→BLOCKED (login rejected, content hidden w/ placeholder «کاربر مسدود»), audit all; cannot self-demote/block (guard).
- **Frontend:** server table w/ filters + action menus + confirms; business-safe copy.
- **Database:** none (User.status from AUTH-001).
- **API:** admin; swagger + gen:types.
- **Validation:** status transition guards; reason required for block/suspend.
- **Error states:** 409 illegal self-action.
- **Permissions:** ADMIN.
- **Acceptance:** suspended user can't login (e2e); blocked user's lots hidden from public listing (e2e).
- **Testing:** service unit + e2e rbac/effects.
- **DoD:** suites green.

### ADM-003 — Admin lots moderation UI

**P0 · Phase 7 · Admin · L** — Deps: ADM-001, TRS-005, MEDIA-005

- **Goal:** `/admin/lots` queue: filter by status; review view = full lot data + all media (images lightbox, video player) + seller summary + linked reports; actions approve/reject(reason)/pause/remove/feature.
- **Why:** The daily driver for marketplace quality (feature #33 Lots).
- **Files:** `features/admin/components/lots-queue.tsx`, `lot-review-panel.tsx`, `app/(admin)/admin/lots/**`.
- **Backend:** none (TRS-005).
- **Frontend:** keyboard-fast review (A=approve, R=reject dialog) for throughput; media secure view (admin authorized); report badges.
- **Database / API:** consumes admin endpoints.
- **Validation:** reject dialog enforces reason.
- **Error states:** transition conflicts toast + queue refresh.
- **Permissions:** ADMIN.
- **Acceptance:** moderator processes 20 seeded pending lots comfortably; actions audit-logged (spot check).
- **Testing:** component tests (queue render, action calls).
- **DoD:** suites green.

### ADM-004 — Admin reports queue

**P0 · Phase 7 · Admin · M** — Deps: ADM-001, TRS-003

- **Goal:** `/admin/reports`: open reports w/ subject preview (lot/user/conversation summary + deep link), assign status, resolve (note + optional linked action shortcuts: remove lot / block user), reject report.
- **Why:** Feature #33 Reports.
- **Files:** `features/admin/components/reports-queue.tsx`, `PATCH /admin/reports/:id` (TRS-003 lifecycle executor).
- **Backend:** resolve/reject writes resolutionNote + adminId + AuditLog; shortcuts call existing admin actions.
- **Frontend:** queue table + drawer detail; status chips.
- **Database / API:** consumes TRS-003 (+ gen:types for admin PATCH dto).
- **Validation:** resolutionNote required.
- **Error states:** subject deleted → show tombstone state.
- **Permissions:** ADMIN.
- **Acceptance:** report → queue → resolve w/ lot removal e2e.
- **Testing:** e2e lifecycle.
- **DoD:** suites green.

### ADM-005 — Admin deals view

**P0 · Phase 7 · Admin · M** — Deps: ADM-001, DEAL-003

- **Goal:** `/admin/deals`: filterable list (status/participants/lot/date), deal detail (timeline, terms, participants, linked conversation summary), dispute investigation: resolve buttons (DEAL-007 activates them).
- **Why:** Feature #33 Deals.
- **Files:** `features/admin/components/deals-table.tsx`, `deal-investigation.tsx`; api `GET /admin/deals`, `GET /admin/deals/:code`.
- **Backend:** read-only in MVP (+ dispute resolution per DEAL-007 P1); participant phone visible to admin (privacy exception documented).
- **Frontend:** timeline reuse from DEAL-004.
- **Database / API / Validation / Errors / Permissions:** standard admin.
- **Acceptance:** admin traces a full deal w/ timeline.
- **Testing:** e2e rbac + render.
- **DoD:** suites green.

### ADM-006 — Admin verification review

**P0 · Phase 7 · Admin · M** — Deps: ADM-001, TRS-001

- **Goal:** `/admin/verifications`: queue of requests (P1: user-submitted; MVP: admin-initiated grant console) — grant/revoke badges on users/lots w/ notes.
- **Why:** Feature #33 Verification.
- **Files:** `features/admin/components/verifications-panel.tsx` (search subject, badge picker, notes).
- **Backend:** TRS-001 endpoints.
- **Frontend:** grant console + history list.
- **Database / API / Validation / Errors / Permissions:** standard admin.
- **Acceptance:** badge granted here appears on public pages (manual script ties to TRS-002).
- **Testing:** component + e2e.
- **DoD:** suites green.

### ADM-007 — Admin categories management

**P0 · Phase 7 · Admin · M** — Deps: ADM-001, CAT-004

- **Goal:** `/admin/categories`: tree editor — create/edit (fa/en names, slug), reorder (up/down), enable/disable, lot-count column, safety copy when disabling (existing lots keep category).
- **Why:** Feature #33 Categories.
- **Files:** `features/admin/components/categories-editor.tsx`.
- **Backend:** CAT-004 endpoints.
- **Frontend:** drag optional; MVP up/down buttons + optimistic order.
- **Database / API / Validation / Errors / Permissions:** standard admin.
- **Acceptance:** new category usable in create-lot picker without deploy.
- **Testing:** component test.
- **DoD:** suites green.

### ADM-008 — Admin dashboard completeness

**P0 · Phase 7 · Admin · S** — Deps: ADM-001..ADM-004

- **Goal:** Overview page finalized: count cards + quick queues (latest pending lots, open reports), links; P1 adds ANL-003 metrics.
- **Why:** Single glance at operational load (moderation SLA, plan §14).
- **Files:** `app/(admin)/admin/page.tsx` finalize.
- **Acceptance:** all counts live-test.
- **Testing:** page test.
- **DoD:** suites green.

### REV-001 — Reviews API (deal-gated, double-blind)

**P1 · Phase 9 · Reviews · M** — Deps: DEAL-005

- **Goal:** `Review` model + `POST /reviews` (per direction, dims per role, comment) + publication rule (both submitted or +14d) + display queries; abuse guards.
- **Why:** Feature #30 — trust after completed deals.
- **User story:** After a completed deal I rate the seller on accuracy/quality/communication/delivery.
- **Files:** `apps/api/src/modules/reviews/`, migration, profile rating aggregates hook (PROF-005 consumes).
- **Backend:** eligibility: deal COMPLETED, reviewer participant, one per direction; dims 1–5 ints (seller-of-deal reviewed on 4 dims; buyer on 3); publish when both directions exist or 14 days post-completion (job check in PROF-005 cycle); comment ≤ 1000, phone/contact scrub regex; no edits; reportable via TRS-003 (subjectType MESSAGE? — add REVIEW subject type in this task's migration enum).
- **Frontend:** none (REV-002).
- **Database:** migration + unique(dealId, direction), index (revieweeId).
- **API:** authenticated; swagger + gen:types.
- **Validation:** as above.
- **Error states:** 403 ineligible; 409 duplicate.
- **Permissions:** deal participants.
- **Acceptance:** double-blind publication e2e (both → visible; one → hidden until deadline via job).
- **Testing:** service unit (eligibility, publish rule), e2e.
- **DoD:** suites green.

### REV-002 — Reviews UI

**P1 · Phase 9 · Reviews · M** — Deps: REV-001, DEAL-004

- **Goal:** Post-completion review prompt (deal detail + notification deep link): star dims + comment; seller profile reviews tab (list + rating summary); review report action.
- **Why:** Feature #30 UX.
- **Files:** `apps/web/src/features/reviews/` (gen:feature), `review-form.tsx`, `reviews-list.tsx`, `rating-summary.tsx`; seller page integration (PROF-002).
- **Backend:** `GET /profiles/sellers/:id/reviews` paginated (+ gen:types).
- **Frontend:** accessible star inputs (keyboard), fa labels per dimension; summary shows avg + count + dim averages.
- **Database / API / Validation / Errors / Permissions:** per REV-001.
- **Acceptance:** flow: complete deal → both rate → reviews visible on profile.
- **Testing:** component + e2e.
- **DoD:** suites green.
