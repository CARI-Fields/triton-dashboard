# Blueprint Foundation, App Shell & Shared Primitives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the real Palantir Blueprint design system, build the new authenticated App Shell (sidebar + content, consolidating the per-page `AuthGate`), and create the shared `components/ui/*` primitive library that every later screen plan consumes — without changing existing page *content*.

**Architecture:** `@blueprintjs/core@6` CSS + components imported at the root; a client `BlueprintProvider` wrapper at the root layout; a client `AppShell` that owns session/login/logout and renders `SidebarNav + <main>{children}</main>`; thin `"use client"` wrappers in `components/ui/*` over Blueprint primitives; a semantic-token CSS layer aliasing to Blueprint `--bp-*`. Existing hand-rolled CSS (`globals.css`, `experiment-workspace.css`) coexists and is retired per-screen in later plans.

**Tech Stack:** Next.js 16 (App Router), React 19, `@blueprintjs/core@6` (+ `@blueprintjs/icons`, `@blueprintjs/select`), Supabase (auth unchanged), Vitest + @testing-library/react + jsdom.

## Plan sequence (this is Plan 1 of the whole-product refactor)

This plan is the prerequisite for all later plans. Later plans (each independently testable):

- **Plan 2** — Task domain: UUID-owner migration (`task_assignees`), Type/Tags/priority/due columns, Task Board + Task detail reskin.
- **Plan 3** — Experiment domain: Experiments database table + Experiment record **read** view + Promotion checklist rail (`policy.ts` visualization).
- **Plan 4** — Templates model + Experiment record **edit** view (template-driven field tables + version drawer).
- **Plan 5** — Compare + Analytics reskin.
- **Plan 6** — API keys Admin UI (+ Agent API backend per `2026-07-28-triton-board-agent-api-design.md`).

## Global Constraints

- **Branch:** work on `feat/blueprint-foundation`, not `main`.
- **Next 16 first:** before writing CSS/component code, read `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` (external stylesheet import) and `05-server-and-client-components.md`. External node_modules CSS is imported in the root layout; CSS order follows import order.
- **RSC boundary:** every file that imports `@blueprintjs/*` and is used from a Server Component must start with `"use client"`. Pages stay Server Components; only the shell + primitives + interactive islands are client.
- **Light only:** no dark theme. Do not add `bp5-dark` / `data-theme` switching.
- **No behavior loss:** realtime, RLS, optimistic concurrency, existing page functionality must keep working. This plan changes chrome + adds primitives only; it must not rewrite Board/Experiment/Analytics internals.
- **Schema over mock:** no new fake data.
- **Commits:** conventional-commits style (`feat:`, `chore:`, `test:` …); append the trailer `Co-Authored-By: Claude <noreply@anthropic.com>`. Commit after each task.
- **Verify before claiming done:** run `npm run build` and `npm test` before marking any task complete.

## File Structure

Created:
- `components/ui/index.ts` — barrel (`"use client"`) re-exporting all primitives.
- `components/ui/Button.tsx` — `Button` + `IconButton` (wrap `@blueprintjs/core` `Button`).
- `components/ui/Tag.tsx` — `Tag`, `StatusTag`, `StatusDot` + status→intent maps.
- `components/ui/PageHeader.tsx` — `PageHeader` (eyebrow / H1 / lede / actions), `Breadcrumbs` wrapper.
- `components/ui/Toolbar.tsx` — `Toolbar`, `SearchInput`, `ToolbarSelect`, `ToolbarSegmentedControl`.
- `components/ui/Card.tsx` — `Card`, `Callout`, `ProgressBar` wrappers.
- `components/ui/DataTable.tsx` — generic `DataTable<T>` (sticky header, optional selection).
- `components/ui/Overlay.tsx` — `Drawer`, `Dialog`, `Tooltip` wrappers (`"use client"`).
- `components/ui/Feedback.tsx` — `Skeleton`, `EmptyState`, `ErrorBanner`, `SaveBar`.
- `components/shell/BlueprintProvider.tsx` — client provider wrapper.
- `components/shell/AppShell.tsx` — client; owns session + login UI + logout; renders sidebar + content.
- `components/shell/SidebarNav.tsx` — client; nav items + active state + brand + live badge.
- `app/blueprint-tokens.css` — semantic tokens aliased to `--bp-*`.
- `test/setup.ts` — jsdom globals for Blueprint (ResizeObserver, matchMedia).

Modified:
- `app/layout.tsx` — import Blueprint CSS + tokens; replace `<div className="app-shell"><Navbar/></div>` with `<AppShell>`.
- `vitest.config.mts` — add `test.setupFiles`.
- `app/page.tsx`, `app/task/[id]/page.tsx`, `app/analytics/page.tsx`, `app/experiments/page.tsx`, `app/experiments/[id]/page.tsx`, `app/experiments/compare/page.tsx` — drop the `<AuthGate>` wrapper (now layout-level).

Deleted:
- `components/Navbar.tsx`, `components/__tests__/Navbar.test.tsx`, `components/AuthGate.tsx` (logic moves into `AppShell`).

---

### Task 1: Branch, read Next 16 guides, install Blueprint

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: installed `@blueprintjs/core@^6`, `@blueprintjs/icons@^6`, `@blueprintjs/select@^6`.

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/blueprint-foundation
```

- [ ] **Step 2: Read the Next 16 CSS + RSC guides** (AGENTS.md mandate; APIs may differ from prior knowledge)

Read these files and note the exact rules:
- `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` — confirms external node_modules CSS is imported in the root layout (see the `bootstrap/dist/css/bootstrap.css` example); CSS order follows import order.
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` — client boundary rules.

- [ ] **Step 3: Install Blueprint packages**

```bash
npm install @blueprintjs/core@^6 @blueprintjs/icons@^6 @blueprintjs/select@^6
```

- [ ] **Step 4: Verify versions + peer compatibility**

```bash
node -e "console.log(require('@blueprintjs/core/package.json').version, require('react/package.json').version)"
```
Expected: a `6.x.x` Blueprint version and `19.2.4` React (Blueprint peer allows `react 18||19`).

- [ ] **Step 5: Confirm the app still builds**

Run: `npm run build`
Expected: build succeeds (packages installed but not yet imported).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @blueprintjs core/icons/select"
# append Co-Authored-By trailer per Global Constraints
```

---

### Task 2: jsdom test setup for Blueprint

Blueprint overlays (Portal/Popover) touch `ResizeObserver` and `window.matchMedia`, which jsdom lacks. Add a setup file so primitive tests can render Blueprint components.

**Files:**
- Create: `test/setup.ts`
- Modify: `vitest.config.mts`

**Interfaces:**
- Produces: a globally-mocked `ResizeObserver` and `window.matchMedia` for all tests.

- [ ] **Step 1: Write the setup file**

```ts
// test/setup.ts
if (typeof window !== "undefined") {
  // @ts-expect-error jsdom lacks ResizeObserver
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // @ts-expect-error jsdom lacks matchMedia
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  });
}
```

- [ ] **Step 2: Wire it into vitest**

Modify `vitest.config.mts` — change the `test` block to:

```ts
  test: {
    environment: "jsdom",
    include: ["**/__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
  },
```

- [ ] **Step 3: Verify setup loads (no test failures from existing suite)**

Run: `npm test`
Expected: existing tests still pass (setup file runs without error).

- [ ] **Step 4: Commit**

```bash
git add test/setup.ts vitest.config.mts
git commit -m "test: add jsdom ResizeObserver/matchMedia setup for Blueprint"
```

---

### Task 3: Blueprint CSS, icon font, and provider wiring

**Files:**
- Create: `components/shell/BlueprintProvider.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: `<BlueprintProvider>` client component; Blueprint base CSS loaded globally before `globals.css`.

- [ ] **Step 1: Write a failing test that a Blueprint component renders its class**

Create `components/shell/__tests__/BlueprintProvider.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "@blueprintjs/core";
import { BlueprintProvider } from "@/components/shell/BlueprintProvider";

describe("BlueprintProvider", () => {
  afterEach(cleanup);

  it("renders Blueprint children", () => {
    render(
      <BlueprintProvider>
        <Button text="Hello" />
      </BlueprintProvider>,
    );
    expect(screen.getByText("Hello")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/shell/__tests__/BlueprintProvider.test.tsx`
Expected: FAIL — module `@/components/shell/BlueprintProvider` not found.

- [ ] **Step 3: Create the provider**

`components/shell/BlueprintProvider.tsx`:

```tsx
"use client";

import { BlueprintProvider as BPProvider } from "@blueprintjs/core";
import type { ReactNode } from "react";

export function BlueprintProvider({ children }: { children: ReactNode }) {
  return <BPProvider>{children}</BPProvider>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/shell/__tests__/BlueprintProvider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Import Blueprint CSS + mount provider in the root layout**

Modify `app/layout.tsx` imports (order matters — Blueprint base first, then project tokens, then existing CSS):

```tsx
import type { Metadata } from "next";
import "@blueprintjs/core/lib/css/blueprint.css";
import "./blueprint-tokens.css";
import "./globals.css";
import "./experiment-workspace.css";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: "Triton Board — Team Experiment Workspace",
  description: "Task-centered experiment context, evidence, comparison, and decisions.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <BlueprintProviderRoot>
          <AppShell>{children}</AppShell>
        </BlueprintProviderRoot>
      </body>
    </html>
  );
}
```

Add the provider import and a tiny wrapper alias at the top so the layout stays a Server Component while the provider is client:

```tsx
import { BlueprintProvider } from "@/components/shell/BlueprintProvider";
function BlueprintProviderRoot({ children }: { children: React.ReactNode }) {
  return <BlueprintProvider>{children}</BlueprintProvider>;
}
```

(Combine: keep one `BlueprintProvider` import and use it directly in JSX. `AppShell` is created in Task 5; to keep this task buildable, create a temporary `AppShell` placeholder now and replace it in Task 5.)

- [ ] **Step 6: Create temporary AppShell placeholder** (replaced in Task 5)

`components/shell/AppShell.tsx`:

```tsx
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
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: build succeeds; Blueprint CSS is bundled.

- [ ] **Step 8: Commit**

```bash
git add app/layout.tsx app/blueprint-tokens.css components/shell/BlueprintProvider.tsx components/shell/AppShell.tsx components/shell/__tests__/BlueprintProvider.test.tsx
git commit -m "feat: wire Blueprint provider and base CSS into root layout"
```

> Note: `app/blueprint-tokens.css` is created empty here (next to the import) and filled in Task 4. If Step 7 fails because the file is missing, create it empty first.

---

### Task 4: Semantic token layer (Light)

Alias project semantic tokens to Blueprint's `--bp-*` variables so the legacy hand-rolled CSS (which reads `--accent`, `--paper`, etc.) continues to render while we migrate. Light only.

**Files:**
- Modify: `app/blueprint-tokens.css`

**Interfaces:**
- Produces: `:root` tokens `--accent`, `--paper`, `--ink`, `--ink-soft`, `--line`, `--good`, `--warn`, `--crit`, `--todo`, `--ground`, `--mono`, `--sans` aliased to Blueprint vars.

- [ ] **Step 1: Write the token aliases**

`app/blueprint-tokens.css`:

```css
:root {
  --ground: var(--bp-typography-color-background, #f6f7f9);
  --paper: #ffffff;
  --ink: var(--bp-typography-color-text, #1c2127);
  --ink-soft: var(--bp-typography-color-text-muted, #5f6b7c);
  --line: rgba(92, 112, 128, 0.2);
  --line-strong: rgba(92, 112, 128, 0.45);
  --accent: var(--bp-typography-color-primary-rest, #2d72d2);
  --accent-hover: var(--bp-typography-color-primary-hover, #215db0);
  --accent-soft: rgba(45, 114, 210, 0.15);
  --found-bg: #edeff2;
  --todo: var(--bp-typography-color-text-disabled, #5f6b7c);
  --warn: var(--bp-intent-warning, #c87619);
  --good: var(--bp-intent-success, #238551);
  --crit: var(--bp-intent-danger, #cd4246);
  --mono: ui-monospace, "SFMono-Regular", "Cascadia Code", Consolas, monospace;
  --sans: var(--bp-typography-font-family, -apple-system, "Segoe UI", Roboto, sans-serif);
}
```

- [ ] **Step 2: Verify existing screens still render correctly**

Run: `npm run dev` (manual), open `/`, log in, and confirm the legacy board still looks unchanged (tokens resolve to the same values).
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/blueprint-tokens.css
git commit -m "feat: alias semantic tokens to Blueprint vars (light)"
```

---

### Task 5: AppShell with auth consolidation

Move the per-page `AuthGate` into a single layout-level `AppShell` that owns session state, the login form, and logout. Pages stop wrapping `<AuthGate>`.

**Files:**
- Create: `components/shell/__tests__/AppShell.test.tsx`
- Modify: `components/shell/AppShell.tsx`
- Modify: `app/page.tsx`, `app/task/[id]/page.tsx`, `app/analytics/page.tsx`, `app/experiments/page.tsx`, `app/experiments/[id]/page.tsx`, `app/experiments/compare/page.tsx`
- Delete (after pages stop using it): `components/AuthGate.tsx`

**Interfaces:**
- Consumes: `@/lib/supabase` → `{ supabase, isSupabaseConfigured }`; `@/lib/auth` → `{ TEAM_EMAIL }`.
- Produces: `<AppShell>{children}</AppShell>` — renders login form when unauthenticated, else `<SidebarNav/> + <main>{children}</main>`.

- [ ] **Step 1: Write failing tests for AppShell auth states**

`components/shell/__tests__/AppShell.test.tsx`:

```tsx
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/shell/AppShell";

const sessionState = vi.hoisted(() => ({ session: null as null | { user: { email: string } } }));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: sessionState.session } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(async ({ password }: { password: string }) =>
        password === "correct"
          ? { data: { session: { user: { email: "team@triton-board.app" } } }, error: null }
          : { data: { session: null }, error: { message: "bad" } },
      ),
      signOut: vi.fn(async () => ({})),
    },
  },
}));

describe("AppShell", () => {
  afterEach(() => {
    cleanup();
    sessionState.session = null;
  });

  it("shows the login form when there is no session", async () => {
    render(
      <AppShell>
        <div>secret content</div>
      </AppShell>,
    );
    await waitFor(() => expect(screen.getByText("Enter the team password")).toBeDefined());
    expect(screen.queryByText("secret content")).toBeNull();
  });

  it("renders children after a successful login", async () => {
    render(
      <AppShell>
        <div>secret content</div>
      </AppShell>,
    );
    await waitFor(() => expect(screen.getByPlaceholderText("Password")).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "correct" } });
    fireEvent.click(screen.getByRole("button", { name: /Unlock board/i }));
    await waitFor(() => expect(screen.getByText("secret content")).toBeDefined());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/shell/__tests__/AppShell.test.tsx`
Expected: FAIL — AppShell is still the placeholder (renders content without gating).

- [ ] **Step 3: Implement AppShell (port AuthGate logic + render SidebarNav)**

`components/shell/AppShell.tsx`:

```tsx
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
```

`SidebarNav` is created in Task 6; create a temporary stub now so this builds:

```tsx
// components/shell/SidebarNav.tsx (temporary stub; replaced Task 6)
"use client";
export function SidebarNav({ onLogout: _onLogout }: { onLogout: () => void }) {
  return <nav aria-label="Primary" />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/shell/__tests__/AppShell.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 5: Remove `<AuthGate>` from every page**

For each page, replace `<AuthGate><X/></AuthGate>` with `<X/>`. Example `app/page.tsx`:

```tsx
import Board from "@/components/Board";

export default function Home() {
  return <Board />;
}
```

Apply the same wrapper removal to:
- `app/task/[id]/page.tsx` → `<TaskDetail />`
- `app/analytics/page.tsx` → `<Analytics />`
- `app/experiments/page.tsx` → the experiments database component it renders
- `app/experiments/[id]/page.tsx` → the experiment detail component
- `app/experiments/compare/page.tsx` → the compare component

(Preserve each page's existing props/data logic; only drop the `AuthGate` import + wrapper.)

- [ ] **Step 6: Delete the old AuthGate**

```bash
git rm components/AuthGate.tsx
```

- [ ] **Step 7: Verify build + full suite**

Run: `npm run build && npm test`
Expected: build succeeds; all tests pass; app gates on login once (layout-level).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: consolidate auth into layout-level AppShell"
```

---

### Task 6: SidebarNav

Data-driven nav so later plans can add Templates / API keys entries. Active state via `usePathname`; nested routes mark their parent active.

**Files:**
- Modify: `components/shell/SidebarNav.tsx`
- Create: `components/shell/__tests__/SidebarNav.test.tsx`
- Delete: `components/Navbar.tsx`, `components/__tests__/Navbar.test.tsx`

**Interfaces:**
- Consumes: `onLogout: () => void` prop.
- Produces: `<SidebarNav onLogout={...} />`; nav items array `{ label, href, matchPrefix }`.

- [ ] **Step 1: Write failing tests** (port the existing Navbar active-state cases)

`components/shell/__tests__/SidebarNav.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarNav } from "@/components/shell/SidebarNav";

const pathnameState = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathnameState.value }));

const cases = [
  { pathname: "/", active: "Task Board" },
  { pathname: "/task/123", active: "Task Board" },
  { pathname: "/experiments", active: "Experiments" },
  { pathname: "/experiments/123", active: "Experiments" },
  { pathname: "/experiments/compare", active: "Compare" },
  { pathname: "/analytics", active: "Analytics" },
] as const;

describe("SidebarNav", () => {
  afterEach(cleanup);

  it("renders the brand and the workspace destinations", () => {
    render(<SidebarNav onLogout={vi.fn()} />);
    expect(screen.getByRole("link", { name: /Triton Board/ }).getAttribute("href")).toBe("/");
    for (const label of ["Task Board", "Experiments", "Compare", "Analytics"]) {
      expect(screen.getByRole("link", { name: label })).toBeDefined();
    }
    expect(screen.getByRole("button", { name: /Log out/i })).toBeDefined();
  });

  for (const { pathname, active } of cases) {
    it(`marks only ${active} active at ${pathname}`, () => {
      pathnameState.value = pathname;
      render(<SidebarNav onLogout={vi.fn()} />);
      const current = screen
        .getAllByRole("link")
        .filter((l) => l.getAttribute("aria-current") === "page");
      expect(current).toHaveLength(1);
      expect(current[0].textContent).toBe(active);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/shell/__tests__/SidebarNav.test.tsx`
Expected: FAIL (stub has no links).

- [ ] **Step 3: Implement SidebarNav**

`components/shell/SidebarNav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Icon } from "@blueprintjs/core";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  matchPrefix?: string[]; // nested routes that also mark this active
}

const NAV_ITEMS: NavItem[] = [
  { label: "Task Board", href: "/", icon: "grid-view", matchPrefix: ["/task"] },
  { label: "Experiments", href: "/experiments", icon: "lab-test", matchPrefix: ["/experiments/"] },
  { label: "Compare", href: "/experiments/compare", icon: "comparison" },
  { label: "Analytics", href: "/analytics", icon: "timeline-bar-chart" },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || (item.matchPrefix ?? []).some((p) => pathname.startsWith(p));
}

export function SidebarNav({ onLogout }: { onLogout: () => void }) {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="navbar" aria-label="Primary">
      <div className="navbar-inner">
        <Link href="/" className="brand">
          <span className="brand-logo">
            <Icon icon="flows" color="#fff" />
          </span>
          <span>
            <strong>Triton Board</strong>
            <small>Team workspace</small>
          </span>
        </Link>
        <div className="nav-section">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-btn${isActive(pathname, item) ? " active" : ""}`}
              aria-current={isActive(pathname, item) ? "page" : undefined}
            >
              <Icon icon={item.icon} /> {item.label}
            </Link>
          ))}
        </div>
        <div className="navbar-spacer" />
        <div className="live-badge" aria-label="Live">
          ● live
        </div>
        <Button minimal small icon="log-out" text="Log out" onClick={onLogout} />
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/shell/__tests__/SidebarNav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Delete the legacy Navbar + its test**

```bash
git rm components/Navbar.tsx components/__tests__/Navbar.test.tsx
```

- [ ] **Step 6: Verify build + full suite**

Run: `npm run build && npm test`
Expected: pass; no remaining imports of `@/components/Navbar`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: replace Navbar with Blueprint SidebarNav"
```

---

### Task 7: Button + IconButton primitives

**Files:**
- Create: `components/ui/Button.tsx`, `components/ui/__tests__/Button.test.tsx`

**Interfaces:**
- Produces: `<Button {...ButtonProps} />` and `<IconButton icon label {...ButtonProps} />` (thin `"use client"` wrappers over `@blueprintjs/core` `Button`).

- [ ] **Step 1: Write failing test**

```tsx
// components/ui/__tests__/Button.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button, IconButton } from "@/components/ui/Button";

describe("Button primitives", () => {
  afterEach(cleanup);

  it("renders a Blueprint button with text", () => {
    render(<Button text="Save" intent="primary" />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
  });

  it("IconButton exposes an accessible label", () => {
    render(<IconButton icon="trash" label="Delete task" />);
    expect(screen.getByRole("button", { name: "Delete task" })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/__tests__/Button.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/ui/Button.tsx
"use client";

import { Button as BPButton, type ButtonProps } from "@blueprintjs/core";

export function Button(props: ButtonProps) {
  return <BPButton {...props} />;
}

export function IconButton({
  icon,
  label,
  ...rest
}: { icon: ButtonProps["icon"]; label: string } & ButtonProps) {
  return <BPButton minimal small icon={icon} aria-label={label} {...rest} />;
}

export type { ButtonProps };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/__tests__/Button.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/Button.tsx components/ui/__tests__/Button.test.tsx
git commit -m "feat(ui): add Button and IconButton primitives"
```

---

### Task 8: Tag, StatusTag, StatusDot + status→intent maps

**Files:**
- Create: `components/ui/Tag.tsx`, `components/ui/__tests__/Tag.test.tsx`

**Interfaces:**
- Produces:
  - `taskStatusIntent(s: Status): Intent`
  - `experimentStatusIntent(s: ExperimentStatus): Intent`
  - `decisionIntent(d: DecisionOutcome): Intent`
  - `<StatusTag status intent>{label}</StatusTag>`, `<StatusDot status />`, `<Tag>{children}</Tag>`
  - `Status` / `ExperimentStatus` / `DecisionOutcome` imported from `@/lib/types`; `Intent` from `@blueprintjs/core`.

- [ ] **Step 1: Write failing test**

```tsx
// components/ui/__tests__/Tag.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusTag, StatusDot, decisionIntent } from "@/components/ui/Tag";

describe("Tag primitives", () => {
  afterEach(cleanup);

  it("StatusTag renders the label text", () => {
    render(<StatusTag intent="success">Done</StatusTag>);
    expect(screen.getByText("Done")).toBeDefined();
  });

  it("StatusDot renders an element with the status class", () => {
    const { container } = render(<StatusDot status="done" />);
    expect(container.querySelector(".dot.done")).not.toBeNull();
  });

  it("decisionIntent maps accepted to success", () => {
    expect(decisionIntent("accepted")).toBe("success");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/__tests__/Tag.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/ui/Tag.tsx
"use client";

import { Tag as BPTag, type Intent, type TagProps } from "@blueprintjs/core";
import type { ReactNode } from "react";
import type { Status, ExperimentStatus, DecisionOutcome } from "@/lib/types";

export function Tag({ children, ...rest }: { children: ReactNode } & TagProps) {
  return <BPTag {...rest}>{children}</BPTag>;
}

export function StatusTag({ intent, children }: { intent: Intent; children: ReactNode }) {
  return (
    <BPTag minimal intent={intent}>
      {children}
    </BPTag>
  );
}

const TASK_STATUS_CLASS: Record<Status, string> = {
  todo: "todo",
  in_progress: "in_progress",
  done: "done",
  blocked: "blocked",
};

export function StatusDot({ status }: { status: Status }) {
  return <span className={`dot ${TASK_STATUS_CLASS[status]}`} aria-hidden />;
}

export function taskStatusIntent(s: Status): Intent {
  return s === "in_progress"
    ? "primary"
    : s === "done"
      ? "success"
      : s === "blocked"
        ? "danger"
        : "none";
}

export function experimentStatusIntent(s: ExperimentStatus): Intent {
  switch (s) {
    case "running":
      return "primary";
    case "analyzing":
      return "warning";
    case "completed":
      return "success";
    case "blocked":
      return "danger";
    default:
      return "none";
  }
}

export function decisionIntent(d: DecisionOutcome): Intent {
  return d === "accepted"
    ? "success"
    : d === "rejected"
      ? "danger"
      : d === "inconclusive"
        ? "warning"
        : "none";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/__tests__/Tag.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/Tag.tsx components/ui/__tests__/Tag.test.tsx
git commit -m "feat(ui): add Tag/StatusTag/StatusDot and status intent maps"
```

---

### Task 9: PageHeader + Breadcrumbs

**Files:**
- Create: `components/ui/PageHeader.tsx`, `components/ui/__tests__/PageHeader.test.tsx`

**Interfaces:**
- Produces:
  - `<PageHeader eyebrow? title lede? actions?>` — renders eyebrow, `<h1>`, optional lede, optional actions slot.
  - `<Breadcrumbs items={{text, href}[]} />` — wraps Blueprint `Breadcrumbs`.

- [ ] **Step 1: Write failing test**

```tsx
// components/ui/__tests__/PageHeader.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeader, Breadcrumbs } from "@/components/ui/PageHeader";

describe("PageHeader", () => {
  afterEach(cleanup);

  it("renders eyebrow, title, lede, and actions", () => {
    render(
      <PageHeader eyebrow="Research database" title="Experiments" lede="All runs" actions={<button>new</button>} />,
    );
    expect(screen.getByText("Research database")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Experiments", level: 1 })).toBeDefined();
    expect(screen.getByText("All runs")).toBeDefined();
    expect(screen.getByRole("button", { name: "new" })).toBeDefined();
  });

  it("Breadcrumbs renders links in order", () => {
    render(<Breadcrumbs items={[{ text: "Board", href: "/" }, { text: "Task", href: "/task/1" }]} />);
    expect(screen.getByRole("link", { name: "Board" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Task" }).getAttribute("href")).toBe("/task/1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/__tests__/PageHeader.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/ui/PageHeader.tsx
"use client";

import { Breadcrumbs as BPBreadcrumbs, type BreadcrumbProps } from "@blueprintjs/core";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: string;
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <div className="page-header-row">
        <h1>{title}</h1>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
      {lede && <p className="lede">{lede}</p>}
    </header>
  );
}

export function Breadcrumbs({ items }: { items: BreadcrumbProps[] }) {
  return <BPBreadcrumbs items={items} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/__tests__/PageHeader.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/PageHeader.tsx components/ui/__tests__/PageHeader.test.tsx
git commit -m "feat(ui): add PageHeader and Breadcrumbs"
```

---

### Task 10: Toolbar building blocks

**Files:**
- Create: `components/ui/Toolbar.tsx`, `components/ui/__tests__/Toolbar.test.tsx`

**Interfaces:**
- Produces:
  - `<Toolbar>{children}</Toolbar>` — flex row container.
  - `<SearchInput value onChange placeholder />` — Blueprint `InputGroup` with left search icon.
  - `<ToolbarSelect value onChange options />` (options: `{label, value}[]`).
  - `<ToolbarSegmentedControl value onChange options />`.

- [ ] **Step 1: Write failing test**

```tsx
// components/ui/__tests__/Toolbar.test.tsx
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toolbar, SearchInput, ToolbarSegmentedControl } from "@/components/ui/Toolbar";

describe("Toolbar primitives", () => {
  afterEach(cleanup);

  it("SearchInput calls onChange", () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} placeholder="Search" />);
    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("abc");
  });

  it("ToolbarSegmentedControl renders the options and selects one", () => {
    const onChange = vi.fn();
    render(
      <ToolbarSegmentedControl
        value="all"
        onChange={onChange}
        options={[
          { label: "All", value: "all" },
          { label: "Running", value: "running" },
        ]}
      />,
    );
    fireEvent.click(screen.getByText("Running"));
    expect(onChange).toHaveBeenCalledWith("running");
  });

  it("Toolbar renders children", () => {
    render(
      <Toolbar>
        <span>x</span>
      </Toolbar>,
    );
    expect(screen.getByText("x")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/__tests__/Toolbar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/ui/Toolbar.tsx
"use client";

import { InputGroup, HTMLSelect, SegmentedControl } from "@blueprintjs/core";
import type { ReactNode } from "react";

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <InputGroup
      leftIcon="search"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function ToolbarSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <HTMLSelect value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </HTMLSelect>
  );
}

export function ToolbarSegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <SegmentedControl
      value={value}
      onChange={(v) => onChange(v as string)}
      options={options.map((o) => ({ label: o.label, value: o.value }))}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/__tests__/Toolbar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/Toolbar.tsx components/ui/__tests__/Toolbar.test.tsx
git commit -m "feat(ui): add Toolbar, SearchInput, ToolbarSelect, SegmentedControl"
```

---

### Task 11: Card, Callout, ProgressBar

**Files:**
- Create: `components/ui/Card.tsx`, `components/ui/__tests__/Card.test.tsx`

**Interfaces:**
- Produces: `<Card title? children actions?>`, `<Callout intent? title? children>`, `<ProgressBar value?>` (value undefined → indeterminate).

- [ ] **Step 1: Write failing test**

```tsx
// components/ui/__tests__/Card.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Card, Callout, ProgressBar } from "@/components/ui/Card";

describe("Card primitives", () => {
  afterEach(cleanup);

  it("Card renders title and children", () => {
    render(
      <Card title="Metrics">
        <p>body</p>
      </Card>,
    );
    expect(screen.getByText("Metrics")).toBeDefined();
    expect(screen.getByText("body")).toBeDefined();
  });

  it("Callout renders intent title", () => {
    render(
      <Callout intent="warning" title="Heads up">
        be careful
      </Callout>,
    );
    expect(screen.getByText("Heads up")).toBeDefined();
  });

  it("ProgressBar renders a progressbar role", () => {
    render(<ProgressBar value={0.5} />);
    expect(screen.getByRole("progressbar")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/__tests__/Card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/ui/Card.tsx
"use client";

import { Card as BPCard, Callout as CPCallout, ProgressBar as BPProgressBar, type Intent } from "@blueprintjs/core";
import type { ReactNode } from "react";

export function Card({
  title,
  children,
  actions,
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <BPCard>
      {(title || actions) && (
        <div className="card-head">
          {title && <div className="card-title">{title}</div>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </BPCard>
  );
}

export function Callout({
  intent,
  title,
  children,
}: {
  intent?: Intent;
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <CPCallout intent={intent} title={title}>
      {children}
    </CPCallout>
  );
}

export function ProgressBar({ value }: { value?: number }) {
  return <BPProgressBar value={value} intent="primary" />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/__tests__/Card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/Card.tsx components/ui/__tests__/Card.test.tsx
git commit -m "feat(ui): add Card, Callout, ProgressBar"
```

---

### Task 12: DataTable

Generic table used by the Experiments database (Plan 3) and Analytics (Plan 5). Sticky header, optional row selection, optional sticky identity columns are configured by callers via props/columns.

**Files:**
- Create: `components/ui/DataTable.tsx`, `components/ui/__tests__/DataTable.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface DataTableColumn<T> {
    key: string;
    header: ReactNode;
    cell: (row: T) => ReactNode;
    sticky?: boolean;       // sticky left identity column
    className?: string;
  }
  function DataTable<T>({
    rows, columns, getRowId, selectable, selectedIds, onToggleRow,
    stickyHeader = true,
  }: {...}): JSX.Element
  ```

- [ ] **Step 1: Write failing test**

```tsx
// components/ui/__tests__/DataTable.test.tsx
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

interface Row {
  id: string;
  name: string;
}

const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "Name", cell: (r) => r.name },
];

describe("DataTable", () => {
  afterEach(cleanup);

  it("renders headers and rows", () => {
    render(<DataTable rows={[{ id: "1", name: "Alpha" }]} columns={columns} getRowId={(r) => r.id} />);
    expect(screen.getByText("Name")).toBeDefined();
    expect(screen.getByText("Alpha")).toBeDefined();
  });

  it("renders a checkbox per row when selectable and toggles selection", () => {
    const onToggle = vi.fn();
    render(
      <DataTable
        rows={[{ id: "1", name: "Alpha" }]}
        columns={columns}
        getRowId={(r) => r.id}
        selectable
        selectedIds={[]}
        onToggleRow={onToggle}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(onToggle).toHaveBeenCalledWith("1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/__tests__/DataTable.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/ui/DataTable.tsx
"use client";

import { Checkbox, HTMLTable } from "@blueprintjs/core";
import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sticky?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  selectable?: boolean;
  selectedIds?: string[];
  onToggleRow?: (id: string) => void;
  stickyHeader?: boolean;
}

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  selectable,
  selectedIds = [],
  onToggleRow,
  stickyHeader = true,
}: DataTableProps<T>) {
  return (
    <div className="table-scroll">
      <HTMLTable interactive={false} className={stickyHeader ? "sticky-head" : undefined}>
        <thead>
          <tr>
            {selectable && <th>{" "}</th>}
            {columns.map((c) => (
              <th key={c.key} className={c.sticky ? "sticky-col" : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = getRowId(row);
            const checked = selectedIds.includes(id);
            return (
              <tr key={id} className={checked ? "row-selected" : undefined}>
                {selectable && (
                  <td>
                    <Checkbox checked={checked} onChange={() => onToggleRow?.(id)} />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={[c.sticky ? "sticky-col" : "", c.className ?? ""].join(" ").trim()}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </HTMLTable>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/__tests__/DataTable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/DataTable.tsx components/ui/__tests__/DataTable.test.tsx
git commit -m "feat(ui): add DataTable with selection and sticky support"
```

---

### Task 13: Overlay primitives — Drawer, Dialog, Tooltip

**Files:**
- Create: `components/ui/Overlay.tsx`, `components/ui/__tests__/Overlay.test.tsx`

**Interfaces:**
- Produces:
  - `<Drawer isOpen title onClose size? children footer?>`
  - `<Dialog isOpen title onClose children footer?>`
  - `<Tooltip content><child/></Tooltip>` (wrap Blueprint `Tooltip` + `Tooltip2` if needed).

- [ ] **Step 1: Write failing test**

```tsx
// components/ui/__tests__/Overlay.test.tsx
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Drawer, Dialog } from "@/components/ui/Overlay";

describe("Overlay primitives", () => {
  afterEach(cleanup);

  it("Drawer renders title and calls onClose on its button", () => {
    const onClose = vi.fn();
    render(
      <Drawer isOpen title="Edit" onClose={onClose}>
        body
      </Drawer>,
    );
    expect(screen.getByText("Edit")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Dialog is closed when isOpen is false", () => {
    render(
      <Dialog isOpen={false} title="X" onClose={vi.fn()}>
        hidden
      </Dialog>,
    );
    expect(screen.queryByText("hidden")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/__tests__/Overlay.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/ui/Overlay.tsx
"use client";

import { Dialog as BPDialog, Drawer as BPDrawer, Tooltip as BPTooltip } from "@blueprintjs/core";
import type { ReactNode } from "react";

export function Drawer({
  isOpen,
  title,
  onClose,
  children,
  footer,
}: {
  isOpen: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <BPDrawer isOpen={isOpen} onClose={onClose} title={title} size="35%">
      <div className="drawer-body">{children}</div>
      {footer && <div className="drawer-footer">{footer}</div>}
    </BPDrawer>
  );
}

export function Dialog({
  isOpen,
  title,
  onClose,
  children,
  footer,
}: {
  isOpen: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <BPDialog isOpen={isOpen} onClose={onClose} title={title}>
      {children}
      {footer && <div className="dialog-footer">{footer}</div>}
    </BPDialog>
  );
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return <BPTooltip content={content}>{children}</BPTooltip>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/__tests__/Overlay.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/Overlay.tsx components/ui/__tests__/Overlay.test.tsx
git commit -m "feat(ui): add Drawer, Dialog, Tooltip overlays"
```

---

### Task 14: Feedback family — Skeleton, EmptyState, ErrorBanner, SaveBar

**Files:**
- Create: `components/ui/Feedback.tsx`, `components/ui/__tests__/Feedback.test.tsx`

**Interfaces:**
- Produces:
  - `<Skeleton lines? />`
  - `<EmptyState title action? />`
  - `<ErrorBanner message onRetry? />`
  - `<SaveBar state="saved"|"unsaved"|"conflict" onSave? onDiscard? />`

- [ ] **Step 1: Write failing test**

```tsx
// components/ui/__tests__/Feedback.test.tsx
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorBanner, SaveBar } from "@/components/ui/Feedback";

describe("Feedback primitives", () => {
  afterEach(cleanup);

  it("EmptyState renders title and action", () => {
    render(<EmptyState title="No experiments" action={<button>Add</button>} />);
    expect(screen.getByText("No experiments")).toBeDefined();
    expect(screen.getByRole("button", { name: "Add" })).toBeDefined();
  });

  it("ErrorBanner calls onRetry", () => {
    const onRetry = vi.fn();
    render(<ErrorBanner message="Failed to load" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("SaveBar shows unsaved state with Save", () => {
    const onSave = vi.fn();
    render(<SaveBar state="unsaved" onSave={onSave} onDiscard={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/__tests__/Feedback.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/ui/Feedback.tsx
"use client";

import { NonIdealState, Callout, Button, Card, Skeleton as BPSkeleton } from "@blueprintjs/core";
import type { ReactNode } from "react";

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div>
      {Array.from({ length: lines }).map((_, i) => (
        <BPSkeleton key={i} />
      ))}
    </div>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return <NonIdealState title={title} action={action} />;
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Callout intent="danger" title="Something went wrong">
      <p>{message}</p>
      {onRetry && (
        <Button small intent="primary" text="Retry" onClick={onRetry} />
      )}
    </Callout>
  );
}

export type SaveState = "saved" | "unsaved" | "conflict";

export function SaveBar({
  state,
  onSave,
  onDiscard,
}: {
  state: SaveState;
  onSave?: () => void;
  onDiscard?: () => void;
}) {
  const label =
    state === "unsaved" ? "Unsaved changes" : state === "conflict" ? "Remote conflict — load latest" : "All changes saved";
  return (
    <Card className="save-bar">
      <span className="save-state">{label}</span>
      <div>
        {state !== "saved" && onDiscard && (
          <Button small text="Discard" onClick={onDiscard} />
        )}
        {state === "unsaved" && onSave && (
          <Button small intent="primary" text="Save" onClick={onSave} />
        )}
        {state === "conflict" && onDiscard && (
          <Button small intent="primary" text="Load latest" onClick={onDiscard} />
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/__tests__/Feedback.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/Feedback.tsx components/ui/__tests__/Feedback.test.tsx
git commit -m "feat(ui): add Skeleton, EmptyState, ErrorBanner, SaveBar"
```

---

### Task 15: ui barrel, dead-code guard, final verification

**Files:**
- Create: `components/ui/index.ts`
- Modify: none (verification only)

**Interfaces:**
- Produces: `components/ui/index.ts` barrel (`"use client"`) re-exporting all primitives, so screens import from `@/components/ui`.

- [ ] **Step 1: Create the barrel**

```ts
// components/ui/index.ts
"use client";

export * from "./Button";
export * from "./Tag";
export * from "./PageHeader";
export * from "./Toolbar";
export * from "./Card";
export * from "./DataTable";
export * from "./Overlay";
export * from "./Feedback";
```

- [ ] **Step 2: Verify the whole app builds and all tests pass**

Run: `npm run build && npm test`
Expected: build succeeds; full suite green.

- [ ] **Step 3: Verify no stale references to removed modules**

Run: `grep -RIn "components/Navbar\|components/AuthGate" app components lib` (expect no matches except possibly this plan/spec docs).

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`; log in; visit `/`, `/experiments`, `/experiments/compare`, `/analytics`, and a task detail. Confirm: the new Blueprint sidebar renders with correct active states; every existing screen still works (realtime, create/edit); no console errors. Existing page *content* is intentionally still legacy-styled — only chrome changed.

- [ ] **Step 5: Commit**

```bash
git add components/ui/index.ts
git commit -m "feat(ui): add primitives barrel and finalize foundation"
```

---

## Self-Review (run after writing — already applied)

- **Spec coverage (spec §7.3 primitives table):** Button/IconButton ✓, Tag/StatusTag/StatusDot ✓, PageHeader/Breadcrumbs ✓, Toolbar (Search/Select/Segmented) ✓, Card/Callout/ProgressBar ✓, DataTable ✓, Drawer/Dialog ✓, FieldTables/ValueEditor/MarkdownField → deferred to Plan 4 (record edit); Skeleton/Empty/ErrorBanner/SaveBar ✓. AppShell/SidebarNav ✓ (§7). PromotionChecklist → Plan 3 (depends on policy.ts UI).
- **Placeholder scan:** none; every code step has real code.
- **Type consistency:** `Status`/`ExperimentStatus`/`DecisionOutcome` from `@/lib/types`; `Intent`/`ButtonProps`/`BreadcrumbProps`/`TagProps` from `@blueprintjs/core`; `DataTableColumn<T>` consistent across definition + tests; `SaveState = "saved"|"unsaved"|"conflict"`.
- **Known follow-ups for later plans:** add Templates + API keys entries to `NAV_ITEMS` (Plans 4/6); retire `globals.css`/`experiment-workspace.css` rules per-screen (Plans 2–5).

## Deferred follow-ups (from Plan 1 final review — carry into later plans)

These are non-blocking items the final whole-branch review surfaced; each has a clear trigger in a later plan:

- **`*-soft` token aliases (Plan 2–5):** `app/blueprint-tokens.css` omits `--warn-soft`/`--good-soft`/`--crit-soft`/`--todo-soft`. Dormant now (`globals.css :root` still defines them and wins). When a later plan strips `globals.css`'s `:root`, it MUST add these aliases or `.pill.*`/`.dot.*`/soft-background rules lose their colors.
- **`SaveBar` conflict state (Plan 3):** `components/ui/Feedback.tsx` `SaveBar` renders both a "Discard" and a "Load latest" button in the `conflict` state, both bound to `onDiscard`. Add an `onLoadLatest?: () => void` prop and bind "Load latest" to it when Plan 3 consumes SaveBar for experiment-detail conflict handling.
- **Dead `.logout-btn` CSS + test (Plan 2–5):** logout moved into `SidebarNav` (Blueprint `Button`), so the `.logout-btn` rules in `globals.css` and the `.logout-btn` assertion in `app/__tests__/workspace-styles.test.ts` are dead. Retire them alongside the per-screen `globals.css` cleanup.
- **Optional — `experimentStatusIntent` named cases:** `components/ui/Tag.tsx` falls through to `default: "none"` for `planned`/`cancelled`. Add named cases if/when those statuses get distinct UI meaning.
