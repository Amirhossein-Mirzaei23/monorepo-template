'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { secureMediaUrl } from '../lib/secure-media';

/**
 * CHT-007 — one chat media object, loaded through the BEARER route: GET
 * {api}/media/secure/{key} with the in-memory access token → Blob → object
 * URL. The blob URL is what the <img>/<video> elements render (media bytes
 * never ride a URL an unauthenticated client could re-fetch, and no token
 * leaks into element attributes).
 *
 * Lifecycle: the object URL is revoked on unmount and on key change — it is
 * a per-view resource, deliberately NOT react-query cache state (there is
 * nothing to stale/invalidate; bytes are immutable per key). This is the
 * documented exception to the "no effect fetching" rule, same family as
 * MEDIA-004's direct-to-API upload path: a binary transport the BFF/query
 * layer does not model.
 *
 * 403 (the secure route's participant gate) surfaces as `forbidden` so the
 * bubble can show «دسترسی به این رسانه را ندارید» instead of a generic
 * failure; any other non-OK/network failure is a retryable `error`.
 */
export interface SecureMediaState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Object URL of the fetched blob — set only while `ready`. */
  url: string | null;
  /** The secure route answered 403 (not a participant of any carrying thread). */
  forbidden: boolean;
}

interface FetchedBlob {
  /** The key this result belongs to (stale results never render). */
  key: string;
  url: string;
  forbidden: boolean;
  failed: boolean;
}

const IDLE: SecureMediaState = { status: 'idle', url: null, forbidden: false };

export function useSecureMedia(storageKey: string | null | undefined): SecureMediaState {
  const { accessToken } = useAuth();
  const [fetched, setFetched] = useState<FetchedBlob | null>(null);
  // Latest-token ref: the fetch effect keys on the STORAGE KEY only. The
  // provider's accessToken function identity is not guaranteed stable across
  // renders, and keying the effect on it would refetch (and re-mint object
  // URLs) on every render. Chat media only renders inside an authenticated
  // thread, so the token at effect time is the one that matters (a missing
  // token just fails the request → error state).
  const accessTokenRef = useRef(accessToken);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    if (!storageKey) {
      return;
    }
    const key = storageKey;
    let cancelled = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();

    void (async () => {
      try {
        const token = accessTokenRef.current();
        const response = await fetch(secureMediaUrl(key), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: controller.signal,
        });
        if (!response.ok) {
          if (!cancelled) {
            setFetched({ key, url: '', forbidden: response.status === 403, failed: true });
          }
          return;
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
        } else {
          setFetched({ key, url: objectUrl, forbidden: false, failed: false });
        }
      } catch {
        // Aborted fetches belong to an already-cleaned-up effect — ignore.
        if (!cancelled) {
          setFetched({ key, url: '', forbidden: false, failed: true });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl !== null) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [storageKey]);

  // Derive the view state at render time — no state churn inside effects.
  // A result belonging to a PREVIOUS key renders as loading (the fetch for
  // the new key is in flight).
  if (!storageKey) {
    return IDLE;
  }
  if (fetched !== null && fetched.key === storageKey) {
    if (fetched.failed) {
      return { status: 'error', url: null, forbidden: fetched.forbidden };
    }
    if (fetched.url !== '') {
      return { status: 'ready', url: fetched.url, forbidden: false };
    }
  }
  return { status: 'loading', url: null, forbidden: false };
}
