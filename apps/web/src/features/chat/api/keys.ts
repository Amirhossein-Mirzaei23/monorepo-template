const CHAT_ROOT = ['chat'] as const;

/** Query keys for the chat feature (TanStack Query). */
export const chatKeys = {
  all: CHAT_ROOT,
  /** GET /conversations inbox pages (CHT-005) — one cache for the infinite list. */
  conversations: [...CHAT_ROOT, 'conversations'] as const,
  /**
   * The page-1 scan that resolves a thread's lot/counterpart context (CHT-006).
   * Nested under `conversations` ON PURPOSE: any `conversation:updated`
   * invalidation of the inbox also refreshes the context (fresh lot status
   * chips) — no GET /conversations/:id exists yet (documented follow-up).
   */
  conversationContext: (conversationId: string) =>
    [...CHAT_ROOT, 'conversations', 'context', conversationId] as const,
  /** GET /conversations/:id/messages backwards-cursor pages (CHT-006). */
  messages: (conversationId: string) => [...CHAT_ROOT, 'messages', conversationId] as const,
};
