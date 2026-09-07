'use client';

import { useQuery } from '@tanstack/react-query';
import type { ConversationListItemDto } from '@monorepo/shared-types';
import { useAuth } from '@/providers/auth-provider';
import { CONVERSATIONS_CONTEXT_SCAN_LIMIT, fetchConversations } from '../api/chat-api';
import { chatKeys } from '../api/keys';

/**
 * CHT-006 — the thread header's lot/counterpart context. There is NO
 * GET /conversations/:id endpoint (CHT-002 shipped list-only), so the thread
 * fetches the FIRST page of the caller's conversations (limit 50 — the API's
 * hard cap) and picks the row by id. Documented limitation + follow-up: a
 * thread beyond page 50 of a very large inbox renders the fallback header
 * («اطلاعات لات در دسترس نیست») until a proper detail endpoint lands.
 *
 * The key nests under `chatKeys.conversations` ON PURPOSE: any
 * `conversation:updated` invalidation refreshes the context too, keeping the
 * lot status chip live (e.g. the lot sells mid-negotiation).
 */
export interface ConversationContextState {
  conversation: ConversationListItemDto | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function useConversationContext(conversationId: string): ConversationContextState {
  const { accessToken } = useAuth();
  const token = accessToken();

  const query = useQuery({
    queryKey: chatKeys.conversationContext(conversationId),
    queryFn: async () => {
      const page = await fetchConversations(token, {
        page: 1,
        limit: CONVERSATIONS_CONTEXT_SCAN_LIMIT,
      });
      return page.items.find((item) => item.id === conversationId) ?? null;
    },
    enabled: Boolean(token && conversationId),
  });

  return {
    conversation: query.data ?? undefined,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
