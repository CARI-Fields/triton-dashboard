"use client";

import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <nav aria-label="Primary" />
      <main className="app-content">{children}</main>
    </div>
  );
}
