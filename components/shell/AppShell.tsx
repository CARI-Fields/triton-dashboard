"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { TEAM_EMAIL } from "@/lib/auth";
import { SidebarNav } from "@/components/shell/SidebarNav";

export function AppShell({ children }: { children: ReactNode }) {
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
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email: TEAM_EMAIL, password });
    setBusy(false);
    if (error) {
      setError("Incorrect password. Try again.");
    } else {
      setSession(data.session);
      setPassword("");
    }
  }

  async function logout() {
    if (supabase) await supabase.auth.signOut();
  }

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
    <div className="app-shell">
      <SidebarNav onLogout={logout} />
      <main className="app-content">{children}</main>
    </div>
  );
}
