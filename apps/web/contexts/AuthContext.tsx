'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import {
  api,
  getAccessToken,
  setAccessToken,
  type User,
} from '@/lib/api';

type AuthContextValue = {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, full_name?: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, hydrate from localStorage and validate the token by loading the
  // profile. A stale/expired token fails /auth/me, so we clear it.
  useEffect(() => {
    const stored = getAccessToken();
    if (!stored) {
      setIsLoading(false);
      return;
    }
    setToken(stored);
    api.auth
      .me()
      .then((u) => setUser(u))
      .catch(() => {
        setAccessToken(null);
        setToken(null);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const tokens = await api.auth.login(email, password);
    setAccessToken(tokens.access_token);
    setToken(tokens.access_token);
    const profile = await api.auth.me();
    setUser(profile);
  }

  async function register(email: string, password: string, full_name?: string) {
    await api.auth.register(email, password, full_name);
    // Auto-login after register so the new user lands inside the app.
    await login(email, password);
  }

  function logout() {
    setAccessToken(null);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, accessToken, isLoading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
