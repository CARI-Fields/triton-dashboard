# Task Board UI Polish Design

**Date:** 2026-07-29

**Status:** Approved; implementation planning complete

**Branch:** `feat/task-board-ui-polish`

## Goal

Refine the current Task Board and Task Detail surfaces without changing their
data model or interaction behavior. Task cards should expose their type and
freshness more clearly, board-level creation should have one obvious entry
point, and Task Detail should read as a calm Notion-like document rather than a
stack of ruled sections.

## Scope

This change covers:

- task-card information hierarchy;
- Task Board column footers and sync copy;
- Task Detail property and section separators;
- responsive, light-theme, and dark-theme presentation;
- focused component and CSS regression tests.

The existing global `New task` action remains the only board-level task
creation entry point. Realtime synchronization, Quick edit, task mutations,
Owner management, Activity, Experiments, Attachments, routing, and error
handling remain unchanged.

## Task Card Design

### Type and title

Task Type moves from its own line to the beginning of the title row. The row
contains:

1. a Type label;
2. the linked task title;
3. the existing overflow-actions control.

The Type label uses `font-variant-caps: all-small-caps`, slightly expanded
tracking, compact horizontal padding, a small radius, accent-colored text, and
a low-chroma accent background. It remains textual so meaning never depends on
color. `No type` stays visible but uses neutral text and surface colors, making
it less prominent than an assigned type.

The Type label is capped at 112px and no more than 40% of the available heading
width, then truncates with an ellipsis. The title keeps its existing wrapping
and focus behavior. The overflow menu remains anchored at the right edge.

### Tags and footer

Tags remain beneath the heading and keep their current order and interaction.

The card footer becomes one horizontal metadata row:

- Owner avatars or `No owner yet` align left.
- A right-aligned metadata group contains Status when the board is grouped by
  Type, followed by the updated time.
- When grouped by Status, the right group contains only the updated time.

The timestamp keeps a semantic `time` element and displays the current relative
copy. It no longer occupies a separate row. Owner avatars may overlap as they do
today; the right metadata group cannot shrink or collide with them.

## Task Board Simplification

Remove every per-column `Add task` button. Remove the corresponding
`onOpenCreate` surface from `TaskBoardView` because the global `New task`
control already opens the same creation flow and remains available above the
board.

Remove the board footer copy:

`Live updates enabled · authoritative rows refreshed after every change`

Removing the copy does not disable or modify Realtime subscriptions, refreshes,
mutation reconciliation, or error reporting.

Empty columns remain valid scroll regions. They do not receive a replacement
empty-state action, because the global `New task` button is the single creation
entry point.

## Task Detail Design

Task Detail becomes a continuous document canvas whose hierarchy comes from
typography, alignment, and whitespace.

### Properties

- Remove the top and bottom border around the property list.
- Remove the border between individual property rows.
- Preserve the current label/value grid and editable controls.
- Use compact vertical spacing with enough row separation to scan labels.
- Keep transparent controls at rest and the existing subtle hover/focus
  treatment so editable values remain discoverable.

### Content sections

- Remove the top divider from Description, Experiments, and Attachments.
- Separate sections with 40px of vertical whitespace.
- Keep section headings compact and semibold.
- Preserve internal borders where they communicate real structure, including
  tables, form controls, menus, attachment items, and experiment records.
- Do not alter Activity Drawer layout or behavior.

The result should feel like one editable page rather than several panels while
retaining clear boundaries inside structured or interactive content.

## Responsive and Theme Behavior

At desktop and compact desktop widths, Type, title, and actions share the
heading row and Owner/update metadata share the footer row.

On narrow screens:

- the Type label stays before the title;
- the title remains allowed to wrap;
- the footer continues to place Owner information left and updated metadata
  right;
- long Type labels truncate;
- no content clips or introduces a horizontal page scroll.

All new colors use existing semantic tokens. Assigned Type uses accent tokens;
`No type` uses neutral surface and text tokens. Both light and dark themes must
retain readable contrast without introducing a new theme token or dependency.

## Accessibility

- Type remains visible text and is not represented by color alone.
- The linked title and overflow actions retain their current keyboard and focus
  behavior.
- The timestamp remains a semantic `time` element with `dateTime`.
- Removing per-column creation buttons must not remove the accessible global
  `New task` action.
- Removing decorative dividers must not change section landmarks, headings, or
  labels.

## Implementation Boundaries

Expected implementation files:

- `components/tasks/TaskCard.tsx`
- `components/tasks/TaskBoardView.tsx`
- `components/Board.tsx`
- `app/globals.css`
- focused tests under `components/tasks/__tests__/`,
  `components/__tests__/`, and `app/__tests__/` as appropriate

No database, Supabase policy, route, API, shared task model, or dependency
change is required.

## Verification

Automated checks must cover:

- Type appears before the title in the task-card heading.
- Owner and updated time share the card footer.
- Status remains present in the footer when grouped by Type.
- Per-column `Add task` controls are absent.
- The global `New task` control remains available.
- The removed sync sentence is absent.
- Task Detail properties and content sections do not restore decorative
  divider borders.
- The full existing test suite and production build pass.

Rendered verification must exercise the Task Board and one Task Detail route at
desktop and mobile sizes. It must check light and dark themes, page identity,
meaningful content, framework overlays, console errors, heading/footer
alignment, wrapping, clipping, and the surviving global task-creation flow.
