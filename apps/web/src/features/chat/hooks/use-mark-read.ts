'use client';

import { useCallback, useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { markConversationRead } from '../api/chat-api';
import { useChatSocket } from './use-chat-socket';
import type { MessageNewEvent } from '../lib/socket-contract';

/**
 * CHT-006 — read receipts. Calls POST /conversations/:id/read (CHT-003):
 *
 * - once when the thread mounts (opening a thread reads it);
 * - on every counterpart `message:new` that arrives while the tab is
 *   focused — the WhatsApp behaviour where a visible thread marks incoming
 *   messages read the moment they land (my own sends never trigger a read —
 *   the server's re-read would be a no-op anyway);
 * - deliberately fire-and-forget: a failed read call costs nothing (the next
 *   trigger retries it; the server route is idempotent and answers
 *   { readCount: 0 } on re-reads), so there is no error UI on this path.
 */
export function useMarkRead(conversationId: string): void {
  const { accessToken, user } = useAuth();
  const token = accessToken();
  const myId = user?.id;
  // Stable on/off identities — see use-typing for the rationale.
  const { on, off } = useChatSocket();

  const markRead = useCallback(() => {
    if (!token) {
      return;
    }
    void markConversationRead(token, conversationId).catch(() => undefined);
  }, [token, conversationId]);

  // Mount: opening the thread marks it read.
  useEffect(() => {
    markRead();
  }, [markRead]);

  // Live: a counterpart message landing in a focused thread is read at once.
  useEffect(() => {
    const onMessageNew = (payload: MessageNewEvent) => {
      if (payload.conversationId !== conversationId || payload.message.senderId === myId) {
        return;
      }
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      markRead();
    };
    on('message:new', onMessageNew);
    return () => off('message:new', onMessageNew);
  }, [on, off, conversationId, myId, markRead]);
}
