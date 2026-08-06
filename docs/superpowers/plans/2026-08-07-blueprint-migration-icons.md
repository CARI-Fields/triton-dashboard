# Blueprint Migration — Plan 2: Re-back Icons with Blueprint

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Replace `main`'s custom inline-SVG `Icon` component with the real Blueprint `Icon`, app-wide, **keeping the exact same `IconName` union and `Icon({ name, size })` API** so all 10 consumers are unchanged. This is the one clean, high-frequency, look-neutral primitive swap; other primitives migrate within their domain plans.

## Scope refinement (important — read first)

The spec (§4.4) listed "re-back all `components/ui/*` primitives" under Plan 2. On inspection, `main`'s primitives split into two groups:

- **Clean Blueprint swap (this plan):** `Icons` — a custom inline-SVG component consumed by 10 files (nav, ThemeToggle, Tag remove button, ActivityDrawer close, dialogs, etc.). Blueprint's `Icon` is a direct, look-neutral replacement (both are line icons).
- **Custom compositions with no clean Blueprint equivalent (deferred to domain plans 3–7):** `Tag` (6-tone hash palette — Blueprint `Tag` has only 4 intents), `WorkspaceSkeleton` (structured board/table/record/analytics variants — Blueprint has only shimmer bars), `OwnerAvatar` (initials avatar — no Blueprint equivalent), `ActivityDrawer`/`Drawer` (custom focus-restore logic), `PageHeader` (thin CSS wrapper). Re-backing these blindly would *downgrade* them. They get restyled/replaced in the domain plan that owns their consuming screen. Likewise, **new** Blueprint primitives the domains need (`Button`, `Card`, `InputGroup`, `HTMLTable`, `Callout`, `SegmentedControl`, `Breadcrumbs`, `Tooltip`, `Dialog`, `Drawer`) are introduced by each domain plan as it consumes them (YAGNI), not stockpiled here.

If you want the big shared-library Plan 2 instead, say so before execution.

**Architecture:** `components/ui/Icons.tsx` keeps its public surface (`export type IconName` union, `export function Icon({name, size})`) but the body renders `@blueprintjs/icons`'s `Icon` via a fixed `IconName → BlueprintIconName` map. The inline `ICON_PATHS` SVG map is deleted. Blueprint's React `Icon` renders inline SVG paths (no icon-font CSS needed).

**Tech Stack:** Next 16, React 19, `@blueprintjs/icons@6` (installed in Plan 1), Vitest + @testing-library/react + jsdom.

## Global Constraints

- **Workspace:** worktree `/home/yubaifeng/e84381970/projects/tb-blueprint-migration`, branch `feat/blueprint-migration` (built on Plan 1). Work ONLY here.
- **Node:** `. "$HOME/.config/nvm/nvm.sh" && nvm use 24` (v24.18.0) before build/test.
- **No API change:** the `IconName` union values and the `Icon({ name, size }: { name: IconName; size?: number })` signature stay identical. Consumers must not need edits. (The default `size` and any `className`/`aria-` passthrough main's `Icon` currently supports must be preserved — read the full current `Icons.tsx` first and keep the same props.)
- **No screen changes:** do not edit consumers; only `components/ui/Icons.tsx` (+ its test).
- **Commits:** conventional style + trailer `Co-Authored-By: Claude <noreply@anthropic.com>`; stage explicitly (no `git add -A`).
- **Test baseline:** this worktree's suite is clean (~816 tests). Add zero new failures.
- **Verify before done:** `npm run build && npm test`.

## File Structure

Modified:
- `components/ui/Icons.tsx` — replace inline-SVG implementation with a Blueprint `Icon` + name map; keep `IconName` + `Icon` API.
- `components/ui/__tests__/Icons.test.tsx` (create if absent) — assert every `IconName` renders a Blueprint icon SVG (no "missing icon" fallback), and the public API/exports are unchanged.

---

### Task 1: Re-back `Icon` with Blueprint (TDD)

**Files:** Modify `components/ui/Icons.tsx`; create/modify `components/ui/__tests__/Icons.test.tsx`.
**Interfaces:** Produces: same `export type IconName` (unchanged 19 values) and `export function Icon({ name, size }: { name: IconName; size?: number })` — now rendering `@blueprintjs/icons` `Icon`.

- [ ] **Step 1: Read the current `Icons.tsx` in full** (the body, default size, any className/aria props) so you preserve the exact public API.

Run: `cat components/ui/Icons.tsx`

- [ ] **Step 2: Write the failing test**

`components/ui/__tests__/Icons.test.tsx`:

```tsx
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Icon, type IconName } from "@/components/ui/Icons";

const NAMES: IconName[] = [
  "board", "experiment", "compare", "template", "activity", "analytics",
  "key", "sun", "moon", "logout", "users", "plus", "filter", "more",
  "menu", "close", "search", "chevron-left", "chevron-right",
];

describe("Icon (Blueprint-backed)", () => {
  afterEach(cleanup);

  it("renders an SVG for every IconName with no missing-icon fallback", () => {
    for (const name of NAMES) {
      const { container } = render(<Icon name={name} size={18} />);
      // Blueprint <Icon> renders an <svg data-icon>...; a missing icon renders nothing/placeholder.
      const svg = container.querySelector("svg");
      expect(svg, `no svg rendered for ${name}`).not.toBeNull();
      // Blueprint tags its icon svg with the icon name in data-icon
      expect(svg?.getAttribute("data-icon"), `${name} not a real Blueprint icon`).toBeTruthy();
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run components/ui/__tests__/Icons.test.tsx`
Expected: FAIL (current `Icon` renders plain `<svg>` without Blueprint `data-icon`).

- [ ] **Step 4: Re-implement `Icon` over Blueprint**

`components/ui/Icons.tsx`:

```tsx
import { Icon as BlueprintIcon, type IconName as BlueprintIconName } from "@blueprintjs/icons";

export type IconName =
  | "board" | "experiment" | "compare" | "template" | "activity" | "analytics"
  | "key" | "sun" | "moon" | "logout" | "users" | "plus" | "filter" | "more"
  | "menu" | "close" | "search" | "chevron-left" | "chevron-right";

const BLUEPRINT_ICON: Record<IconName, BlueprintIconName> = {
  board: "grid-view",
  experiment: "lab-test",
  compare: "comparison",
  template: "grid",
  activity: "history",
  analytics: "timeline-bar-chart",
  key: "key",
  sun: "sun",
  moon: "moon",
  logout: "log-out",
  users: "people",
  plus: "plus",
  filter: "filter",
  more: "more",
  menu: "menu",
  close: "cross",
  search: "search",
  "chevron-left": "chevron-left",
  "chevron-right": "chevron-right",
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <BlueprintIcon icon={BLUEPRINT_ICON[name]} size={size} />;
}
```

**IMPORTANT — verify every mapped name is a real `BlueprintIconName`** in the installed `@blueprintjs/icons` (e.g. grep `lib/esm/index.d.ts` or attempt the build). If any of `grid-view / lab-test / comparison / grid / history / timeline-bar-chart / key / sun / moon / log-out / people / plus / filter / more / menu / cross / search / chevron-left / chevron-right` is NOT a valid Blueprint icon name, substitute the closest valid one and note it in the report. Preserve main's current default `size` and any `className`/`aria-*` passthrough if the real `Icons.tsx` has them (re-add those props on the `<BlueprintIcon>`).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run components/ui/__tests__/Icons.test.tsx`
Expected: PASS (every name renders a real Blueprint svg with `data-icon`).

- [ ] **Step 6: Commit**

```bash
git add components/ui/Icons.tsx components/ui/__tests__/Icons.test.tsx
git commit -m "feat(ui): re-back Icon with @blueprintjs/icons

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Verify all consumers + full build/suite

**Files:** none (verification only).

- [ ] **Step 1: Build + full suite**

Run: `. "$HOME/.config/nvm/nvm.sh" && nvm use 24 && npm run build && npm test`
Expected: build succeeds; suite green (no new failures). The 10 consumers (nav, ThemeToggle, Tag, ActivityDrawer, dialogs, …) render Blueprint icons with no code changes (API unchanged).

- [ ] **Step 2: Confirm no consumer needed an API change**

Run: `git diff a2fd39c..HEAD -- $(git grep -l "components/ui/Icons" app components | grep -v __tests__)` — expect only `components/ui/Icons.tsx` changed among Icon-related files; consumers untouched.

- [ ] **Step 3: Reasoned smoke (no interactive login)**

Report: every `IconName` maps to a valid Blueprint icon; consumers unchanged; icon look is line-style (Blueprint), consistent with the prior custom line icons; light/dark both render icons correctly (Blueprint icons use `currentColor`).

- [ ] **Step 4: Report (no commit unless a fix was needed)**

---

## Self-Review

- **Spec coverage:** Plan 2 = Icons re-back ✓ (scope refinement: other primitives deferred to domain plans, with rationale). API preserved ✓.
- **Risk:** the 19-name → Blueprint map — verify each is valid (Step 4 instructs this). If a name is invalid, substitute + note.
- **No screen changes:** only `Icons.tsx` + its test touched.
- **Consistency:** `IconName` union and `Icon({name,size})` signature unchanged so the 10 consumers compile and render without edits.
