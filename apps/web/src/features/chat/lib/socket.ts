'use client';

import { io, type Socket } from 'socket.io-client';
import { publicApiUrl } from '@/lib/config';
import type { ChatClientToServerEvents, ChatServerToClientEvents } from './socket-contract';

/**
 * CHT-004 — the app-wide chat socket SINGLETON. One socket.io connection per
 * browser session, shared by every chat surface (CHT-005 inbox, CHT-006
 * thread): consumers never call `io()` themselves — they read the singleton
 * through `use-chat-socket` (or these helpers directly in tests).
 */

/** The client socket with the app's typed event maps. */
export type ChatSocket = Socket<ChatServerToClientEvents, ChatClientToServerEvents>;

let singleton: ChatSocket | undefined;

export interface ChatSocketOptions {
  /** API origin — defaults to `publicApiUrl` (NEXT_PUBLIC_API_URL). */
  apiOrigin?: string;
  /**
   * In-memory token getter (AuthProvider keeps the access token out of
   * storage). Called at EVERY (re)connect attempt, so silent token rotations
   * are picked up without rebuilding the socket.
   */
  getToken: () => string | undefined;
}

/**
 * Creates the singleton on first call (autoConnect: false — the hook drives
 * connect/disconnect from the auth state), then always returns it.
 *
 * `path: '/ws'` matches the API gateway; `auth` is a FUNCTION so socket.io
 * re-reads the current in-memory token on every attempt — including the
 * reconnection loop after a dropped connection or an expired token
 * (401 handshake → server closed the socket → reconnection with fresh token).
 */
export function getChatSocket(options: ChatSocketOptions): ChatSocket {
  if (singleton) {
    return singleton;
  }
  singleton = io(options.apiOrigin ?? publicApiUrl, {
    path: '/ws',
    auth: (callback) => callback({ token: options.getToken() ?? '' }),
    autoConnect: false,
    reconnection: true,
  });
  return singleton;
}

/**
 * Tears the singleton down (logout / session end): disconnects and clears the
 * cached instance so the next `getChatSocket` builds fresh — including a
 * re-read of the (new) token getter closure.
 */
export function disconnectChatSocket(): void {
  singleton?.disconnect();
  singleton = undefined;
}

/** Current connection state of the singleton (undefined = never created). */
export function isChatSocketConnected(): boolean {
  return singleton?.connected ?? false;
}

/** Test seam: drop the cached singleton without touching a live socket. */
export function resetChatSocketForTests(): void {
  singleton = undefined;
}
