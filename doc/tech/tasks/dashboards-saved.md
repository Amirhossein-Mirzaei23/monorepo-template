# Tasks — Dashboards & Saved (DSH, SAV)

Context: The authenticated `(app)` shell is mobile-first: bottom tab navigation, role-aware home
dashboards, settings. Saved lots are P0; saved searches P1 (+P2 notifications).

---

### DSH-001 — App shell + bottom tab navigation

**P0 · Phase 8 · Dashboards · M** — Deps: PLAT-002, PLAT-001, ONB-002

- **Goal:** `(app)` layout: mobile bottom tab bar (بازار / گفتگو / پیشنهادها / معاملات / پروفایل) + top header w/ notifications bell slot (NTF-003) + add-lot FAB for sellers; desktop converts tabs to sidebar; onboarding-complete server gate.
- **Why:** Features #26/#27 navigation; mobile-first principle.
- **Files:** `apps/web/src/app/(app)/layout.tsx`, `components/app-shell.tsx`, `bottom-tabs.tsx`, `nav-fab.tsx`; badge counters hooks (unread messages/offers via existing list endpoints w/ `?countOnly=true` param added).
- **Backend:** add `countOnly` variant to conversations list (unread total) + offers list (pending total) — tiny param, or dedicated `GET /app/badges` endpoint (choose: single `/app/badges`).
- **Frontend:** active-route highlighting RTL; safe-area insets; role-aware (buyer hides FAB; tabs identical for both roles — offers/deals labels shared).
- **Database:** none.
- **API:** `GET /app/badges` authenticated; swagger + gen:types.
- **Validation / Errors:** badge failure silent (hide dots).
- **Permissions:** authenticated + onboarded.
- **Acceptance:** one-hand reachability of all tabs at 360px; desktop sidebar; badge counts live.
- **Testing:** shell component tests (role variants), e2e redirect for un-onboarded.
- **DoD:** suites green.

### DSH-002 — Seller dashboard overview

**P0 · Phase 8 · Dashboards · M** — Deps: DSH-001, LOT-005, CHT-002, OFR-002, DEAL-003

- **Goal:** `/dashboard`: seller home — stat cards (active lots, pending moderation, drafts, sold, unread conversations, pending offers, active deals), recent activity list (latest offers/messages/deal events), CTA «افزودن لات»; analytics placeholder section (P1 ANL-002).
- **Why:** Feature #26 — seller's daily cockpit.
- **Files:** `apps/web/src/features/dashboard/components/seller-home.tsx`, `stat-card.tsx`, `recent-activity.tsx`, `app/(app)/dashboard/page.tsx`; api `GET /app/seller-overview` (aggregate counts + recent 10 events).
- **Backend:** aggregate endpoint (single route, service composes count queries); role-gated seller view.
- **Frontend:** cards link to sections; pull-to-refresh; empty-state CTAs for new sellers («اولین لات خود را بسازید»).
- **Database / API:** swagger + gen:types.
- **Validation / Errors:** standard.
- **Permissions:** seller role.
- **Acceptance:** numbers match section pages (spot-check script).
- **Testing:** service unit (aggregation), page test.
- **DoD:** suites green.

### DSH-003 — Buyer dashboard overview

**P0 · Phase 8 · Dashboards · M** — Deps: DSH-001, SAV-002, CHT-002, OFR-002, DEAL-003

- **Goal:** Buyer home at `/dashboard` (role-switched): saved lots count, saved searches (P1 slot), unread messages, sent offers, deals in progress, purchase history count; recent saved lots row.
- **Why:** Feature #27 — buyer cockpit.
- **Files:** `features/dashboard/components/buyer-home.tsx`; api `GET /app/buyer-overview` (or one `/app/overview` role-aware — choose single role-aware endpoint, replaces the two).
- **Backend:** same aggregate pattern.
- **Frontend:** quick links; discovery CTA («گشت در بازار»).
- **Database / API / Validation / Errors / Permissions:** mirror DSH-002 (buyer role).
- **Acceptance:** both roles see correct home after role change in profile (buyer+seller account test).
- **Testing:** page test both roles.
- **DoD:** suites green.

### DSH-004 — Settings page

**P0 · Phase 8 · Dashboards · S** — Deps: DSH-001, PROF-001

- **Goal:** `/settings`: profile edit link, sessions (AUTH-006 P1 slot), change phone (P1 slot), account deletion (P1 slot, or manual-process copy at launch), logout, app info (version), language placeholder (fa only).
- **Why:** Features #26/#27 Settings; logout requirement (feature #1).
- **Files:** `app/(app)/settings/page.tsx`, `features/profile/components/settings-page.tsx`.
- **Backend:** logout exists (BFF) — ensure wired.
- **Frontend:** list-style settings (mobile pattern); danger zone isolated; P1 slots render «به‌زودی» or hidden.
- **Database / API / Validation / Errors / Permissions:** standard.
- **Acceptance:** logout returns to `/login` cleanly (clears client caches).
- **Testing:** component test.
- **DoD:** suites green.

### SAV-001 — Saved lots API

**P0 · Phase 8 · Saved · S** — Deps: LOT-001

- **Goal:** `SavedLot` model + `PUT /saved-lots/:lotId`, `DELETE /saved-lots/:lotId`, `GET /saved-lots` (paginated, card payload incl. current lot status); lot saveCount maintained.
- **Why:** Feature #23 — buyer favorites powering card heart + saved page.
- **Files:** `apps/api/src/modules/saved-lots/` (module/service/repo/dto), migration.
- **Backend:** idempotent put (409-free); delete idempotent (200/204); saveCount inc/dec atomic; toggle throttle; only ACTIVE lots saveable (others 409).
- **Frontend:** none (MKT-005 heart + SAV-002).
- **Database:** migration + unique(userId, lotId), index (userId, createdAt).
- **API:** authenticated; swagger + gen:types.
- **Validation:** lotId exists.
- **Error states:** 409 non-active lot.
- **Permissions:** authenticated buyer (sellers can save too — anyone).
- **Acceptance:** heart toggle reflects instantly across pages (react-query key shared).
- **Testing:** service unit (counters idempotency), e2e.
- **DoD:** suites green.

### SAV-002 — Saved lots page

**P0 · Phase 8 · Saved · M** — Deps: SAV-001, MKT-005

- **Goal:** `/saved`: grid of saved lot cards w/ current status badges (sold/expired states visible per feature #23), remove action, empty state, infinite scroll.
- **Why:** Feature #23 view.
- **Files:** `app/(app)/saved/page.tsx`, `features/saved/components/saved-lots-page.tsx`.
- **Backend:** none.
- **Frontend:** status ribbons («فروخته شد»/«منقضی») on cards; unsave via heart; CTA to similar active lots on sold items.
- **Database / API:** consumes SAV-001.
- **Validation / Errors:** standard list states.
- **Permissions:** authenticated.
- **Acceptance:** saved → status change → badge appears on next visit.
- **Testing:** component tests incl. status badges.
- **DoD:** suites green.

### SAV-003 — Saved searches

**P1 · Phase 9 · Saved · M** — Deps: MKT-008, MKT-002

- **Goal:** `SavedSearch` model (queryJson snapshot of filters/q) + `POST/GET/DELETE /saved-searches` + save-bar UI on listing page («ذخیره جستجو») + `/saved/searches` management list w/ run links.
- **Why:** Feature #24 — recurring sourcing workflows (buyers monitor categories).
- **Files:** `apps/api/src/modules/saved-searches/`, migration; web `features/saved/components/save-search-bar.tsx`, `saved-searches-page.tsx`.
- **Backend:** serialize+validate queryJson against the public lots-query DTO on read (forward-compat); notifyEnabled flag stored (matching engine is SAV-004 P2).
- **Frontend:** snapshot current URL params; run → navigates `/lots?…`.
- **Database:** migration + index (userId).
- **API:** authenticated; swagger + gen:types.
- **Validation:** queryJson must deserialize to valid query DTO (else 422 on save).
- **Error states:** stale filters (category removed) → banner when running.
- **Permissions:** owner.
- **Acceptance:** save→run reproduces filtered listing.
- **Testing:** service unit (snapshot validation), component test.
- **DoD:** suites green.

### SAV-004 — Saved-search matching notifications

**P2 · Phase 10+ · Saved · M** — Deps: SAV-003, NTF-001

- **Goal:** On lot approval, match ACTIVE saved searches (bounded: ≤ N searches scanned via category/q prefilter) → NEW_MATCHING_LOT notifications; digest to avoid spam (max 3/day per user).
- **Why:** Feature #24 future notifications — retention driver, deliberately P2.
- **Files:** jobs module + notifications integration.
- **Acceptance (when built):** no notification storms (digest respected); unsubscribe per search via notifyEnabled.
- **DoD:** not started before P2 sign-off.
