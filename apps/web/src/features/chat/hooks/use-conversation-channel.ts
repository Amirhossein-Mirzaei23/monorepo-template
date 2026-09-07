'use client';

import { useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { getChatSocket } from '../lib/socket';

/**
 * CHT-006 — room lifecycle for the open thread. Joins the conversation room
 * on mount (`conversation:subscribe`), leaves it on unmount
 * (`conversation:unsubscribe`), and — the part the card's "two-session
 * realtime" acceptance hinges on — RE-joins after every socket (re)connect:
 * socket.io rooms are per-socket server memory, so the automatic socket.io
 * reconnection lands on a FRESH socket that is in no room until the client
 * subscribes again. The join itself is emitted through the singleton (queued
 * while the handshake is still in flight — server re-verifies participation).
 */
export function useConversationChannel(conversationId: string): void {
  const { accessToken } = useAuth();
  const getToken = accessToken;

  useEffect(() => {
    if (!getToken()) {
      return;
    }
    const socket = getChatSocket({ getToken });
    const join = () => socket.emit('conversation:subscribe', { conversationId });
    const leave = () => socket.emit('conversation:unsubscribe', { conversationId });

    join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      leave();
    };
  }, [conversationId, getToken]);
}
