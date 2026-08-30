'use client';

import type { LoginResponseDto, UserResponseDto } from '@monorepo/shared-types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { apiFetch } from '@/lib/api-client';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: SessionStatus;
  user: UserResponseDto | undefined;
  /** Current access token (kept in memory only — never persisted). */
  accessToken: () => string | undefined;
  login: (payload: LoginResponseDto) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Session owner for the whole app. The access token lives in memory only; the
 * refresh token never reaches client JS (httpOnly cookie exchanged via the BFF).
 * On mount it silently restores the session through the BFF refresh endpoint.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<UserResponseDto | undefined>(undefined);
  const tokenRef = useRef<string | undefined>(undefined);

  const login = useCallback((payload: LoginResponseDto) => {
    tokenRef.current = payload.accessToken;
    setUser(payload.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      tokenRef.current = undefined;
      setUser(undefined);
      setStatus('unauthenticated');
    }
  }, []);

  // Silent session restore: exchange the httpOnly refresh cookie via the BFF.
  useEffect(() => {
    let cancelled = false;
    void apiFetch<LoginResponseDto>('/api/auth/refresh', { method: 'POST' })
      .then((payload) => {
        if (!cancelled) {
          login(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('unauthenticated');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [login]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, accessToken: () => tokenRef.current, login, logout }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return context;
}
