# Chat feature

CHT-004 scope: the realtime transport (socket singleton + hook). CHT-005 added
the inbox (data + UI); CHT-006 added the thread surface under
`app/(app)/chat/[id]` (bubbles, composer, lot-context header, optimistic send).

## Layout

```
features/chat/
├── lib/socket-contract.ts   # web mirror of the API's WS contract (chat.events.ts)
├── lib/socket.ts            # socket.io-client SINGLETON (path /ws, auth fn, autoConnect false)
├── hooks/use-chat-socket.ts # auth-driven connect + typed on/off/emit + 10s polling-fallback flag
├── hooks/use-conversations.ts # CHT-005 inbox query (infinite) + WS invalidation + 15s fallback poll
├── hooks/use-messages.ts    # CHT-006 backwards-cursor history (infinite) + message:new/read reconcile
├── hooks/use-send-message.ts # CHT-006 optimistic send (negative temp ids, POST + WS-echo dedupe, retry)
├── hooks/use-mark-read.ts   # CHT-006 read receipts (mount + focused message:new)
├── hooks/use-typing.ts      # CHT-006 throttled typing emit (2s) + counterpart indicator (3s TTL)
├── hooks/use-conversation-channel.ts # CHT-006 room subscribe/unsubscribe + re-join on reconnect
├── hooks/use-conversation-context.ts # CHT-006 lot/counterpart header context (page-1 list scan — no detail endpoint yet)
├── api/keys.ts              # chatKeys (query-key factory)
├── api/chat-api.ts          # GET /conversations + messages/read/send via the BFF, zod-validated
├── components/chat-inbox.tsx       # CHT-005 /chat body: header + fallback badge + list
├── components/conversations-list.tsx # CHT-005 rows (lot context, unread, system preview) + states
├── components/chat-thread.tsx      # CHT-006 thread body: scroll management + rows + typing dots
├── components/message-bubble.tsx   # CHT-006 bubbles (own/other/system pill, ticks, failed retry)
├── components/composer.tsx         # CHT-006 auto-grow textarea, Enter-to-send, validation
├── components/lot-context-header.tsx # CHT-006 pinned lot header + «مشاهده لات» link
├── testing/fixtures.ts      # contract-exact fixtures shared by the suites
└── __tests__/               # hook tests (fake socket, fake timers) + component tests
```

## Contract summary (full table: apps/api/src/modules/conversations/README.md)

- Handshake: `io(apiOrigin, { path: '/ws', auth: { token } })` — the token is
  the in-memory access token from `AuthProvider`, re-read on EVERY connect
  attempt via the `auth` callback (silent refreshes are picked up on reconnect).
- Server → client: `message:new`, `conversation:updated`, `message:read`,
  `typing`, `conversation:error`.
- Client → server: `conversation:subscribe`, `conversation:unsubscribe`,
  `typing`. Message SENDS go through REST (POST /conversations/:id/messages);
  the socket echo (`message:new`) reconciles the thread.

## Fallback mechanics (the "never hard-fails" rule)

`useChatSocket()` exposes `connected` and `pollingActive`:

- socket.io reconnects automatically; no UI action needed for short drops;
- a drop LONGER than 10 s flips `pollingActive: true` — consumers switch their
  react-query reads to a 15 s `refetchInterval` (CHT-005/006 wire this up);
- reconnect (or logout) clears the flag; a logout never arms it.

Room lifecycle for the thread UI (CHT-006): on conversation open emit
`conversation:subscribe { conversationId }` (mount) and
`conversation:unsubscribe` (unmount); typing → `emit('typing', {
conversationId })` — the server debounces relays to 3 s.
