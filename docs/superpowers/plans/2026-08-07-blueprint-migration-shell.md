# Blueprint Migration — Plan 3: App Shell, Nav & ThemeToggle reskin

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Reskin the app shell chrome — `Navbar` (brand, nav items + nested subnav, mobile sheet, logout) and `ThemeToggle` — to the Blueprint design system, and retire the corresponding `globals.css` shell rules. First domain reskin on top of Plans 1–2.

## Design decisions (flagged)

1. **Nav items stay `next/link`, styled with Blueprint button classes** — NOT Blueprint `AnchorButton`. `AnchorButton` renders a plain `<a>` → full page reload on each nav click (loses Next client routing + prefetch), which is unacceptable. So `<Link>` keeps an `className` of Blueprint's button classes (`Classes.MINIMAL_BUTTON` + `Classes.FILL` + conditional `Classes.ACTIVE`) with the Blueprint `<Icon>` + label inside. This is "real Blueprint" (uses the design system's classes/look) while preserving routing. Verify exact class constants against the installed `@blueprintjs/core` `Classes`.
2. **`ThemeToggle` → Blueprint `SegmentedControl`** (`options=[{label:"Default",value:"light"},{label:"Dark",value:"dark"}]`, `value=theme`, `onValueChange=setTheme`). If v6 `SegmentedControl` options don't accept icons, text-only labels are fine (the sun/moon icons are dropped — acceptable).
3. **Brand + live badge stay custom** (a styled `Link` + a small status element) — Blueprint has no brand/logo component.
4. **Logout → Blueprint `Button`** (`minimal`, `icon="log-out"`).
5. **Mobile sheet behavior is preserved as-is** (its open/close logic + responsive CSS stay); only the nav *items* inside it change to Blueprint-styled links, so mobile comes along for free.
6. **CSS retirement:** remove the shell *component* rules from `globals.css` (`.navbar`, `.navbar-inner`, `.nav-section(-label)`, `.nav-btn` + `.nav-btn.active/.ancestor-active/.nav-subnav`, `.brand`, `.brand-mark`, `.theme-toggle(+button)`, `.logout-btn`, `.live-badge`). KEEP a minimal `.app-shell` (grid) + `.app-content` layout + a small `.navbar` skeleton for the sidebar layout that the Blueprint components sit in.

**Architecture:** `Navbar.tsx` renders the same structure (brand, grouped nav, subnav, live badge, ThemeToggle, logout) but each control is a Blueprint-styled element. A small residual `globals.css` shell block provides only layout (sidebar width/sticky/grid). `usePathname` active logic, nested-subnav logic, mobile-sheet logic, `useAuthActions` logout — all unchanged.

**Tech Stack:** Next 16, React 19, `@blueprintjs/core@6`, Vitest + @testing-library/react + jsdom.

## Global Constraints

- **Workspace:** worktree `/home/yubaifeng/e84381970/projects/tb-blueprint-migration`, branch `feat/blueprint-migration` (on top of Plans 1–2). Work ONLY here.
- **Node:** `. "$HOME/.config/nvm/nvm.sh" && nvm use 24` before build/test.
- **Preserve behavior:** `usePathname` active states (`aria-current="page"`), nested-subnav active/ancestor logic, mobile sheet open/close + focus, logout (`useAuthActions`), theme toggle. No routing change (stay `next/link`).
- **Retire CSS:** delete the shell component selectors listed in decision 6 from `globals.css`. Do not retire rules used by non-shell screens.
- **Commits:** conventional + trailer `Co-Authored-By: Claude <noreply@anthropic.com>`; stage explicitly.
- **Test baseline:** clean (~818 tests). Add zero new failures. Existing `Navbar.test.tsx` asserts active states via `aria-current="page"` + labels — keep it passing (update selectors only if the rendered structure's assertion target moved, never weaken).
- **Verify before done:** `npm run build && npm test`.

## File Structure

Modified:
- `components/theme/ThemeToggle.tsx` — Blueprint `SegmentedControl`.
- `components/Navbar.tsx` — Blueprint-styled links/buttons; same nav structure/logic.
- `app/globals.css` — retire shell component rules; keep minimal shell layout.
- `components/__tests__/Navbar.test.tsx` — update assertions only as needed for the new markup (no weakening).

---

### Task 1: ThemeToggle → Blueprint SegmentedControl

**Files:** Modify `components/theme/ThemeToggle.tsx`; possibly `components/theme/__tests__/ThemeToggle.test.tsx`.

- [ ] **Step 1: Read current ThemeToggle + its test** (`cat components/theme/ThemeToggle.tsx components/theme/__tests__/ThemeToggle.test.tsx`). Note the assertions to preserve.

- [ ] **Step 2: Verify `SegmentedControl` API** in the installed `@blueprintjs/core` (props: `options`, `value`, `onValueChange`, `small?`, `inline?`; whether option supports `icon`). Decide text-only vs icon options.

- [ ] **Step 3: Re-implement ThemeToggle**

```tsx
"use client";
import { SegmentedControl } from "@blueprintjs/core";
import { useTheme, type Theme } from "@/components/theme/ThemeProvider";

const OPTIONS = [
  { label: "Default", value: "light" as Theme },
  { label: "Dark", value: "dark" as Theme },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <SegmentedControl
      aria-label="Theme"
      small
      options={OPTIONS}
      value={theme}
      onValueChange={(v) => setTheme(v as Theme)}
    />
  );
}
```

Preserve an accessible label ("Theme"). If the existing test asserts button labels "Default"/"Dark" + `aria-pressed`, update it to the SegmentedControl contract (the selected option's label is present; `role="radiogroup"`/`aria-label="Theme"`). Keep verifying both themes are selectable.

- [ ] **Step 4: Run focused test + build**

Run: `npx vitest run components/theme && npm run build`
Expected: ThemeToggle test passes (updated assertions); build green.

- [ ] **Step 5: Commit**

```bash
git add components/theme/ThemeToggle.tsx components/theme/__tests__/ThemeToggle.test.tsx
git commit -m "feat(theme): reskin ThemeToggle to Blueprint SegmentedControl

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Navbar → Blueprint-styled links/buttons

**Files:** Modify `components/Navbar.tsx`; `components/__tests__/Navbar.test.tsx`.

- [ ] **Step 1: Read full `Navbar.tsx`** and the test. Identify: `NavigationLink`, `BrandLink`, the nav-section grouping, the mobile-sheet logic, the logout control, where ThemeToggle is placed. Preserve all of it; only the rendered element styling changes.

- [ ] **Step 2: Verify Blueprint `Classes` constants** (`Classes.MINIMAL_BUTTON`, `Classes.FILL`, `Classes.ACTIVE`, `Classes.BUTTON`) and `Button` in the installed package.

- [ ] **Step 3: Restyle nav links with Blueprint button classes**

In `NavigationLink`, apply Blueprint button classes to the `next/link`:

```tsx
import { Classes } from "@blueprintjs/core";

<Link
  href={item.href}
  className={[
    Classes.BUTTON,
    Classes.MINIMAL,
    Classes.FILL,
    active ? Classes.ACTIVE : "",
    secondary ? "nav-subnav" : "", // keep a small layout hook for indentation
  ].filter(Boolean).join(" ")}
  aria-current={active ? "page" : undefined}
>
  <Icon name={item.icon} />
  <span>{item.label}</span>
</Link>
```

(Keep `nav-subnav` as a tiny residual layout class for subnav indentation, styled in the minimal shell CSS — Task 3.) Verify the BP button classes render a filled, minimal, left-aligned button with icon+label (set `alignText="left"` via class if needed, or a small layout rule).

- [ ] **Step 4: Restyle brand + logout**

- Brand: keep a styled `Link` (`className="brand"`) — minimal custom CSS (Task 3).
- Logout: Blueprint `<Button minimal icon="log-out" text="Log out" onClick={signOut} />` (use `useAuthActions`).

- [ ] **Step 5: Update `Navbar.test.tsx` assertions only as needed**

The test asserts nav links by name + `aria-current="page"` active states. Those still hold (labels + aria-current unchanged). If it asserts old CSS classes (`.nav-btn`/`.active`), update to the new contract (e.g., `aria-current` + link text). Do NOT weaken coverage.

- [ ] **Step 6: Run focused test + build**

Run: `npx vitest run components/__tests__/Navbar.test.tsx && npm run build`
Expected: Navbar test passes; build green.

- [ ] **Step 7: Commit**

```bash
git add components/Navbar.tsx components/__tests__/Navbar.test.tsx
git commit -m "feat(nav): reskin Navbar items to Blueprint button classes

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Retire shell component CSS; keep minimal shell layout

**Files:** Modify `app/globals.css`.

- [ ] **Step 1: Identify the shell rules to delete**

Grep `app/globals.css` for: `.navbar`, `.navbar-inner`, `.navbar-spacer`, `.nav-section`, `.nav-section-label`, `.nav-btn` (+ `.nav-btn:hover/.active/.ancestor-active`, `.nav-btn svg`), `.brand` (+ `.brand strong`), `.brand-mark`, `.theme-toggle` (+ `.theme-toggle button*`), `.logout-btn` (+ hover), `.live-badge`, and their focus-visible entries in the shared focus rule.

- [ ] **Step 2: Delete those rules** from `globals.css`. KEEP (or reduce to layout-only): `.app-shell` (grid: sidebar width + content), `.app-content`. Add a minimal residual block for what Blueprint classes don't cover:

```css
/* Shell layout (Blueprint components provide the control styling) */
.app-shell { /* grid: <sidebar> <content> */ }
.app-content { min-width: 0; }
.brand { display: flex; align-items: center; gap: 10px; color: inherit; text-decoration: none; }
.brand strong { font-size: 14px; }
.nav-subnav { margin-left: 18px; }   /* subnav indentation hook */
.live-badge { /* small status line */ }
/* narrow-screen shell behavior stays (mobile sheet) */
```

(Keep the existing `@media (max-width: 767px)` shell rules that drive the mobile sheet layout — only remove the component styling the Blueprint classes now provide.)

- [ ] **Step 3: Build + full suite + verify no orphaned selectors**

Run: `npm run build && npm test`
Expected: green. Then `grep -n "nav-btn\|theme-toggle button\|logout-btn" app/globals.css` → no hits (retired); `grep -n "app-shell\|app-content" app/globals.css` → the minimal layout rules remain.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "style: retire shell component CSS in favor of Blueprint

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Verify shell reskin end-to-end

**Files:** none (verification).

- [ ] **Step 1: Build + full suite**

Run: `. "$HOME/.config/nvm/nvm.sh" && nvm use 24 && npm run build && npm test`
Expected: build green; suite green (no new failures); Navbar + ThemeToggle tests pass.

- [ ] **Step 2: Reasoned smoke (no interactive login)**

Report: nav renders Blueprint-styled links (icon+label, active via `bp5-active` + `aria-current`); nested subnav indented; ThemeToggle is a SegmentedControl (Default/Dark); logout is a Blueprint Button; brand is a styled link; light/dark both render correctly (icons use `currentColor`); routing unchanged (next/link); mobile sheet behavior intact. Shell component CSS retired; only minimal layout CSS remains.

- [ ] **Step 3: Report (commit only if a fix was needed)**

---

## Self-Review

- **Spec coverage:** shell + nav + ThemeToggle reskin ✓ (spec §5 Plan 3). Routing preserved (next/link) ✓. CSS retired ✓.
- **Behavior preserved:** active states, nested subnav, mobile sheet, logout, theme toggle ✓.
- **Risks:** (a) Blueprint button classes on `next/link` — verify they render as intended filled minimal buttons (Task 2 Step 2 verifies constants; Step 6 verifies render); (b) SegmentedControl icon support — text-only fallback accepted; (c) CSS retirement must not remove rules other screens use — Task 3 greps before deleting.
- **Test discipline:** Navbar/ThemeToggle tests updated for new markup without weakening (aria-current + labels still asserted).
