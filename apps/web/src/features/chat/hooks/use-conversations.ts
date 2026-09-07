'use client';

import { useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationListItemDto } from '@monorepo/shared-types';
import { useAuth } from '@/providers/auth-provider';
import { CONVERSATIONS_PAGE_SIZE, fetchConversations } from '../api/chat-api';
import { chatKeys } from '../api/keys';
import { useChatSocket } from './use-chat-socket';

/**
 * CHT-005 — the conversations inbox. One infinite query over the
 * Paginated envelope (page/total offset walk, like useMyLots) plus the card's
 * LIVE-UPDATE mechanics on top:
 *
 * - every `conversation:updated` WS event invalidates the list key — simple
 *   and correct: the refetch re-reads previews, unread counters, lot statuses
 *   and the newest-activity order in one shot (frontend-data.md → WS events
 *   invalidate query keys rather than duplicating state);
 * - while the socket has been down > 10 s (`pollingActive`, the CHT-004
 *   fallback contract) the same query polls every 15 s — chat never
 *   hard-fails without WS; a reconnect clears the flag and realtime
 *   invalidation takes over again.
 *
 * Disabled until an in-memory access token exists; default staleTime/retry
 * apply (doc/CONVENTIONS.md); the 15 s interval is the documented CHT-004
 * fallback cadence, not a staleTime override.
 */

/** Poll cadence while `pollingActive` (CHT-004 fallback contract: 15 s). */
export const CHAT_POLLING_INTERVAL_MS = 15_000;

export interface ConversationsListState {
  items: ConversationListItemDto[];
  /** Paginated total from the envelope (page 1) — available for headers. */
  total: number | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  /** WS fallback active → the inbox shows the «اتصال زنده قطع است» badge. */
  pollingActive: boolean;
}

export function useConversationsList(): ConversationsListState {
  const { accessToken } = useAuth();
  const token = accessToken();
  const socket = useChatSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
    };
    socket.on('conversation:updated', invalidate);
    return () => socket.off('conversation:updated', invalidate);
  }, [socket, queryClient]);

  const query = useInfiniteQuery({
    queryKey: chatKeys.conversations,
    queryFn: ({ pageParam }) =>
      fetchConversations(token, { page: pageParam, limit: CONVERSATIONS_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.limit < lastPage.total ? lastPage.page + 1 : undefined,
    enabled: Boolean(token),
    // CHT-004 fallback — poll only while the socket has been down > 10 s.
    refetchInterval: socket.pollingActive ? CHAT_POLLING_INTERVAL_MS : false,
  });

  return {
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
    total: query.data?.pages[0]?.total,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
    hasNextPage: Boolean(query.hasNextPage),
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    pollingActive: socket.pollingActive,
  };
}
