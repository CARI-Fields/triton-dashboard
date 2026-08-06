# Blueprint Migration — Plan 1: Foundation Plumbing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load the real Palantir Blueprint design system into current `main` and bridge its light/dark theme to Blueprint — without changing any screen's UI yet. This is the plumbing on which Plan 2 (Blueprint-backed primitives) and Plans 3–7 (per-domain reskin) build.

**Architecture:** Install `@blueprintjs/core@6`; import its base CSS and mount a client `BlueprintProvider` inside `main`'s existing `ThemeProvider`; extend `ThemeProvider` + the layout's no-flash script so `theme==="dark"` also applies Blueprint's `bp6-dark` class to `<html>`; add a minimal token file that switches the app to Blueprint's font stack. Existing custom-CSS screens stay visually as-is (palette migration happens per-domain later).

**Tech Stack:** Next.js 16 (App Router), React 19, `@blueprintjs/core@6` (+ `@blueprintjs/icons`, `@blueprintjs/select`), Supabase, Vitest + @testing-library/react + jsdom.

## Plan sequence (this is Plan 1 of the Blueprint migration)

- **Plan 1 (this)** — foundation plumbing.
- **Plan 2** — re-back `main`'s `components/ui/*` primitives with Blueprint in-place (Icons, Tag, StatusDot, Drawer, ActivityDrawer, WorkspaceSkeleton, …).
- **Plan 3** — App shell + nav + ThemeToggle. · **Plan 4** Task domain · **Plan 5** Experiments · **Plan 6** Compare + Analytics · **Plan 7** Templates + API keys.

## Global Constraints

- **Workspace:** work in the worktree `/home/yubaifeng/e84381970/projects/tb-blueprint-migration` on branch `feat/blueprint-migration` (forked from `main` @ `a2fd39c`). Do NOT work in the sibling `triton-board` checkout (it holds a discarded experiment).
- **Node:** default `node` is v18, rejected by Next 16/Vitest 4. Before any build/test: `. "$HOME/.config/nvm/nvm.sh" && nvm use 24` (v24.18.0). Note the command in every report.
- **Next 16 first:** read `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` before CSS/layout code (external node_modules CSS imports in the root layout; order = import order).
- **No screen changes:** this plan is plumbing only. Do not reskin any screen or retire `globals.css` rules. Existing screens must keep working, light and dark.
- **No flash:** dark mode (`bp6-dark`) must be applied before first paint (layout inline script) and on toggle (`ThemeProvider.applyTheme`).
- **Commits:** conventional-commits style; append trailer `Co-Authored-By: Claude <noreply@anthropic.com>`. Stage files explicitly (never `git add -A` — there are untracked files about). Commit after each task.
- **Test baseline:** `npm test` scans a stray `.worktrees/` dir → ~12 pre-existing failures there are NOISE; ignore them. Your change must add zero new failures.
- **Verify before claiming done:** `npm run build` + `npm test` (node 24) before marking any task complete.

## File Structure

Created:
- `components/shell/BlueprintProvider.tsx` — client wrapper over `@blueprintjs/core` `BlueprintProvider`.
- `app/blueprint-tokens.css` — imported after `globals.css`; switches fonts to Blueprint stack (and is where later per-domain token remaps land).
- `test/setup.ts` — jsdom `ResizeObserver`/`matchMedia` mocks.
- `components/shell/__tests__/BlueprintProvider.test.tsx`, `components/theme/__tests__/ThemeProvider.bridge.test.tsx` — tests.

Modified:
- `package.json`, `package-lock.json` — add Blueprint deps.
- `app/layout.tsx` — import Blueprint CSS + `BlueprintProvider`; add `bp6-dark` to the no-flash theme script.
- `components/theme/ThemeProvider.tsx` — `applyTheme` toggles `bp6-dark`.
- `vitest.config.mts` — add `test.setupFiles`.

---

### Task 1: Install Blueprint packages

**Files:** Modify `package.json`, `package-lock.json`.
**Interfaces:** Produces installed `@blueprintjs/core@^6`, `@blueprintjs/icons@^6`, `@blueprintjs/select@^6`.

- [ ] **Step 1: Populate node_modules in the worktree**

Run: `cd /home/yubaifeng/e84381970/projects/tb-blueprint-migration && . "$HOME/.config/nvm/nvm.sh" && nvm use 24 && npm install`
Expected: clean install (first time in this worktree).

- [ ] **Step 2: Read the Next 16 CSS guide** (AGENTS.md mandate)

Read `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`; note external-package CSS import rule.

- [ ] **Step 3: Install the Blueprint packages**

Run: `npm install @blueprintjs/core@^6 @blueprintjs/icons@^6 @blueprintjs/select@^6`
Expected: 6.x versions installed; peer `react/react-dom 18||19` satisfied (project is 19.2.4).

- [ ] **Step 4: Verify versions + build**

Run: `node -e "console.log(require('@blueprintjs/core/package.json').version, require('react/package.json').version)"` then `npm run build`
Expected: a `6.x.x` Blueprint version, `19.2.4` React; build succeeds (packages installed, not yet imported).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @blueprintjs core/icons/select

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: jsdom test setup for Blueprint

**Files:** Create `test/setup.ts`; modify `vitest.config.mts`.
**Interfaces:** Produces a global `ResizeObserver` + `window.matchMedia` mock for all tests.

- [ ] **Step 1: Write the setup file**

```ts
// test/setup.ts
if (typeof window !== "undefined") {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error jsdom does not implement ResizeObserver
  window.ResizeObserver = ResizeObserverMock;
  // @ts-expect-error jsdom does not implement matchMedia
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

- [ ] **Step 2: Wire `setupFiles` into vitest**

In `vitest.config.mts`, change the `test` block to:

```ts
  test: {
    environment: "jsdom",
    include: ["**/__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
  },
```

(Keep existing `plugins`, `resolve.alias`.)

- [ ] **Step 3: Verify existing suite still passes with the setup loaded**

Run: `. "$HOME/.config/nvm/nvm.sh" && nvm use 24 && npm test`
Expected: same pass/fail counts as baseline (the only failures remain under `.worktrees/`); setup file loads without error.

- [ ] **Step 4: Commit**

```bash
git add test/setup.ts vitest.config.mts
git commit -m "test: add jsdom ResizeObserver/matchMedia setup for Blueprint

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Blueprint base CSS + BlueprintProvider in the root layout

**Files:** Create `components/shell/BlueprintProvider.tsx`; modify `app/layout.tsx`.
**Interfaces:** Produces `<BlueprintProvider>` (client) mounted inside `ThemeProvider`, Blueprint base CSS imported before `globals.css`.

- [ ] **Step 1: Write a failing test that a Blueprint child renders inside the provider**

`components/shell/__tests__/BlueprintProvider.test.tsx`:

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

- [ ] **Step 5: Import Blueprint CSS + mount provider in the layout**

Modify `app/layout.tsx`:
- Add imports (order matters — Blueprint base CSS before project CSS):

```tsx
import "@blueprintjs/core/lib/css/blueprint.css";
import "./globals.css";
import "./experiment-workspace.css";
import "./blueprint-tokens.css";
import { BlueprintProvider } from "@/components/shell/BlueprintProvider";
```

- Wrap the children inside `ThemeProvider` with `<BlueprintProvider>`:

```tsx
        <ThemeProvider>
          <BlueprintProvider>
            <AuthGate>
              <div className="app-shell">
                <Navbar />
                <main className="app-content">{children}</main>
              </div>
            </AuthGate>
          </BlueprintProvider>
        </ThemeProvider>
```

(Create `app/blueprint-tokens.css` empty now — a single comment line — so the import resolves; Task 5 fills it.)

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds; Blueprint CSS bundled.

- [ ] **Step 7: Commit**

```bash
git add app/layout.tsx app/blueprint-tokens.css components/shell/BlueprintProvider.tsx components/shell/__tests__/BlueprintProvider.test.tsx
git commit -m "feat: mount Blueprint provider and base CSS in root layout

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Theme bridge — `bp6-dark` on dark

Blueprint v6 renders dark when an ancestor carries the `bp6-dark` class (`Classes.DARK`). Bridge `main`'s theme to it: both in the layout's no-flash inline script and in `ThemeProvider.applyTheme`.

**Files:** Modify `app/layout.tsx` (theme script), `components/theme/ThemeProvider.tsx`; create `components/theme/__tests__/ThemeProvider.bridge.test.tsx`.
**Interfaces:** Produces: `theme==="dark"` ⇒ `<html>` has class `bp6-dark`; `theme==="light"` ⇒ it does not.

- [ ] **Step 1: Write a failing test for the bridge**

`components/theme/__tests__/ThemeProvider.bridge.test.tsx`:

```tsx
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ThemeProvider, { useTheme } from "@/components/theme/ThemeProvider";

function Toggle() {
  const { setTheme } = useTheme();
  return (
    <>
      <button onClick={() => setTheme("dark")}>dark</button>
      <button onClick={() => setTheme("light")}>light</button>
    </>
  );
}

describe("ThemeProvider bp6-dark bridge", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("bp6-dark");
    delete (document.documentElement.dataset as Record<string, string | undefined>).theme;
  });

  it("adds bp6-dark for dark and removes it for light", () => {
    const { getByText } = render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    );
    act(() => getByText("dark").click());
    expect(document.documentElement.classList.contains("bp6-dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => getByText("light").click());
    expect(document.documentElement.classList.contains("bp6-dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/theme/__tests__/ThemeProvider.bridge.test.tsx`
Expected: FAIL — `bp6-dark` not toggled.

- [ ] **Step 3: Extend `applyTheme` in `ThemeProvider.tsx`**

In `applyTheme(theme, persist)`, after the existing `dataset.theme` + `colorScheme` lines, add:

```ts
  document.documentElement.classList.toggle("bp6-dark", theme === "dark");
```

- [ ] **Step 4: Update the no-flash inline script in `app/layout.tsx`**

In `themeScript`, after the line that sets `document.documentElement.style.colorScheme = theme;`, add:

```js
    document.documentElement.classList.toggle("bp6-dark", theme === "dark");
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run components/theme/__tests__/ThemeProvider.bridge.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add app/layout.tsx components/theme/ThemeProvider.tsx components/theme/__tests__/ThemeProvider.bridge.test.tsx
git commit -m "feat: bridge light/dark theme to Blueprint bp6-dark

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Font bridge — switch to Blueprint font stack

Switch the app from IBM Plex to Blueprint's font stack (system fonts) by overriding the CSS font variables, without editing `globals.css`. Imported after `globals.css` so it wins.

**Files:** Modify `app/blueprint-tokens.css`.

- [ ] **Step 1: Write the token overrides**

`app/blueprint-tokens.css`:

```css
/*
 * Blueprint migration token layer.
 * Imported AFTER globals.css so these override main's tokens at equal specificity.
 * Plan 1: switch fonts to the Blueprint stack (retire IBM Plex visually).
 * Later plans add per-domain palette remaps here as screens migrate to Blueprint.
 */

:root,
[data-theme="dark"] {
  --font-ibm-plex-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  --font-ibm-plex-mono: ui-monospace, "SFMono-Regular", "Cascadia Code", Consolas,
    monospace;
  --sans: var(--font-ibm-plex-sans);
  --mono: var(--font-ibm-plex-mono);
}
```

(`globals.css` derives `--sans`/`--mono` from the `--font-ibm-plex-*` vars; overriding the source vars flips the whole app to Blueprint fonts. The `next/font` IBM Plex files still load but are unused — removal is a later cleanup, out of scope here.)

- [ ] **Step 2: Verify build + that screens still render**

Run: `npm run build`
Expected: build succeeds. (Visual font change is expected and intended; do not modify `globals.css`.)

- [ ] **Step 3: Commit**

```bash
git add app/blueprint-tokens.css
git commit -m "feat: switch font stack to Blueprint via token bridge

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Whole-app build + full suite**

Run: `. "$HOME/.config/nvm/nvm.sh" && nvm use 24 && npm run build && npm test`
Expected: build succeeds; full suite has zero NEW failures beyond the pre-existing `.worktrees/` noise; the new tests (BlueprintProvider, ThemeProvider bridge) pass.

- [ ] **Step 2: No stale/duplicate provider wiring**

Run: `grep -RIn "BlueprintProvider\|bp6-dark\|blueprint-tokens" app components` — confirm BlueprintProvider mounted once in layout, bp6-dark toggled in exactly two places (layout script + applyTheme), tokens imported once.

- [ ] **Step 3: Reasoned smoke (no interactive login available)**

Confirm in the report: layout imports `blueprint.css` before project CSS; `BlueprintProvider` sits inside `ThemeProvider`; `applyTheme` + the no-flash script both toggle `bp6-dark`; fonts resolve to the Blueprint stack. Existing screens are intentionally still custom-CSS-styled (reskin starts in Plan 2+).

- [ ] **Step 4: Commit (if any final tidy) otherwise report)**

If Steps 1–2 needed no changes, no commit — just report.

---

## Self-Review

- **Spec coverage:** install + provider + CSS (§4.1) ✓; theme bridge to `bp6-dark` (§2.1/§4.2) ✓; font switch to Blueprint stack (§2.3/§4.3) ✓; jsdom setup (§4.5) ✓. Palette remap of `main` tokens → Blueprint is deliberately deferred to per-domain plans (unmigrated screens keep main palette during transition; user accepted mixed interim). Primitive re-backing (§4.4) is Plan 2.
- **Placeholder scan:** none; every code step has real code.
- **Type/consistency:** `bp6-dark` used consistently; `BlueprintProvider` named export consistent across file + test + layout; token var names (`--font-ibm-plex-sans/mono`, `--sans`, `--mono`) match `main`'s `globals.css`.
- **Main-specific risks flagged:** `next/font` IBM Plex still loaded but unused (cleanup later); token file must import AFTER `globals.css` to override (enforced by layout import order in Task 3).
