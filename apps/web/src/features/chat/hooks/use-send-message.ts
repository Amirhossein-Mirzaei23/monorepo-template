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
 * - sendMedia() (CHT-007): once an attachment UPLOAD completed, the bubble
 *   carries its local preview while the {type, mediaAssetId} POST goes out;
 * - reconcile: the temp retires when EITHER ack arrives — the POST response
 *   or the `message:new` WS echo of my own row (the sender is in the room).
 *   Both paths land the row in the cache through `appendServerMessage`
 *   (id-dedupe makes the double delivery harmless); the ✓ tick then lives on
 *   the server row (readAt null), so temps only ever rest in
 *   'sending' | 'failed' — there is no lingering 'sent' state to clean up.
 *   TEXT temps reconcile by body equality; MEDIA temps by kind (the client
 *   does not know the asset id before the ack) — oldest matching temp wins.
 * - failure: the temp flips to 'failed' (red bubble + retry); retry() puts
 *   the SAME temp back to 'sending' and re-POSTs the same payload.
 */

/** Lifecycle of an optimistic bubble (see the module doc — no 'sent' rest state). */
export type PendingMessageStatus = 'sending' | 'failed';

/** jsdom-safe object URL revocation (not every environment implements it). */
function revokeObjectUrl(url: string | undefined): void {
  if (url && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

/** The media a pending bubble was sent with (CHT-007) — the local preview
 * keeps rendering while the POST is in flight. */
export interface PendingMedia {
  type: 'IMAGE' | 'VIDEO';
  /** The uploaded MediaAsset id — re-POSTed verbatim on retry. */
  mediaAssetId: string;
  /** Object URL of the LOCAL file — revoked by use-attachment-send on unmount. */
  localPreviewUrl: string;
}

export interface PendingMessage {
  /** Negative, decreasing per session — never collides with real ids. */
  tempId: number;
  conversationId: string;
  senderId: string;
  /** Already-trimmed body (TEXT sends); empty for media sends. */
  body: string;
  /** The media reference (media sends) or undefined (TEXT sends). */
  media?: PendingMedia;
  /** Client clock ISO stamp — replaced by the server row on reconcile. */
  createdAt: string;
  status: PendingMessageStatus;
}

export interface UseSendMessageResult {
  /** In-flight/failed optimistic bubbles, in send order. */
  pending: PendingMessage[];
  send: (body: string) => void;
  /** CHT-007 — send an uploaded attachment (upload completion callback). */
  sendMedia: (type: 'IMAGE' | 'VIDEO', mediaAssetId: string, localPreviewUrl: string) => void;
  retry: (tempId: number) => void;
  /** CHT-007 — discard a pending bubble (revokes its local preview URL). */
  discard: (tempId: number) => void;
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
    setPending((items) => {
      const target = items.find((item) => item.tempId === tempId);
      // CHT-007: the retired optimistic bubble's LOCAL preview object URL is
      // ours to revoke — the server row renders via the authed-fetch keys.
      if (target?.media) {
        revokeObjectUrl(target.media.localPreviewUrl);
      }
      return items.filter((item) => item.tempId !== tempId);
    });
  }, []);

  // Unmount: revoke the local previews of optimistic bubbles still pending
  // (handed over from use-attachment-send on upload success).
  useEffect(() => {
    const items = pendingRef.current;
    return () => {
      for (const item of items) {
        if (item.media) {
          revokeObjectUrl(item.media.localPreviewUrl);
        }
      }
    };
  }, []);

  const setPendingStatus = useCallback((tempId: number, status: PendingMessageStatus) => {
    setPending((items) =>
      items.map((item) => (item.tempId === tempId ? { ...item, status } : item)),
    );
  }, []);

  const mutation = useMutation({
    mutationFn: ({
      payload,
    }: {
      tempId: number;
      payload: { body: string } | { type: 'IMAGE' | 'VIDEO'; mediaAssetId: string };
    }) => sendMessage(token, conversationId, payload),
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
    (
      tempId: number,
      payload: { body: string } | { type: 'IMAGE' | 'VIDEO'; mediaAssetId: string },
    ) => {
      setPendingStatus(tempId, 'sending');
      mutate({ tempId, payload });
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
      const message = payload.message;
      const match = pendingRef.current
        .filter((item) => item.status === 'sending')
        .filter((item) =>
          message.mediaAssetId !== null
            ? item.media?.type === message.type
            : item.body !== '' && item.body === message.body,
        )[0];
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
      mutate({ tempId, payload: { body: trimmed } });
    },
    [conversationId, mutate, myId],
  );

  const sendMedia = useCallback(
    (type: 'IMAGE' | 'VIDEO', mediaAssetId: string, localPreviewUrl: string) => {
      if (!mediaAssetId) {
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
          body: '',
          media: { type, mediaAssetId, localPreviewUrl },
          createdAt: new Date().toISOString(),
          status: 'sending',
        },
      ]);
      mutate({ tempId, payload: { type, mediaAssetId } });
    },
    [conversationId, mutate, myId],
  );

  const retry = useCallback(
    (tempId: number) => {
      const item = pendingRef.current.find((candidate) => candidate.tempId === tempId);
      if (!item || item.status !== 'failed') {
        return;
      }
      startSend(
        item.tempId,
        item.media
          ? { type: item.media.type, mediaAssetId: item.media.mediaAssetId }
          : { body: item.body },
      );
    },
    [startSend],
  );

  return { pending, send, sendMedia, retry, discard: removePending };
}
