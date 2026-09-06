# Rakdsho — Task Index

Execution-ready task cards for every planned feature. Master plan (architecture, domain model,
risks, API surface, DB design, delivery plans): [`../rakdsho-plan.md`](../rakdsho-plan.md)

**Per-task ground rules** (apply to every card, not repeated there):
follow `doc/CONVENTIONS.md`; scaffold via `npm run gen:module` / `gen:feature`; finish with
`npm run lint && npm run typecheck && npm run test`; run `npm run gen:types` when API DTOs change;
one Prisma migration per schema change; conventional commits.

## Files

| File                                                     | Areas                                                                   | Count                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| [platform.md](platform.md)                               | PLAT — RTL/fa base, routes, env, PWA, SEO, Capacitor                    | 6                                                               |
| [auth.md](auth.md)                                       | AUTH — phone OTP, sessions, phone change, deletion                      | 8                                                               |
| [profiles.md](profiles.md)                               | ONB, PROF — onboarding, my/public profiles, metrics                     | 7                                                               |
| [catalog-lots.md](catalog-lots.md)                       | CAT, LOT — categories, lot domain/lifecycle/UI, expiry                  | 10                                                              |
| [media.md](media.md)                                     | MEDIA — storage abstraction, image/video upload, uploader UI            | 6                                                               |
| [marketplace.md](marketplace.md)                         | MKT — listing, search, filters, home, cards, detail, share              | 12                                                              |
| [chat.md](chat.md)                                       | CHT — conversations, messages, WS, chat UI, media, actions              | 10                                                              |
| [offers-deals.md](offers-deals.md)                       | OFR, DEAL — offers, deals, payment recording, completion                | 11                                                              |
| [trust-admin.md](trust-admin.md)                         | TRS, ADM, REV — verification, moderation, reports, admin panel, reviews | 17                                                              |
| [dashboards-saved.md](dashboards-saved.md)               | DSH, SAV — app shell, dashboards, settings, saved lots/searches         | 8                                                               |
| [notifications-analytics.md](notifications-analytics.md) | NTF, ANL — in-app notifications, SMS critical, analytics                | 8                                                               |
| [qa-launch.md](qa-launch.md)                             | QA — E2E, permission suites, RTL/a11y, security, launch                 | 5                                                               |
| **Total**                                                |                                                                         | **108 cards** (CAT-002 is folded into CAT-001 → 107 actionable) |

Complexity: XS 1 · S 22 · M 71 · L 12 · XL 1.

## Task table (ID · title · P · phase · complexity)

| ID        | Title                                 | P   | Ph  | C   |     | ID       | Title                               | P   | Ph  | C   |
| --------- | ------------------------------------- | --- | --- | --- | --- | -------- | ----------------------------------- | --- | --- | --- |
| PLAT-001  | ✅ Persian/RTL foundation             | P0  | 0   | S   |     | CHT-001  | Conversation domain + get-or-create | P0  | 5   | M   |
| PLAT-002  | ✅ Public marketplace shell/routes    | P0  | 0   | S   |     | CHT-002  | Conversations list API              | P0  | 5   | M   |
| PLAT-003  | ✅ Env & config additions             | P0  | 0   | XS  |     | CHT-003  | Messages API (send/list/read)       | P0  | 5   | M   |
| PLAT-004  | PWA manifest & icons                  | P1  | 10  | S   |     | CHT-004  | WebSocket gateway                   | P0  | 5   | L   |
| PLAT-005  | SEO foundation                        | P1  | 10  | M   |     | CHT-005  | Conversations list UI               | P0  | 5   | L   |
| PLAT-006  | Capacitor readiness spike             | P2  | 10  | M   |     | CHT-006  | Chat thread UI                      | P0  | 5   | L   |
| AUTH-001  | ✅ Phone-based User + OtpCode schema  | P0  | 1   | M   |     | CHT-007  | Media messages                      | P0  | 5   | M   |
| AUTH-002  | ✅ OTP service + throttling           | P0  | 1   | M   |     | CHT-008  | Quick actions in chat               | P0  | 5   | S   |
| AUTH-003  | ✅ OTP endpoints (login-or-register)  | P0  | 1   | M   |     | CHT-009  | Block & report conversation         | P1  | 9   | M   |
| AUTH-004  | ✅ Web OTP login UI + BFF             | P0  | 1   | M   |     | CHT-010  | Presence                            | P2  | 10  | M   |
| AUTH-005  | ✅ Seed + docs refresh                | P0  | 1   | S   |     | OFR-001  | Offer domain + state machine        | P0  | 6   | M   |
| AUTH-006  | Session/device management             | P1  | 9   | M   |     | OFR-002  | Offers API                          | P0  | 6   | M   |
| AUTH-007  | Change phone number                   | P1  | 9   | M   |     | OFR-003  | Offer expiry job                    | P0  | 6   | S   |
| AUTH-008  | Account deletion                      | P1  | 9   | S   |     | OFR-004  | Offers UI                           | P0  | 6   | M   |
| ONB-001   | ✅ Profile domain + onboarding API    | P0  | 1   | M   |     | DEAL-001 | Deal domain + state machine         | P0  | 6   | L   |
| ONB-002   | ✅ Mobile-first onboarding UI         | P0  | 1   | L   |     | DEAL-002 | Deal creation API                   | P0  | 6   | M   |
| PROF-001  | ✅ My profile view/edit               | P0  | 1   | M   |     | DEAL-003 | Deal transitions API                | P0  | 6   | M   |
| PROF-002  | Public seller profile page            | P0  | 1   | M   |     | DEAL-004 | Deals UI                            | P0  | 6   | M   |
| PROF-003  | Public buyer profile                  | P1  | 9   | S   |     | DEAL-005 | Completion effects                  | P0  | 6   | M   |
| PROF-004  | Avatar upload                         | P1  | 9   | M   |     | DEAL-006 | Payment recording + commission      | P0  | 6   | S   |
| PROF-005  | Seller metrics rollup job             | P1  | 9   | M   |     | DEAL-007 | Dispute handling                    | P1  | 9   | M   |
| CAT-001   | ✅ Category domain + seed             | P0  | 2   | M   |     | TRS-001  | Verification domain + admin API     | P0  | 7   | M   |
| CAT-002   | _(folded into CAT-001)_               | —   | —   | —   |     | TRS-002  | Badge display                       | P0  | 7   | S   |
| CAT-003   | ✅ Category picker components         | P0  | 2   | S   |     | TRS-003  | Reports domain + create API         | P0  | 7   | M   |
| CAT-004   | ✅ Admin categories CRUD API          | P0  | 2   | M   |     | TRS-004  | Report UI                           | P0  | 7   | S   |
| LOT-001   | ✅ Lot domain model + repository      | P0  | 2   | L   |     | TRS-005  | Lot moderation queue API            | P0  | 7   | M   |
| LOT-002   | ✅ Lot create/update API              | P0  | 2   | M   |     | TRS-006  | Moderation wiring (seller view)     | P0  | 7   | S   |
| LOT-003   | ✅ Lot lifecycle actions API          | P0  | 2   | M   |     | TRS-007  | Inspection workflow                 | P1  | 9   | M   |
| LOT-004   | Create/edit lot UI (wizard)           | P0  | 2   | L   |     | ADM-001  | Admin shell + overview              | P0  | 7   | M   |
| LOT-005   | My Lots management UI                 | P0  | 2   | M   |     | ADM-002  | Admin users management              | P0  | 7   | M   |
| LOT-006   | ✅ Lot expiration job                 | P0  | 2   | S   |     | ADM-003  | Admin lots moderation UI            | P0  | 7   | L   |
| MEDIA-001 | StorageService + MediaAsset + serving | P0  | 3   | M   |     | ADM-004  | Admin reports queue                 | P0  | 7   | M   |
| MEDIA-002 | Image upload API (sharp variants)     | P0  | 3   | M   |     | ADM-005  | Admin deals view                    | P0  | 7   | M   |
| MEDIA-003 | Video upload API (client poster)      | P0  | 3   | M   |     | ADM-006  | Admin verification review           | P0  | 7   | M   |
| MEDIA-004 | Web uploader components               | P0  | 3   | L   |     | ADM-007  | Admin categories management         | P0  | 7   | M   |
| MEDIA-005 | Lot media attach/organize             | P0  | 3   | S   |     | ADM-008  | Admin dashboard completeness        | P0  | 7   | S   |
| MEDIA-006 | S3-compatible storage driver          | P1  | 9   | M   |     | REV-001  | Reviews API (deal-gated)            | P1  | 9   | M   |
| MKT-001   | Public lot listing API                | P0  | 4   | M   |     | REV-002  | Reviews UI                          | P1  | 9   | M   |
| MKT-002   | Filters API                           | P0  | 4   | M   |     | DSH-001  | App shell + bottom tabs             | P0  | 8   | M   |
| MKT-003   | Search API (pg_trgm)                  | P0  | 4   | M   |     | DSH-002  | Seller dashboard overview           | P0  | 8   | M   |
| MKT-004   | Marketplace home page                 | P0  | 4   | L   |     | DSH-003  | Buyer dashboard overview            | P0  | 8   | M   |
| MKT-005   | Lot card component                    | P0  | 4   | M   |     | DSH-004  | Settings page                       | P0  | 8   | S   |
| MKT-006   | Browse page + infinite scroll         | P0  | 4   | M   |     | SAV-001  | Saved lots API                      | P0  | 8   | S   |
| MKT-007   | Search UI                             | P0  | 4   | S   |     | SAV-002  | Saved lots page                     | P0  | 8   | M   |
| MKT-008   | Filters & sort UI                     | P0  | 4   | M   |     | SAV-003  | Saved searches                      | P1  | 9   | M   |
| MKT-009   | Lot detail page                       | P0  | 4   | L   |     | SAV-004  | Saved-search notifications          | P2  | 10  | M   |
| MKT-010   | Share                                 | P0  | 4   | S   |     | NTF-001  | Notification domain + wiring        | P1  | 9   | M   |
| MKT-011   | Engagement counters + events          | P1  | 9   | M   |     | NTF-002  | Notifications API                   | P1  | 9   | S   |
| MKT-012   | Recommendations (placeholder)         | P2  | 10  | L   |     | NTF-003  | Notifications UI                    | P1  | 9   | M   |
|           |                                       |     |     |     |     | NTF-004  | Web push (PWA)                      | P2  | 10  | M   |
|           |                                       |     |     |     |     | NTF-005  | SMS critical events                 | P1  | 9   | S   |
|           |                                       |     |     |     |     | ANL-001  | Analytics event capture + rollups   | P1  | 9   | M   |
|           |                                       |     |     |     |     | ANL-002  | Seller analytics page               | P1  | 9   | M   |
|           |                                       |     |     |     |     | ANL-003  | Admin marketplace metrics           | P1  | 9   | M   |
|           |                                       |     |     |     |     | QA-001   | E2E critical-journey suite          | P0  | 10  | XL  |
|           |                                       |     |     |     |     | QA-002   | Permission & state-machine suite    | P0  | 10  | M   |
|           |                                       |     |     |     |     | QA-003   | RTL/mobile/a11y QA pass             | P0  | 10  | M   |
|           |                                       |     |     |     |     | QA-004   | Security & load review              | P1  | 10  | M   |
|           |                                       |     |     |     |     | QA-005   | Launch readiness execution          | P0  | 10  | M   |

## Recommended execution order

Phase-ordered (dependencies detailed per card and in plan §7–§8):

1. PLAT-001 → PLAT-002 → PLAT-003 → AUTH-001
2. AUTH-002 → AUTH-003 → AUTH-004 → AUTH-005
3. ONB-001 → ONB-002 → PROF-001
4. CAT-001 → CAT-003 → CAT-004
5. LOT-001 → LOT-002 → LOT-003 → LOT-006
6. MEDIA-001 → MEDIA-002 → MEDIA-003 → MEDIA-004 → MEDIA-005
7. LOT-004 → LOT-005
8. MKT-001 → MKT-002 → MKT-003 → MKT-005 → MKT-006 → MKT-007 → MKT-008
9. MKT-004 → MKT-009 → MKT-010 → PROF-002
10. CHT-001 → CHT-002 → CHT-003 → CHT-004 → CHT-005 → CHT-006 → CHT-007 → CHT-008
11. OFR-001 → OFR-002 → OFR-003 → OFR-004
12. DEAL-001 → DEAL-002 → DEAL-003 → DEAL-004 → DEAL-005 → DEAL-006
13. TRS-001 → TRS-002 → TRS-003 → TRS-004 → TRS-005 → TRS-006
14. ADM-001 → ADM-002 → ADM-003 → ADM-004 → ADM-005 → ADM-006 → ADM-007 → ADM-008
15. DSH-001 → DSH-002 → DSH-003 → DSH-004 → SAV-001 → SAV-002
16. QA-001 → QA-002 → QA-003 → QA-005 ← **P0/MVP complete**
17. P1 wave: NTF-001→003 → REV-001→002 → SAV-003 → AUTH-006→008 → PROF-003→005 → TRS-007 → DEAL-007 → CHT-009 → ANL-001→003 → PLAT-005 → MEDIA-006 → NTF-005 → QA-004 → PLAT-004
18. P2 wave: NTF-004, SAV-004, PLAT-006, MKT-012 (+ payment/auction spikes — not yet tasked)

## Recommended first 10 tasks

1. **PLAT-001** — Persian/RTL foundation
2. **PLAT-002** — Public marketplace shell & route restructure
3. **PLAT-003** — Env & config additions
4. **AUTH-001** — Phone-based User + OtpCode schema migration
5. **AUTH-002** — OTP service (hashing, expiry, attempts, rate limits, dev mode)
6. **AUTH-003** — OTP request/verify endpoints (login-or-register)
7. **AUTH-004** — Web OTP login UI + BFF routes
8. **AUTH-005** — Seed & docs refresh
9. **ONB-001** — Profile domain + onboarding API
10. **ONB-002** — Mobile-first onboarding UI

One task per session (per `AGENTS.md`); check off here and in the area file when done.
