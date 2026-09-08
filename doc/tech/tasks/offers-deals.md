# Tasks — Offers & Deals (OFR, DEAL)

Context: Negotiation (offers w/ counter chains) → transaction (deals with an explicit state
machine). No wallet/escrow/gateway in MVP — payment is recorded, not processed (product
principles 7, 12; decision D9 flags the legal review).

---

### OFR-001 ✅ — Offer domain + state machine

**P0 · Phase 6 · Offers · M** — Deps: LOT-002, CHT-001

- **Goal:** `Offer` model with counter-chain (`parentId`), status enum, repository, pure transition rules.
- **Why:** Feature #20 — offer semantics must be enforceable server-side before any UI.
- **User story:** n/a (foundation).
- **Files:** `apps/api/prisma/schema.prisma` + migration, `src/modules/offers/` (module/service/repo/dto/constants).
- **Backend:** model per plan §3; transition table: PENDING→(COUNTERED|ACCEPTED|REJECTED|CANCELLED|EXPIRED); counters create a new linked offer (chain head tracked); accepting invalidates sibling pending offers on the same lot from the same buyer; expiry default 72 h.
- **Frontend:** none.
- **Database:** migration + indexes (lotId, buyerId, createdAt), (sellerId, status), (status, expiresAt).
- **API:** none yet.
- **Validation:** price 1..2B Toman; quantity within `minOrder..availableQuantity` at offer time; note ≤ 500.
- **Error states:** n/a (service-level next).
- **Permissions:** n/a.
- **Acceptance:** table-driven unit tests cover every legal/illegal transition incl. chain semantics.
- **Testing:** state-machine unit suite (required).
- **DoD:** suites green.

### OFR-002 ✅ — Offers API

**P0 · Phase 6 · Offers · M** — Deps: OFR-001, CHT-003

- **Goal:** `POST /offers` (buyer), `POST /offers/:id/counter|accept|reject|cancel`, `GET /offers` (role-aware lists), `GET /lots/:id/offers` (seller).
- **Why:** Feature #20 complete backend.
- **User story:** As a buyer I offer 150M for 500 pieces; the seller counters 165M; I accept.
- **Files:** `offers.controller.ts`, `offers.service.ts`, dto set.
- **Backend:** create: only on ACTIVE lots, buyer ≠ seller, optionally tied to conversation; posts a system/action message into the linked conversation («پیشنهاد ۱۵۰ میلیون برای ۵۰۰ عدد») — message type ACTION w/ offer payload reference (future structured actions, feature #19). accept: within expiry, lot still ACTIVE, available ≥ qty → transaction (accept offer, reject sibling pending, emit hook for deal creation — deal created explicitly by parties in DEAL-002 but acceptance creates the eligibility), notification hook points. reject/cancel: guard by role and status. Counter: creates child offer by seller w/ own 72 h expiry.
- **Frontend:** none.
- **Database:** none.
- **API:** role-gated per action; swagger + `gen:types`.
- **Validation:** OFR-001 rules at runtime (availableQuantity may have changed — revalidate, 409 w/ fa message).
- **Error states:** 408/410-style semantics for expired (409 + code `OFFER_EXPIRED`); 403 wrong role; 409 lot unavailable/qty.
- **Permissions:** buyer actions (create/cancel own), seller actions (counter/accept/reject on their lots).
- **Acceptance:** full negotiate flow e2e incl. stale-qty rejection; sibling auto-reject on accept.
- **Testing:** service unit matrix; controller e2e.
- **DoD:** suites green.

### OFR-003 ✅ — Offer expiry job

**P0 · Phase 6 · Offers · S** — Deps: OFR-002, LOT-006 (jobs module exists)

- **Goal:** Hourly cron: PENDING offers past `expiresAt` → EXPIRED (notification hook point).
- **Why:** Keeps negotiation honest; feature #20 expiry state.
- **Files:** `apps/api/src/modules/jobs/offer-expiry.service.ts`.
- **Backend:** batched updateMany; idempotent.
- **Frontend / Database / API:** none.
- **Acceptance:** expired offer shows «منقضی» and rejects accept.
- **Testing:** unit w/ fake clock.
- **DoD:** registered in jobs module.

### OFR-004 — Offers UI

**P0 · Phase 6 · Offers · M** — Deps: OFR-002, CHT-006 (sheet context)

- **Goal:** Make-offer sheet (price Toman w/ live unit-price hint, quantity stepper bounded by lot, optional note); offer history timeline in conversation (chain cards w/ status chips); seller action bar (accept/counter/reject w/ counter sheet reusing form); offers list page `/offers` (role-aware tabs: دریافتی/ارسالی).
- **Why:** Feature #20 UX end-to-end.
- **Files:** `apps/web/src/features/offers/` (gen:feature), components `offer-sheet.tsx`, `offer-card.tsx`, `offer-history.tsx`, `app/(app)/offers/page.tsx`.
- **Backend:** none.
- **Frontend:** accept → success state prompts «ایجاد معامله» (DEAL-002 CTA); rejected/expired visual states; RTL; Toman formatting; quantity validation vs lot.
- **Database / API:** consumes OFR-002.
- **Validation:** zod mirror (price bounds, qty bounds, note length).
- **Error states:** 409s surfaced as inline fa banners w/ refresh lot info link.
- **Permissions:** buyer creates; seller responds; lists per role.
- **Acceptance:** negotiate-counter-accept journey usable at 360px; offer events visible in chat thread.
- **Testing:** sheet component tests; offers page tests.
- **DoD:** suites green; used by QA-001.

### DEAL-001 — Deal domain + state machine + timeline

**P0 · Phase 6 · Deals · L** — Deps: OFR-001, LOT-001

- **Goal:** `Deal` + `DealEvent` models; full `DealStatus` transition table with role permissions; repository.
- **Why:** The transaction spine (feature #21) — explicit lifecycle + auditability (principles 12/13).
- **Files:** `apps/api/prisma/schema.prisma` + migration, `src/modules/deals/` (module/service/repo/dto/constants).
- **Backend:** transition matrix (buyer B / seller S / admin A):
  - NEGOTIATING→AGREED (B|S, during deal edit window), →CANCELLED (B|S w/ reason)
  - AGREED→PAYMENT_PENDING (S|B), →CANCELLED (B|S)
  - PAYMENT_PENDING→PAID (S confirms received OR B confirms sent w/ S auto-confirm window — MVP: S confirms, B can mark «پرداخت کردم» which notifies S), →CANCELLED (S)
  - PAID→PREPARING (S)→SHIPPED (S)→DELIVERED (S)→COMPLETED (B confirms receipt; auto after 7d)
  - any non-terminal +DISPUTED (B|S, w/ reason) — admin handles in P1 DEAL-007
  - terminal: COMPLETED, CANCELLED, DISPUTED(resolved→COMPLETED|CANCELLED by admin)
  - every transition appends DealEvent (actor, from→to, note).
- **Frontend:** none.
- **Database:** migration + indexes (buyerId, updatedAt), (sellerId, updatedAt), (status); `DealEvent(dealId, createdAt)`.
- **API:** none yet.
- **Validation:** invariants: qty ≤ lot.available at creation; prices copied (snapshot — lot edits later don't mutate deals); commissionRate configurable const (0% MVP, field reserved).
- **Error states:** n/a.
- **Permissions:** n/a.
- **Acceptance:** table-driven unit tests for the full matrix incl. role denials.
- **Testing:** state-machine suite (required).
- **DoD:** suites green.

### DEAL-002 — Deal creation API

**P0 · Phase 6 · Deals · M** — Deps: DEAL-001, OFR-002, CHT-001

- **Goal:** `POST /deals` from (a) accepted offer or (b) directly from a conversation (fixed-price quick path); confirmation payload locks lot/qty/price/delivery/payment terms.
- **Why:** Feature #21 deal flow steps (confirm lot → qty → price → delivery → payment → created).
- **Files:** `deals.controller.ts`, `deals.service.ts`, `dto/create-deal.dto.ts`.
- **Backend:** validation: offer (if given) is ACCEPTED + buyer = caller; lot ACTIVE + available ≥ qty; reserve qty (decrement availableQuantity transactionally on deal create — restore on cancel); snapshot fields; delivery/payment enums + optional terms note; system message into conversation («معامله ایجاد شد #CODE»); code nanoid-8; notification hook points.
- **Frontend:** none.
- **Database:** none.
- **API:** buyer-initiated; swagger + gen:types.
- **Validation:** as above; `paymentMethod` from recorded enum (no gateway).
- **Error states:** 409 qty no longer available / lot inactive; 400 bad offer state.
- **Permissions:** deal buyer (seller accepts via NEGOTIATING→AGREED transition).
- **Acceptance:** create from accepted offer + from chat both e2e; availableQuantity decremented; cancel restores.
- **Testing:** service unit (reservation transaction incl. rollback), e2e both paths.
- **DoD:** suites green.

### DEAL-003 — Deal transitions API

**P0 · Phase 6 · Deals · M** — Deps: DEAL-002

- **Goal:** `POST /deals/:code/transition` (target status + note), `POST /deals/:code/cancel` (reason), `POST /deals/:code/payment-confirm` (buyer), permission matrix enforced.
- **Why:** Feature #21 — explicit lifecycle actions.
- **Files:** `deals.controller.ts`, `deals.service.ts` (matrix executor).
- **Backend:** executes DEAL-001 matrix w/ DealEvent append; cancellation restores reserved qty (unless status ≥ PREPARING — then requires reason + admin visibility); COMPLETED triggers DEAL-005 effects; dispute allowed pre-completion w/ reason ≥ 20 chars.
- **Frontend:** none.
- **Database:** none.
- **API:** participant role-gated; swagger + gen:types.
- **Validation:** target reachable from current; note required for cancel/dispute.
- **Error states:** 409 illegal transition (fa message w/ allowed next states); 403 wrong role.
- **Permissions:** buyer/seller per matrix.
- **Acceptance:** happy path NEGOTIATING→…→COMPLETED e2e + role-denial e2e; qty restored on early cancel.
- **Testing:** controller e2e matrix sample + unit full matrix.
- **DoD:** suites green.

### DEAL-004 — Deals UI

**P0 · Phase 6 · Deals · M** — Deps: DEAL-003, PLAT-001

- **Goal:** `/deals` list (role tabs خرید/فروش, status filter chips) + `/deals/:code` detail: header (lot summary link), terms block (qty/prices snapshot, delivery, payment, terms note), status timeline (DealEvent steps Jalali), action bar per current state & role, cancel/dispute w/ reasons.
- **Why:** Feature #21 + #26/#27 dashboard pages.
- **Files:** `apps/web/src/features/deals/` (gen:feature), components `deal-card.tsx`, `deal-detail.tsx`, `status-timeline.tsx`, `app/(app)/deals/**`.
- **Backend:** none.
- **Frontend:** action buttons exactly mirror matrix (disabled + tooltip for unavailable); live updates via notifications/refresh; print/share deal summary (deferred).
- **Database / API:** consumes DEAL-002/003.
- **Validation:** reason inputs min length.
- **Error states:** 409 transitions toast + refresh state.
- **Permissions:** participants.
- **Acceptance:** buyer and seller views drive one deal to completion from both phones (manual QA script); timeline shows all events.
- **Testing:** component tests (action visibility matrix), page tests.
- **DoD:** suites green; used by QA-001.

### DEAL-005 — Completion effects

**P0 · Phase 6 · Deals · M** — Deps: DEAL-003, LOT-003, NTF hooks (realized P1)

- **Goal:** On COMPLETED (and CANCELLED) atomic side-effects: lot available/sold state, counters, review eligibility, purchase history entries.
- **Why:** The marketplace's ledger moment — principle 2 (optimize for successful transactions).
- **Files:** `deals.service.ts` (completion handler), lots service interplay, `Review` eligibility flag (deal.completedAt non-null).
- **Backend:** transaction: if availableQuantity = 0 → lot SOLD + soldAt; increment seller successfulDeals (Profile counter); mark buyer purchase entry (derived — purchase history = deals where buyer=me & COMPLETED, no extra table); seed notification hook (realized in NTF-001); audit DealEvent COMPLETED.
- **Frontend:** none (UI reflects via existing pages).
- **Database:** counter columns on Profile (migration small).
- **API:** none.
- **Validation:** idempotent (double-complete guarded by status precondition).
- **Error states:** failure rolls back whole transaction.
- **Permissions:** system (triggered by transition).
- **Acceptance:** completing final qty marks lot SOLD; cancelled mid-way restores qty; profile counters correct.
- **Testing:** service unit (transaction, idempotency), e2e completion path.
- **DoD:** suites green.

### DEAL-006 — Payment recording + commission fields

**P0 · Phase 6 · Deals · S** — Deps: DEAL-001

- **Goal:** Payment terms on deal: method enum (CASH/CARD_TO_CARD/BANK_TRANSFER/CHEQUE), termsNote, buyer `payment-confirm` mark, seller PAID confirmation (already in matrix); commissionRate/commissionAmount fields populated (0% MVP) — no processing.
- **Why:** Feature #22 — architecture ready for payments without escrow (principle 7).
- **Files:** deals dto/constants (fa labels), deals service bits, DEAL-004 terms block display.
- **Backend:** fields + validation + events («خریدار پرداخت را اعلام کرد» DealEvent note).
- **Frontend:** terms block + «پرداخت کردم» button (buyer).
- **Database:** none (fields in DEAL-001 migration).
- **API / Validation / Errors / Permissions:** within DEAL endpoints.
- **Acceptance:** recorded method visible both sides; announces create timeline events.
- **Testing:** e2e payment-confirm flow.
- **DoD:** gateway integration explicitly absent (documented for D9 review).

### DEAL-007 — Dispute handling

**P1 · Phase 9 · Deals · M** — Deps: DEAL-003, ADM-005

- **Goal:** Dispute flow: either party flags (reason + optional evidence via chat reference), deal → DISPUTED, admin investigation view + resolve (→COMPLETED or CANCELLED w/ resolution note).
- **Why:** Risk R5 — transaction disputes need a support path.
- **Files:** deals module (dispute endpoints), ADM-005 (resolution UI), AuditLog entries.
- **Backend:** dispute create guards (participant, pre-terminal, reason ≥ 20 chars); admin resolve permission; resolution restores/keeps qty per outcome; notifications.
- **Frontend:** dispute dialog in DEAL-004.
- **Database / API:** swagger + gen:types.
- **Validation / Errors / Permissions:** as above.
- **Acceptance:** disputed deal blocks participant transitions until admin resolves; audit trail complete.
- **Testing:** e2e dispute→resolve both outcomes.
- **DoD:** suites green.
