# Conversations module

CHT-001 (get-or-create) · CHT-002 (inbox) · CHT-003 (messages send/list/read)
· CHT-004 (the `/ws` socket.io gateway) · CHT-007 (media messages). Reference
pattern: `apps/api/src/modules/users`. REST surface is documented in swagger
(`/docs`); this README tracks the WS contract, which is NOT part of the
generated OpenAPI document, plus the CHT-007 media rules.

## Endpoints (REST)

| Method | Path                          | Auth | Notes                                                         |
| ------ | ----------------------------- | ---- | ------------------------------------------------------------- |
| POST   | `/conversations`              | JWT  | get-or-create for lot+buyer (CHT-001)                         |
| GET    | `/conversations`              | JWT  | participant inbox, paginated, newest activity first (CHT-002) |
| POST   | `/conversations/:id/messages` | JWT  | send TEXT or IMAGE/VIDEO, throttled 30/min (CHT-003/007)      |
| GET    | `/conversations/:id/messages` | JWT  | backwards cursor history (CHT-003)                            |
| POST   | `/conversations/:id/read`     | JWT  | mark my side read → `{ readCount }` (CHT-003)                 |

## Media messages (CHT-007)

`POST /conversations/:id/messages` accepts exactly one of:

- `{ body }` — TEXT (trimmed 1..2000 chars); a `mediaAssetId` on a TEXT send
  answers 400 `MEDIA_ASSET_WITH_TEXT`, a missing/empty body 400
  `MESSAGE_BODY_REQUIRED`.
- `{ type: 'IMAGE' | 'VIDEO', mediaAssetId }` — media rows are BODY-LESS by
  contract (a non-empty body answers 400 `MEDIA_BODY_FORBIDDEN`; a missing
  `mediaAssetId` 400 `MEDIA_ASSET_REQUIRED`). The referenced MediaAsset must
  be owned by the sender — missing and foreign assets answer uniformly 403
  `MEDIA_NOT_OWNED` (no existence oracle, MEDIA-005's precedent) — and its
  MediaType must match the message type (else 400 `MEDIA_TYPE_MISMATCH`).

The send transaction is unchanged otherwise: message row + conversation
lockstep + counterpart unread increment in one transaction. Media rows store
NO body; the conversation's `lastMessagePreview` carries the Persian
placeholders **«📷 تصویر» / «🎬 ویدیو»** (CONTENT copy in fa by design, same
exception as the SYSTEM welcome).

Message responses (REST history + `message:new` WS payloads) carry
`mediaAssetId`, `mediaStorageKey` (original bytes) and `mediaPreviewKey`
(IMAGE: the 1200w WebP cover variant; VIDEO: the poster thumb
`{id}pt.webp`; null when the asset has none). Clients render these
EXCLUSIVELY through the bearer route `GET /media/secure/{key}` — never the
public route.

### Secure serving — authorization matrix (`GET /media/secure/:key`)

After authentication (401 anonymous — the global guard):

| Key resolved to                                                                       | Authenticated requester                |
| ------------------------------------------------------------------------------------- | -------------------------------------- |
| Asset referenced by ≥ 1 Message, requester takes a side of one of those conversations | **200** stream (`private, no-store`)   |
| Asset referenced by ≥ 1 Message, requester in NONE of them                            | **403** `SECURE_MEDIA_FORBIDDEN`       |
| Asset NOT referenced by any message (secure/-prefixed)                                | **200** — unchanged MEDIA-001 contract |
| Unknown key / rowless object without bytes                                            | **404** (unchanged)                    |
| Malformed key (pattern/traversal)                                                     | **400** (unchanged)                    |

The public route `GET /media/:key` is UNCHANGED by CHT-007 (public assets,
immutable cache headers). Variant keys (`{id}c.webp`, `{id}t.webp`,
`{id}p.*`, `{id}pt.webp`) have no rows of their own; the route resolves their
BASE asset by stripping the extension and the 1–2-char suffix from the file
segment and probing the storage-key prefix `{yyyy}/{mm}/{id}.` — the gate
then applies to the base asset. Chat attachments are uploaded through the
MEDIA-002/003 endpoints (which mint PUBLIC-pattern keys), so the secure route
additionally resolves the requested key WITHOUT its `secure/` prefix — but
only when the inner asset is chat-attached (message-referenced); unreferenced
public keys still 404 here, which keeps MEDIA-001's "no splicing" contract.
Documented residual: a message-referenced asset with a public-pattern key
remains reachable through the PUBLIC route by anyone — the durable fix is
chat-scoped uploads minting `secure/`-prefixed keys (follow-up for a MEDIA
card; needs a consumer context on the upload endpoints).

## WS contract (CHT-004)

Single namespace at **`/ws`** (socket.io path option — the URL is
`{apiOrigin}/ws/` with socket.io's own query/EIO params). Handshake must carry
a valid access token or the connection is rejected. REST behavior is
unchanged; realtime is delivery-only and always recoverable via the web's
15 s polling fallback.

### Handshake

| Item         | Value                                                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport    | socket.io v4 (`socket.io-client` on the web)                                                                                                          |
| Auth         | **Primary:** `io(url, { auth: { token } })` → `handshake.auth.token`. **Fallback:** `Authorization: Bearer <token>` HTTP header (non-browser clients) |
| Verification | `TokenService.verifyAccessToken` — the SAME service/secret as REST; missing/invalid token ⇒ handshake rejected (`WsException('UNAUTHORIZED')`)        |
| CORS         | handshake origins from config `app.ws.origins` (env `WS_ORIGINS`), credentials on — applied by the config-driven `WsAdapter` (src/common/ws)          |

### Rooms (server-authoritative — clients never pick rooms)

| Room                | Joined when                                                    |
| ------------------- | -------------------------------------------------------------- |
| `user:{userId}`     | automatically on every authenticated connection                |
| `conversation:{id}` | only via `conversation:subscribe` after a DB participant check |

### Client → server events

| Event                      | Payload              | Behavior                                                                                                      |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `conversation:subscribe`   | `{ conversationId }` | participation verified server-side, then join. Rejections ⇒ `conversation:error` (see codes below)            |
| `conversation:unsubscribe` | `{ conversationId }` | leave (always allowed; stopping to listen needs no authorization); drops the typing-relay authorization too   |
| `typing`                   | `{ conversationId }` | requires a prior `conversation:subscribe` **on this socket**; relayed with a 3 s per-user-per-thread debounce |

### Server → client events

| Event                  | Payload                                                   | Room(s)                              | Emitted when                                                                      |
| ---------------------- | --------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| `message:new`          | `{ conversationId, message: MessageResponseDto }`         | `conversation:{id}`                  | a send transaction commits (service → emitter → gateway)                          |
| `conversation:updated` | `{ conversationId, lastMessageAt, preview, unreadCount }` | `user:{id}` of the OTHER participant | same commit — the recipient's inbox refresh (unread = their post-increment count) |
| `message:read`         | `{ conversationId, readerId, readCount }`                 | `conversation:{id}`                  | a mark-read transaction commits (`readCount` 0 = idempotent re-read)              |
| `typing`               | `{ conversationId, userId }`                              | `conversation:{id}`                  | debounced relay of a participant's typing (≤ 1 per 3 s per user per thread)       |
| `conversation:error`   | `{ code, conversationId? }`                               | the offending socket only            | a rejected subscribe/unsubscribe/typing request                                   |

### `conversation:error` codes

| Code                     | Meaning                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `INVALID_PAYLOAD`        | event payload failed shape validation (`conversationId` must be a non-empty string) |
| `CONVERSATION_NOT_FOUND` | unknown conversation id (REST 404 analogue)                                         |
| `NOT_PARTICIPANT`        | known conversation the caller takes no side of (same code as REST 403)              |
| `NOT_SUBSCRIBED`         | `typing` without a prior server-verified `conversation:subscribe`                   |
| `UNAUTHORIZED`           | handshake rejection reason (never delivered on a live socket)                       |

Wire notes:

- Payloads are JSON-serializable — `lastMessageAt`/`createdAt` arrive as ISO
  strings on the client even though the server-side typed emitter passes `Date`.
- Emissions happen AFTER the transaction commits, so listeners only ever see
  committed data. There is no ack channel: a missed event is recovered by the
  polling fallback (web `use-chat-socket` flag, consumed by CHT-006).
- Presence (online/offline) is deliberately deferred to CHT-010 (P2).

### Emitter decoupling (why the service stays unit-testable)

`ConversationsService` depends on the `ChatEmitter` INTERFACE (`CHAT_EMITTER`
symbol in `chat.events.ts`), never on the gateway. `ConversationsModule` binds
it with `{ provide: CHAT_EMITTER, useExisting: ChatGateway }`. Unit tests
inject a recording fake (`FakeChatEmitter` in the service spec) and assert the
announcements; `ChatGateway` implements the same interface as the production
side. The gateway itself only does transport work (auth, rooms, relay) and
reads participation through `ConversationsRepository` — no service dependency,
so the module has no DI cycle (and the card's separate `chat.gateway.module.ts`
was folded into `ConversationsModule` for the same reason).

## Testing notes

- `conversations.service.spec.ts` — service unit suite incl. the CHT-004
  emit assertions through the fake emitter.
- `chat.gateway.spec.ts` — gateway unit suite (handshake accept/reject,
  participant/non-participant room joins, 3 s typing debounce with fake
  timers, emitter room routing) with plain socket doubles.
- Socket.io E2E (two real clients over the wire) is deliberately not added —
  heavy to run in CI; unit coverage above plus the existing controller e2e
  suites cover the card's acceptance matrix (authorization is enforced in the
  same code path for wire clients). Revisit if a realtime regression escapes.
