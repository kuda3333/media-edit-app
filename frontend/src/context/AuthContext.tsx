import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch, getToken, setToken, User, TokenResponse } from '../api/client';

type AuthState = {
  user: User | null | undefined; // undefined = loading
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const bootstrap = useCallback(async () => {
    const tok = await getToken();
    if (!tok) {
      setUser(null);
      return;
    }
    try {
      const me = await apiFetch<User>('/api/auth/me');
      setUser(me);
    } catch {
      await setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = async (email: string, password: string) => {
    const data = await apiFetch<TokenResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      auth: false,
    });
    await setToken(data.access_token);
    setUser(data.user);
  };

  const signup = async (email: string, password: string, name?: string) => {
    const data = await apiFetch<TokenResponse>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
      auth: false,
    });
    await setToken(data.access_token);
    setUser(data.user);
  };

  const logout = async () => {
    await setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
