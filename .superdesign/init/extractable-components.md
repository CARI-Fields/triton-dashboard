# Extractable components

The codebase is a custom Next.js application. The components below are the stable, reusable visual patterns worth offering as Superdesign `DraftComponent` entities. Props are limited to page-varying state, navigation, visibility, and counts; visual treatment and fixed copy remain hardcoded.

## Layout Components

## Navbar

- Source: `components/Navbar.tsx`
- Category: layout
- Description: Responsive application sidebar and mobile app bar with primary navigation, account actions, and theme control.
- Extractable props: `activeItem` (string, derived from current pathname), `mobileOpen` (boolean, default: false), `onNavigate` (navigation callback), `onLogout` (callback), `showAdmin` (boolean, default: true).
- Hardcoded: Triton Board wordmark/SVG, “Triton Kernel Agent,” navigation labels and icon names, “Shared team board,” all CSS classes and the 767px mobile breakpoint.

## Drawer

- Source: `components/ui/Drawer.tsx`
- Category: layout
- Description: Focus-managed modal side drawer with a backdrop, panel body, and optional footer.
- Extractable props: `open` (boolean), `titleId` (string), `onClose` (callback), `footer` (content), `blocked` (boolean, default: false).
- Hardcoded: dialog semantics, backdrop-close interaction, CSS classes, and focus-management implementation.

## ActivityDrawer

- Source: `components/ui/ActivityDrawer.tsx`
- Category: layout
- Description: Slide-out activity panel with backdrop, close button, dialog semantics, and restored trigger focus.
- Extractable props: `open` (boolean), `panelId` (string), `label` (string), `onClose` (callback), `returnFocusRef` (element ref), `className` (string, default: "").
- Hardcoded: “Activity” heading, close icon, close-button label, CSS classes, and focus behavior.

## PageHeader

- Source: `components/ui/PageHeader.tsx`
- Category: layout
- Description: Page-level heading region with optional eyebrow, descriptive copy, and action slot.
- Extractable props: `eyebrow` (content), `title` (content), `description` (content), `actions` (content).
- Hardcoded: header DOM structure, `h1` hierarchy, and CSS classes.

## TaskBoardView

- Source: `components/tasks/TaskBoardView.tsx`
- Category: layout
- Description: Kanban-style board grouping task cards by status or type and exposing a group-level creation action.
- Extractable props: `groupBy` ("status" | "type"), `tasks` (data), `types` (data), `members` (data), `onOpenCreate` (callback), `onPatchTask` (callback), `onDeleteTask` (callback).
- Hardcoded: column header structure, status/type grouping algorithm, “No type,” “Add task,” and CSS classes.

## Basic Components

## Icon

- Source: `components/ui/Icons.tsx`
- Category: basic
- Description: Consistent inline SVG icon renderer used throughout the workspace.
- Extractable props: `name` (icon identifier), `size` (number, default: 20).
- Hardcoded: icon path catalogue, 24px view box, 1.5px round stroke styling, and `aria-hidden` behavior.

## Tag

- Source: `components/ui/Tag.tsx`
- Category: basic
- Description: Colored metadata tag with optional removal action.
- Extractable props: `value` (string), `removable` (boolean, default: false), `onRemove` (callback).
- Hardcoded: tone derivation, close icon, removal-label format, and CSS classes.

## StatusDot

- Source: `components/ui/StatusDot.tsx`
- Category: basic
- Description: Status-colored dot accompanied by a textual label.
- Extractable props: `status` (task or experiment status), `label` (string).
- Hardcoded: inner indicator element and `status-dot` CSS class convention.

## ExperimentStatusBadge

- Source: `components/experiments/ExperimentStatusBadge.tsx`
- Category: basic
- Description: Compact, policy-labeled experiment status pill.
- Extractable props: `status` (experiment status).
- Hardcoded: label lookup, CSS class naming convention, and all style rules.

## OwnerAvatar

- Source: `components/ui/OwnerAvatar.tsx`
- Category: basic
- Description: Accessible initials avatar with bounded display dimensions and fallbacks.
- Extractable props: `name` (string), `initials` (string), `size` (number, default: 28).
- Hardcoded: 20–48px size bounds, `UN` fallback initials, “Unknown owner” fallback text, and CSS class.

## ThemeToggle

- Source: `components/theme/ThemeToggle.tsx`
- Category: basic
- Description: Light/dark appearance switcher tied to the app theme provider.
- Extractable props: `theme` ("light" | "dark"), `onThemeChange` (callback).
- Hardcoded: Default/Dark labels, sun/moon icon names, two-option layout, and CSS classes.

## WorkspaceSkeleton

- Source: `components/ui/WorkspaceSkeleton.tsx`
- Category: basic
- Description: Screen-specific loading skeleton for board, table, record, and analytics content.
- Extractable props: `variant` ("board" | "table" | "record" | "analytics"), `label` (string).
- Hardcoded: placeholder counts, visual DOM patterns, accessibility structure, and CSS classes.

## MarkdownField

- Source: `components/MarkdownField.tsx`
- Category: basic
- Description: Click-to-edit Markdown field that renders safely when idle and saves edits on blur or Cmd/Ctrl+Enter.
- Extractable props: `value` (string), `onSave` (callback), `onDraftChange` (callback), `onEditingChange` (callback), `placeholder` (string), `minHeight` (number, default: 76).
- Hardcoded: Markdown renderer configuration, external-link behavior, “Markdown supported” hints, keyboard shortcuts, and CSS classes.

## OwnerPicker

- Source: `components/tasks/OwnerPicker.tsx`
- Category: basic
- Description: Selected-owner chips plus an anchored picker for adding existing or newly created owners.
- Extractable props: `members` (data), `owners` (string array), `onChange` (callback), `onCreateOwner` (callback), `onPendingChange` (callback), `disabled` (boolean, default: false).
- Hardcoded: “Add owner,” “No owners yet,” “Everyone is already added,” new-owner field copy, 6px panel gap, CSS classes, and focus/placement behavior.

## CommaListInput

- Source: `components/experiments/CommaListInput.tsx`
- Category: basic
- Description: Form input that edits a string-array value as a comma-separated draft.
- Extractable props: `label` (string), `value` (string array), `onChange` (callback).
- Hardcoded: comma parsing on blur, input DOM, and label structure.

## ExperimentFilters

- Source: `components/experiments/ExperimentFilters.tsx`
- Category: basic
- Description: Experiment-list filter toolbar with saved-view tabs, search, select filters, and result count.
- Extractable props: `rows` (data), `value` (filter state), `resultCount` (number), `onChange` (callback), `currentTab` (derived from saved view).
- Hardcoded: five saved-view labels, filter labels, “All” options, sort rules, “experiments” result label, CSS classes, and the filter field set.
