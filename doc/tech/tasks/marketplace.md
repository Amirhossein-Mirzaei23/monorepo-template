# Tasks — Marketplace Discovery (MKT)

Context: Public read-side of the marketplace. Postgres-only search (`ILIKE` + `pg_trgm`),
indexed filters, sort allowlist via the shared pagination DTO. Home page prioritizes inventory
discovery. Exact seller addresses never appear in public payloads.

---

### MKT-001 ✅ — Public lot listing API

**P0 · Phase 4 · Marketplace · M** — Deps: LOT-001, MEDIA-005 (cover in payload)

- **Goal:** `GET /lots` — public, paginated, ACTIVE-only, sorted; card-shaped payload (cover thumb, title, prices, qty, condition, city, seller summary, verification, updatedAt).
- **Why:** Backbone of browse/home/search surfaces.
- **User story:** As a buyer I scroll the newest lots.
- **Files:** `apps/api/src/modules/lots/lots.controller.ts`, `dto/lot-card.dto.ts`, repository `findPublic` refinement (seller join + badges + cover).
- **Backend:** response mapping hides exactAddress/rejectionReason (allowlisted mapper); `include` tuned to avoid N+1 (seller profile + badges + cover via relation, single query set).
- **Frontend:** none.
- **Database:** uses LOT-001 indexes.
- **API:** `@Public()`; PaginationQueryDto + `sort` allowlist: `createdAt` (newest default), `updatedAt`, `priceAsc`, `priceDesc`, `quantityAsc`, `quantityDesc`, `expiresAt` (ending soon); swagger + `gen:types`. Future sorts (best-deal, distance, seller response time, popularity) stay out — the allowlist keeps them additive.
- **Validation:** pagination caps (limit ≤ 100).
- **Error states:** 400 bad sort/filter param.
- **Permissions:** public.
- **Acceptance:** 1k-lot fixture: p50 < 50 ms; payload field allowlist test green.
- **Testing:** controller e2e (sort × pagination), mapper allowlist unit test.
- **DoD:** suites green.

### MKT-002 ✅ — Filters API

**P0 · Phase 4 · Marketplace · M** — Deps: MKT-001 (the `verifiedSeller` filter param + EXISTS subquery land with TRS-001 in Phase 7 — ship the other filters first)

- **Goal:** Query params on `GET /lots`: categoryId(+sub), priceMin/Max, qtyMin/Max, city, province, condition[], pricingType, verifiedSeller, liquidationReason, freshness (`listedWithin`=7d/30d).
- **Why:** Feature #13 — buyers narrow to relevant inventory.
- **Files:** `apps/api/src/modules/lots/dto/lots-public-query.dto.ts`, repository where-builder.
- **Backend:** typed query DTO (class-validator, arrays allowed for condition/reason); verifiedSeller → EXISTS(approved BUSINESS_VERIFIED/SELLER_VERIFIED for seller); where composed in one builder with unit tests.
- **Frontend:** none (MKT-008).
- **Database:** verify composite index usage (categoryId,status),(city,status); add (pricingType) only if plans demand.
- **API:** public; swagger + `gen:types`.
- **Validation:** numeric ranges sane (price ≤ 2B, qty ≤ 1M); unknown enum values → 400.
- **Error states:** invalid combos ignored-safe (validated not crashed).
- **Permissions:** public.
- **Acceptance:** each filter selectable alone + combined in e2e; EXPLAIN uses indexes on fixture.
- **Testing:** where-builder unit tests (every filter), e2e combos.
- **DoD:** suites green.

### MKT-003 — Search API

**P0 · Phase 4 · Marketplace · M** — Deps: MKT-001

- **Goal:** `q` param on `GET /lots`: trigram similarity over title/description + exact matches on category names (fa), seller business name, city.
- **Why:** Feature #12 with Postgres only (no ES — constraint).
- **Files:** `lots-public-query.dto.ts` (`q` string trim ≤ 100), repository search builder.
- **Backend:** normalized query (fa digit/char normalize — «ي→ی», «ك→ک», digits); `title ILIKE %q% OR description ILIKE %q%` backed by trgm GIN, OR businessName/city/category-name matches via joins; relevance = simple ordering (exact-title prefix first) when `q` present; minimum q length 2.
- **Frontend:** none (MKT-007).
- **Database:** GIN trgm indexes from LOT-001; benchmark on 10k fixture.
- **API:** public; combined with filters/sort; swagger + gen:types.
- **Validation:** q sanitized (no regex semantics — literal).
- **Error states:** q < 2 chars → 400 («جستجو حداقل ۲ کاراکتر»).
- **Permissions:** public.
- **Acceptance:** Persian normalization works («تیشرت» finds «تی‌شرت» variants); search+filter+sort compose; p50 < 100 ms @10k.
- **Testing:** unit tests for normalizer; e2e search scenarios incl. empty results.
- **DoD:** suites green.

### MKT-004 — Marketplace home page

**P0 · Phase 4 · Marketplace · L** — Deps: MKT-005, MKT-006 (hooks), CAT-001, PLAT-002

- **Goal:** Public SSR `/`: search bar, category tiles, «تازه‌ها» fresh lots, «به‌زودی تمام می‌شوند» ending soon, «تأییدشده‌ها» verified suppliers strip.
- **Why:** Feature #11 — discovery-first landing (also the shared-link destination).
- **Files:** `apps/web/src/app/(public)/page.tsx`, `features/marketplace/components/home-sections.tsx`, `search-bar.tsx`, `category-tiles.tsx`.
- **Backend:** optional `GET /lots?sort=expiresAt&limit=8` reuse; verified-suppliers list: `GET /profiles/sellers?verified=true&limit=10` (small public endpoint added in this task).
- **Frontend:** RSC fetching initial sections (no client waterfall), «مشاهده همه» links to listing pages; search bar → `/lots?q=`; skeleton + error sections independent (one section failing doesn't kill page); fa copy. «بهترین قیمت‌ها» (best deals) section deferred per plan §9 — add as a heuristic once liquidity exists.
- **Database:** none.
- **API:** as above (swagger + gen:types).
- **Validation / Errors:** per-section error boundaries with retry links.
- **Permissions:** public.
- **Acceptance:** LCP < 2.5 s on throttled mobile; SEO metadata fa; sections populated from seeded data.
- **Testing:** page render test w/ mocked fetches; section empty-state tests.
- **DoD:** lint/typecheck/test green.

### MKT-005 — Lot card component

**P0 · Phase 4 · Marketplace · M** — Deps: MKT-001, PLAT-001 (verified badge renders once TRS-002 lands)

- **Goal:** `LotCard`: cover image, title, total + unit price, quantity+unit, condition chip, city, verified badge, seller name, relative updatedAt, save (heart) action.
- **Why:** Feature #15 — the atomic UI of every list surface.
- **Files:** `apps/web/src/features/marketplace/components/lot-card.tsx`, `condition-chip.tsx`, `verified-badge.tsx`.
- **Backend:** none.
- **Frontend:** aspect-square cover (thumb variant) w/ lazy load + skeleton; RTL layout; heart uses SAV-001 mutation when logged-in else redirects to login (prop-gated so card is usable pre-SAV with `saveable=false`); prices via `formatToman`; condition/reason fa labels from a shared display-map module (mirrors api constants).
- **Database / API:** consumes MKT-001 payload.
- **Validation:** image fallback placeholder when no cover.
- **Error states:** broken image → placeholder; card click navigates `/l/{code}`.
- **Permissions:** public render; save needs auth.
- **Acceptance:** 360px grid 2-col and 1-col list variant; a11y (card is one link, heart is separate button, keyboard reachable).
- **Testing:** component tests (render, save gating, price formatting).
- **DoD:** used by MKT-004/006/009, SAV-002, PROF-002.

### MKT-006 — Browse/listing page with infinite scroll

**P0 · Phase 4 · Marketplace · M** — Deps: MKT-005, MKT-001

- **Goal:** `/lots` — filter-aware grid, infinite scroll (react-query `useInfiniteQuery`), loading skeletons, empty state, error retry.
- **Why:** Feature #12 search UX + browse surface.
- **Files:** `apps/web/src/app/(public)/lots/page.tsx`, `features/marketplace/components/lot-list.tsx`, `hooks/use-lots.ts`, `api/keys.ts`.
- **Backend:** none.
- **Frontend:** URL-synced state (q/filters/sort via searchParams — shareable); IntersectionObserver sentinel; skeletons on load; empty state w/ category suggestions; error boundary + retry; SSR first page for SEO then client pages. Category landing pages `/c/{slug}` (SEO, PLAT-005) render this page pre-scoped to the category.
- **Database / API:** consumes MKT-001..003.
- **Validation:** URL params validated client-side before fetch.
- **Error states:** per-page append failure → inline retry row (list preserved).
- **Permissions:** public.
- **Acceptance:** scroll loads 5+ pages smoothly; deep-link with filters reproduces state; back button preserves scroll position.
- **Testing:** hook tests (pagination, dedupe), component test for empty/error.
- **DoD:** suites green.

### MKT-007 — Search UI

**P0 · Phase 4 · Marketplace · S** — Deps: MKT-006, MKT-003

- **Goal:** Search bar behavior: submit → `/lots?q=`, recent searches (localStorage, fa), search-from-home focus state, result count display, clear.
- **Why:** Feature #12 UX completeness.
- **Files:** `features/marketplace/components/search-bar.tsx` (extend), `recent-searches.ts`, listing header integration.
- **Backend:** none.
- **Frontend:** fa-digit normalization before submit; recents (max 8, removable); zero-result page suggests removing filters + popular categories.
- **Database / API:** none new.
- **Validation:** min length hint.
- **Error states:** n/a (listing page handles).
- **Permissions:** public.
- **Acceptance:** recents persist; shared links w/ q work logged-out.
- **Testing:** component tests (submit/normalize/recents).
- **DoD:** suites green.

### MKT-008 — Filters & sort UI

**P0 · Phase 4 · Marketplace · M** — Deps: MKT-002, MKT-006, CAT-003

- **Goal:** Mobile bottom-sheet (desktop sidebar) filter panel: category cascade, price/qty ranges (fa inputs), city select, condition chips, pricing type, verified toggle, reason select, freshness; sort dropdown; active-filter chips w/ individual removal + reset.
- **Why:** Feature #13/#14 complete UX.
- **Files:** `features/marketplace/components/filters-sheet.tsx`, `sort-select.tsx`, `active-filter-chips.tsx`, schema `filters-schema.ts`.
- **Backend:** none.
- **Frontend:** sheet slides from bottom, large touch targets; ranges in Toman with helper text («تومان»); URL state sync (same param names as API); counts: not in MVP. Verified-seller toggle hidden until that filter lands (TRS-001).
- **Database / API:** consumes MKT-002 params.
- **Validation:** zod mirror; min ≤ max enforced.
- **Error states:** invalid input blocked client-side.
- **Permissions:** public.
- **Acceptance:** filter→URL→reload reproduces; chips removal updates list without full reset; sheet a11y (focus trap, esc).
- **Testing:** component tests (open/close, apply/reset, URL sync).
- **DoD:** suites green.

### MKT-009 — Lot detail page

**P0 · Phase 4 · Marketplace · L** — Deps: MKT-001, MEDIA-005, CHT-001 (chat CTA), OFR-001 (offer CTA — CTAs may land disabled-first)

- **Goal:** Public SSR `/l/{code}`: image gallery + video gallery, full spec block, description, seller summary w/ metrics + badges, similar lots, actions: save, share, report, «گفتگو با فروشنده», «پیشنهاد قیمت».
- **Why:** Feature #16 — conversion point; public for sharing/SEO.
- **Files:** `apps/web/src/app/(public)/l/[code]/page.tsx`, `features/marketplace/components/lot-detail.tsx`, `media-gallery.tsx` (images + videos w/ poster), `seller-summary.tsx`, `spec-block.tsx`; api `GET /lots/:code` public detail DTO (adds availableQuantity, minOrder, reason, category path, seller block, similar).
- **Backend:** detail endpoint `@Public()`; viewCount atomic increment (fire-and-forget, deduped by session cookie heuristic — 1/30 min); similar = same subcategory/category ACTIVE, newest 8, excluding self; payload allowlist (no exactAddress — test).
- **Frontend:** sticky mobile action bar (chat + offer + save); gallery swipe w/ video play inline; spec block uses fa display maps; share per MKT-010; report opens TRS-004 dialog (feature-flagged until TRS-004); location shown as «تهران — منطقه X» from locationHint/city only.
- **Database:** none new.
- **API:** public detail + similar; swagger + gen:types.
- **Validation:** 404 for non-ACTIVE codes logged-out; sellers see own non-active lots via owner view (`GET /lots/:id` owner route from LOT-002).
- **Error states:** 404 page fa; gallery media fallbacks.
- **Permissions:** public; actions auth-gated.
- **Acceptance:** page loads logged-out w/ full content; OG title/price/city (basic metadata now, PLAT-005 enriches); no private fields (test).
- **Testing:** page render test, payload allowlist e2e, gallery component tests.
- **DoD:** lint/typecheck/test green.

### MKT-010 — Share

**P0 · Phase 4 · Marketplace · S** — Deps: MKT-009

- **Goal:** Share sheet on lot detail: copy link, Telegram (`https://t.me/share/url?…`), WhatsApp (`https://wa.me/?text=…`), native `navigator.share` when available; shared text fa template w/ title+price.
- **Why:** Feature #32 — Instagram/Telegram are primary buyer channels in Iran.
- **Files:** `features/marketplace/components/share-sheet.tsx`, `lib/share.ts`.
- **Backend:** none.
- **Frontend:** absolute public URL; clipboard API + fallback; toast confirm.
- **Database / API / Validation:** none.
- **Error states:** clipboard denial → show URL for manual copy.
- **Permissions:** public.
- **Acceptance:** TG/WA intents open with prefilled fa text; copy works on mobile Safari/Chrome.
- **Testing:** unit tests for share-link builders.
- **DoD:** suites green.

### MKT-011 — Lot engagement counters + events

**P1 · Phase 9 · Marketplace · M** — Deps: MKT-009, SAV-001

- **Goal:** `AnalyticsEvent` capture for LOT_VIEW / LOT_SAVE / LOT_SHARE / SEARCH (best-effort, fire-and-forget) surfaced in seller analytics (ANL-002).
- **Why:** Seller analytics + marketplace conversion funnel need events.
- **Files:** `apps/api/src/modules/analytics/` (module, `POST /analytics/events` batched, service), web `lib/track.ts` (queue + sendBeacon).
- **Backend:** append-only insert, sampled search events (log every 1st), retention job TODO P2.
- **Frontend:** track helpers called from detail/list/save/share.
- **Database:** migration (AnalyticsEvent) + indexes (type, createdAt),(entityType, entityId).
- **API:** authenticated-optional (anonymous allowed w/o userId); throttle; swagger + gen:types.
- **Validation:** type enum; entity ids strings.
- **Error states:** tracking failure silent (never blocks UX).
- **Permissions:** public-write.
- **Acceptance:** events land for view/save/share; counters on lot increment consistently.
- **Testing:** e2e event insert; client queue unit test.
- **DoD:** suites green.

### MKT-012 — Recommendations («پیشنهاد برای شما»)

**P2 · Phase 10+ · Marketplace · L** — Deps: MKT-011, ANL-001

- **Goal:** Personalized home/listing section v1 (category-affinity + recency heuristic; swap-in point for ML later).
- **Why:** Future feature — explicitly out of MVP; captured here so the home layout reserves the slot.
- **Files:** api optional `GET /lots/recommended`, home section.
- **Acceptance (when built):** section only renders for logged-in buyers w/ ≥ 3 interest signals; CTR instrumented.
- **DoD:** not started before P2 planning sign-off.
