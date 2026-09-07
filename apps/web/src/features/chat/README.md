# Chat feature

CHT-004 scope: the realtime transport (socket singleton + hook). CHT-005 added
the inbox (data + UI); the thread surface lands with CHT-006 under
`app/(app)/chat/[id]` (the current file there is a placeholder).

## Layout

```
features/chat/
├── lib/socket-contract.ts   # web mirror of the API's WS contract (chat.events.ts)
├── lib/socket.ts            # socket.io-client SINGLETON (path /ws, auth fn, autoConnect false)
├── hooks/use-chat-socket.ts # auth-driven connect + typed on/off/emit + 10s polling-fallback flag
├── hooks/use-conversations.ts # CHT-005 inbox query (infinite) + WS invalidation + 15s fallback poll
├── api/keys.ts              # chatKeys (query-key factory)
├── api/chat-api.ts          # GET /conversations via the BFF, zod-validated (CHT-002)
├── components/chat-inbox.tsx       # CHT-005 /chat body: header + fallback badge + list
├── components/conversations-list.tsx # CHT-005 rows (lot context, unread, system preview) + states
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
