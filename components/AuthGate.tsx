"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { TEAM_EMAIL } from "@/lib/auth";

const SESSION_VERIFICATION_ERROR =
  "Could not verify your session. Sign in again.";

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
    let active = true;
    if (!supabase) {
      setReady(true);
      return;
    }
    const client = supabase;
    const readInitialSession = async () => {
      try {
        const { data, error: sessionError } =
          await client.auth.getSession();
        if (!active) return;
        if (sessionError) {
          setSession(null);
          setError(SESSION_VERIFICATION_ERROR);
          return;
        }
        setSession(data.session);
        if (data.session) setError(null);
      } catch {
        if (!active) return;
        setSession(null);
        setError(SESSION_VERIFICATION_ERROR);
      } finally {
        if (active) setReady(true);
      }
    };
    void readInitialSession();
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (nextSession) setError(null);
    });
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

  async function logout() {
    if (supabase) await supabase.auth.signOut();
  }

  // Not configured yet -> let the child render its own setup screen.
  if (!isSupabaseConfigured) return <>{children}</>;

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
    <>
      <button className="logout-btn" onClick={logout} title="Log out">
        ⎋ Log out
      </button>
      {children}
    </>
  );
}
