'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { getChatSocket, type ChatSocket } from '../lib/socket';
import type { ChatClientToServerEvents, ChatServerToClientEvents } from '../lib/socket-contract';

/**
 * CHT-004 — React binding for the chat socket singleton. Connects when the
 * session is authenticated, exposes typed on/off/emit + connection state, and
 * owns the card's FALLBACK contract:
 *
 * - socket.io handles reconnection attempts itself (`reconnection: true`);
 * - when the socket stays DISCONNECTED for more than 10 s, `pollingActive`
 *   flips true — consumers (CHT-005 inbox / CHT-006 thread) switch their
 *   react-query reads to 15 s polling so chat never hard-fails without WS;
 * - a successful (re)connect clears the flag immediately;
 * - a token change (silent BFF refresh) forces a fresh handshake — the
 *   singleton's `auth` callback re-reads the in-memory token at connect time;
 * - unmount removes THIS consumer's listeners; the singleton itself lives for
 *   the app session (mount it once in the (app) layout).
 */

/** Disconnected longer than this ⇒ polling fallback activates (card: 10 s). */
export const CHAT_FALLBACK_AFTER_MS = 10_000;

export interface UseChatSocketResult {
  /** Live socket.io connection (handshake authenticated) for this session. */
  connected: boolean;
  /** True after > 10 s disconnected — poll via react-query (15 s) instead. */
  pollingActive: boolean;
  /** Subscribe to a server event while mounted (pair with `off`). */
  on: <E extends keyof ChatServerToClientEvents>(
    event: E,
    handler: ChatServerToClientEvents[E],
  ) => void;
  /** Remove a previously registered handler. */
  off: <E extends keyof ChatServerToClientEvents>(
    event: E,
    handler: ChatServerToClientEvents[E],
  ) => void;
  /** Send a client event (subscribe/typing). Sends themselves go via REST. */
  emit: <E extends keyof ChatClientToServerEvents>(
    event: E,
    ...args: Parameters<ChatClientToServerEvents[E]>
  ) => void;
}

export function useChatSocket(): UseChatSocketResult {
  const { status, accessToken: getToken } = useAuth();
  // Raw socket state — EXPOSED only while authenticated (derived below), so a
  // logout never surfaces a stale connected/polling flag and the unmount/
  // logout path needs no setState in the effect body.
  const [socketConnected, setSocketConnected] = useState(false);
  const [fallbackArmed, setFallbackArmed] = useState(false);

  // Live mirror for the disconnect handler: arming the fallback is reserved
  // to drops that happen while authenticated (a logout disconnect must not
  // arm it — the provider's getter identity changes with its memo, not the
  // token value, so the connect effect compares VALUES through tokenRef).
  const statusRef = useRef(status);
  const tokenRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current !== null) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const ensureSocket = useCallback((): ChatSocket => getChatSocket({ getToken }), [getToken]);

  // Drive the singleton's connection from the auth state. Re-runs on status
  // changes (restore/login/logout) and provider updates around a token
  // rotation — forcing the card's "reconnect on token change" handshake.
  useEffect(() => {
    if (status === 'loading') {
      return; // wait for the silent session restore before dialing
    }
    tokenRef.current = getToken();
    const socket = ensureSocket();

    const handleConnect = () => {
      setSocketConnected(true);
      clearFallbackTimer();
      setFallbackArmed(false);
    };
    const handleDisconnect = () => {
      setSocketConnected(false);
      if (statusRef.current === 'authenticated') {
        clearFallbackTimer();
        fallbackTimerRef.current = setTimeout(() => setFallbackArmed(true), CHAT_FALLBACK_AFTER_MS);
      }
    };
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    if (status === 'authenticated') {
      if (socket.connected) {
        // Already dialled — a rerun here means the token changed: drop the
        // connection authenticated with the OLD token and handshake anew.
        socket.disconnect();
      }
      socket.connect();
    } else {
      // Logout: fires `disconnect` synchronously when live, which resets the
      // socket state; stale flags stay masked by the derivation below.
      socket.disconnect();
      clearFallbackTimer();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      clearFallbackTimer();
      // The singleton socket stays alive across consumers (app-level);
      // only this consumer's listeners are removed.
    };
  }, [status, getToken, ensureSocket, clearFallbackTimer]);

  const on = useCallback<UseChatSocketResult['on']>(
    (event, handler) => {
      // socket.io's listener overloads don't unify an open generic — the
      // payload types ARE pinned by this hook's signature, so the narrowed
      // call is safe.
      ensureSocket().on(event as never, handler as never);
    },
    [ensureSocket],
  );

  const off = useCallback<UseChatSocketResult['off']>(
    (event, handler) => {
      ensureSocket().off(event as never, handler as never);
    },
    [ensureSocket],
  );

  const emit = useCallback<UseChatSocketResult['emit']>(
    (event, ...args) => {
      ensureSocket().emit(event, ...args);
    },
    [ensureSocket],
  );

  return {
    connected: status === 'authenticated' && socketConnected,
    pollingActive: status === 'authenticated' && fallbackArmed,
    on,
    off,
    emit,
  };
}
