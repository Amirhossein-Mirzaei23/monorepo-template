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
