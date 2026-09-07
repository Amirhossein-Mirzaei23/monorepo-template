'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { MESSAGE_BODY_MAX_LENGTH, sendMessage } from '../api/chat-api';
import { appendServerMessage } from './use-messages';
import { useChatSocket } from './use-chat-socket';
import type { MessageNewEvent } from '../lib/socket-contract';

/**
 * CHT-006 — the optimistic send. The SERVER truth lives in the react-query
 * cache (use-messages); this hook layers the in-flight bubbles on top as
 * component state (`pending`), keyed by DECREASING NEGATIVE temp ids so they
 * can never collide with real (cuid) row ids:
 *
 * - send(): trimmed body validated against the CHT-003 bound (1..2000) —
 *   the temp bubble renders instantly with status 'sending' and the POST
 *   goes out (composer gates empty/oversize too; the hook re-checks);
 * - reconcile: the temp retires when EITHER ack arrives — the POST response
 *   or the `message:new` WS echo of my own row (the sender is in the room).
 *   Both paths land the row in the cache through `appendServerMessage`
 *   (id-dedupe makes the double delivery harmless); the ✓ tick then lives on
 *   the server row (readAt null), so temps only ever rest in
 *   'sending' | 'failed' — there is no lingering 'sent' state to clean up;
 * - failure: the temp flips to 'failed' (red bubble + retry); retry() puts
 *   the SAME temp back to 'sending' and re-POSTs the same body.
 */

/** Lifecycle of an optimistic bubble (see the module doc — no 'sent' rest state). */
export type PendingMessageStatus = 'sending' | 'failed';

export interface PendingMessage {
  /** Negative, decreasing per session — never collides with real ids. */
  tempId: number;
  conversationId: string;
  senderId: string;
  /** Already-trimmed body (what the POST sends). */
  body: string;
  /** Client clock ISO stamp — replaced by the server row on reconcile. */
  createdAt: string;
  status: PendingMessageStatus;
}

export interface UseSendMessageResult {
  /** In-flight/failed optimistic bubbles, in send order. */
  pending: PendingMessage[];
  send: (body: string) => void;
  retry: (tempId: number) => void;
}

export function useSendMessage(conversationId: string): UseSendMessageResult {
  const { accessToken, user } = useAuth();
  const token = accessToken();
  const myId = user?.id;
  const queryClient = useQueryClient();
  // Stable on/off identities — see use-typing for the rationale.
  const { on, off } = useChatSocket();

  const [pending, setPending] = useState<PendingMessage[]>([]);
  const nextTempIdRef = useRef(0);
  // Latest-pending mirror for the event-driven paths (WS echo, retry) —
  // updated after commit, never during render.
  const pendingRef = useRef<PendingMessage[]>([]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const removePending = useCallback((tempId: number) => {
    setPending((items) => items.filter((item) => item.tempId !== tempId));
  }, []);

  const setPendingStatus = useCallback((tempId: number, status: PendingMessageStatus) => {
    setPending((items) =>
      items.map((item) => (item.tempId === tempId ? { ...item, status } : item)),
    );
  }, []);

  const mutation = useMutation({
    mutationFn: ({ body }: { tempId: number; body: string }) =>
      sendMessage(token, conversationId, body),
    onSuccess: (message, variables) => {
      appendServerMessage(queryClient, conversationId, message);
      removePending(variables.tempId);
    },
    onError: (_error, variables) => {
      setPendingStatus(variables.tempId, 'failed');
    },
  });
  // `mutate` is referentially stable across renders (unlike the mutation wrapper).
  const { mutate } = mutation;

  const startSend = useCallback(
    (tempId: number, body: string) => {
      setPendingStatus(tempId, 'sending');
      mutate({ tempId, body });
    },
    [mutate, setPendingStatus],
  );

  // WS echo reconcile: my own committed row also arrives through the socket
  // (often BEFORE the POST resolves) — land it in the cache and retire the
  // matching optimistic bubble immediately so no duplicate bubble flashes.
  useEffect(() => {
    const onMessageNew = (payload: MessageNewEvent) => {
      if (payload.conversationId !== conversationId || payload.message.senderId !== myId) {
        return;
      }
      appendServerMessage(queryClient, conversationId, payload.message);
      const match = pendingRef.current.find(
        (item) => item.status === 'sending' && item.body === payload.message.body,
      );
      if (match) {
        removePending(match.tempId);
      }
    };
    on('message:new', onMessageNew);
    return () => off('message:new', onMessageNew);
  }, [on, off, queryClient, conversationId, myId, removePending]);

  const send = useCallback(
    (body: string) => {
      const trimmed = body.trim();
      if (trimmed.length === 0 || trimmed.length > MESSAGE_BODY_MAX_LENGTH) {
        return;
      }
      nextTempIdRef.current -= 1;
      const tempId = nextTempIdRef.current;
      setPending((items) => [
        ...items,
        {
          tempId,
          conversationId,
          senderId: myId ?? '',
          body: trimmed,
          createdAt: new Date().toISOString(),
          status: 'sending',
        },
      ]);
      mutate({ tempId, body: trimmed });
    },
    [conversationId, mutate, myId],
  );

  const retry = useCallback(
    (tempId: number) => {
      const item = pendingRef.current.find((candidate) => candidate.tempId === tempId);
      if (!item || item.status !== 'failed') {
        return;
      }
      startSend(item.tempId, item.body);
    },
    [startSend],
  );

  return { pending, send, retry };
}
