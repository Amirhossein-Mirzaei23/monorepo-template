# Tasks — Categories & Lots (CAT, LOT)

Context: The core marketplace object is a **LOT** (wholesale batch), not a retail product.
Categories are admin-managed data (2-level tree), never hardcoded enums in UI.
Lot lifecycle: `DRAFT → PENDING_REVIEW → ACTIVE ⇄ PAUSED; → SOLD | EXPIRED | REJECTED | REMOVED`.

---

### CAT-001 ✅ — Category domain + seed

**P0 · Phase 2 · Catalog · M** — Deps: AUTH-001 (migration order)

- **Goal:** `Category` self-relation model, public tree query, seeded initial taxonomy.
- **Why:** Lots, onboarding interests, filters and home sections all key off categories; must be data-driven from day 1.
- **User story:** As an admin I can add categories later without code changes (feature #6).
- **Files:** `apps/api/src/modules/categories/` (module/service/repo/dto), `prisma/schema.prisma` + migration, `prisma/seed.ts` (extend).
- **Backend:** model: `nameFa`, `nameEn?`, `slug` unique, `parentId?` (depth ≤ 2 enforced in service), `sortOrder`, `isActive @default(true)`. Service: `tree()` (two levels, active only, ordered), admin CRUD in CAT-004.
- **Frontend:** none.
- **Database:** migration + seed: پوشاک (مردانه/زنانه/بچگانه/لباس زیر/اسپرت), کفش (مردانه/زنانه/بچگانه/ورزشی), کیف و اکسسوری (کیف/کمربند/کلاه/عینک/اکسسوری), خانه و لوازم خانگی (آشپزخانه/دکوراتیو/اتاق خواب/ملزومات خانگی), زیبایی و بهداشتی, کالا مصرفی FMCG (مواد غذایی بسته‌بندی/شوینده/اقلام مصرفی).
- **API:** `GET /categories` public `@Public()`; swagger + `gen:types`.
- **Validation:** slug kebab-case unique; nameFa required 2–50; parent must be top-level.
- **Error states:** inactive categories hidden from public tree but resolvable by id for historical lots.
- **Permissions:** public read; admin write (CAT-004).
- **Acceptance:** seeded tree returns nested structure; adding a sub-subcategory via service throws.
- **Testing:** service unit tests (depth guard, ordering); controller e2e.
- **DoD:** seed idempotent; suites green; `gen:types` regenerated.

### CAT-002 — (folded into CAT-001) Public categories API

Covered by CAT-001 (`GET /categories`). Kept as ID for dependency references only.

### CAT-003 ✅ — Category picker components

**P0 · Phase 2 · Catalog · S** — Deps: CAT-001

- **Goal:** Shared web components: `CategoryTreePicker` (two cascading selects / bottom sheets) + `CategoryChips` (interests) + category icon map.
- **Why:** Reused by onboarding, create-lot, filters, home — build once.
- **User story:** As a seller I pick پوشاک → مردانه in two taps on mobile.
- **Files:** `apps/web/src/features/categories/` (gen:feature), hooks w/ react-query (public endpoint), `components/category-tree-picker.tsx`, `category-chips.tsx`.
- **Backend:** none.
- **Frontend:** RTL cascading select (native `<select>` for reliability on mobile) + sheet variant; chips multi-select; loading/empty/error states; fa labels.
- **Database:** none.
- **API:** consumes `GET /categories`.
- **Validation:** child requires parent; disabled options for inactive.
- **Error states:** fetch error → retry UI.
- **Permissions:** public data.
- **Acceptance:** picker used in ONB-002 and LOT-004 without modification (integration proven later).
- **Testing:** component tests (cascading behavior, keyboard nav).
- **DoD:** barrel exports; lint/typecheck/test green.

### CAT-004 ✅ — Admin categories CRUD API

**P0 · Phase 2 · Catalog · M** — Deps: CAT-001 (uses the existing `@Roles(ADMIN)` guard; admin UI arrives with ADM-007)

- **Goal:** `POST /admin/categories`, `PATCH /admin/categories/:id` (name/slug/parent/toggle), `PATCH /admin/categories/:id/reorder`.
- **Why:** Feature #6: taxonomy changes without deploys.
- **Files:** `apps/api/src/modules/categories/` admin controller (or `modules/admin/categories.controller.ts` per module layout choice — keep domain module with an admin controller), AuditLog writes.
- **Backend:** depth guard, slug uniqueness, reorder = sibling `sortOrder` swap; deactivate hides from public tree; lots keep referencing; AuditLog `category:update` etc.
- **Frontend:** none (ADM-007).
- **Database:** none.
- **API:** `@Roles(ADMIN)`; swagger + `gen:types`.
- **Validation:** as CAT-001; reorder target must be sibling.
- **Error states:** 409 slug clash; 400 depth violation.
- **Permissions:** ADMIN only.
- **Acceptance:** create/edit/toggle/reorder verified by e2e; AuditLog rows written.
- **Testing:** controller e2e incl. rbac (403 for USER).
- **DoD:** suites green.

### LOT-001 ✅ — Lot domain model + repository

**P0 · Phase 2 · Lots · L** — Deps: AUTH-001, CAT-001

- **Goal:** Full `Lot` model (plan §3), enums, indexes, trgm search indexes, repository with listing-ready queries.
- **Why:** The marketplace's central entity; every later task depends on this schema being right.
- **User story:** n/a (foundation).
- **Files:** `apps/api/prisma/schema.prisma` + migration (incl. raw SQL for `pg_trgm` + GIN), `src/modules/lots/lots.repository.ts`, `src/modules/lots/lots.constants.ts` (enum display maps fa).
- **Backend:** fields/enums/indexes exactly per plan §3 (code nanoid-8, sellerId, categoryId, subcategoryId?, title, description, quantity, unit, availableQuantity, minOrderQuantity, pricingType, totalPrice, unitPrice stored, condition, liquidationReason, province, city, locationHint, exactAddress private, status, rejectionReason?, viewCount, saveCount, expiresAt, publishedAt?, soldAt?, featuredAt?, deletedAt). Repository: `findPublic` (status ACTIVE + filters + sort allowlist + pagination), `findBySellerAndId`, `findById`, `create`, `update`, counters atomic inc.
- **Frontend:** none.
- **Database:** migration; indexes per plan; trgm GIN on title/description.
- **API:** none yet.
- **Validation:** invariants enforced at service layer next task (0 ≤ available ≤ quantity; unitPrice derived; minOrder ≤ quantity).
- **Error states:** n/a.
- **Permissions:** n/a.
- **Acceptance:** `findPublic` EXPLAIN uses indexes on seeded 1k synthetic lots (script in tests); enums compile.
- **Testing:** repository tests against fake-prisma for filter/sort composition; migration up/down tested.
- **DoD:** migration + model committed; `prisma generate` clean.

### LOT-002 ✅ — Lot create/update service + API

**P0 · Phase 2 · Lots · M** — Deps: LOT-001, ONB-001 (seller role)

- **Goal:** `POST /lots` (creates DRAFT or directly PENDING_REVIEW), `PATCH /lots/:id` (DRAFT/REJECTED only), full validation + derived fields.
- **Why:** Sellers must be able to draft and edit lots (feature #8).
- **User story:** As a seller I save a draft and finish it later.
- **Files:** `apps/api/src/modules/lots/lots.service.ts`, `lots.controller.ts`, `dto/create-lot.dto.ts`, `dto/update-lot.dto.ts`, `dto/lot-response.dto.ts` (two shapes: public + owner — exactAddress/rejectionReason only in owner shape).
- **Backend:** validations: title 5–120 fa-aware; description ≤ 5000; category required + sub optional but must be child of category; quantity ≥ 1; available default = quantity; minOrder 1..quantity; unitPrice computed `round(total/quantity)`; totalPrice 1..2,000,000,000 Toman; condition/reason enums; province/city from geo list; locationHint free text ≤ 100 (shown publicly); exactAddress ≤ 300 (never public); expiresAt default +30d at submit; edit rules: DRAFT/REJECTED fully editable (resubmit moves REJECTED → PENDING_REVIEW, clears reason); while ACTIVE/PAUSED only price/quantity/minOrder/availableQuantity are editable (revalidated, no re-moderation, fires the `LOT_PRICE_CHANGED` hook point consumed by NTF-001); any content edit (title/description/category/media/location) on ACTIVE/PAUSED returns the lot to PENDING_REVIEW.
- **Frontend:** none (LOT-004).
- **Database:** none.
- **API:** owner-scoped `@ApiBearerAuth`; response DTO split; swagger + `gen:types`.
- **Validation:** as above; unit default PIECE.
- **Error states:** 403 non-owner; 409 illegal status edit; 400 validation.
- **Permissions:** authenticated + `accountRoles` includes SELLER (else 403 «ابتدا فروشنده شوید»).
- **Acceptance:** draft→edit→submit flow via e2e; public response never contains exactAddress/rejectionReason (allowlist test).
- **Testing:** service unit (all validation branches, derivation, transitions); controller e2e.
- **DoD:** suites green.

### LOT-003 ✅ — Lot lifecycle actions API

**P0 · Phase 2 · Lots · M** — Deps: LOT-002

- **Goal:** `POST /lots/:id/submit|pause|resume|mark-sold|duplicate`, `DELETE /lots/:id`.
- **Why:** Sellers control listing state (feature #8: pause/resume/mark sold/delete/duplicate).
- **User story:** As a seller I pause my lot while renegotiating with a buyer, then resume it.
- **Files:** `apps/api/src/modules/lots/lots.controller.ts` (actions), `lots.service.ts` (transition table).
- **Backend:** allowed transitions: DRAFT/REJECTED→PENDING_REVIEW (submit); ACTIVE→PAUSED (pause); PAUSED→ACTIVE (resume); ACTIVE/PAUSED→SOLD (mark-sold, sets soldAt, available→0); DRAFT→(edit→submit); DELETE = soft delete any non-sold status → REMOVED; duplicate = copy to new DRAFT with fresh code/expiry, media linked in MEDIA-005 (allow duplicate before media task: copies fields only). Transitions recorded in AuditLog (self actions).
- **Frontend:** none.
- **Database:** none.
- **API:** owner-only; swagger + `gen:types`.
- **Validation:** status precondition per action.
- **Error states:** 409 illegal transition w/ fa message; 403 non-owner.
- **Permissions:** owner seller.
- **Acceptance:** full lifecycle e2e incl. illegal moves rejected; paused lots hidden from `findPublic`.
- **Testing:** state-machine unit tests (table-driven, every pair); e2e happy paths.
- **DoD:** suites green.

### LOT-004 — Create/edit lot UI (mobile-first wizard)

**P0 · Phase 2 · Lots · L** — Deps: LOT-002, CAT-003, MEDIA-004 (media step), PLAT-001

- **Goal:** `/dashboard/lots/new` + `/dashboard/lots/:id/edit` wizard: media → basics → pricing/quantity → classification/location → review & submit; drafts autosaved.
- **Why:** The seller conversion funnel; must be thumb-friendly (product principle: mobile-first listing creation).
- **User story:** As a seller I create a complete lot from my phone in ~3 minutes with photos and a video.
- **Files:** `apps/web/src/features/lots/` (gen:feature + components `create-lot-wizard`, step forms, `unit-price-preview`), `app/(app)/dashboard/lots/new/page.tsx`, `.../lots/[id]/edit/page.tsx`.
- **Backend:** none.
- **Frontend:** steps with sticky next button; live unit-price preview («قیمت هر واحد: ~۲۲٬۵۰۰ تومان»); quantity/unit pickers; condition + liquidation-reason selects (fa labels from constants); city picker; locationHint field with helper copy («فقط منطقه تقریبی — آدرس دقیق بعد از معامله منتشر می‌شود»); exactAddress field marked private; review step with card preview; draft autosave (debounced PATCH) + resume; submit → «در انتظار بررسی» state; edit mode locked for non-editable statuses (read-only + status banner + rejection reason when REJECTED).
- **Database:** none.
- **API:** consumes LOT-002/003.
- **Validation:** zod mirror of API; fa messages.
- **Error states:** per-step inline; submit failure keeps draft.
- **Permissions:** seller.
- **Acceptance:** wizard completes at 360px; draft resumes; rejection reason visible and resubmit works.
- **Testing:** component tests per step; wizard flow test (mocked api); unit-price derivation test.
- **DoD:** lint/typecheck/test green; used by QA-001.

### LOT-005 — My Lots management UI

**P0 · Phase 2 · Lots · M** — Deps: LOT-003, LOT-004

- **Goal:** `/dashboard/lots` seller inventory: tabs (فعال/در انتظار بررسی/پیش‌نویس/ردشده/فروخته‌شده/منقضی), row cards with status + quick actions.
- **Why:** Sellers manage their lifecycle actions in bulk context (feature #26 "My Lots").
- **Files:** `apps/web/src/features/lots/components/my-lots-page.tsx`, `app/(app)/dashboard/lots/page.tsx`, api hooks (`GET /lots/mine` — add endpoint here: owner listing w/ status filter + pagination).
- **Backend:** add `GET /lots/mine` (owner-scoped, all non-removed statuses, status filter param) to lots controller.
- **Frontend:** tabs + infinite scroll; per-lot action menu (pause/resume/mark sold/duplicate/edit/delete with confirms); status chips fa; empty states per tab.
- **Database:** index (sellerId, status, updatedAt) if missing.
- **API:** owner; swagger + gen:types.
- **Validation:** status param allowlist.
- **Error states:** list error retry; action failure toast + refresh.
- **Permissions:** owner seller.
- **Acceptance:** all LOT-003 actions executable from UI; optimistic status chip updates.
- **Testing:** component tests incl. action-permission matrix by status.
- **DoD:** suites green.

### LOT-006 ✅ — Lot expiration job

**P0 · Phase 2 · Lots · S** — Deps: LOT-001 (creates the shared `jobs` module)

- **Goal:** Hourly cron expires ACTIVE lots past `expiresAt` → status EXPIRED (+ notification hook point, realized in P1).
- **Why:** Ending-soon sorting and marketplace freshness depend on real expiry (features #7/#14).
- **Files:** `apps/api/src/modules/jobs/` (new module, `@nestjs/schedule` dep), `jobs/lot-expiry.service.ts`.
- **Backend:** batched `updateMany` (status ACTIVE, expiresAt < now → EXPIRED); log count; hooks for future notifications left as TODO comment.
- **Frontend:** none.
- **Database:** index (status, expiresAt) from LOT-001.
- **API:** none.
- **Validation:** idempotent.
- **Error states:** job errors logged, retried next hour.
- **Permissions:** system.
- **Acceptance:** seeded lot with past expiry flips after run; sellers see منقضی tab.
- **Testing:** unit test with fake clock; e2e smoke via manual trigger (test-only endpoint guarded by env? no — unit test only).
- **DoD:** schedule registered in app module; README documents jobs.
