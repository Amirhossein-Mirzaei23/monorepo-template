import type { MessageResponseDto } from './dto/message.dto';

/**
 * CHT-004 — the WebSocket contract of the /ws socket.io gateway plus the
 * emitter seam that keeps ConversationsService unit-testable.
 *
 * Room model (server-authoritative — never trust client rooms):
 * - `user:{userId}`          — joined automatically on every authenticated
 *                              connection; the inbox/counterpart surface.
 * - `conversation:{id}`      — joined ONLY through `conversation:subscribe`
 *                              after a server-side participant check.
 *
 * This file is the single source of truth for the event names and payload
 * shapes; the web mirror lives in apps/web/src/features/chat/lib/socket-contract.ts
 * (kept in sync by hand — the shared package is generated from REST swagger
 * only, WS events are not part of that document).
 */

/** Server-authoritative room names (clients never choose their rooms). */
export const chatRooms = {
  user: (userId: string): string => `user:${userId}`,
  conversation: (conversationId: string): string => `conversation:${conversationId}`,
} as const;

/** Server-side typing relay debounce (card CHT-004): one relay / 3s / user / thread. */
export const TYPING_DEBOUNCE_MS = 3_000;

// --- server → client payloads ---

/** `message:new` — a committed TEXT message, to the conversation room. */
export interface MessageNewEvent {
  conversationId: string;
  message: MessageResponseDto;
}

/**
 * `conversation:updated` — inbox refresh for the OTHER participant (sent to
 * their `user:` room only, never the sender's): the new activity stamp, the
 * stored preview, and the recipient's post-increment unread counter.
 */
export interface ConversationUpdatedEvent {
  conversationId: string;
  lastMessageAt: Date;
  preview: string | null;
  /** The recipient's unread count AFTER the send transaction's { increment }. */
  unreadCount: number;
}

/** `message:read` — read receipts, to the conversation room. */
export interface MessageReadEvent {
  conversationId: string;
  /** Who marked the thread read (the reader, not the sender). */
  readerId: string;
  /** How many counterpart messages this read call stamped (0 = idempotent). */
  readCount: number;
}

/** `typing` — debounced relay of a participant's typing state. */
export interface TypingEvent {
  conversationId: string;
  userId: string;
}

/** `conversation:error` — rejected subscribe/unsubscribe/typing requests. */
export interface ConversationErrorEvent {
  code: string;
  conversationId?: string;
}

/** Typed server → client event map (the `Server` generic's emit side). */
export interface ChatServerToClientEvents {
  'message:new': (payload: MessageNewEvent) => void;
  'conversation:updated': (payload: ConversationUpdatedEvent) => void;
  'message:read': (payload: MessageReadEvent) => void;
  typing: (payload: TypingEvent) => void;
  'conversation:error': (payload: ConversationErrorEvent) => void;
}

// --- client → server payloads ---

export interface ConversationRoomPayload {
  conversationId: string;
}

/** Typed client → server event map (the `Server` generic's listen side). */
export interface ChatClientToServerEvents {
  'conversation:subscribe': (payload: ConversationRoomPayload) => void;
  'conversation:unsubscribe': (payload: ConversationRoomPayload) => void;
  typing: (payload: ConversationRoomPayload) => void;
}

// --- error codes (machine-readable, fa copy rendered web-side) ---

/**
 * WS-side error codes carried on `conversation:error`. `NOT_PARTICIPANT`
 * reuses the REST value from MESSAGE_ERROR_CODES so web copy maps 1:1.
 */
export const CHAT_WS_ERROR_CODES = {
  /** Missing/invalid bearer token at the handshake (connection rejected). */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** Event payload failed shape validation (not a string conversationId). */
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  /** conversationId does not resolve to a conversation (uniform 404 analogue). */
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  /** Known conversation the caller takes no side of (REST value reused). */
  NOT_PARTICIPANT: 'NOT_PARTICIPANT',
  /** typing fired for a conversation this socket never subscribed to. */
  NOT_SUBSCRIBED: 'NOT_SUBSCRIBED',
} as const;

// --- the emitter seam (service → gateway decoupling) ---

/**
 * Injection token for the chat emitter. ConversationsService depends on THIS
 * interface, not on the gateway: the module binds it with `useExisting:
 * ChatGateway`, so production calls hit the real socket.io server while unit
 * tests inject a recording fake — the service stays unit-testable with no
 * socket.io in scope (card CHT-004's "injected emitter interface").
 */
export const CHAT_EMITTER = Symbol('CHAT_EMITTER');

/**
 * The outbound side of CHT-004 as the service sees it. Methods are
 * fire-and-forget (void): the mutations they announce are already COMMITTED
 * when called (services emit after the transaction resolves), so no ack or
 * error channel is needed — a lost socket delivery is recovered by the
 * web-side 15 s polling fallback.
 */
export interface ChatEmitter {
  /** Broadcast the committed message to the conversation room. */
  emitMessageNew(payload: MessageNewEvent): void;
  /**
   * Ping the OTHER participant's user room about the thread's new activity
   * (lastMessageAt/preview + their incremented unread counter).
   */
  emitConversationUpdated(recipientId: string, payload: ConversationUpdatedEvent): void;
  /** Broadcast a read receipt to the conversation room. */
  emitMessageRead(payload: MessageReadEvent): void;
}
