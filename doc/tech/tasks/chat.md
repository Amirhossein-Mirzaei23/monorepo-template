# Tasks — Chat (CHT)

Context: Chat is a P0 core feature, always tied to a specific lot (buyer × seller × lot).
Realtime via a socket.io gateway in the API (decision D4) with polling fallback. Conversation
payloads must clearly present lot context (title, price, cover thumb). Media messages reuse the
media pipeline (secure serving).

---

### CHT-001 ✅ — Conversation domain + get-or-create API

**P0 · Phase 5 · Chat · M** — Deps: LOT-001, AUTH-003

- **Goal:** `Conversation` + `Message` models; `POST /conversations` (get-or-create for lot+buyer); participant invariants.
- **Why:** Foundation of all communication; one thread per buyer per lot (product principle 5).
- **Files:** `apps/api/prisma/schema.prisma` + migration, `src/modules/conversations/` (module/service/repo/dto).
- **Backend:** get-or-create keyed on unique(lotId, buyerId) — seller derived from lot; reject self-conversation (buyer = seller of lot) and non-ACTIVE lots (409 fa «این لات فعال نیست»); SYSTEM welcome message inserted on create («گفتگو درباره: …» with lot title/price); status ACTIVE.
- **Frontend:** none.
- **Database:** migration; indexes per plan §3 (participant+lastMessageAt).
- **API:** `@ApiBearerAuth`; returns conversation w/ lot summary; swagger + `gen:types`.
- **Validation:** lotId exists + ACTIVE; requester has BUYER role.
- **Error states:** 403 self-conversation/non-buyer; 404 lot; 409 inactive lot.
- **Permissions:** authenticated buyer (sellers reply within their conversations).
- **Acceptance:** create-twice returns same conversation (e2e); welcome system message present.
- **Testing:** service unit (idempotent create, guards), controller e2e.
- **DoD:** suites green.

### CHT-002 ✅ — Conversations list API

**P0 · Phase 5 · Chat · M** — Deps: CHT-001

- **Goal:** `GET /conversations` — participant's threads, paginated, newest-activity first, each with: lot (code/title/cover thumb/price/status), counterpart (name/avatar/verified), lastMessage preview, my unread count.
- **Why:** Messages inbox on both dashboards (features #26/#27).
- **Files:** `conversations.controller.ts`, `dto/conversation-list.dto.ts`, repository (single query set — no N+1).
- **Backend:** union query on buyerId/sellerId = me; preview truncated 80 chars; system messages previewed in gray style flag; lot status changes reflected (sold/expired badges).
- **Frontend:** none (CHT-005).
- **Database:** composite indexes (buyerId, lastMessageAt desc), (sellerId, lastMessageAt desc).
- **API:** paginated; swagger + gen:types.
- **Validation:** pagination standard.
- **Error states:** standard.
- **Permissions:** participant only.
- **Acceptance:** 2-query-max per page verified in test (repository returns joined shape); unread counts correct after send (CHT-003).
- **Testing:** repository unit; e2e listing both roles.
- **DoD:** suites green.

### CHT-003 ✅ — Messages API (send/list/read)

**P0 · Phase 5 · Chat · M** — Deps: CHT-001

- **Goal:** `POST /conversations/:id/messages` (TEXT first), `GET /conversations/:id/messages` (cursor pagination asc), `POST /conversations/:id/read`; unread counters atomic; throttled send.
- **Why:** Core messaging semantics incl. read state (feature #17).
- **Files:** `src/modules/messages/` or extend conversations module (choose: extend conversations module, messages controller under same module), `dto/message.dto.ts`.
- **Backend:** send: transaction (insert message, update conversation lastMessageAt/preview, increment counterpart unread) — messages ≤ 2000 chars, trim; sender must be participant; blocked conversation rejects (403); rate limit 30/min/user. list: `before` cursor (message id), limit ≤ 50. read: set my unread = 0 + mark messages readAt where sender = counterpart (batch update where readAt null).
- **Frontend:** none.
- **Database:** index (conversationId, createdAt) from CHT-001.
- **API:** swagger + gen:types.
- **Validation:** body required for TEXT; type enum default TEXT (media types land in CHT-007).
- **Error states:** 403 non-participant; 429 throttle; 404 unknown conversation.
- **Permissions:** participants.
- **Acceptance:** send updates list previews + unread (e2e both roles); pagination walks full history.
- **Testing:** service unit (transaction steps), e2e incl. throttle.
- **DoD:** suites green.

### CHT-004 ✅ — WebSocket gateway (realtime)

**P0 · Phase 5 · Chat · L** — Deps: CHT-003 (adds `@nestjs/websockets`, `@nestjs/platform-socket.io`, web `socket.io-client` — intentional dep changes)

- **Goal:** `/ws` socket.io gateway: JWT handshake auth, per-conversation + per-user rooms; server emits `message:new`, `conversation:updated`, `message:read`, `typing`; client join/leave on conversation open.
- **Why:** Realtime chat UX (feature #17) — core product principle.
- **Files:** `apps/api/src/modules/conversations/chat.gateway.ts`, `chat.gateway.module.ts`, `main.ts` (enable CORS w/ credentials for WS origins), web `features/chat/lib/socket.ts` + `hooks/use-chat-socket.ts`.
- **Backend:** handshake verifies access token (reuse TokenService), attaches userId; `subscribeConversation(id)` verifies participation then join room; emits after CHT-003 mutations (service calls gateway via injected emitter interface to keep service testable); typing relay participant-to-participant w/ 3 s debounce server-side; presence deferred (P2).
- **Frontend:** socket singleton w/ auth token; auto-reconnect; on `message:new` → append + scroll + mark-read when focused; **fallback**: when disconnected > 10 s, react-query polling (15 s) activates — chat never hard-fails without WS.
- **Database:** none.
- **API:** WS contract documented in module README (event names/payloads); REST unchanged.
- **Validation:** room join authorization server-side (never trust client rooms).
- **Error states:** invalid token → disconnect; unauthorized join → error event.
- **Permissions:** authenticated participants.
- **Acceptance:** two browser sessions chat in realtime; third user cannot join room; polling fallback verified by killing WS.
- **Testing:** gateway unit tests (auth, room guard, emit-on-send via mocked emitter); hook tests (fallback switching).
- **DoD:** WS origins config via PLAT-003; suites green.

### CHT-005 ✅ — Conversations list UI

**P0 · Phase 5 · Chat · L** — Deps: CHT-002, CHT-004, PLAT-001

- **Goal:** `/chat` inbox: lot-context cards (thumb, title, price, lot status badge), counterpart + verified badge, preview, relative time, unread badge; swipe/tap → thread.
- **Why:** Feature #17's UI must display lot context prominently.
- **Files:** `apps/web/src/features/chat/` (gen:feature), `components/conversations-list.tsx`, `app/(app)/chat/page.tsx`.
- **Backend:** none.
- **Frontend:** live updates via `conversation:updated` WS event → react-query invalidation; empty state («هنوز گفتگویی ندارید» + CTA to marketplace); sold/expired lot chips; pull-to-refresh (mobile).
- **Database / API:** consumes CHT-002/004.
- **Validation:** none.
- **Error states:** list error retry; WS badge when in fallback mode.
- **Permissions:** authenticated.
- **Acceptance:** unread badges live-update from another session; lot status changes reflect without reload.
- **Testing:** component tests (render, unread, lot-context block), list hook tests.
- **DoD:** suites green.

### CHT-006 — Chat thread UI

**P0 · Phase 5 · Chat · L** — Deps: CHT-003, CHT-004, CHT-005

- **Goal:** `/chat/:id` thread: message bubbles (own = primary side), day separators (Jalali), timestamps, read ticks, typing indicator, composer w/ send, back-pagination on scroll-top, lot header (always visible) + «مشاهده لات» link.
- **Why:** The primary negotiation surface.
- **Files:** `features/chat/components/chat-thread.tsx`, `message-bubble.tsx`, `composer.tsx`, `lot-context-header.tsx`, hooks.
- **Backend:** none.
- **Frontend:** optimistic send (temp id, reconcile on server ack or WS echo, retry w/ failed state); scroll management (stick-to-bottom unless scrolled up); delivery/read ticks (✓ on server ack = delivered, ✓✓ on `message:read`); reply-to-message optional (model field `replyToId` ready, UI only if time allows); typing dots via WS; system messages centered gray pills.
- **Database / API:** consumes CHT-003/004.
- **Validation:** composer disables empty/oversize.
- **Error states:** failed message row w/ retry tap; WS fallback indicator.
- **Permissions:** participant (route guarded + server enforced).
- **Acceptance:** two-session conversation feels realtime; pagination loads history without jump; lot header shows title+price per example format.
- **Testing:** component tests (bubbles, day separators, optimistic flow), thread hook tests.
- **DoD:** suites green; used by QA-001.

### CHT-007 — Media messages (image/video)

**P0 · Phase 5 · Chat · M** — Deps: CHT-006, MEDIA-001 (secure serving), MEDIA-003, MEDIA-004

- **Goal:** Attach image/video in composer (camera/gallery per MEDIA-004 patterns); bubbles render secure media (authed fetch → blob URL) w/ upload progress + retry; video bubble w/ poster + tap-to-play.
- **Why:** Feature #18 — buyers request extra photos/videos; media must be access-controlled.
- **Files:** `features/chat/components/attachment-button.tsx`, `media-bubble.tsx`, api send-with-media flow; api: `POST /conversations/:id/messages` extended `{type: IMAGE|VIDEO, mediaAssetId}`.
- **Backend:** message create validates asset ownership + type match; MediaAsset considered chat-attached; secure serve route serves participants (check via message lookup — authorized if requester participates in a conversation containing that asset).
- **Frontend:** upload → pending bubble (progress %) → send on complete; failed → retry/remove; blob-URL loading w/ authed fetch (token in header); tap image → fullscreen viewer (swipe); video inline.
- **Database:** none (Message.mediaAssetId from CHT-001).
- **API:** swagger + gen:types.
- **Validation:** chat media caps: 5 images / 1 video per send batch.
- **Error states:** upload/serv failures with per-bubble retry.
- **Permissions:** participants only (incl. secure serve).
- **Acceptance:** non-participant cannot fetch secure media URL (e2e 403); media bubbles in both sessions.
- **Testing:** e2e secure-serve authz; component tests for bubble states.
- **DoD:** suites green.

### CHT-008 — Quick actions in chat

**P0 · Phase 5 · Chat · S** — Deps: CHT-006, OFR-004 (offer deep-link)

- **Goal:** Contextual quick-action chips above composer: «قیمت بپرس», «عکس بیشتری بفرست», «ویدیو بفرست», «پیشنهاد قیمت», «هماهنگی بازدید» (buyer side) — template texts send as normal messages; offer chip opens OFR-004 sheet with lot context; arrange-inspection sends a scheduling message (the real inspection workflow is TRS-007).
- **Why:** Feature #19 — structured negotiation starters without over-engineering chat.
- **Files:** `features/chat/components/quick-actions.tsx`, constants for fa templates.
- **Backend:** none (messages are TEXT; architecture note: `MessageType.ACTION` reserved for future structured payloads).
- **Frontend:** chips shown only before first user message in thread (then collapse to a «…» menu); each sends its fa template.
- **Database / API / Validation:** none new.
- **Error states:** standard send failures.
- **Permissions:** participants (buyer-side chips; seller sees mirrored info chips only).
- **Acceptance:** tap → message sent instantly; offer chip opens pre-filled offer sheet.
- **Testing:** component test.
- **DoD:** suites green.

### CHT-009 — Block user & report conversation

**P1 · Phase 9 · Chat · M** — Deps: CHT-003, TRS-003

- **Goal:** `POST /conversations/:id/block` (+unblock): blocked pair → conversation status BLOCKED, sends rejected both ways; report conversation → Report(subjectType CONVERSATION).
- **Why:** Feature #17 safety requirements.
- **Files:** conversations module (block endpoints), web thread header menu (block/report w/ confirms).
- **Backend:** block stored on conversation (blockedById); system message notes the block; admin can see status in ADM-004.
- **Frontend:** menu w/ fa confirmations; blocked state banner («این گفتگو مسدود شده»).
- **Database:** `blockedById?` column (migration).
- **API:** swagger + gen:types.
- **Validation:** participant only.
- **Error states:** 409 already blocked.
- **Permissions:** participants.
- **Acceptance:** after block, both sides' sends 403; unblock restores.
- **Testing:** e2e block/unblock matrix.
- **DoD:** suites green.

### CHT-010 — Presence (online/offline)

**P2 · Phase 10+ · Chat · M** — Deps: CHT-004

- **Goal:** Online dot on counterpart in thread/inbox via WS connect/disconnect tracking (in-memory presence map + TTL).
- **Why:** «if practical» feature — deferred deliberately.
- **Acceptance (when built):** presence only within chat surfaces; no cross-app online status.
- **DoD:** not started before P2 sign-off.
