const CHAT_ROOT = ['chat'] as const;

/** Query keys for the chat feature (TanStack Query). */
export const chatKeys = {
  all: CHAT_ROOT,
  /** GET /conversations inbox pages (CHT-005) — one cache for the infinite list. */
  conversations: [...CHAT_ROOT, 'conversations'] as const,
};
