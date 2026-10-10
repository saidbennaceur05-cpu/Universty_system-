import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import type { AuthSession } from "./types";
import * as api from "./api";

interface AuthContextValue {
  session: AuthSession | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<AuthSession>;
  logout: () => Promise<void>;
  setSession: (s: AuthSession | null) => void;
}

const AuthContext = createContext<AuthContextValue>({ session: null, ready: false, login: async () => { throw new Error("no provider"); }, logout: async () => {}, setSession: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    api
      .bootstrap()
      .then((s) => setSession(s))
      .catch((e: unknown) => setBootError(e instanceof Error ? e.message : "Impossible de démarrer l'application."))
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const s = await api.login(email, password);
    setSession(s);
    return s;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setSession(null);
  }, []);

  if (bootError) return <div className="boot-error"><strong>UniAbsence n'a pas pu démarrer.</strong><p>{bootError}</p></div>;

  return <AuthContext.Provider value={{ session, ready, login, logout, setSession }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Convenience for pages that can only render with an authenticated user. */
export function useSession(): AuthSession {
  const { session } = useAuth();
  if (!session) throw new Error("useSession() appelé hors session.");
  return session;
}
