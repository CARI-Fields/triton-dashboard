# Triton Board design system

## Product context

Triton Board is a light/dark, desktop-first operations workspace for tracking technical work. Its core surfaces are the task board, task detail document, experiments workspace, analytics, and administration. The app uses Next.js 16 with React 19, custom components, and one global vanilla-CSS stylesheet; it has no Tailwind configuration or third-party component library.

Primary jobs are: scan work by status/type/owner, create a task from the global `New task` action, edit task metadata and document content in place, and inspect experiments/attachments/activity without losing task context.

## Page architecture

- Application shell: persistent left navigation at wide widths; compact icon rail below 1280px; a sticky mobile app bar and off-canvas sidebar below 768px.
- Board: page header and global `New task`, view tabs and toolbar, horizontal board columns/scroll region, then task cards. Columns remain scroll regions when empty.
- Task detail: a continuous document canvas: back link and editable title, property grid, Description, Experiments, Attachments, and a separate Activity drawer/rail. Structured sub-content keeps its own meaningful borders.
- Theme: `ThemeProvider` applies `data-theme="light" | "dark"` on the document root, honoring the saved `triton-theme` value or the system preference.

## Semantic tokens (existing only)

| Role | Light | Dark override |
| --- | --- | --- |
| canvas | `#ffffff` | `#141414` |
| surface | `#ffffff` | `#252525` |
| subtle surface | `#f8faff` | `#1b1b1b` |
| hover surface | `#f3f3f3` | `#303030` |
| border / strong | `#e6e6e6` / `#d8dde8` | `#414141` / `#525252` |
| primary / secondary / tertiary text | `#141414` / `#6f748c` / `#929292` | `#e6e6e6` / `#929292` / `#7a7a7a` |
| accent / hover / foreground / subtle | `#1e96eb` / `#1887d4` / `#075f9f` / `#eaf5fd` | same accent/hover; `#8dcef7`; `rgb(30 150 235 / 12%)` |
| status | todo `#abb3bf`, progress `#1e96eb`, done `#248569`, blocked `#d45d62`, warning `#c88719` | only status foregrounds override: todo `#c7ccd4`, progress `#8dcef7`, done `#8bd7bb`, blocked `#f0a6aa` |

Compatibility aliases (`--ground`, `--paper`, `--ink`, `--line`, `--accent-soft`, status soft variants) resolve to the semantic tokens above. Use semantic variables rather than literal colors. Focus is `0 0 0 2px var(--canvas), 0 0 0 4px var(--accent)`.

## Typography, spacing, shape, and motion

- Font: `var(--sans)` = system UI stack; code uses `var(--mono)` = Cascadia Code/Consolas/ui-monospace stack. No external font is defined.
- Type: global line-height `1.55`; existing UI uses 13px, 14px, 15px, 16px, 18px and page-level heading sizes already defined in `app/globals.css`. Keep compact labels and semibold headings; do not introduce a new typeface or scale.
- Spacing: no tokenized spacing scale. Existing layout values use the 4px rhythm (4, 8, 10, 12, 16, 18, 20, 22, 24, 28, 32, 36, 40, 44, 46, 56, 64, 80, 88px) plus responsive `clamp()` values. Use values already present in the stylesheet.
- Radius: existing controls/cards use 6px, 7px, and 8px; pills/avatars/scroll thumbs use `999px`. Do not add a new radius family.
- Shadows: `--shadow-1` and `--shadow-3` are the shared elevation definitions; mobile sidebar also uses `16px 0 40px rgb(0 0 0 / 18%)`.
- Motion: existing interactive transitions are restrained (120ms for navigation; 180ms for mobile sidebar). Respect `prefers-reduced-motion: reduce`.
- Breakpoints: 1279px compact desktop, 1023px tablet/compact layout, 767px mobile, 479px narrow mobile; an additional 720px local responsive rule and 768px desktop-only board/detail contracts exist.

## Accessibility baseline

- Preserve visible focus (`--focus-ring` and component focus styles), semantic headings, labels, `aria-label`s, and keyboard behavior.
- Keep interactive controls at least 44px tall/wide on mobile.
- Text labels must retain meaning without color; preserve `time[dateTime]` for task freshness.
- Both themes must use the existing semantic tokens and remain readable; no new color token or dependency is permitted.
- Do not remove the global accessible `New task` action when removing column-level creation controls.

## Approved task-board polish direction

This approved direction refines hierarchy without changing data model, routes, behavior, realtime synchronization, or the existing global creation flow.

- **Two-line Type-first card heading:** keep Type and title on distinct lines. The first line contains the textual Type label at left and the existing overflow control at right; the second line contains the linked title at the full available width. The label uses `font-variant-caps: all-small-caps`, slightly expanded tracking, compact horizontal padding, small existing radius, accent foreground/subtle tokens, and is capped at 112px and 40% of heading width with ellipsis. `No type` remains visible with neutral text/surface treatment.
- **Single footer row:** tags stay below the heading. Owners or `No owner yet` sit left; the non-shrinking right group contains Status then updated time when grouped by Type, or updated time only when grouped by Status. Keep owner overlap, semantic `time`, current relative timestamp, and no collision/wrapping failure on narrow screens.
- **Board simplification:** remove all per-column `Add task` controls and the `onOpenCreate` surface they require. Remove the visible live-sync sentence only; subscriptions, refresh, reconciliation, and error handling remain unchanged. Empty columns remain scroll regions.
- **Continuous Task Detail:** remove decorative top/bottom/row property borders and the top dividers on Description, Experiments, and Attachments. Keep label/value grid, transparent resting controls, hover/focus discoverability, compact semibold headings, and meaningful internal borders for tables, inputs, menus, attachments, and experiment records. Separate content sections with exactly **40px** vertical whitespace. Do not alter Activity Drawer layout or behavior.

## Implementation guardrails

Use only `app/globals.css` semantic variables, existing system font stacks, existing component styles, and the approved layout changes above. Preserve desktop and narrow-screen behavior: Type remains on the line above a wrapping title, footer metadata remains left/right, long labels truncate, and no horizontal page scroll is introduced.
