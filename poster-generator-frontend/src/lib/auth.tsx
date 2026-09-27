'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearToken, getToken, UnauthorizedError } from '@/lib/api';
import type { User } from '@/lib/types';

interface AuthState {
  user: User | null;
  /** True until the initial session check finishes, so pages can hold off. */
  initialising: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initialising, setInitialising] = useState(true);

  // On mount, ask the server who we are. The token in localStorage is only a
  // claim; the server is the authority on whether it is still valid.
  useEffect(() => {
    const controller = new AbortController();

    if (!getToken()) {
      // Nothing to verify, so we are finished immediately. The update is
      // deferred by a microtask on purpose: `initialising` starts as `true` on
      // both the server and the client (the server has no localStorage), so
      // setting it here must not happen in the same tick as the mount, or the
      // render cascades before the first paint.
      queueMicrotask(() => {
        if (!controller.signal.aborted) setInitialising(false);
      });
      return () => controller.abort();
    }

    api
      .me(controller.signal)
      .then(setUser)
      .catch((error: unknown) => {
        // An aborted request is a navigation, not a failure to report.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof UnauthorizedError) clearToken();
      })
      .finally(() => {
        if (!controller.signal.aborted) setInitialising(false);
      });

    return () => controller.abort();
  }, []);

  // A 401 from anywhere in the app signs the user out centrally, so no screen
  // can get stuck rendering an authenticated shell with no data.
  useEffect(() => {
    const onUnauthorized = () => {
      clearToken();
      setUser(null);
    };
    window.addEventListener('poster:unauthorized', onUnauthorized);
    return () => window.removeEventListener('poster:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const signedIn = await api.login(email, password);
    setUser(signedIn);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const created = await api.register(name, email, password);
    setUser(created);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, initialising, login, register, logout }),
    [user, initialising, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return context;
}
