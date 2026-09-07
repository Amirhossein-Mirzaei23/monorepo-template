import type { MessageResponseDto } from '@monorepo/shared-types';

/**
 * CHT-004 — the web mirror of the /ws socket.io contract. Kept in sync BY HAND
 * with apps/api/src/modules/conversations/chat.events.ts (the shared package
 * is generated from the REST swagger only — WS events are not in that
 * document, so this file is the client-side single source of truth).
 *
 * Over-the-wire shapes are JSON-serializable: dates arrive as ISO strings
 * even though the server-side emitter passes `Date` objects.
 */

/** `message:new` — a committed message, broadcast to the conversation room. */
export interface MessageNewEvent {
  conversationId: string;
  message: MessageResponseDto;
}

/**
 * `conversation:updated` — inbox refresh for the OTHER participant only:
 * new activity stamp, stored preview, and the recipient's post-increment
 * unread counter (drives CHT-005's live unread badges).
 */
export interface ConversationUpdatedEvent {
  conversationId: string;
  /** ISO datetime string over the wire. */
  lastMessageAt: string;
  preview: string | null;
  unreadCount: number;
}

/** `message:read` — read receipt broadcast to the conversation room. */
export interface MessageReadEvent {
  conversationId: string;
  readerId: string;
  /** Counterpart messages stamped by the read call (0 = idempotent re-read). */
  readCount: number;
}

/** `typing` — debounced relay of a participant's typing state. */
export interface TypingEvent {
  conversationId: string;
  userId: string;
}

/** `conversation:error` — a rejected subscribe/unsubscribe/typing request. */
export interface ConversationErrorEvent {
  code: string;
  conversationId?: string;
}

/** Server → client events (client's listen side). */
export interface ChatServerToClientEvents {
  'message:new': (payload: MessageNewEvent) => void;
  'conversation:updated': (payload: ConversationUpdatedEvent) => void;
  'message:read': (payload: MessageReadEvent) => void;
  typing: (payload: TypingEvent) => void;
  'conversation:error': (payload: ConversationErrorEvent) => void;
}

/** Client → server events (client's emit side). */
export interface ChatClientToServerEvents {
  'conversation:subscribe': (payload: { conversationId: string }) => void;
  'conversation:unsubscribe': (payload: { conversationId: string }) => void;
  typing: (payload: { conversationId: string }) => void;
}

/** Machine-readable codes carried on `conversation:error` (fa copy web-side). */
export const CHAT_WS_ERROR_CODES = {
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  NOT_PARTICIPANT: 'NOT_PARTICIPANT',
  NOT_SUBSCRIBED: 'NOT_SUBSCRIBED',
} as const;
