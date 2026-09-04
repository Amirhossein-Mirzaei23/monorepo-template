# Rakdsho (راکدشو) — Technical & Product Implementation Plan

> B2B liquidation / dead-stock marketplace for Iran. Mobile-first, Tehran launch, clothing as the
> primary category. This is the master planning document — it does not implement anything.
>
> - Full task cards: [`doc/tech/tasks/`](tasks/) (one file per feature area, index in `tasks/README.md`)
> - Repo rules: [`AGENTS.md`](../AGENTS.md), [`doc/ARCHITECTURE.md`](../ARCHITECTURE.md), [`doc/CONVENTIONS.md`](../CONVENTIONS.md)
> - Date: 2026-09-04 · Status: planning complete, implementation not started

---

## 1. Repository Assessment

### 1.1 Existing stack (verified in code)

| Layer         | Technology                                                                                                                        | Version     | State                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------- |
| Monorepo      | npm workspaces, Node ≥ 20                                                                                                         | —           | working                                                       |
| API           | NestJS (modular monolith, controller → service → repository)                                                                      | 11.x        | working                                                       |
| ORM/DB        | Prisma + PostgreSQL 16 (docker-compose)                                                                                           | Prisma 6.12 | working, 1 migration                                          |
| Auth          | JWT access (15m) + opaque refresh rotation (hashed, reuse detection), httpOnly cookie via BFF                                     | @nestjs/jwt | working                                                       |
| API docs      | @nestjs/swagger at `/docs`; feeds `gen:types`                                                                                     | 11.x        | working                                                       |
| Web           | Next.js App Router, React 19, feature-based                                                                                       | 16.x        | working                                                       |
| UI            | Tailwind v4 + shadcn/ui primitives (button, input, label, card, form, toast) in `apps/web/src/components/ui`                      | —           | working                                                       |
| Data fetching | react-query v5 + feature-scoped hooks; SSR/RSC decision table in CONVENTIONS.md                                                   | 5.x         | working                                                       |
| Forms         | react-hook-form + zod resolver                                                                                                    | —           | working                                                       |
| Contract      | `@monorepo/shared-types` generated from swagger (openapi-typescript + zod); CI drift gate                                         | —           | working                                                       |
| Observability | pino + request-id, OpenTelemetry, `/metrics` Prometheus, Sentry hooks in CI                                                       | —           | wired                                                         |
| Quality       | ESLint flat shared configs, strict TS, jest (api unit/e2e, web component), Husky + commitlint + lint-staged, CI matrix node 20/22 | —           | working                                                       |
| Generators    | plop `gen:module` (Nest domain) / `gen:feature` (web feature)                                                                     | —           | working                                                       |
| Deploy        | Multi-stage Dockerfiles (distroless / standalone), docker-compose (`postgres` + `apps` profile), migration-gate template in CI    | —           | working                                                       |
| SMS           | `modules/sms` — IranPayamak pattern API sender (`sendOtp`, web/android pattern codes, masked logging)                             | —           | **present but unused** — built for OTP, not yet wired to auth |

### 1.2 Existing modules and what they give us

- `modules/users` — reference domain: controller/service/repository/dto/tests, pagination + sort
  allowlist pattern (`common/dto/pagination-query.dto.ts`), transaction convention (services own
  `$transaction`, repositories take a tx client). **Reused as the blueprint for every new domain.**
- `modules/auth` — register/login/refresh/logout/me with refresh rotation in `RefreshToken`
  (sha256 hashes, family revocation on reuse). Email + password today. `TokenService` is
  identity-agnostic except `issueAccessToken` embedding `email` — small change for phone.
- `modules/sms` — `SmsService.sendOtp(phone, code, clientType)` ready; config + env validation done.
- `common/` — `@Public()`, `@Roles()`, `@CurrentUser()`, JwtAuthGuard (global, opt-out via
  `@Public`), RolesGuard, GlobalExceptionFilter (uniform `ApiErrorBody`), logging/timeout
  interceptors, ValidationPipe whitelist.
- Web `features/auth` — reference feature (components/hooks/api/schemas/barrel) to mirror for
  every new web feature.
- Web BFF — `app/api/auth/*` route handlers proxy to the API, re-issue the refresh cookie on the
  web origin (`lib/bff.ts`); `middleware.ts` gates `/` and `/dashboard/:path*` on cookie presence.
- Prisma schema today: `User` (email/passwordHash/role USER|ADMIN) + `RefreshToken`. Seed creates
  an admin + a user with passwords.

### 1.3 Gaps (must be built — nothing marketplace-specific exists yet)

- Phone/OTP authentication (SMS sender exists, OTP storage/verify flow does not).
- Profiles/onboarding, roles beyond USER/ADMIN.
- Categories, lots, marketplace browsing/search/filters, lot detail.
- Media pipeline: no file upload, storage, image variants, video, or serving — nothing exists.
- Chat: no realtime layer (no WS dependency installed), no conversations/messages.
- Offers, deals, reviews, verification, reports, inspections, notifications.
- Admin panel (API guards exist; no admin routes/UI).
- Persian/RTL: app is `lang="en"`, LTR, English copy; no Jalali/Toman formatting helpers.
- PWA manifest, SEO surfaces, sitemap.
- No scheduled jobs (no `@nestjs/schedule`).

### 1.4 Important technical constraints

- **Contract drift gate**: every task touching API DTOs must run `npm run gen:types` and commit the
  regenerated `packages/shared-types` (CI fails otherwise).
- **Layer rules**: controller → service → repository; repositories never open transactions.
- **Feature boundaries (web)**: cross-feature imports only via `features/<f>/index.ts`.
- **No new top-level folders**; new domains via `npm run gen:module` / `gen:feature`.
- Distroless API runtime: adding binaries (e.g. ffmpeg) has image implications — avoid in MVP.
- CSP currently allows `unsafe-inline` scripts; media/uploads will need `img-src`/`media-src`
  review when the storage host is known.
- `package-lock.json` only changes with intentional dependency changes (each dep addition is part
  of a task's scope, named in the task card).

### 1.5 Assumptions (marked, to be confirmed)

- A1: IranPayamak account/pattern codes are live (env values) — OTP delivery works in prod.
- A2: Hosting is a single Linux host (or small PaaS like Liara/AranCloud) with a persistent volume
  for local-disk media in MVP; object storage can be added later behind the storage abstraction.
- A3: Prices are entered and stored in **Toman** (integer).
- A4: Single API instance in MVP (WS sticky sessions and Redis adapter are explicitly out).
- A5: Admin staff is 1–3 people; admin UI lives in the same web app behind `ADMIN` role.

---

## 2. Product Architecture

Modular monolith on the existing template — no microservices, no Redis/ES/Kafka. All new state in
PostgreSQL; files on a volume behind an interface.

### 2.1 Frontend (Next.js 16, feature-based — unchanged structure)

- Route groups grow to: `(public)` marketplace (`/`, `/l/{code}`, `/c/{slug}`, `/s/{id}`),
  `(auth)` (`/login`), `(onboarding)` (`/onboarding`), `(app)` authenticated area
  (`/dashboard`, `/dashboard/lots`, `/chat`, `/offers`, `/deals`, `/saved`, `/settings`), `(admin)`
  (`/admin/*`).
- Public pages are SSR/RSC (SEO + share previews); authenticated interactive views use
  feature-scoped react-query hooks (per the existing decision table).
- Mobile-first: bottom tab bar in the `(app)` shell, desktop responsive upgrade.
- Persian/RTL from Phase 0: `lang="fa" dir="rtl"`, self-hosted Vazirmatn font, `lib/format.ts`
  (Toman, Persian digits, Jalali dates via `Intl` persian calendar — no heavy date dependency).
- New web features: `auth` (extended), `onboarding`, `profile`, `categories`, `lots`,
  `marketplace`, `media`, `chat`, `offers`, `deals`, `saved`, `notifications`, `admin`,
  `analytics` — each mirrored from `features/auth`.

### 2.2 Backend (NestJS — new modules under `modules/`)

`otp`, `profiles`, `categories`, `lots`, `media`, `conversations`, `messages`, `offers`, `deals`,
`reviews`, `verifications`, `inspections`, `reports`, `notifications`, `saved-lots`,
`saved-searches`, `analytics`, `admin` (+ `jobs` for `@nestjs/schedule` cron: lot/offer expiry,
stats rollup). Each generated via `gen:module`, following the users reference.

### 2.3 Database / domain architecture

Single PostgreSQL database, Prisma-owned. Domain boundaries by module; cross-module writes go
through services (e.g. deal completion calls into lots + notifications), transactions owned by the
calling service. Money = Toman `Int` (validated ≤ 2,000,000,000 — int4 is sufficient for B2B
clothing lots; revisit to BigInt only if FMCG/vehicle categories appear). Full schema: §12.

### 2.4 File / media storage

- `StorageService` interface (`put`, `get`, `delete`, `publicUrl`) with a **local-disk driver**
  (volume-mounted `STORAGE_DIR`) in MVP and an S3-compatible driver (AranCloud/Liara object
  storage) as a later task — no code changes at call sites.
- `MediaAsset` records ownership/mime/size/dimensions + storage keys. Uploads go **directly from
  the browser to the API** (`POST /media`, multipart, bearer token; CORS allowlist already
  exists) — multipart proxying through the Next BFF adds memory pressure for no benefit; JSON
  metadata still flows through the BFF. (Decision D3.)
- Images: `sharp` variants (original / cover 1200w / thumb 480w, WebP+JPEG), max 10 MB, ≤ 15 per
  lot. Videos: ≤ 60 s and ≤ 50 MB each, ≤ 3 per lot; **thumbnail is a client-captured poster
  frame** (canvas) uploaded alongside — no ffmpeg on the distroless API. (Decision D10.)
- Serving: `GET /media/:key` public + cache headers for lot media (marketplace is public);
  `GET /media/secure/:key` (bearer) for chat media. Keys contain unguessable ids.

### 2.5 Realtime chat

- `@nestjs/websockets` + socket.io gateway (`/ws`), JWT handshake verification, rooms per
  conversation + per user (reused for notification pushes). Single instance; no Redis adapter.
- Client: `socket.io-client` in the chat feature with a polling fallback (react-query refetch on
  reconnect/focus) so chat degrades gracefully. (Decision D4.)
- Presence/typing: typing indicator via WS events (P0-lite); online presence deferred (P2).

### 2.6 Notifications

- `Notification` rows written by domain services (direct service calls — no event bus per
  constraints). Unread count + list via REST; pushed over the user's WS room when connected.
- Push (web-push/PWA) and SMS-for-critical-events are P1/P2; SMS reuses `SmsService`.

### 2.7 Authentication

- Phone-number identity: `POST /auth/otp/request` (rate-limited per phone + per IP) → SMS via
  existing `SmsService` → `POST /auth/otp/verify` = login-or-register → existing
  `TokenService` session (access in body, refresh in httpOnly cookie via BFF — unchanged).
- `OtpCode` stores sha256 hash + expiry + attempt counter + per-phone send limits. Dev mode
  (`OTP_DEV_MODE=true`, refused in production) returns/logs a fixed code so agents and tests can
  run without SMS.
- Password login is retained **for ADMIN only** (seeded admin keeps email+password; service
  rejects non-admin password logins). (Decision D6.)
- `accountRoles: [BUYER, SELLER]` on User (set in onboarding) — never mutually exclusive.

### 2.8 Admin

Same API (`@Roles(UserRole.ADMIN)`), same web app `(admin)` route group guarded by role in
middleware + layouts. Server-rendered tables + action buttons; no separate app/deploy.

### 2.9 Search

PostgreSQL only: `ILIKE` filters plus a `pg_trgm` GIN index on `Lot.title`/`Lot.description`;
search covers title, description, category/subcategory names, seller business name, city.
Filters/sorts are indexed columns. Elasticsearch explicitly out (P2+ if ever).

### 2.10 API boundaries

REST, same style as existing controllers (unversioned, kebab resources — consistent with the
template; introducing `/v1` now would churn every existing path — Decision D7 keeps current
style). Swagger remains the contract; every DTO change regenerates shared-types. Media upload is
the only non-JSON endpoint. WS gateway is the only non-HTTP transport.

---

## 3. Domain Model

All ids are cuid. Every major entity carries `createdAt`/`updatedAt`; soft delete via `deletedAt`
where noted. Lifecycle enums are explicit on every marketplace entity (product principle 12).

Folded entities (deliberate; dedicated tables arrive with their phase without restructuring):
**Business** → nullable seller fields on `Profile` (one account, dual buyer/seller roles);
**Payment** → `Deal.paymentMethod` + payment-terms/confirmation fields; **Shipment** →
`Deal.deliveryMethod` + notes.

| Entity             | Key fields                                                                                                                                                                                                                                                                                                                                                                                                                            | Relations                                                             | Lifecycle / enums                                                                                                                                                                                                                                                                                                                                                                                                                        | Critical indexes                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **User**           | phone (unique), email? (unique?), name, passwordHash? (admin only), role, accountRoles[], status, onboardingCompletedAt, deletedAt                                                                                                                                                                                                                                                                                                    | 1–1 Profile; 1–n lots, conversations, deals…                          | `UserRole {USER, ADMIN}`; `AccountRole {BUYER, SELLER}`; `UserStatus {ACTIVE, SUSPENDED, BLOCKED, DELETED}`                                                                                                                                                                                                                                                                                                                              | phone unique; status                                                                                                                       |
| **RefreshToken**   | tokenHash unique, userId, expiresAt, revokedAt, deviceLabel?, userAgent?, lastUsedAt                                                                                                                                                                                                                                                                                                                                                  | n–1 User                                                              | revoked or expired = dead                                                                                                                                                                                                                                                                                                                                                                                                                | userId (exists today; add lastUsedAt)                                                                                                      |
| **OtpCode**        | phone, codeHash, purpose, expiresAt, consumedAt, attempts, lastSentAt                                                                                                                                                                                                                                                                                                                                                                 | —                                                                     | `OtpPurpose {LOGIN, PHONE_CHANGE}`                                                                                                                                                                                                                                                                                                                                                                                                       | (phone, createdAt); unique active per phone                                                                                                |
| **Profile**        | userId unique, displayName, businessName?, province?, city?, bio?, instagram?, website?, avatarMediaId?, isBuyer, isSeller, sellerYearsActive?, sellerBusinessType?, sellerDescription?                                                                                                                                                                                                                                               | 1–1 User; n–n Categories (interests)                                  | —                                                                                                                                                                                                                                                                                                                                                                                                                                        | userId unique                                                                                                                              |
| **Category**       | nameFa, nameEn?, slug unique, parentId? (self-relation, 2 levels), sortOrder, isActive                                                                                                                                                                                                                                                                                                                                                | self; n–n Profile; 1–n Lot                                            | active flag (no enum)                                                                                                                                                                                                                                                                                                                                                                                                                    | slug unique; (parentId, sortOrder)                                                                                                         |
| **Lot**            | code (public, nanoid-8), sellerId, categoryId, subcategoryId?, title, description, quantity, unit, availableQuantity, minOrderQuantity, pricingType, totalPrice, unitPrice (stored, derived), condition, liquidationReason, province, city, locationHint (approx, public), exactAddress (private — only exposed after deal), status, rejectionReason?, viewCount, saveCount, expiresAt, publishedAt?, soldAt?, featuredAt?, deletedAt | n–1 User(seller), Category×2; 1–n LotMedia, Conversation, Offer, Deal | `LotStatus {DRAFT, PENDING_REVIEW, ACTIVE, PAUSED, REJECTED, EXPIRED, SOLD, REMOVED}`; `LotCondition {GRADE_A, GRADE_B, GRADE_C, MIXED, NEW, USED, DAMAGED, NEAR_EXPIRY}`; `LiquidationReason {EXCESS_PRODUCTION, CANCELLED_ORDER, EXPORT_RETURN, SEASON_CLEARANCE, OVERSTOCK, FACTORY_CLOSURE, PACKAGING_CHANGE, NEAR_EXPIRY, OTHER}`; `PricingType {FIXED, NEGOTIABLE}` (future AUCTION); `LotUnit {PIECE, SET, BOX, KG, PAIR, OTHER}` | code unique; (status, createdAt); (status, expiresAt); (categoryId, status); (city, status); (sellerId, status); trgm on title/description |
| **MediaAsset**     | ownerId, type (IMAGE/VIDEO), storageKey, thumbKey?, mime, sizeBytes, width?, height?, durationMs?                                                                                                                                                                                                                                                                                                                                     | owned by User; referenced by LotMedia / Message / Inspection          | IMAGE \| VIDEO                                                                                                                                                                                                                                                                                                                                                                                                                           | ownerId, createdAt                                                                                                                         |
| **LotMedia**       | lotId, mediaAssetId, sortOrder, isCover                                                                                                                                                                                                                                                                                                                                                                                               | n–1 Lot, MediaAsset                                                   | —                                                                                                                                                                                                                                                                                                                                                                                                                                        | (lotId, sortOrder); unique(lotId, mediaAssetId)                                                                                            |
| **Conversation**   | lotId, buyerId, sellerId, lastMessageAt, lastMessagePreview, buyerUnread, sellerUnread, status                                                                                                                                                                                                                                                                                                                                        | n–1 Lot; 2×User; 1–n Message                                          | `ConversationStatus {ACTIVE, BLOCKED, REPORTED}`                                                                                                                                                                                                                                                                                                                                                                                         | unique(lotId, buyerId); (buyerId, lastMessageAt desc); (sellerId, lastMessageAt desc)                                                      |
| **Message**        | conversationId, senderId?, type, body?, mediaAssetId?, replyToId?, readAt?                                                                                                                                                                                                                                                                                                                                                            | n–1 Conversation, MediaAsset; self (reply)                            | `MessageType {TEXT, IMAGE, VIDEO, SYSTEM, ACTION}` (sender null = system)                                                                                                                                                                                                                                                                                                                                                                | (conversationId, createdAt)                                                                                                                |
| **Offer**          | lotId, buyerId, sellerId, conversationId?, parentId? (counter chain), quantity, unitPrice, totalPrice, note?, status, expiresAt, decidedAt?                                                                                                                                                                                                                                                                                           | n–1 Lot, Conversation, self                                           | `OfferStatus {PENDING, COUNTERED, ACCEPTED, REJECTED, CANCELLED, EXPIRED}`                                                                                                                                                                                                                                                                                                                                                               | (lotId, buyerId, createdAt); (sellerId, status); (status, expiresAt)                                                                       |
| **Deal**           | code, lotId, buyerId, sellerId, offerId?, conversationId?, quantity, unitPrice, totalPrice, deliveryMethod, deliveryNote?, paymentMethod, paymentTermsNote?, paidConfirmedByBuyerAt?, commissionRate, commissionAmount?, status, cancelReason?, disputeReason?, timestamps per stage, completedAt?                                                                                                                                    | n–1 Lot, Offer, Conversation; 1–n DealEvent, Review                   | `DealStatus {NEGOTIATING, AGREED, PAYMENT_PENDING, PAID, PREPARING, SHIPPED, DELIVERED, COMPLETED, CANCELLED, DISPUTED}`; `DeliveryMethod {PICKUP, SELLER_SHIPS, BUYER_TRANSPORT, CARRIER}`; `PaymentMethodRecorded {CASH, CARD_TO_CARD, BANK_TRANSFER, CHEQUE}` (gateway later)                                                                                                                                                         | (buyerId, updatedAt); (sellerId, updatedAt); (status); code unique                                                                         |
| **DealEvent**      | dealId, actorId?, fromStatus, toStatus, note?                                                                                                                                                                                                                                                                                                                                                                                         | n–1 Deal                                                              | —                                                                                                                                                                                                                                                                                                                                                                                                                                        | (dealId, createdAt)                                                                                                                        |
| **Review**         | dealId unique-per-direction, reviewerId, revieweeId, direction, dims (seller: accuracy/quality/communication/delivery; buyer: payment/communication/completion — 1–5 Ints), comment?, publishedAt?                                                                                                                                                                                                                                    | n–1 Deal, 2×User                                                      | `ReviewDirection {BUYER_TO_SELLER, SELLER_TO_BUYER}`; double-blind: published when both sides submitted or 14 days passed                                                                                                                                                                                                                                                                                                                | unique(dealId, direction); (revieweeId)                                                                                                    |
| **Verification**   | subjectType {USER, LOT}, subjectId, type, status, requestNote?, adminNote?, reviewedByAdminId?, decidedAt?, revokedAt?                                                                                                                                                                                                                                                                                                                | —                                                                     | `VerificationType {PHONE_VERIFIED, IDENTITY_VERIFIED, BUSINESS_VERIFIED, SELLER_VERIFIED, LOT_VERIFIED, QUANTITY_CHECKED, CONDITION_CHECKED, PHOTOS_VERIFIED}`; `VerificationStatus {PENDING, APPROVED, REJECTED, REVOKED}`                                                                                                                                                                                                              | (subjectType, subjectId, type); (status)                                                                                                   |
| **Inspection**     | lotId, inspectorId, quantityChecked, conditionChecked, defects?, notes?, photoMediaIds[], result, inspectedAt                                                                                                                                                                                                                                                                                                                         | n–1 Lot                                                               | `InspectionResult {PENDING, VERIFIED, VERIFIED_WITH_NOTES, FAILED}`                                                                                                                                                                                                                                                                                                                                                                      | (lotId, inspectedAt desc)                                                                                                                  |
| **Report**         | reporterId, subjectType {LOT, USER, CONVERSATION, MESSAGE}, subjectId, reason, note?, status, resolutionNote?, resolvedByAdminId?                                                                                                                                                                                                                                                                                                     | —                                                                     | `ReportReason {FAKE_LISTING, INCORRECT_QUANTITY, INCORRECT_CONDITION, COUNTERFEIT, SCAM, SPAM, ABUSIVE_BEHAVIOR, PROHIBITED_ITEM, OTHER}`; `ReportStatus {OPEN, REVIEWING, RESOLVED, REJECTED}`                                                                                                                                                                                                                                          | (status, createdAt); (subjectType, subjectId)                                                                                              |
| **Notification**   | userId, type, title, body, dataJson, readAt?                                                                                                                                                                                                                                                                                                                                                                                          | n–1 User                                                              | `NotificationType {NEW_MESSAGE, NEW_OFFER, OFFER_COUNTERED, OFFER_ACCEPTED, OFFER_REJECTED, DEAL_STATUS_CHANGED, NEW_MATCHING_LOT, LOT_PRICE_CHANGED, LOT_EXPIRING, SAVED_LOT_SOLD, VERIFICATION_RESULT}`                                                                                                                                                                                                                                | (userId, readAt, createdAt)                                                                                                                |
| **SavedLot**       | userId, lotId, createdAt                                                                                                                                                                                                                                                                                                                                                                                                              | n–1 User, Lot                                                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                        | unique(userId, lotId)                                                                                                                      |
| **SavedSearch**    | userId, name?, queryJson, notifyEnabled                                                                                                                                                                                                                                                                                                                                                                                               | n–1 User                                                              | —                                                                                                                                                                                                                                                                                                                                                                                                                                        | (userId)                                                                                                                                   |
| **AnalyticsEvent** | userId?, type, entityType?, entityId?, metaJson, createdAt                                                                                                                                                                                                                                                                                                                                                                            | —                                                                     | `AnalyticsEventType {LOT_VIEW, LOT_SAVE, LOT_SHARE, SEARCH, CONTACT, OFFER_MADE, DEAL_COMPLETED, …}`                                                                                                                                                                                                                                                                                                                                     | (type, createdAt); (entityType, entityId)                                                                                                  |
| **AuditLog**       | actorId?, action, entityType, entityId, metaJson, ip?                                                                                                                                                                                                                                                                                                                                                                                 | —                                                                     | —                                                                                                                                                                                                                                                                                                                                                                                                                                        | (entityType, entityId, createdAt); (actorId, createdAt)                                                                                    |

Aggregate seller metrics (successful transactions, rating average/count, response rate/time,
cancellation rate, active listings) are **computed** (queries + a nightly rollup onto
`Profile`/denormalized counters in P1 — task PROF-005), never user-editable.

---

## 4. Feature Map (P0 / P1 / P2)

**P0 — MVP (must ship)**

- Auth: phone OTP (request/verify/resend/expiry/rate-limit), logout, dev-mode OTP, admin password path
- Onboarding: role select (buyer/seller/both), profile + business fields, city, categories, avatar (deferred to media phase), no documents
- Profiles: my profile view/edit; public seller profile w/ metrics; buyer profile (minimal)
- Categories: seeded tree, public API, admin CRUD, picker component
- Lots: full model, create/edit/draft (mobile-first), publish → moderation, pause/resume, mark sold, delete, duplicate, expiration
- Media: image upload (camera/gallery, variants, reorder, cover, retry), video upload + client poster, lot galleries
- Marketplace: home (search, categories, fresh, ending soon, verified suppliers), browse w/ infinite scroll, search, filters, sorting, lot card, lot detail (public SSR), share, similar lots (same-category)
- Chat: lot-linked conversations, text/image/video messages, WS realtime, read state, typing, pagination, quick actions, lot context header
- Offers: make/counter/accept/reject/cancel, history, expiry
- Deals: creation from accepted offer, confirm terms, status flow to Completed/Cancelled, completion effects, payment method recording + optional confirmation + commission fields (no gateway, no wallet)
- Trust: phone-verified badge, manual admin verification (user + lot), lot moderation queue w/ rejection reason + resubmit, reports
- Admin: users, lots moderation, reports, deals view, verification review, categories, dashboard
- Buyer: save lot, saved list, share
- Dashboards: seller dashboard (lots/messages/offers/deals), buyer dashboard (saved/messages/offers/deals/purchases), settings
- Platform: RTL/Persian/Jalali/Toman formatting, mobile-first + responsive
- QA: E2E critical path, permission/state-machine suites, RTL/mobile a11y pass, launch checklist

**P1 — fast follow**

- Saved searches (+ saved-search notifications in P2), notifications (in-app + bell + WS push), SMS critical events
- Ratings & reviews (double-blind, deal-gated)
- Inspection workflow (admin), advanced verification types
- Seller analytics, buyer purchase history, admin marketplace metrics
- Better moderation tooling, SEO improvements (sitemap/OG/structured data), PWA manifest
- Session/device management, change phone, account deletion
- S3-compatible storage driver, deal disputes handling

**P2 — later**

- Auction, make-an-offer upgrades, online payment gateway / escrow-like (legal review first)
- Logistics integrations, inspection network, recommendations, pricing intelligence
- Sponsored/featured monetization, subscription plans, advanced analytics, fraud detection

---

## 5. Development Phases

| Phase | Name                           | Contents                                                                                                           | Exit criteria                              |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 0     | Platform foundation            | RTL/Persian/formatting, route restructure (public home), env/config additions                                      | fa/RTL app shell; `/` public               |
| 1     | Auth & onboarding              | OTP auth end-to-end, session reuse, profiles + onboarding, public seller profile                                   | user can OTP-login → onboard → see profile |
| 2     | Catalog & lots                 | Categories + seed, lot domain, create/edit UI, lot lifecycle, my-lots, expiry job                                  | seller can create + submit a lot           |
| 3     | Media                          | Storage abstraction, image/video upload, uploader UI, lot media + galleries                                        | lot with 15 imgs + 3 videos displays       |
| 4     | Marketplace                    | Listing/search/filter/sort APIs, home, cards, detail page, share                                                   | buyer can discover + open a lot publicly   |
| 5     | Chat                           | Conversations/messages APIs, WS gateway, chat UI, media messages, quick actions                                    | buyer↔seller realtime chat w/ lot context  |
| 6     | Offers & deals                 | Offer chain + UI, deal state machine + UI, payment recording, completion effects                                   | accepted offer → deal → completed          |
| 7     | Trust & moderation             | Verification, reports, moderation queue, admin panel (users/lots/reports/deals/verifications/categories/dashboard) | admin can run the marketplace manually     |
| 8     | Dashboards & saved             | App shell + bottom tabs, seller/buyer dashboards, saved lots, settings                                             | both roles self-serve                      |
| 9     | Notifications & analytics (P1) | In-app notifications, event capture, seller/admin analytics                                                        | —                                          |
| 10    | QA & launch                    | E2E, permission suites, a11y/RTL pass, security review, launch checklist                                           | launch readiness signed off                |

Phase labels on P1/P2 cards: **Phase 9** = P1 product wave, **Phase 10** = launch-adjacent or
post-launch. P0 cards' phases are the strict build order.

---

## 6. Task Breakdown

**108 task cards** (107 actionable — CAT-002 is folded into CAT-001), each independently
executable by one coding-agent session. Full cards (goal, story, deps, files, backend/frontend/DB
work, API, validation, errors, permissions, acceptance, testing, DoD, complexity) live in
[`doc/tech/tasks/`](tasks/README.md):

| File                               | Areas         | Tasks |
| ---------------------------------- | ------------- | ----- |
| `tasks/platform.md`                | PLAT          | 6     |
| `tasks/auth.md`                    | AUTH          | 8     |
| `tasks/profiles.md`                | ONB, PROF     | 7     |
| `tasks/catalog-lots.md`            | CAT, LOT      | 10    |
| `tasks/media.md`                   | MEDIA         | 6     |
| `tasks/marketplace.md`             | MKT           | 12    |
| `tasks/chat.md`                    | CHT           | 10    |
| `tasks/offers-deals.md`            | OFR, DEAL     | 11    |
| `tasks/trust-admin.md`             | TRS, ADM, REV | 17    |
| `tasks/dashboards-saved.md`        | DSH, SAV      | 8     |
| `tasks/notifications-analytics.md` | NTF, ANL      | 8     |
| `tasks/qa-launch.md`               | QA            | 5     |

Complexity mix: XS 1 · S 22 · M 71 · L 12 · XL 1 (E2E suite).

---

## 7. Dependency Graph (critical paths)

```
PLAT-001 (RTL/fa base) ──┐
PLAT-002 (public routes)─┤
AUTH-001 (phone schema)──┼→ AUTH-002 → AUTH-003 → AUTH-004 → ONB-001 → ONB-002
AUTH-005 (seed)          │                              │
                         │              PROF-001, PROF-002 (public seller page ← MKT-005)
                         └→ CAT-001 → CAT-003 (picker) ─┐
                                                                      ↓
MEDIA-001 (storage) → MEDIA-002 → MEDIA-003 → MEDIA-004 ──→ LOT-004 (create-lot UI w/ media)
        │                                                   ↑
        │            LOT-001 → LOT-002 → LOT-003 ───────────┘
        │                        └──→ LOT-003 → TRS-005/TRS-006 (moderation wiring)
        │                             LOT-005 (my lots) ← LOT-004
        │                             LOT-006 (expiry job) ← LOT-001
        │
        └──→ MEDIA-005 (lot media) → MKT-009 (lot detail w/ galleries)
                              │
CAT-001 → LOT-001             │
   ↓                          ↓
MKT-001 → MKT-002 → MKT-003 → MKT-006 (browse) → MKT-004 (home)
   └──────────────→ MKT-005 (card) → MKT-009 (detail) → MKT-010 (share)
                                              ↓
LOT-001 → CHT-001 → CHT-002 → CHT-003 → CHT-004 (WS) → CHT-005/CHT-006 (UI)
                             └→ CHT-007 (media msgs ← MEDIA-001..004)
MKT-009 + CHT-001 → OFR-001 → OFR-002 → OFR-004 → DEAL-002
OFR-001 → OFR-003 (expiry job)
DEAL-001 → DEAL-002 → DEAL-003 → DEAL-004 → DEAL-005 (completion effects → REV-001, NTF-*)
DEAL-001 → DEAL-006 (payment recording) · DEAL-001 → DEAL-007 (disputes, P1)
TRS-001 (verification) → TRS-002 (badges) → used by MKT-002 (verified filter), MKT-005
TRS-003 → TRS-004 (reports) → ADM-004
TRS-005 (moderation API) → ADM-003 → ADM-001 (admin shell first in practice)
ADM-001 → ADM-002 … ADM-008 ; CAT-004 → ADM-007
DEAL-005 → REV-001 → REV-002 (reviews, P1)
LOT-001 → SAV-001 → SAV-002 ; MKT-003 → SAV-003 → SAV-004 (P1/P2)
CHT-002 + OFR-002 + DEAL-003 → NTF-001 → NTF-002 → NTF-003
PLAT-003 (env) gates AUTH-002/MEDIA-001; PLAT-004/005 (PWA/SEO) after MKT-009
QA-001/QA-002/QA-003 after Phases 1–8 core; QA-005 last
```

## 8. Suggested Implementation Order

Exact order (grouped; within a line, left → right):

1. PLAT-001, PLAT-002, PLAT-003, AUTH-001
2. AUTH-002, AUTH-003, AUTH-004, AUTH-005
3. ONB-001, ONB-002, PROF-001
4. CAT-001, CAT-003, CAT-004
5. LOT-001, LOT-002, LOT-003, LOT-006
6. MEDIA-001, MEDIA-002, MEDIA-003, MEDIA-004, MEDIA-005
7. LOT-004, LOT-005
8. MKT-001, MKT-002, MKT-003, MKT-005, MKT-006, MKT-007, MKT-008
9. MKT-004, MKT-009, MKT-010, PROF-002
10. CHT-001, CHT-002, CHT-003, CHT-004, CHT-005, CHT-006, CHT-007, CHT-008
11. OFR-001, OFR-002, OFR-003, OFR-004
12. DEAL-001, DEAL-002, DEAL-003, DEAL-004, DEAL-005, DEAL-006
13. TRS-001, TRS-002, TRS-003, TRS-004, TRS-005, TRS-006
14. ADM-001, ADM-002, ADM-003, ADM-004, ADM-005, ADM-006, ADM-007, ADM-008
15. DSH-001, DSH-002, DSH-003, DSH-004, SAV-001, SAV-002
16. QA-001, QA-002, QA-003, QA-005 ← MVP (P0) complete
17. P1: NTF-001→NTF-003, REV-001, REV-002, SAV-003, AUTH-006, AUTH-007, AUTH-008, PROF-003, PROF-004, PROF-005, TRS-007, DEAL-007, CHT-009, ANL-001→ANL-003, ADM tooling, PLAT-005, MEDIA-006, NTF-005, QA-004
18. P2: MKT-012, NTF-004, SAV-004, PLAT-006, payment/auction spikes (not planned as tasks yet)

## 9. MVP Scope

**Must be built:** everything in the P0 feature map (§4) — real transactions end-to-end: OTP login,
onboard, list a lot with media, moderate it, discover it, chat about it, offer/counter, deal with
recorded payment terms, complete, admin-run trust rails.

**Can be mocked / manual:**

- OTP delivery in dev (`OTP_DEV_MODE`) and in tests (service mocked).
- Verification: manual admin badges only — no KYC flow.
- "Best deals" home section: simple heuristic (biggest unit-price discount vs category median can
  wait; start with newest + ending soon + verified).
- Similar lots: same subcategory, newest — no ML.
- Response metrics: display placeholders ("—") until PROF-005 lands (P1).
- Analytics: lot view/save counters only; full analytics is P1.

**Must NOT be built yet:** auction, make-an-offer pricing mode beyond NEGOTIABLE, wallet/escrow,
online payment gateway, logistics integrations, recommendations, Elasticsearch, Redis, Kafka,
microservices, native app, automated KYC, sponsored listings/subscriptions.

## 10. Risks & Technical Decisions

| #   | Risk / decision                                                                          | Impact                         | Mitigation / recommendation                                                                                                                        | Decide now?                      |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| D1  | SMS provider/pattern availability (IranPayamak codes, OTP template approval, filtering)  | Blocks all login               | Config already ported; verify live send in week 1; `OTP_DEV_MODE` for dev; consider a second provider behind SmsService interface later            | **Yes**                          |
| D2  | Media storage: local volume vs object storage day 1                                      | Cost/ops of migration later    | Local disk + `StorageService` abstraction; S3 driver is a P1 task; nightly volume backups                                                          | **Yes** (default: local)         |
| D3  | Upload path: browser→API direct vs via BFF                                               | Progress events, memory        | Direct to API (CORS allowlist exists); BFF stays JSON-only                                                                                         | **Yes** (default: direct)        |
| D4  | Realtime: WS (socket.io) vs polling only                                                 | Chat UX, complexity            | socket.io gateway + polling fallback; single instance is fine for first thousands of users                                                         | **Yes** (default: WS)            |
| D5  | Money representation                                                                     | Data integrity                 | Toman `Int`, validated ≤ 2B; unit price derived; never floats                                                                                      | **Yes**                          |
| D6  | Keep password login for admins                                                           | Security surface               | Keep, ADMIN-only, seeded; regular users phone-only                                                                                                 | **Yes**                          |
| D7  | URL scheme for public lot pages                                                          | SEO/links                      | `/l/{nanoid8}` + fa metadata; category `/c/{slug}`; seller `/s/{id}`; keep unversioned API paths (template convention)                             | Yes (light)                      |
| D8  | Jalali/Persian formatting dependency                                                     | Bundle weight                  | `Intl.DateTimeFormat('fa-IR', {calendar:'persian'})` + `Intl.NumberFormat` in `lib/format.ts`; self-hosted Vazirmatn; no date library added        | Yes (light)                      |
| D9  | **Regulatory**: eNAMAD trust seal, marketplace commission invoicing/tax, escrow legality | Launch-blocking legal exposure | Out of code scope; flag for legal review before public launch (QA-005 checklist item). No payment custody in MVP                                   | Flag now, resolve pre-launch     |
| D10 | Server-side video processing (ffmpeg)                                                    | Image size/ops                 | Client-captured poster frame + duration/mime/size validation server-side; ffmpeg only if moderation demands it                                     | **Yes** (default: client poster) |
| D11 | Admin UI placement                                                                       | Effort                         | Same app, `(admin)` group, role-guarded — no separate deploy                                                                                       | **Yes**                          |
| R1  | Media storage cost / abuse                                                               | Cost, legality of content      | Auth-required uploads, per-user daily quotas, mime sniffing (file magic bytes), size caps, admin removal + AuditLog                                | Partly (quotas in MEDIA-002)     |
| R2  | Marketplace cold start (no buyers or no sellers)                                         | Product failure                | Launch Tehran-first, manually recruit suppliers (concierge onboarding), seed listings manually via admin; measure contact-rate not listing count   | Ongoing, ops                     |
| R3  | Fraud/scam off-platform payment, fake listings                                           | Trust collapse                 | Deal recording + reviews + verification badges + reports + moderation; no payment custody; disclaimers; dispute handling P1                        | Design included                  |
| R4  | Duplicate/fake accounts (cheap SIMs)                                                     | Trust, spam                    | Per-phone uniqueness, OTP rate limits, device/session controls P1, admin block tools                                                               | Design included                  |
| R5  | Transaction disputes                                                                     | Support load                   | DealEvent timeline + AuditLog + dispute status + admin investigation view (DEAL-007)                                                               | Design included                  |
| R6  | Search scalability                                                                       | Perf                           | pg_trgm + indexed filters is ample for thousands of lots; ES explicitly deferred                                                                   | No                               |
| R7  | Exact-location privacy                                                                   | Seller safety                  | `locationHint` (city/district only) public; `exactAddress` never in lot payloads — released only inside an accepted deal's detail for participants | Design included                  |
| R8  | WS at scale                                                                              | Perf                           | Single instance now; socket.io Redis adapter + sticky sessions documented as the scaling path, not built                                           | No                               |
| R9  | Chat as abuse channel (spam/scam off-platform)                                           | Trust                          | Rate limits on send, block/report, message retention, admin view P1                                                                                | Partly                           |
| R10 | OTP brute force                                                                          | Account takeover               | Hashed codes, 5-attempt lockout, per-phone send caps (3/hour, 5/day), per-IP throttle, 2-min expiry                                                | Design included                  |

## 11. Suggested API Surface (planned, not implemented)

Auth/session: `POST /auth/otp/request` · `POST /auth/otp/verify` · `POST /auth/login` (admin pw)
· `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` (exists) · `GET/DELETE /auth/sessions[/:id]` (P1) · `POST /auth/phone-change/request|confirm` (P1) · `DELETE /auth/account` (P1)

Profiles: `PUT /profiles/onboarding` · `GET /profiles/me` · `PATCH /profiles/me` ·
`GET /profiles/sellers/:id` (public) · `GET /profiles/buyers/:id` (public, minimal) ·
`GET /profiles/me/metrics` (seller stats) · `GET /profiles/sellers?verified=true` (public home strip — MKT-004)

Categories: `GET /categories` (public tree) · admin: `POST/PATCH /admin/categories[/:id]` ·
`PATCH /admin/categories/:id/reorder` · `PATCH /admin/categories/:id/toggle`

Lots: `POST /lots` · `GET /lots` (public browse+search+filters+sort) · `GET /lots/:code` (public)
· `PATCH /lots/:id` (owner, DRAFT/REJECTED) · `POST /lots/:id/submit` · `POST /lots/:id/pause` ·
`/resume` · `/mark-sold` · `/duplicate` · `DELETE /lots/:id` · `GET /lots/mine` (seller, tabs by
status) · `GET /lots/:id/similar` (public)

Media: `POST /media` (multipart; returns MediaAsset) · `GET /media/:key` (public, cached) ·
`GET /media/secure/:key` (bearer) · `DELETE /media/:id` (owner) · `PUT /lots/:id/media`
(reorder/cover set)

Conversations/messages: `POST /conversations` (get-or-create for lot) · `GET /conversations` ·
`GET /conversations/:id` · `POST /conversations/:id/messages` · `GET /conversations/:id/messages`
· `POST /conversations/:id/read` · `POST /conversations/:id/block` (P1) · WS gateway `/ws`
(`join`, `message`, `typing`, `read` events)

Offers: `POST /offers` · `POST /offers/:id/counter` · `/accept` · `/reject` · `/cancel` ·
`GET /offers` (mine: buyer/seller) · `GET /lots/:code/offers` (seller)

Deals: `POST /deals` (from offer or conversation) · `GET /deals` · `GET /deals/:code` ·
`POST /deals/:code/transition` (state advance per matrix) · `POST /deals/:code/cancel` ·
`POST /deals/:code/dispute` (P1) · `POST /deals/:code/payment-confirm` (buyer)

Reviews (P1): `POST /reviews` · `GET /profiles/sellers/:id/reviews`

Verification/reports: `POST /reports` · `GET /verifications/me` (P1-optional — MVP badges are admin-initiated) · admin under `/admin/*`

Saved: `PUT/DELETE /saved-lots/:lotId` · `GET /saved-lots` · P1: `POST /saved-searches` ·
`GET/DELETE /saved-searches[/:id]`

Notifications (P1): `GET /notifications` · `GET /notifications/unread-count` ·
`POST /notifications/:id/read` · `POST /notifications/read-all`

App shell / analytics: `GET /app/badges` · `GET /app/seller-overview` · `GET /app/buyer-overview` ·
`GET /app/seller-analytics?days=` (P1) · `POST /analytics/events` (public-write, best-effort)

Admin: `GET /admin/overview` · `GET /admin/users` + `PATCH /admin/users/:id` (suspend/block/verify/
roles) · `GET /admin/lots?status=PENDING_REVIEW` + `POST /admin/lots/:id/approve|reject|pause|
remove|feature` · `GET /admin/reports` + `PATCH /admin/reports/:id` · `GET /admin/deals` +
`PATCH /admin/deals/:code` · `GET /admin/verifications` + `PATCH /admin/verifications/:id` ·
categories (above) · `POST /admin/lots/:id/inspection` (P1)

All list endpoints use the shared `PaginationQueryDto` envelope (`Paginated<T>`); all payloads
swagger-annotated → `gen:types`.

## 12. Database Design

See §3 for entities/fields/indexes/enums. Cross-cutting decisions:

- **Ids**: cuid strings (matches template). Public references (lot/deal) additionally get a short
  non-sequential `code` (nanoid-8) used in URLs so internal ids aren't enumerable.
- **Soft delete**: `deletedAt` on User, Lot, Conversation, Message, SavedLot, SavedSearch.
  Hard-delete only for OtpCode (expired rows pruned by job) and expired AnalyticsEvents (retention
  job later). Reports/verifications/audit rows are never deleted.
- **Audit fields**: `createdAt`/`updatedAt` everywhere; state transitions additionally recorded in
  `DealEvent` (deals) and `AuditLog` (admin actions, moderation decisions, verification grants).
- **Unique constraints**: `User.phone`, `Lot.code`, `Deal.code`, `Category.slug`,
  `Conversation(lotId, buyerId)`, `SavedLot(userId, lotId)`, `Review(dealId, direction)`,
  active-OTP-per-phone partial unique.
- **Money/quantity**: `Int` Toman; `quantity`/`availableQuantity`/`minOrderQuantity` positive Ints;
  invariant `0 ≤ availableQuantity ≤ quantity`; `unitPrice = round(totalPrice / quantity)` stored
  on write.
- **Live-lot edits**: while `ACTIVE`/`PAUSED`, only price/quantity/minOrder may change
  (revalidated, no re-moderation — this is what powers `LOT_PRICE_CHANGED` notifications);
  content edits (title/description/category/media/location) send the lot back to
  `PENDING_REVIEW`.
- **JSON columns**: `SavedSearch.queryJson`, `Notification.dataJson`, `AuditLog.metaJson`,
  `AnalyticsEvent.metaJson` (Prisma `Json`).
- **Search**: `pg_trgm` extension + GIN indexes on `Lot.title`, `Lot.description` (raw SQL in a
  Prisma migration).
- **Counters**: `Lot.viewCount`/`saveCount` incremented via `updateMany` (no read-modify-write);
  unread counts on Conversation updated atomically in message send.
- **Migrations**: one Prisma migration per schema-touching task, expand/contract style, committed
  with the task; `prisma migrate deploy` in deploy (never in request path).

## 13. Testing Strategy

- **Unit (api)**: services with `fake-prisma` (existing `src/test/fakes`); state machines get
  dedicated suites — lot transitions (LOT-003), offer chain (OFR-001), deal matrix (DEAL-003);
  OTP service (expiry/attempts/rate) (AUTH-002); unit-price derivation; media validation rules.
- **API/e2e (supertest + create-test-app)**: controller authorization matrix (public / buyer /
  seller / owner / admin) for every resource; pagination/filter/sort contracts; moderation flow
  (submit → approve/reject → resubmit); offer→deal→completion happy path + illegal transitions;
  conversation isolation (participant-only access); upload endpoint (multipart, oversize,
  wrong-mime, quota); media serve caching/authorization; OTP request/verify/rate-limit.
- **Web (jest + testing-library)**: component tests per feature (forms with zod schemas, chat
  thread rendering, lot card, filters sheet); `lib/format` (toman/Jalali/fa digits) snapshot tests;
  uploader (progress/retry/reorder) with mocked XHR.
- **WS**: gateway unit tests (auth handshake reject, room isolation, event emission) with a mocked
  server; polling fallback covered in chat hook tests.
- **E2E (Playwright, task QA-001)**: the full critical journey incl. mobile viewport + RTL;
  `OTP_DEV_MODE` used for deterministic login.
- **Gates**: `npm run lint && npm run typecheck && npm run test` per task (AGENTS.md), drift gate
  in CI keeps shared-types honest.

## 14. Launch Readiness Checklist

- [ ] Security: OTP rate limits + lockout verified; IDOR audit (conversations, media, deals,
      lots-by-owner); mime sniffing on uploads; helmet/CSP reviewed for media host + WS; secrets
      rotated from defaults; admin password strong + 2FA-lite (OTP) considered
- [ ] Performance: listing query `EXPLAIN` with 10k lots; image variant pipeline verified; WS
      memory baseline; N+1 checks on conversation list (last message + unread in one query)
- [ ] Monitoring/alerts: `/health/*` + `/metrics` scraped; pino logs shipped; alert on error rate,
      OTP failure spike, disk usage (media volume)
- [ ] Error tracking: Sentry DSN live for api + web (CI hooks exist)
- [ ] Logging: request-id correlation across BFF→API verified; OTP codes never logged (masked)
- [ ] Backups: Postgres nightly + restore drill; media volume nightly (until S3 driver lands)
- [ ] Media storage: volume sized + quota per user; cleanup job for orphaned assets (P1)
- [ ] SEO/Privacy: robots + sitemap; OG previews; exact-address leak test (public payloads
      scrubbed); report/abuse entry points reachable
- [ ] Analytics: lot view/save counters live; funnel events (search→view→contact→offer→deal)
- [ ] Moderation: admin queue SLA (pending lots < 24h); rejection reasons; report triage runbook
- [ ] Rate limiting: OTP, login, chat send, offer create, upload — all throttled
- [ ] Privacy: account deletion path (P1) or documented manual process at launch; ToS/privacy fa
- [ ] RTL/mobile QA: QA-003 sign-off (touch targets ≥44px, keyboard nav, a11y contrast)
- [ ] Legal (D9): eNAMAD applicability, commission invoicing/tax, escrow legality opinion —
      owner sign-off before public traffic

## 15. 3-Month Delivery Plan (12 weeks, P0)

Assumes ~1 senior dev + coding agents; scope = P0 only; P1 starts only after week 12 exit.

| Week | Focus                              | Tasks                                                                                           |
| ---- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1    | Platform + auth backend            | PLAT-001, PLAT-002, PLAT-003, AUTH-001, AUTH-002 (+ live SMS check D1)                          |
| 2    | Auth end-to-end + onboarding       | AUTH-003, AUTH-004, AUTH-005, ONB-001, ONB-002(start)                                           |
| 3    | Onboarding + profiles + categories | ONB-002(done), PROF-001, CAT-001, CAT-003                                                       |
| 4    | Lot domain                         | LOT-001, LOT-002, LOT-003, LOT-006, CAT-004                                                     |
| 5    | Media pipeline                     | MEDIA-001, MEDIA-002, MEDIA-003                                                                 |
| 6    | Lot UI w/ media                    | MEDIA-004, MEDIA-005, LOT-004, LOT-005                                                          |
| 7    | Marketplace read side              | MKT-001, MKT-002, MKT-003, MKT-005, MKT-006                                                     |
| 8    | Marketplace pages                  | MKT-007, MKT-008, MKT-004, MKT-009, MKT-010, PROF-002                                           |
| 9    | Chat                               | CHT-001…CHT-004, CHT-005/006 (start)                                                            |
| 10   | Chat done + offers                 | CHT-006(done), CHT-007, CHT-008, OFR-001…OFR-004                                                |
| 11   | Deals + trust + admin              | DEAL-001…DEAL-006, TRS-001…TRS-006, ADM-001…ADM-008 (condensed: admin tables pragmatic-minimal) |
| 12   | Dashboards + QA + launch           | DSH-001…DSH-004, SAV-001, SAV-002, QA-001…QA-003, QA-005                                        |

Buffer strategy: weeks 11–12 carry the slack; if pressure, defer ADM-005/ADM-006 detail views and
TRS-004 report dialogs to week 13 (they gate launch only if moderation SLA requires them).

## 16. 6-Month Delivery Plan (24 weeks)

- **Weeks 1–12**: P0 (above) → soft launch to invited Tehran suppliers/buyers.
- **Week 13**: stabilization from launch feedback; deferred week-12 items.
- **Weeks 14–16**: P1 communications — NTF-001…NTF-003, CHT-009, NTF-005, SAV-003.
- **Weeks 17–19**: P1 trust & accounts — REV-001/REV-002, TRS-007, AUTH-006, AUTH-007, AUTH-008,
  DEAL-007, PROF-004.
- **Weeks 20–21**: P1 insight — ANL-001…ANL-003, PROF-005, PROF-003, PLAT-005 (SEO), MEDIA-006
  (S3 driver if volume demands).
- **Weeks 22–23**: P1 hardening — QA-004 (security/load), moderation tooling polish, PLAT-004
  (PWA), performance pass on listing/chat at 10× data.
- **Week 24**: P2 spikes only (no builds): payment gateway legal/technical spike, auction design
  spike, MKT-012 recommendation data requirements. Decide go/no-go for the next quarter.

---

## Recommended First 10 Tasks

1. **PLAT-001** — Persian/RTL foundation (fonts, `dir=rtl`, `lib/format.ts` toman/Jalali/fa-digits)
2. **PLAT-002** — Route restructure: public marketplace shell at `/`, protected groups
3. **PLAT-003** — Env/config additions (storage dir/URL, OTP settings, upload limits, WS CORS)
4. **AUTH-001** — Prisma migration: phone-based `User` (+status, accountRoles), `OtpCode`
5. **AUTH-002** — OTP service: hashed codes, expiry, attempts, per-phone rate limits, dev mode
6. **AUTH-003** — `POST /auth/otp/request` + `/auth/otp/verify` (login-or-register, sessions via
   existing TokenService; password login becomes admin-only)
7. **AUTH-004** — Web OTP login UI (phone → code steps, resend timer) + BFF routes + middleware
8. **AUTH-005** — Seed update (phone admin), swagger regen, retire old login form
9. **ONB-001** — Profile model + onboarding API (roles, business fields, city, categories)
10. **ONB-002** — Mobile-first onboarding UI (role select → profile → seller extras)

Nothing in this document has been implemented. Task cards with full acceptance criteria live in
[`doc/tech/tasks/`](tasks/README.md).
