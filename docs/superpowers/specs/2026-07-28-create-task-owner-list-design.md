# Create Task Owner List Design

**Date:** 2026-07-28
**Status:** Superseded by `2026-07-28-owner-picker-fixed-sidebar-design.md`

> The selected-only Owner picker replaces this document's always-expanded
> one-owner-per-row selector. Historical implementation details below are kept
> for context only.

## Goal

Make the Owner selector in the Create Task drawer easier to scan by rendering
exactly one owner per row. Long names must stay on one line and truncate with an
ellipsis instead of widening the drawer or wrapping.

## Scope

This change applies only to the Owner field in `AddTaskDrawer`. It does not
change the Team view, Task Detail owner editor, member data, or multi-owner
selection behavior.

## Approved layout

- `.owner-options` is a single-column grid.
- Every `.owner-option` fills the available field width and remains one
  clickable checkbox label.
- Checkbox and avatar keep fixed dimensions.
- The name consumes the remaining width with `min-width: 0`.
- An overflowing name uses `white-space: nowrap`, `overflow: hidden`, and
  `text-overflow: ellipsis`.
- The name element exposes the full value through `title`; the checkbox keeps
  the full accessible name through `aria-label`.
- Existing selected, hover, focus, dark-theme, and narrow 44px target behavior
  remains unchanged.

## Alternatives considered

1. **Single row with ellipsis — selected.** Stable drawer width and row height,
   fast vertical scanning, and full-name access through tooltip/accessibility
   text.
2. Multi-line names. Preserves all visible text but produces uneven rows and a
   less scannable selector.
3. Keep two columns and truncate. Uses less vertical space but gives long names
   too little room and conflicts with the requested one-owner-per-row layout.

## Verification

- Component test: each rendered owner has a dedicated name element whose
  tooltip contains the complete name.
- CSS contract test: owner grid has one column and the name element has the
  required flex/min-width/ellipsis rules.
- Regression tests: selecting multiple owners and task submission remain
  unchanged.
- Browser check: Create Task drawer at desktop and narrow width, including a
  deliberately long owner name, with no horizontal overflow in light and dark
  themes.
