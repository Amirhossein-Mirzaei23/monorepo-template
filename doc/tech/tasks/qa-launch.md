# Tasks — QA & Launch (QA)

Context: Quality gates for the P0 launch. Existing suites (jest unit + supertest e2e per module)
run per task; these tasks add cross-cutting verification. Playwright is added intentionally
(devDependency + lockfile change) in QA-001.

---

### QA-001 — E2E critical-journey suite (Playwright)

**P0 · Phase 10 · QA · XL** — Deps: Phases 1–8 complete (AUTH-004, ONB-002, LOT-004, MEDIA-004, MKT-009, CHT-006, OFR-004, DEAL-004, ADM-003)

- **Goal:** Playwright suite covering the two money paths on mobile viewport + RTL:
  1. **Seller**: OTP login → onboarding(seller) → create lot w/ 2 images + 1 video (fixtures) → submit → admin approves → lot visible publicly.
  2. **Buyer**: OTP login → onboarding(buyer) → browse/search/filter → open lot → save → chat (both sessions: text + image message) → make offer → seller counters → buyer accepts → buyer creates deal → both drive to COMPLETED → seller dashboard reflects sale.
     Plus: report lot, admin resolve report, moderation reject→resubmit loop.
- **Why:** The launch-blocking regression net; `OTP_DEV_MODE` + seeded admin make it deterministic.
- **Files:** `apps/web/e2e/*.spec.ts`, `playwright.config.ts` (root or web workspace — keep inside `apps/web`), fixtures for media, npm script `test:e2e`; CI job (optional profile, needs postgres service — reuse ci.yml migration-gate template).
- **Backend:** test env wiring (`OTP_DEV_MODE=true`, seeded DB via `db:seed` + fixtures script).
- **Frontend:** none.
- **Database:** e2e seeds (3 categories, 2 sellers, lots in mixed statuses).
- **API:** none.
- **Validation:** n/a.
- **Error states:** suite asserts key error UX too (wrong OTP, 409 offer on sold lot).
- **Permissions:** n/a.
- **Acceptance:** suite green locally against docker-compose stack; runtime < 5 min.
- **Testing:** n/a (is the testing).
- **DoD:** scripted one-command run (`docker compose up -d postgres && npm run test:e2e`); documented in web README.

### QA-002 — Permission & state-machine API suite

**P0 · Phase 10 · QA · M** — Deps: Phases 2–7

- **Goal:** Consolidated supertest suite (not per-module) asserting: rbac matrix on every resource (anonymous/buyer/seller/owner/admin × key endpoints); lot/offer/deal full transition matrices incl. role denials; IDOR probes (foreign conversation/media-secure/deal/lot-owner routes → 404/403); double-submit idempotency (offer accept race — sequential + note on tx guarantees); throttles fire on OTP/chat/offer.
- **Why:** Security-critical invariants in one continuously-run place.
- **Files:** `apps/api/src/__tests__/permissions.e2e-spec.ts`, `state-machines.e2e-spec.ts`, `idor.e2e-spec.ts`.
- **Backend:** none (test-only).
- **Frontend:** none.
- **Database:** fixture factory helpers (create user/lot/deal fast).
- **API:** none.
- **Validation / Errors:** asserts exact status codes + fa message presence.
- **Permissions:** n/a.
- **Acceptance:** suite green; covers ≥ 95% of route×role grid (checklist in spec header).
- **Testing:** n/a.
- **DoD:** wired into `npm run test -w @monorepo/api` (e2e jest project, existing pattern).

### QA-003 — RTL / mobile / a11y QA pass

**P0 · Phase 10 · QA · M** — Deps: DSH-001..004, MKT pages, CHT, PLAT-001

- **Goal:** Audit + fixes: 360px layouts (no horizontal scroll), touch targets ≥ 44px, focus visibility, keyboard flows (forms, gallery, filters sheet), contrast (≥ 4.5:1), screen-reader labels on icon buttons (heart/share/report/tabs), `dir=rtl` correctness in all flows incl. mixed fa/en/number strings, Jalali/Toman formatting spot checks, empty/loading/error states inventory.
- **Why:** Feature #37 acceptance; a11y is enforced by lint but needs holistic pass.
- **Files:** fixes across `apps/web/src/**` (small, per-finding); findings log `doc/tech/qa/rtl-mobile-a11y.md` (checklist + fixes).
- **Backend:** none.
- **Frontend:** as found.
- **Acceptance:** axe-core (via Playwright) zero critical violations on 8 key pages; manual checklist signed off; no layout overflow at 320–1920px.
- **Testing:** axe checks added to QA-001 pages.
- **DoD:** findings doc committed; re-run clean.

### QA-004 — Security & load review

**P1 · Phase 10 · QA · M** — Deps: QA-002

- **Goal:** Security review checklist executed: OTP brute-force (rate + lockout verified live), upload abuse (magic-byte bypass attempt, quota), storage path traversal, SQLi via search normalization (parameterized — verify), WS auth bypass, refresh-token reuse detection, session fixation after phone change, CSP/mixed content with media URLs; light load test (k6 or autocannon): browse listing + lot detail at 50 rps for 5 min — p95 targets (< 300 ms), WS 200 concurrent pairs memory stable.
- **Why:** Pre-public-launch hardening (plan §14).
- **Files:** `doc/tech/qa/security-review.md` (findings + fixes), k6 script `scripts/load/browse.js` (api-only).
- **Backend:** fixes as found.
- **Acceptance:** no open high findings; load targets met on staging-equivalent host; report committed.
- **Testing:** n/a.
- **DoD:** sign-off noted in report.

### QA-005 — Launch readiness execution

**P0 · Phase 10 · QA · M** — Deps: QA-001, QA-003 (and infra tasks MEDIA-001 deploy config)

- **Goal:** Execute the plan §14 checklist: backups configured + restore drill (pg_dump + media volume tar → restore to scratch), `/metrics` + health alerts (disk 75%, error rate, OTP failure spike), Sentry DSN live both apps, seeded production categories + admin account, moderation runbook (`doc/tech/runbooks/moderation.md`: SLA, reject reason style guide), ToS/privacy fa drafts circulated (legal owner), D9 legal items flagged to owner, rate-limit final values set, robots/sitemap staged (if PLAT-005 slipped, minimal robots.txt), smoke test on prod-like stack from clean DB.
- **Why:** Nothing launches on hope.
- **Files:** runbooks + config changes; `doc/tech/qa/launch-checklist.md` (filled, dated).
- **Backend / Frontend:** config-level only.
- **Acceptance:** checklist all-green with owners; clean-environment bootstrap (compose → migrate → seed → smoke) succeeds.
- **Testing:** bootstrap script `scripts/bootstrap-fresh.sh` (documented commands).
- **DoD:** launch readiness sign-off recorded.
