"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { TEAM_EMAIL } from "@/lib/auth";

interface AuthActions {
  logout: () => Promise<void>;
}

const AuthActionsContext = createContext<AuthActions | null>(null);

export function useAuthActions(): AuthActions {
  const context = useContext(AuthActionsContext);
  if (!context) {
    throw new Error("useAuthActions must be used within AuthGate");
  }
  return context;
}

/**
 * Gate that requires the shared team password before rendering anything.
 * Real security comes from the database RLS (see supabase/migration-auth.sql):
 * without a valid session, Supabase returns nothing. This screen just collects
 * the password and signs in the shared account.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    let active = true;
    const client = supabase;
    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: TEAM_EMAIL,
      password,
    });
    setBusy(false);
    if (error) {
      setError("Incorrect password. Try again.");
    } else {
      setPassword("");
    }
  }

  const logout = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
  }, []);

  const authActions = useMemo(() => ({ logout }), [logout]);

  // Not configured yet -> let the child render its own setup screen.
  if (!isSupabaseConfigured) {
    return (
      <AuthActionsContext.Provider value={authActions}>
        {children}
      </AuthActionsContext.Provider>
    );
  }

  if (!ready) {
    return (
      <div className="wrap">
        <p className="state-note">Loading…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={login}>
          <p className="eyebrow">Triton Board</p>
          <h1 className="login-title">Enter the team password</h1>
          <p className="login-sub">This board is private to the Triton Kernel Agent team.</p>
          <input
            type="password"
            className="login-input"
            placeholder="Password"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="login-error">{error}</p>}
          <button className="btn primary login-btn" type="submit" disabled={busy || !password}>
            {busy ? "Checking…" : "Unlock board"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <AuthActionsContext.Provider value={authActions}>
      {children}
    </AuthActionsContext.Provider>
  );
}
