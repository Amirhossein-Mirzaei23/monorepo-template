# Tasks — Platform Foundation (PLAT)

Format: **Priority · Phase · Area · Complexity** — Deps. Shared conventions for every task:
follow `doc/CONVENTIONS.md`, use `gen:module`/`gen:feature` scaffolds, run
`npm run lint && npm run typecheck && npm run test`, run `npm run gen:types` whenever API DTOs
change, and commit one Prisma migration per schema change.

---

### PLAT-001 ✅ — Persian / RTL foundation

**P0 · Phase 0 · Platform · S** — Deps: none

- **Goal:** The web app renders right-to-left in Persian with correct currency/date/number formatting.
- **Why:** Every subsequent UI task builds on RTL + Persian helpers; retrofitting is expensive.
- **User story:** As an Iranian user I see a Persian RTL interface with Toman prices, Persian digits and Jalali dates.
- **Files:** `apps/web/src/app/layout.tsx`, `apps/web/public/fonts/*`, `apps/web/src/lib/format.ts`, `apps/web/src/styles/globals.css`, `apps/web/src/app/(auth)/login/page.tsx` (copy swap).
- **Backend:** none.
- **Frontend:** set `<html lang="fa" dir="rtl" …>`; add self-hosted Vazirmatn woff2 via `next/font/local`; translate existing auth/dashboard copy to Persian; audit shadcn primitives + Tailwind classes for RTL (use logical properties `ms-`/`me-`, `text-start` etc.).
- **Database:** none.
- **API:** none.
- **Validation:** n/a.
- **Error states:** n/a.
- **Permissions:** public.
- **Acceptance:** app renders RTL Persian incl. login + dashboard; no LTR leftovers in components; font loads from `/fonts` (no external CDN).
- **Testing:** `lib/format` unit tests (toman, fa digits, Jalali date); RTL smoke via login-form test.
- **DoD:** lint/typecheck/test green; screenshots of login RTL; `formatToman`, `formatFaDigits`, `formatJalali` exported from `@/lib/format`.
- **Details for `lib/format.ts`:** `Intl.NumberFormat('fa-IR')`, `Intl.DateTimeFormat('fa-IR', { calendar: 'persian' })`, `formatToman(n)` → «۱۸۰٬۰۰۰٬۰۰۰ تومان».

### PLAT-002 ✅ — Route restructure: public marketplace shell

**P0 · Phase 0 · Platform · S** — Deps: PLAT-001

- **Goal:** `/` is a public marketplace home (SSR, no auth); authenticated areas move under explicit groups; middleware matchers updated.
- **Why:** Marketplace discovery must be public (SEO, shared links); the template currently gates `/`.
- **User story:** As a visitor I can open `/` and browse without logging in.
- **Files:** `apps/web/src/app/(dashboard)/*` → `apps/web/src/app/(public)/page.tsx` (placeholder), `(app)/layout.tsx`, `src/middleware.ts`.
- **Backend:** none.
- **Frontend:** create `(public)` group (placeholder home), rename `(dashboard)` group to `(app)` with `/dashboard` prefix inside; middleware protects `/dashboard/:path*`, `/onboarding`, `/settings` etc.; redirect stale `/` auth gate to `/login`.
- **Database:** none.
- **API:** none.
- **Validation / Errors / Permissions:** middleware must not break existing `/api/*` BFF routes.
- **Acceptance:** `/` renders logged-out; `/dashboard` redirects to `/login?next=…` when anonymous.
- **Testing:** middleware unit test (cookie present/absent × routes).
- **DoD:** routes green in dev, existing auth e2e still passes.

### PLAT-003 — Env & config additions

**P0 · Phase 0 · Platform · XS** — Deps: none

- **Goal:** All new infrastructure knobs exist, validated, documented.
- **Why:** AUTH-002 (OTP), MEDIA-001 (storage), CHT-004 (WS) need config; fail-fast convention.
- **User story:** n/a (developer task).
- **Files:** `apps/api/.env.example`, `src/config/configuration.ts`, `src/config/env.validation.ts`, `apps/web/.env.example`.
- **Backend:** add config: `OTP_DEV_MODE` (bool, must be false in prod — throw at boot if true && production), `OTP_TTL_MS`, `OTP_MAX_ATTEMPTS`, `OTP_SEND_HOURLY/DAILY`; `STORAGE_DIR`, `PUBLIC_MEDIA_BASE_URL`; `MAX_IMAGE_MB=10`, `MAX_VIDEO_MB=50`, `MAX_LOT_IMAGES=15`, `MAX_LOT_VIDEOS=3`, `MAX_VIDEO_SECONDS=60`; `WS_ORIGINS`.
- **Frontend:** none (BFF unchanged).
- **Database / API:** none.
- **Acceptance:** API boots with new vars; refuses `OTP_DEV_MODE=true` in production; `.env.example` documents each var in Persian-agnostic English comments.
- **Testing:** env-validation unit tests for new rules.
- **DoD:** config typed via `AppConfig` extension; no `process.env` reads outside `config/`.

### PLAT-004 — PWA manifest & icons

**P1 · Phase 10 · Platform · S** — Deps: PLAT-002

- **Goal:** Installable PWA: manifest, icons, theme color, apple meta.
- **Why:** Mobile-first users install from browser; also the base for Capacitor wrapping later.
- **User story:** As a seller I add Rakdsho to my home screen and it opens full-screen.
- **Files:** `apps/web/public/manifest.webmanifest`, `public/icons/*`, `app/layout.tsx` metadata, `next.config.ts` headers if needed.
- **Backend:** none. **Database:** none. **API:** none.
- **Validation:** Lighthouse PWA basic checks pass (manifest + icons + theme).
- **Acceptance:** installable on Android Chrome + iOS Safari (meta tags), RTL-safe icon set, fa app name «راکدشو».
- **Testing:** manual check + Lighthouse run documented in PR.
- **DoD:** no service-worker caching beyond Next defaults (explicitly out of scope).

### PLAT-005 — SEO foundation

**P1 · Phase 10 · Platform · M** — Deps: MKT-009, MKT-004

- **Goal:** Indexable public pages with metadata/OG/sitemap.
- **Why:** Organic buyer acquisition channel; must not precede liquidity (deliberately P1).
- **User story:** As a buyer coming from a Telegram share/Google I land on a rich lot page.
- **Files:** `apps/web/src/app/(public)/**` metadata exports, `app/sitemap.ts`, `app/robots.ts`, `public/robots.txt` (replaced).
- **Backend:** none (public APIs already exist).
- **Frontend:** per-page `generateMetadata` (lot: title/price/city + OG image = cover; category; seller), JSON-LD `Product`/`Offer` on lot detail, sitemap from paginated lot/category listing (capped + `noindex` for expired/sold), canonical URLs.
- **Database / API:** optional `GET /lots` `fields=slim` for sitemap generation.
- **Validation:** no PII/exact-address in any meta payload.
- **Error states:** 404/410 pages for removed lots.
- **Permissions:** public only.
- **Acceptance:** valid OG previews (Telegram/WhatsApp debugger), sitemap.xml < 50k urls, Lighthouse SEO ≥ 95.
- **Testing:** metadata unit tests on lot page helper.
- **DoD:** robots.txt replaced by `app/robots.ts`.

### PLAT-006 — Capacitor readiness spike

**P2 · Phase 10 · Platform · M** — Deps: PLAT-004

- **Goal:** Documented checklist (not a build) for wrapping the web app with Capacitor for Cafe Bazaar / direct APK.
- **Why:** Distribution channel for later; ensure no architectural blockers now.
- **User story:** n/a (future spike).
- **Files:** `doc/tech/capacitor-readiness.md` (new).
- **Work:** verify deep links (`/l/{code}`), splash/icons, storage of tokens in webview cookies, camera input behavior in WebView, WS reachability; list required changes.
- **Acceptance:** document with verified findings + effort estimate; no code changes required by MVP architecture (confirm or file follow-ups).
- **Testing / DoD:** reviewed by lead; linked from plan §9.
