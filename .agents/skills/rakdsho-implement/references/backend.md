# Backend Patterns — Relational Spine + Layered REST

## The data spine

PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`) with a **relational domain model
centered on one spine**:

```
users ──< lots ──< conversations ──< messages
  │        │  └────< offers ──────< deals ──< deal_events
  │        └────────< lot_media >── media_assets
  └──< saved_lots / notifications / reports / verifications / reviews (all FK back to users)
```

- Everything relational is a table with a real FK — no polymorphic JSON soup. `Json` columns are
  allowed ONLY for the documented payload/meta fields (`SavedSearch.queryJson`,
  `Notification.dataJson`, `AuditLog.metaJson`, `AnalyticsEvent.metaJson`).
- Enums in Prisma for every lifecycle (`LotStatus`, `OfferStatus`, `DealStatus`,
  `ConversationStatus`, …) — states are data, not booleans. See plan §3 for the exact enums.
- Money: Toman `Int` (validated ≤ 2,000,000,000); `unitPrice = round(totalPrice / quantity)`
  derived on write. Never floats, never strings.
- Soft delete via `deletedAt` where the plan says so; public entities (lots/deals) carry short
  non-sequential `code` (nanoid-8) for URLs — internal cuid ids stay internal.
- Indexes per plan §3; search = `ILIKE` + `pg_trgm` GIN (raw SQL in the migration). Never add
  Elasticsearch, Redis, Kafka, or a second datastore — that's a plan-level decision, not a
  task-level one.
- No wallet, no escrow, no auction logic — payment is _recorded_ on deals, not processed.

## Module structure (mirror `modules/users` exactly)

```
apps/api/src/modules/<domain>/
├── <domain>.module.ts
├── <domain>.controller.ts     # thin: routing, guards, DTO binding, swagger — zero business logic
├── <domain>.service.ts        # business rules, state machines, transactions
├── <domain>.repository.ts     # data access only, accepts optional tx client
├── dto/                       # request/response DTOs, class-validator + swagger annotated
└── __tests__/                 # service spec (fake-prisma) + controller e2e (create-test-app)
```

Scaffold with `npm run gen:module`, register in `app.module.ts`.

## Layering rules (from doc/CONVENTIONS.md — enforced)

- Controller → Service → Repository, no skipping. Repositories never open transactions.
- Services own transaction boundaries: `prisma.$transaction(async (tx) => …)` and pass `tx`
  down to repository methods.
- State machines (lot lifecycle, offer chain, deal matrix) live in the service as explicit
  transition tables with table-driven unit tests covering every legal AND illegal move — this is
  what QA-002 asserts later.
- Cross-domain side effects go through the other domain's service (e.g. deal completion calls
  the lots service), never by writing another module's tables directly.

## REST conventions

- Same style as existing controllers: unversioned kebab resources (`/lots`, `/conversations`),
  `@Controller('lots')` etc.
- Auth: global JwtAuthGuard — mark public routes `@Public()`, admin routes `@Roles(UserRole.ADMIN)`.
  Ownership checks happen in the service (owner/idor guards), returning 404 for foreign
  resources where probing matters.
- List endpoints extend `common/dto/pagination-query.dto.ts`, return the `Paginated<T>`
  envelope, and parse `sort` against a field allowlist via `parseSort`.
- Response DTOs are allowlisted mappers — separate shapes for public vs owner vs admin
  (e.g. lot payloads never contain `exactAddress`/`rejectionReason` outside the owner shape).
  Assert the allowlist in a test.
- Validation: class-validator on every DTO field with fa-ready error semantics; global
  ValidationPipe already whitelists.
- Errors flow through the existing GlobalExceptionFilter (`ApiErrorBody`); throw the right
  status (400 validation, 401 auth, 403 role, 404 missing/foreign, 409 state/conflict, 429
  throttled) with Persian-safe messages where user-facing.
- Rate-limit sensitive routes with `@Throttle` (OTP, chat send, offers, uploads).
- Swagger annotations on every DTO/endpoint; after ANY DTO change run `npm run gen:types` and
  commit regenerated `packages/shared-types` — the CI drift gate fails otherwise.
- Uploads are the only multipart endpoints; everything else is JSON. Realtime is only the
  `/ws` socket.io gateway (CHT-004), JWT-handshake-authenticated, room authorization
  server-side.

## Migrations & jobs

- One Prisma migration per task, expand/contract (nullable first, backfill, then tighten);
  never edit an applied migration.
- Scheduled work (expiry jobs, rollups) lives in `modules/jobs` via `@nestjs/schedule`,
  idempotent batched `updateMany` style.

## Testing bar (per card's Testing field)

- Service unit tests with `src/test/fakes/fake-prisma.ts`; lifecycle entities get table-driven
  transition suites.
- Controller e2e with `src/test/utils/create-test-app.ts`: auth matrix (anonymous/buyer/seller/
  owner/admin), happy path, key error paths, payload allowlists.
- Never log OTP codes, tokens, or full phone numbers (mask like `SmsService` does).
