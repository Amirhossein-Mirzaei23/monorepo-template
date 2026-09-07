'use client';

import { useEffect } from 'react';
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import type { MessagePageDto, MessageResponseDto } from '@monorepo/shared-types';
import { useAuth } from '@/providers/auth-provider';
import { fetchMessages } from '../api/chat-api';
import { chatKeys } from '../api/keys';
import { CHAT_POLLING_INTERVAL_MS } from './use-conversations';
import { useChatSocket } from './use-chat-socket';
import type { MessageNewEvent, MessageReadEvent } from '../lib/socket-contract';

/**
 * CHT-006 — the thread history. One infinite query over the CHT-003
 * backwards-cursor envelope ({ items ASC, hasMore, nextCursor }): the FIRST
 * page is the newest slice of the thread, `fetchPreviousPage` walks OLDER
 * history with the `before` cursor, and the flattened result is oldest →
 * newest — exactly the render order of the bubbles. On top of the query sit
 * the card's realtime mechanics:
 *
 * - `message:new` (echoes included — the sender is in the room) is appended
 *   to the cache with id-dedupe: the WS echo of MY send and the POST ack both
 *   reconcile to the same row (`appendServerMessage`);
 * - `message:read` from the COUNTERPART flips my bubbles' ticks by stamping
 *   `readAt` on every not-yet-read message of mine (`stampMyMessagesRead`);
 * - while the socket has been down > 10 s (`pollingActive`, CHT-004 fallback
 *   contract) the query polls every 15 s — a reconnect hands control back to
 *   the live events.
 *
 * Disabled until an in-memory access token exists; default staleTime/retry
 * apply (doc/CONVENTIONS.md); the 15 s interval is the documented CHT-004
 * fallback cadence, not a staleTime override.
 */

export interface UseMessagesResult {
  /** Flattened thread, oldest → newest (server rows only — optimistic
   * pending sends live in use-send-message). */
  messages: MessageResponseDto[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  /** Older history exists beyond the oldest loaded message. */
  hasPreviousPage: boolean;
  isFetchingPreviousPage: boolean;
  fetchPreviousPage: () => void;
  /** WS fallback active → the thread shows the «اتصال زنده قطع است» badge. */
  pollingActive: boolean;
}

/**
 * Append a committed server message to the thread cache — the single
 * reconciliation seam for BOTH ack paths of the optimistic send (POST
 * response and the `message:new` WS echo arrive for the same row) and for
 * counterpart messages. Id-dedupe makes double delivery a no-op; a cache
 * that has not loaded yet skips the append (the initial fetch includes it).
 */
export function appendServerMessage(
  queryClient: QueryClient,
  conversationId: string,
  message: MessageResponseDto,
): void {
  queryClient.setQueryData<InfiniteData<MessagePageDto>>(
    chatKeys.messages(conversationId),
    (data) => {
      if (!data) {
        return data;
      }
      const alreadyThere = data.pages.some((page) =>
        page.items.some((item) => item.id === message.id),
      );
      if (alreadyThere) {
        return data;
      }
      const pages = [...data.pages];
      const lastIndex = pages.length - 1;
      const lastPage = pages[lastIndex];
      if (!lastPage) {
        return data;
      }
      pages[lastIndex] = { ...lastPage, items: [...lastPage.items, message] };
      return { ...data, pages };
    },
  );
}

/**
 * `message:read` from the counterpart: stamp MY messages read (the server
 * read the payload has no ids — markRead stamps ALL my unread rows, so the
 * local mirror does the same). Idempotent; my own read events never flip my
 * own ticks (the caller filters on readerId).
 */
export function stampMyMessagesRead(
  queryClient: QueryClient,
  conversationId: string,
  myId: string,
  readAt = new Date().toISOString(),
): void {
  queryClient.setQueryData<InfiniteData<MessagePageDto>>(
    chatKeys.messages(conversationId),
    (data) => {
      if (!data) {
        return data;
      }
      let changed = false;
      const pages = data.pages.map((page) => {
        const items = page.items.map((item) => {
          if (item.senderId !== myId || item.readAt !== null) {
            return item;
          }
          changed = true;
          return { ...item, readAt };
        });
        return items === page.items ? page : { ...page, items };
      });
      return changed ? { ...data, pages } : data;
    },
  );
}

export function useMessages(conversationId: string): UseMessagesResult {
  const { accessToken, user } = useAuth();
  const token = accessToken();
  const myId = user?.id;
  const queryClient = useQueryClient();
  // The on/off CALLBACKS are stable across renders (the hook memoizes them);
  // subscribing with those identities keeps this effect from re-subscribing
  // on every unrelated render.
  const { on, off, pollingActive } = useChatSocket();

  useEffect(() => {
    const onMessageNew = (payload: MessageNewEvent) => {
      if (payload.conversationId !== conversationId) {
        return;
      }
      appendServerMessage(queryClient, conversationId, payload.message);
    };
    const onMessageRead = (payload: MessageReadEvent) => {
      if (payload.conversationId !== conversationId || !myId || payload.readerId === myId) {
        return;
      }
      stampMyMessagesRead(queryClient, conversationId, myId);
    };
    on('message:new', onMessageNew);
    on('message:read', onMessageRead);
    return () => {
      off('message:new', onMessageNew);
      off('message:read', onMessageRead);
    };
  }, [on, off, queryClient, conversationId, myId]);

  const query = useInfiniteQuery({
    queryKey: chatKeys.messages(conversationId),
    queryFn: ({ pageParam }) => fetchMessages(token, conversationId, pageParam),
    // pageParam = the `before` cursor; undefined → the newest page.
    initialPageParam: undefined as string | undefined,
    // v5 requires both walks: NEXT is always undefined (newer messages arrive
    // through `message:new`/refetch, never through a "next page"), PREVIOUS
    // walks OLDER history with the oldest-returned id as the `before` cursor.
    getNextPageParam: () => undefined,
    getPreviousPageParam: (firstPage) =>
      firstPage.hasMore ? (firstPage.nextCursor ?? firstPage.items[0]?.id) : undefined,
    enabled: Boolean(token && conversationId),
    // CHT-004 fallback — poll only while the socket has been down > 10 s.
    refetchInterval: pollingActive ? CHAT_POLLING_INTERVAL_MS : false,
  });

  return {
    messages: query.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
    hasPreviousPage: Boolean(query.hasPreviousPage),
    isFetchingPreviousPage: query.isFetchingPreviousPage,
    fetchPreviousPage: () => {
      void query.fetchPreviousPage();
    },
    pollingActive,
  };
}
