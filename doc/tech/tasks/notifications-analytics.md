# Tasks — Notifications & Analytics (NTF, ANL)

Context: In-app notifications are P1 (P0 launch can ship without them — hook points are already
reserved in offers/deals/chat/jobs services). No event bus: domain services call
`NotificationService` directly (plan §2.6). Analytics: lightweight event table + derived views,
no external analytics service in MVP.

---

### NTF-001 — Notification domain + emission wiring

**P1 · Phase 9 · Notifications · M** — Deps: AUTH-001 (hook points: OFR-002, DEAL-003, CHT-003, TRS-005, LOT-006)

- **Goal:** `Notification` model + `NotificationService.create()` + wire all P0 hook points: new message (when recipient offline/unread), offer events (new/countered/accepted/rejected), deal status changes, verification results, lot rejection/expiry (to seller), saved-lot sold.
- **Why:** Feature #25 — re-engagement for a negotiation-driven marketplace.
- **User story:** As a seller I learn immediately when a buyer counters my offer.
- **Files:** `apps/api/src/modules/notifications/` (module/service/repo/dto), migration; call sites in offers/deals/conversations/verifications/jobs services (injected dependency — services already expose TODO hook comments).
- **Backend:** create(userId, type, title/body fa templates, dataJson w/ deep-link route); batch variants for fan-out (none needed MVP); dedupe window for message notifications (max 1 «new messages» per conversation per 10 min — upsert unread-style single row per conversation w/ counter); WS push `user:{id}` emit when socket gateway present (CHT-004 rooms).
- **Frontend:** none (NTF-003).
- **Database:** migration + index (userId, readAt, createdAt); body/title generated at read-time from type+data (store only type+data+context ids — avoids stale templates).
- **API:** none yet.
- **Validation:** type enum; dataJson serializable.
- **Error states:** notification failure never fails the parent transaction (fire-after-commit; log-only failures).
- **Permissions:** system.
- **Acceptance:** each wired event produces correct notification in e2e; parent flows unaffected on notification outage (kill switch env).
- **Testing:** service unit (template map), integration test per wired event (≥ offers + deals).
- **DoD:** suites green.

### NTF-002 — Notifications API

**P1 · Phase 9 · Notifications · S** — Deps: NTF-001

- **Goal:** `GET /notifications` (paginated, unread first option), `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`.
- **Why:** Feature #25 in-app channel backend.
- **Files:** notifications controller + dto.
- **Backend:** standard CRUD-lite; read marks readAt.
- **Frontend:** none.
- **Database / API:** swagger + gen:types.
- **Validation:** id ownership.
- **Error states:** 404 foreign id.
- **Permissions:** owner.
- **Acceptance:** unread count consistent after reads.
- **Testing:** e2e.
- **DoD:** suites green.

### NTF-003 — Notifications UI

**P1 · Phase 9 · Notifications · M** — Deps: NTF-002, DSH-001 (bell slot), CHT-004 (WS push)

- **Goal:** Header bell w/ unread badge + `/notifications` list: grouped by day (Jalali), fa templates (e.g. «پیشنهاد شما برای «800 تی‌شرت مردانه» رد شد»), tap → deep link (lot/deal/offer/chat), mark-all-read; live badge via WS push + fallback poll (60 s).
- **Why:** Feature #25 UX.
- **Files:** `apps/web/src/features/notifications/` (gen:feature), `components/notification-bell.tsx`, `notifications-page.tsx`, `app/(app)/notifications/page.tsx`.
- **Backend:** none.
- **Frontend:** swipe/tap mark-read; unread dot; empty state; infinite scroll.
- **Database / API:** consumes NTF-002.
- **Validation / Errors:** standard.
- **Permissions:** authenticated.
- **Acceptance:** badge and list update live in two-session test.
- **Testing:** component + hook tests.
- **DoD:** suites green.

### NTF-004 — Web push (PWA)

**P2 · Phase 10+ · Notifications · M** — Deps: NTF-003, PLAT-004

- **Goal:** web-push subscription + opt-in flow + push on message/offer events (respecting quiet hours).
- **Why:** «Push where appropriate» — deferred until PWA + usage justify.
- **DoD:** not started before P2 sign-off.

### NTF-005 — SMS for critical events

**P1 · Phase 9 · Notifications · S** — Deps: NTF-001

- **Goal:** SMS (via existing `SmsService`, new pattern codes) for: offer accepted, deal disputed, lot rejected — daily cap per user (3), opt-out toggle.
- **Why:** Feature #25 «SMS only for critical events» (also the IranPayamak pattern needs new template approval — flagged in D1).
- **Files:** notifications service (channel fan-out), `SmsService` pattern extension (env: new pattern codes), settings toggle (Profile column `smsOptOut`).
- **Backend:** send inline after commit w/ timeout; failures logged only.
- **Frontend:** settings toggle fa.
- **Database:** profile column (small migration).
- **API / Validation / Errors / Permissions:** per above.
- **Acceptance:** capped sends; opt-out respected.
- **Testing:** unit tests for cap/opt-out logic (provider mocked).
- **DoD:** suites green.

### ANL-001 — Analytics event capture

**P1 · Phase 9 · Analytics · M** — Deps: MKT-011 (events table exists)

- **Goal:** Consolidate capture points (search, lot view/save/share, contact-started [conversation created], offer made, deal completed) + nightly rollup queries materializing marketplace + seller counters (`AnalyticsRollup` tables or materialized views — choose plain tables written by job).
- **Why:** Feature #36 — funnel + seller analytics data foundation.
- **Files:** analytics module (rollup service in jobs), retention: raw events pruned > 180d.
- **Backend:** rollups: marketplace daily (lots created/approved/sold, GMV, deals, conversion contact→deal), seller daily (views, saves, contacts, offers, sold, avg time-to-sell), buyer weekly (searches, views, saves, contacts).
- **Frontend:** none.
- **Database:** rollup tables (small migration) + indexes (scope, day).
- **API:** none.
- **Validation:** idempotent recompute (delete+insert per scope/day in tx).
- **Error states:** job retry next cycle.
- **Permissions:** system.
- **Acceptance:** rollups reconcile with direct SQL on fixture week.
- **Testing:** rollup unit tests w/ fixtures.
- **DoD:** suites green.

### ANL-002 — Seller analytics page

**P1 · Phase 9 · Analytics · M** — Deps: ANL-001, DSH-002 (placeholder slot)

- **Goal:** `/dashboard/analytics`: date-range selector (Jalali, 7/30/90d), KPI cards (views, saves, contacts, offers, conversion, avg time-to-sell), per-lot table (views/saves/offers/status), simple SVG bar/line charts (no chart library — or add `recharts` if justified; prefer lightweight inline SVG).
- **Why:** Feature #36 Seller section — supplier retention.
- **Files:** `apps/web/src/features/analytics/`, api `GET /app/seller-analytics?days=…`.
- **Backend:** aggregate endpoint over rollups + per-lot live counters.
- **Frontend:** RTL-safe charts; fa numbers; empty state pre-data.
- **Database / API:** swagger + gen:types.
- **Validation / Errors / Permissions:** seller role; standard.
- **Acceptance:** numbers match rollups for seeded range.
- **Testing:** endpoint unit + page test.
- **DoD:** suites green.

### ANL-003 — Admin marketplace metrics

**P1 · Phase 9 · Analytics · M** — Deps: ANL-001, ADM-001

- **Goal:** `/admin/metrics`: marketplace KPIs (total/active/sold lots, GMV, transactions, conversion, avg lot value, time-to-sell, supplier/buyer acquisition, repeat rate, take-rate placeholder, cancellation rate) with 30/90d trends; CSV export.
- **Why:** Feature #36 Marketplace + Business sections — founder dashboard.
- **Files:** admin feature components, api `GET /admin/metrics`.
- **Backend:** rollup aggregation + user cohort queries (repeat = ≥2 completed deals).
- **Frontend:** table + trend charts; CSV client-side from JSON.
- **Database / API / Validation / Errors / Permissions:** admin; standard.
- **Acceptance:** KPIs reconcile with rollups.
- **Testing:** endpoint unit test.
- **DoD:** suites green.
