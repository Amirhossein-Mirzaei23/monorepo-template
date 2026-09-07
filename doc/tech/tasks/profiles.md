# Tasks — Onboarding & Profiles (ONB, PROF)

Context: `User` gains `accountRoles: [BUYER, SELLER]` (AUTH-001) — one account can act as both.
No business/legal documents in MVP. Public seller profile is a P0 trust surface.

---

### ONB-001 ✅ — Profile domain + onboarding API

**P0 · Phase 1 · Profiles · M** — Deps: AUTH-003, CAT-001 (for interests)

- **Goal:** `Profile` model and `PUT /profiles/onboarding` + `GET /profiles/me` endpoints.
- **Why:** First-login role selection and business identity power every later permission and display.
- **User story:** As a new user I pick buyer/seller/both and fill my business basics so I can use the marketplace.
- **Files:** `apps/api/src/modules/profiles/` (new module), `prisma/schema.prisma` + migration.
- **Backend:** `Profile` per plan §3 (userId unique; common: displayName, businessName?, province?, city?, bio?, instagram?, website?; seller extras: sellerYearsActive?, sellerBusinessType?, sellerDescription?; isBuyer/isSeller mirror accountRoles; `ProfileInterest` join to Category). `PUT /profiles/onboarding`: transaction — upsert profile, set `User.accountRoles` + `onboardingCompletedAt`. `GET /profiles/me` returns profile + verification badges (TRS-001 later adds badges).
- **Frontend:** none (ONB-002).
- **Database:** migration + indexes (userId unique).
- **API:** swagger DTOs; `@ApiBearerAuth`; `gen:types`.
- **Validation:** at least one role; displayName 3–60; businessName ≤ 80 required for sellers; city required (province derived from a static province/city list — ship as shared const `packages/shared-types` hand-authored? No: seed table not needed; use a static TS list in both apps via a small shared module in `packages/shared-types/src/iran-geo.ts` (hand-authored, allowed pre-codegen? it's not generated — put it in `apps/web/src/lib/iran-geo.ts` + api `src/common/constants/iran-geo.ts` duplicated once, documented); instagram handle pattern; website URL optional.
- **Error states:** 400 validation; 409 re-onboarding allowed (idempotent update).
- **Permissions:** authenticated.
- **Acceptance:** onboarding completes in one call; `auth/me` reflects `onboardingCompleted`; re-submit updates.
- **Testing:** service unit (transaction, role sync), controller e2e.
- **DoD:** suites green; `gen:types` regenerated.

### ONB-002 ✅ — Mobile-first onboarding UI

**P0 · Phase 1 · Profiles · L** — Deps: ONB-001, CAT-001, PLAT-001

- **Goal:** Multi-step Persian onboarding wizard at `/onboarding` (guarded; skippable sections per role).
- **Why:** Conversion-critical first session; mobile-first per product principle.
- **User story:** As a seller on my phone I finish onboarding in under 2 minutes.
- **Files:** `apps/web/src/features/onboarding/` (gen:feature), `app/(onboarding)/onboarding/page.tsx`, layout.
- **Backend:** none.
- **Frontend:** steps: 1) role select (buyer / seller / both — big touch cards) 2) identity (displayName, businessName when seller, city picker from geo list) 3) interests (category chips) 4) seller extras (years active select, business type select, description textarea) 5) optional links (instagram/website) — progress indicator, back/next, autosave draft to localStorage, submit → `/dashboard`; skip path for buyers after step 3; accessible labels; fa validation messages from zod schema.
- **Database:** none.
- **API:** consumes ONB-001.
- **Validation:** mirrors API zod schema (`features/onboarding/schemas/`).
- **Error states:** inline per-field; toast on submit failure w/ retry.
- **Permissions:** authenticated; un-onboarded users redirected here from `(app)` layout (server-side check on `onboardingCompleted`).
- **Acceptance:** wizard completes on 360px viewport; drafts survive reload; buyer path = 3 steps.
- **Testing:** component tests per step + full flow test with mocked api.
- **DoD:** lint/typecheck/test green.

### PROF-001 ✅ — My profile view/edit

**P0 · Phase 1 · Profiles · M** — Deps: ONB-001

- **Goal:** `PATCH /profiles/me` + `/settings/profile` UI showing all own fields and trust placeholders.
- **Why:** Users must maintain identity info; surfaces trust metrics layout used on public pages.
- **Files:** `apps/api/src/modules/profiles/*` (edit endpoint + dto), `apps/web/src/features/profile/` + `app/(app)/settings/profile/page.tsx`.
- **Backend:** partial update rules (role changes allowed — adds accountRole, never removes history); display metrics block (successful transactions, rating, response rate/time, cancellation rate, active listings) computed as zeros/dashes until P1.
- **Frontend:** form reusing onboarding field components; read-only metrics section with placeholders; avatar slot (activated by PROF-004).
- **Database:** none.
- **API:** swagger + `gen:types`.
- **Validation:** same as ONB-001 subset.
- **Error states:** inline/toast per conventions.
- **Permissions:** owner.
- **Acceptance:** edit persists and reflects immediately (react-query invalidation).
- **Testing:** e2e edit; component test.
- **DoD:** suites green.

### PROF-002 ✅ — Public seller profile page

**P0 · Phase 1 · Profiles · M** — Deps: ONB-001, MKT-005 (lot cards) — badge row renders empty until TRS-002 lands

- **Goal:** `GET /profiles/sellers/:id` (public) + SSR page `/s/:id` with business info, badges, metrics, active + sold lot grids.
- **Why:** Buyers vet sellers before contacting — core trust surface (product principle 1).
- **Files:** api `profiles` module (public endpoint w/ role check), web `features/profile` (public view) + `app/(public)/s/[id]/page.tsx`.
- **Backend:** returns business info, about, categories (from lots), location (city/province only — never exact address), badge list, metrics (transactions, rating avg/count, response rate/time — placeholders allowed), paginated lots split active/sold via existing listing query filtered by seller.
- **Frontend:** SSR page; metrics strip; badge row; lot card grids (active first); report + share actions; empty states.
- **Database:** read-only (indexes from LOT-001).
- **API:** public `@Public()`; swagger + `gen:types`.
- **Validation:** id exists + user isSeller + status ACTIVE else 404.
- **Error states:** 404 page (fa).
- **Permissions:** public.
- **Acceptance:** page loads logged-out (SEO-ready); no private fields in payload (assert in test).
- **Testing:** e2e payload allowlist test (exact-address absence), page render test.
- **DoD:** suites green.

### PROF-003 — Public buyer profile (minimal)

**P1 · Phase 9 · Profiles · S** — Deps: ONB-001

- **Goal:** `GET /profiles/buyers/:id` + minimal page: display/business name, city, categories, completed purchases count, buyer rating, joined date, verification.
- **Why:** Sellers check who they're dealing with; required feature #5.
- **Files:** api profiles module; web minimal page `app/(public)/b/[id]/page.tsx`.
- **Backend:** computed counters only; no contact details.
- **Frontend:** simple SSR card.
- **API:** public; swagger + gen:types.
- **Validation:** exists + isBuyer else 404.
- **Permissions:** public.
- **Acceptance:** payload contains no phone/email (test).
- **Testing:** e2e allowlist test.
- **DoD:** suites green.

### PROF-004 — Avatar upload

**P1 · Phase 9 · Profiles · M** — Deps: MEDIA-001, MEDIA-002, ONB-001

- **Goal:** Users set a profile avatar from camera/gallery; cropped square; shown wherever the user appears.
- **Why:** Profile completeness; feature #2/#3 (profile image).
- **Files:** api profiles (`PATCH /profiles/me` accepts `avatarMediaId` after ownership check), web settings UI w/ `AvatarUploader` (reuses MEDIA-004 pieces).
- **Backend:** accept MediaAsset id owned by caller + mime image; store thumb variant key on profile.
- **Frontend:** crop-to-square client-side, upload via media api, PATCH profile; avatar component used in chat/profile/nav.
- **Database:** `avatarMediaId` (FK set null on media delete).
- **API:** swagger + gen:types.
- **Validation:** image type/size per MEDIA limits; 1 avatar.
- **Error states:** upload failures per MEDIA-004 patterns.
- **Permissions:** owner.
- **Acceptance:** avatar shows in navbar + chat messages; removal resets to initials placeholder.
- **Testing:** component + e2e set/remove.
- **DoD:** suites green.

### PROF-005 — Seller metrics rollup job

**P1 · Phase 9 · Profiles · M** — Deps: DEAL-005, CHT-003

- **Goal:** Nightly `@nestjs/schedule` job computing per-seller: response rate, median response time, cancellation rate; plus rating aggregates maintained on review publish.
- **Why:** Trust metrics must be real before being displayed prominently (features #3/#4); avoids on-read aggregation cost.
- **Files:** `apps/api/src/modules/jobs/` (new), profiles module (store on `Profile` numeric columns: responseRatePct, responseTimeMinutes, cancellationRatePct, successfulDeals, ratingAvg, ratingCount), `app.module.ts` (ScheduleModule).
- **Backend:** response metrics from Conversations (first seller reply within 24h of buyer first message = responded; median latency); cancellation from deals; rating from published reviews; all updated in one transaction per seller.
- **Frontend:** none (displays switch from placeholder to value).
- **Database:** nullable metric columns + updatedMetricsAt.
- **API:** values included in PROF-002 payload (already specced).
- **Validation:** guards against divide-by-zero (no conversations/deals → null → «—»).
- **Error states:** job failure logged + retried next cycle (idempotent).
- **Permissions:** system.
- **Acceptance:** metrics match manual SQL on fixture data; PROF-002 shows values.
- **Testing:** job unit test with fixtures; idempotency test.
- **DoD:** suites green; cron documented in module README.
