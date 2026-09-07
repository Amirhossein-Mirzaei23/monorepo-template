'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useChatSocket } from './use-chat-socket';
import type { TypingEvent } from '../lib/socket-contract';

/**
 * CHT-006 — the typing pair over the CHT-004 socket:
 *
 * - `useTypingEmitter` gives the composer a throttled notify callback: the
 *   FIRST keystroke emits immediately, then at most one `typing` emit per
 *   2 s no matter how fast the user types (the server additionally debounces
 *   its room relay to 3 s — the client throttle keeps the wire quiet);
 * - `useTypingIndicator` listens for the COUNTERPART's `typing` events and
 *   keeps the three-dot bubble alive for the server's relay window (3 s TTL)
 *   before it fades. Own echoes and other conversations are ignored.
 */

/** Client emit throttle — the card's «at most every 2 s». */
export const TYPING_EMIT_INTERVAL_MS = 2_000;

/** How long an indicator stays up after the last relay (server debounce window). */
export const TYPING_INDICATOR_TTL_MS = 3_000;

/** Stable throttled `typing` emitter for the composer (2 s client throttle). */
export function useTypingEmitter(conversationId: string): () => void {
  const { emit } = useChatSocket();
  const lastEmitAtRef = useRef(0);

  return useCallback(() => {
    const now = Date.now();
    if (now - lastEmitAtRef.current < TYPING_EMIT_INTERVAL_MS) {
      return;
    }
    lastEmitAtRef.current = now;
    emit('typing', { conversationId });
  }, [emit, conversationId]);
}

/** True while the COUNTERPART is typing (3 s TTL after their last relay). */
export function useTypingIndicator(conversationId: string): boolean {
  const { user } = useAuth();
  const myId = user?.id;
  // The on/off CALLBACKS are stable across renders (the hook memoizes them);
  // subscribing with those identities keeps this effect from re-running —
  // a re-run would clear the rolling TTL timer on every unrelated render.
  const { on, off } = useChatSocket();
  const [counterpartTyping, setCounterpartTyping] = useState(false);
  const ttlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onTyping = (payload: TypingEvent) => {
      if (payload.conversationId !== conversationId || payload.userId === myId) {
        return;
      }
      setCounterpartTyping(true);
      if (ttlTimerRef.current !== null) {
        clearTimeout(ttlTimerRef.current);
      }
      ttlTimerRef.current = setTimeout(() => setCounterpartTyping(false), TYPING_INDICATOR_TTL_MS);
    };
    on('typing', onTyping);
    return () => {
      off('typing', onTyping);
      if (ttlTimerRef.current !== null) {
        clearTimeout(ttlTimerRef.current);
        ttlTimerRef.current = null;
      }
    };
  }, [on, off, conversationId, myId]);

  return counterpartTyping;
}
