/**
 * Public API (barrel) of the chat feature — the only import path other
 * modules may use (doc/ARCHITECTURE.md → Frontend rules).
 */
export { useChatSocket, CHAT_FALLBACK_AFTER_MS } from './hooks/use-chat-socket';
export type { UseChatSocketResult } from './hooks/use-chat-socket';
export {
  CHAT_POLLING_INTERVAL_MS,
  useConversationsList,
  type ConversationsListState,
} from './hooks/use-conversations';
export { getChatSocket, disconnectChatSocket, isChatSocketConnected } from './lib/socket';
export type { ChatSocket } from './lib/socket';
export {
  CHAT_WS_ERROR_CODES,
  type ChatClientToServerEvents,
  type ChatServerToClientEvents,
  type ConversationErrorEvent,
  type ConversationUpdatedEvent,
  type MessageNewEvent,
  type MessageReadEvent,
  type TypingEvent,
} from './lib/socket-contract';
export {
  fetchConversations,
  CONVERSATIONS_PAGE_SIZE,
  type ConversationsQuery,
} from './api/chat-api';
export { chatKeys } from './api/keys';
// --- CHT-005 inbox UI ---
export { ChatInbox } from './components/chat-inbox';
export {
  ConversationsList,
  ConversationRow,
  type ConversationsListProps,
} from './components/conversations-list';
// --- CHT-006 thread UI ---
export { ChatThread } from './components/chat-thread';
export {
  Composer,
  MESSAGE_BODY_COUNTER_THRESHOLD,
  type ComposerProps,
} from './components/composer';
export { MessageBubble, type MessageBubbleProps } from './components/message-bubble';
export { LotContextHeader, type LotContextHeaderProps } from './components/lot-context-header';
export {
  MESSAGES_PAGE_SIZE,
  MESSAGE_BODY_MAX_LENGTH,
  CONVERSATIONS_CONTEXT_SCAN_LIMIT,
  fetchMessages,
  sendMessage,
  markConversationRead,
} from './api/chat-api';
export {
  useMessages,
  appendServerMessage,
  stampMyMessagesRead,
  type UseMessagesResult,
} from './hooks/use-messages';
export {
  useSendMessage,
  type PendingMessage,
  type PendingMessageStatus,
  type UseSendMessageResult,
} from './hooks/use-send-message';
export { useMarkRead } from './hooks/use-mark-read';
export {
  TYPING_EMIT_INTERVAL_MS,
  TYPING_INDICATOR_TTL_MS,
  useTypingEmitter,
  useTypingIndicator,
} from './hooks/use-typing';
export { useConversationChannel } from './hooks/use-conversation-channel';
export {
  useConversationContext,
  type ConversationContextState,
} from './hooks/use-conversation-context';
