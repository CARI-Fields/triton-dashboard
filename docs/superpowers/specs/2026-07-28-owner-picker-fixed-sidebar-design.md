# Owner Picker and Fixed Sidebar Design

**Date:** 2026-07-28
**Status:** Approved

## Goal

Reduce Owner-field noise in Create Task and Task Detail, make the light
appearance read as the product default, and keep the desktop navigation stable
while long workspace content scrolls.

## Scope

This change covers three user-facing behaviors:

1. Rename the visible light-theme option from `Light` to `Default`.
2. Replace the always-expanded Owner member lists in Create Task and Task Detail
   with a shared selected-owner editor.
3. Make the desktop application content pane the only page-level vertical
   scroller while the left navigation remains stationary.

It does not rename the internal `light` theme value, change theme storage or
colors, change the database schema, redesign the Team view, or redesign mobile
navigation and scrolling.

## Theme terminology

- The light-theme button displays `Default`.
- Its accessible name is `Default theme`.
- The internal theme union remains `"light" | "dark"`.
- Clicking Default still applies `data-theme="light"`, sets
  `color-scheme: light`, and persists `light` under `triton-theme`.
- The Dark option and all light/dark semantic tokens remain unchanged.

## Shared Owner picker

Create a controlled `OwnerPicker` used by both `AddTaskDrawer` and
`TaskProperties`.

### Closed state

- Render only currently selected Owners as compact avatar Chips.
- Each Chip exposes the complete name and a clearly labelled remove button.
- Long names stay on one line and truncate visually without losing the full
  accessible name or tooltip.
- When no Owner is selected, show `No owners yet`.
- Always render an `Add owner` button.

The picker must continue to display a selected Owner whose name is temporarily
absent from the Team member array, using a derived initials fallback.

### Add Owner panel

Activating `Add owner` opens a lightweight anchored panel labelled
`Add owner`.

- List only existing Team members who are not already selected.
- Selecting an existing member immediately adds that member and closes the
  panel.
- Provide a `New owner name` input and a `Create owner` action.
- Trim new names and compare them case-insensitively against existing members.
- If a matching member already exists, select that member without another
  database insert.
- Otherwise create the Team member, then immediately select the returned
  member and close the panel.
- Escape and an outside pointer action close the panel without changing the
  current selection.
- While creation is pending, prevent duplicate submissions.
- If creation fails, keep the panel open and preserve the typed value. The
  parent surface continues to own and display its existing mutation error
  feedback.

Keyboard focus must move into the panel when it opens and return to the
`Add owner` button when the panel closes. All selection, creation, and removal
actions require explicit accessible names.

### Component boundary

`OwnerPicker` is UI-only and does not import the Supabase client. Its controlled
contract receives:

- the Team member array;
- the selected Owner names;
- a selection-change callback; and
- an async create-Owner callback that returns the created or matched `Member`.

The picker updates selection only after the create callback succeeds.

## Data flow

### Create Task

- `AddTaskDrawer` keeps Owner names in its existing task draft.
- Selecting or removing an Owner updates only that draft until task submission.
- `Board` supplies the create-Owner callback.
- Creating a member writes to `members`, reloads the authoritative board
  snapshot, returns the created member, and allows the picker to add its name to
  the draft.
- Task submission continues to send every selected Owner through the existing
  task storage adapter.

### Task Detail

- `TaskProperties` replaces its checkbox list with `OwnerPicker`.
- Selecting and removing existing members continues through the current
  cumulative optimistic Owner patch coordinator.
- `TaskDetail` supplies the create-Owner callback, refreshes its Team member
  state, then allows the picker to submit the Owner patch.
- A failed member creation must not enqueue an Owner patch.
- Existing Owner patch failure reconciliation and activity entries remain
  unchanged.

### Team view

The existing Team view remains the full roster-management surface. Its
`Add owner` form may reuse the same parent create function, but its layout and
removal behavior are outside this change.

## Desktop scrolling

At desktop and compact-sidebar widths above the existing mobile breakpoint:

- `.app-shell` occupies exactly `100dvh`, has no page-level overflow, and keeps
  its two-column grid.
- `.app-sidebar` occupies the viewport height and does not move when workspace
  content scrolls.
- `.app-content` has `min-height: 0`, `height: 100dvh`, and
  `overflow-y: auto`, making it the only page-level vertical scroller.
- Page headers and workspace content scroll together inside `.app-content`.
- Fixed drawers and dialogs retain their existing viewport-relative behavior.

At the existing mobile breakpoint, explicitly preserve the current document
scroll, sticky top bar, and slide-out navigation behavior. No mobile visual
redesign is included.

## Error handling

- Existing-member selection and local Create Task draft changes are
  synchronous.
- Duplicate names reuse the existing Team member rather than surfacing an
  error.
- Member insert failures leave selection unchanged, keep the create input
  intact, and use the containing Board or Task Detail mutation alert.
- Task Detail Owner patch failures keep using the existing rollback and
  resynchronization path.

## Verification

Implementation follows test-driven development.

### Component and integration tests

- Theme Toggle exposes `Default theme`, and activating it still applies and
  persists `light`.
- The closed Owner picker renders selected names only.
- The open panel renders unselected Team members only.
- Removing a Chip updates the controlled selection.
- Selecting an existing member adds it and closes the panel.
- Creating a unique member calls the async callback, adds the returned member,
  and closes the panel.
- Entering an existing name reuses that member without a create call.
- A rejected create keeps the panel open, retains the input, and leaves
  selection unchanged.
- Create Task submits all Owners selected through the picker.
- Task Properties preserves cumulative rapid Owner changes and its existing
  failure-reconciliation contract.

### Style and browser checks

- CSS contracts assert desktop shell height/overflow, stationary sidebar, and
  independently scrollable content.
- Desktop browser QA records the sidebar bounding position before and after
  scrolling `.app-content`; the sidebar position must be unchanged and the
  document itself must not become the workspace scroller.
- Browser QA covers Create Task and Task Detail Owner selection, removal, and
  new-member creation in Default and Dark themes.
- A narrow desktop/compact-sidebar width is checked in addition to the primary
  desktop viewport.
- Existing mobile contracts are run as regression tests, without introducing a
  new mobile design.

## Alternatives considered

1. **Shared controlled Owner picker — selected.** Keeps both task surfaces
   consistent, isolates database writes in their parents, and gives the
   interaction one focused test suite.
2. Duplicate the picker markup in each panel. Slightly less initial component
   work, but selection, creation, accessibility, and errors would drift.
3. A full Owner-management modal. Offers room for future administration but is
   unnecessarily heavy for selecting or creating one member in context.
