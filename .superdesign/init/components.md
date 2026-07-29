# Shared UI primitives

Framework context: Next.js 16 / React 19. The project uses custom React components and global CSS classes; it does not use a third-party component library.

## `Icon`

- File: `components/ui/Icons.tsx`
- Description: Central inline SVG icon library used by navigation, drawers, and action buttons.
- Key props: `name` (`IconName`), `size` (default `20`).

```tsx
import type { ReactNode } from "react";

export type IconName =
  | "board"
  | "experiment"
  | "compare"
  | "activity"
  | "analytics"
  | "key"
  | "sun"
  | "moon"
  | "logout"
  | "users"
  | "plus"
  | "filter"
  | "more"
  | "menu"
  | "close"
  | "search"
  | "chevron-left"
  | "chevron-right";

const ICON_PATHS: Record<IconName, ReactNode> = {
  board: <><rect x="3.5" y="4" width="17" height="16" rx="1.5" /><path d="M9 4v16M9 9h11" /></>,
  experiment: <><path d="M9 3h6M10 3v5l-5.8 9.2A2.5 2.5 0 0 0 6.3 21h11.4a2.5 2.5 0 0 0 2.1-3.8L14 8V3" /><path d="M7.8 15h8.4" /></>,
  compare: <><path d="M4 7h14M15 4l3 3-3 3M20 17H6M9 14l-3 3 3 3" /></>,
  activity: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>,
  analytics: <><path d="M4 20V10M9.3 20V5M14.7 20v-8M20 20V3M2 20h20" /></>,
  key: <><circle cx="8" cy="12" r="4" /><path d="M12 12h9M17 12v3M20 12v2" /></>,
  sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></>,
  moon: <path d="M20 15.1A8.5 8.5 0 0 1 8.9 4a8.5 8.5 0 1 0 11.1 11.1Z" />,
  logout: <><path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M14 8l4 4-4 4M9 12h9" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5A5.5 5.5 0 0 1 9 13h0a5.5 5.5 0 0 1 5.5 5.5V20M15.5 5.2a3 3 0 0 1 0 5.6M17 13a5.5 5.5 0 0 1 3.5 5.1V20" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  filter: <path d="M4 5h16l-6.3 7.1V19l-3.4-1.8v-5.1L4 5Z" />,
  more: <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m5 5 14 14M19 5 5 19" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
  "chevron-left": <path d="m15 5-7 7 7 7" />,
  "chevron-right": <path d="m9 5 7 7-7 7" />,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width={size} height={size}>{ICON_PATHS[name]}</svg>;
}
```

## `Tag`

- File: `components/ui/Tag.tsx`
- Description: Styled task tag with optional removal control.
- Key props: `value`, `removable`, `onRemove`.

```tsx
"use client";

import { tagTone } from "@/lib/tasks/model";
import { Icon } from "@/components/ui/Icons";

export interface TagProps { value: string; removable?: boolean; onRemove?: (value: string) => void; }

export default function Tag({ value, removable = false, onRemove }: TagProps) {
  return (
    <span className="tag" data-tone={tagTone(value)}>
      <span>{value}</span>
      {removable && onRemove ? <button type="button" className="tag-remove" aria-label={`Remove ${value}`} onClick={() => onRemove(value)}><Icon name="close" size={12} /></button> : null}
    </span>
  );
}
```

## `StatusDot`

- File: `components/ui/StatusDot.tsx`
- Description: Status indicator paired with a readable label.
- Key props: `status`, `label`.

```tsx
import type { ExperimentStatus, Status as TaskStatus } from "@/lib/types";

export interface StatusDotProps { status: TaskStatus | ExperimentStatus; label: string; }

export default function StatusDot({ status, label }: StatusDotProps) {
  return <span className={`status-dot status-${status}`}><i aria-hidden="true" /><span>{label}</span></span>;
}
```

## `OwnerAvatar`

- File: `components/ui/OwnerAvatar.tsx`
- Description: Initials avatar with size bounds and accessible owner name.
- Key props: `name`, `initials`, `size`.

```tsx
const DEFAULT_AVATAR_SIZE = 28;
const MIN_AVATAR_SIZE = 20;
const MAX_AVATAR_SIZE = 48;
const FALLBACK_OWNER_NAME = "Unknown owner";
const FALLBACK_OWNER_INITIALS = "UN";

export interface OwnerAvatarProps { name: string; initials?: string; size?: number; }

function normalizedInitials(value: string): string { return Array.from(value.trim().toUpperCase()).slice(0, 2).join(""); }
function avatarInitials(name: string, initials?: string): string {
  const explicit = normalizedInitials(initials ?? "");
  if (explicit) return explicit;
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return FALLBACK_OWNER_INITIALS;
  if (words.length > 1) {
    const first = Array.from(words[0])[0] ?? "";
    const last = Array.from(words[words.length - 1])[0] ?? "";
    return normalizedInitials(`${first}${last}`) || FALLBACK_OWNER_INITIALS;
  }
  return normalizedInitials(words[0]) || FALLBACK_OWNER_INITIALS;
}
function boundedAvatarSize(size: number | undefined): number {
  const finiteSize = typeof size === "number" && Number.isFinite(size) ? size : DEFAULT_AVATAR_SIZE;
  return Math.min(MAX_AVATAR_SIZE, Math.max(MIN_AVATAR_SIZE, Math.round(finiteSize)));
}

export default function OwnerAvatar({ name, initials, size }: OwnerAvatarProps) {
  const avatarSize = boundedAvatarSize(size);
  const accessibleName = name.trim() || FALLBACK_OWNER_NAME;
  return <span className="owner-avatar" role="img" aria-label={accessibleName} style={{ width: avatarSize, height: avatarSize }}>{avatarInitials(name, initials)}</span>;
}
```

## `PageHeader`

- File: `components/ui/PageHeader.tsx`
- Description: Reusable page heading with optional eyebrow, description, and actions.
- Key props: `eyebrow`, `title`, `description`, `actions`.

```tsx
import type { ReactNode } from "react";

export interface PageHeaderProps { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; }

export default function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <div className="page-description">{description}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
```

## `Drawer`

- File: `components/ui/Drawer.tsx`
- Description: Accessible modal side-drawer shell with optional footer.
- Key props: `open`, `titleId`, `onClose`, `footer`, `blocked`, `children`.

```tsx
"use client";

import type { ReactNode } from "react";
import { useModalFocus } from "@/components/ui/useModalFocus";

export interface DrawerProps { open: boolean; titleId: string; onClose: () => void; footer?: ReactNode; blocked?: boolean; children: ReactNode; }

export default function Drawer({ open, titleId, onClose, footer, blocked = false, children }: DrawerProps) {
  const dialogRef = useModalFocus({ open, onClose, blocked });
  if (!open) return null;
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !blocked) onClose(); }}>
      <section ref={dialogRef} className="drawer-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
```

## `ActivityDrawer`

- File: `components/ui/ActivityDrawer.tsx`
- Description: Persistent activity panel with focus return and backdrop behavior.
- Key props: `open`, `panelId`, `label`, `onClose`, `returnFocusRef`, `className`, `children`.

```tsx
"use client";

import type { ReactNode, RefObject } from "react";
import { Icon } from "@/components/ui/Icons";
import { useModalFocus } from "@/components/ui/useModalFocus";

export interface ActivityDrawerProps { open: boolean; panelId: string; label: string; onClose: () => void; returnFocusRef: RefObject<HTMLElement | null>; className?: string; children: ReactNode; }

export default function ActivityDrawer({ open, panelId, label, onClose, returnFocusRef, className = "", children }: ActivityDrawerProps) {
  const closeAndRestoreFocus = () => { onClose(); window.setTimeout(() => { const panel = document.getElementById(panelId); const trigger = returnFocusRef.current; if (panel?.getAttribute("data-open") === "false" && trigger?.isConnected) trigger.focus(); }, 0); };
  const panelRef = useModalFocus({ open, onClose: closeAndRestoreFocus, blocked: false });
  return <><button type="button" className="activity-drawer-backdrop" data-open={open} aria-label="Close activity" aria-hidden={!open} tabIndex={-1} disabled={!open} onClick={closeAndRestoreFocus} /><section ref={panelRef} id={panelId} className={`activity-drawer ${className}`.trim()} data-open={open} role={open ? "dialog" : undefined} aria-modal={open ? true : undefined} aria-label={label} aria-hidden={!open} inert={!open} tabIndex={-1}><header className="activity-drawer-header"><h2>Activity</h2><button type="button" className="activity-drawer-close" aria-label="Close activity" data-modal-initial-focus onClick={closeAndRestoreFocus}><Icon name="close" size={16} /></button></header><div className="activity-drawer-scroll" tabIndex={open ? 0 : -1}>{children}</div></section></>;
}
```

## `WorkspaceSkeleton`

- File: `components/ui/WorkspaceSkeleton.tsx`
- Description: Accessible loading placeholder for board, table, record, and analytics screens.
- Key props: `variant`, `label`.

```tsx
export type WorkspaceSkeletonVariant = "board" | "table" | "record" | "analytics";

export default function WorkspaceSkeleton({ variant, label }: { variant: WorkspaceSkeletonVariant; label: string; }) {
  return (
    <div className={`workspace-skeleton workspace-skeleton-${variant}`} role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="skeleton-visual" aria-hidden="true">
        <i className="skeleton-title" /><i className="skeleton-toolbar" />
        {variant === "board" ? <div className="skeleton-board-columns">{Array.from({ length: 4 }, (_, column) => <div className="skeleton-board-column" key={column}><i /><i /><i /></div>)}</div> : null}
        {variant === "table" ? <div className="skeleton-table">{Array.from({ length: 7 }, (_, row) => <i key={row} />)}</div> : null}
        {variant === "record" ? <div className="skeleton-record"><div>{Array.from({ length: 13 }, (_, row) => <i key={row} />)}</div></div> : null}
        {variant === "analytics" ? <div className="skeleton-analytics">{Array.from({ length: 5 }, (_, item) => <i key={item} />)}</div> : null}
      </div>
    </div>
  );
}
```

## `ThemeToggle`

- File: `components/theme/ThemeToggle.tsx`
- Description: Two-option theme selector, backed by the shared theme provider.
- Key props: none.

```tsx
"use client";

import { useTheme, type Theme } from "@/components/theme/ThemeProvider";
import { Icon, type IconName } from "@/components/ui/Icons";

const THEME_OPTIONS = [
  { theme: "light", label: "Default", icon: "sun" },
  { theme: "dark", label: "Dark", icon: "moon" },
] satisfies Array<{ theme: Theme; label: string; icon: IconName }>;

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return <div className="theme-toggle" role="group" aria-label="Theme">{THEME_OPTIONS.map((option) => <button key={option.theme} type="button" aria-label={`${option.label} theme`} aria-pressed={theme === option.theme} onClick={() => setTheme(option.theme)}><Icon name={option.icon} size={18} /><span>{option.label}</span></button>)}</div>;
}
```

## `ExperimentStatusBadge`

- File: `components/experiments/ExperimentStatusBadge.tsx`
- Description: Compact status badge for experiment records.
- Key props: `status`.

```tsx
import type { ExperimentStatus } from "@/lib/types";
import { EXPERIMENT_STATUS_LABELS } from "@/lib/experiments/policy";

export default function ExperimentStatusBadge({ status }: { status: ExperimentStatus }) {
  return <span className={`experiment-status experiment-status-${status}`}>{EXPERIMENT_STATUS_LABELS[status]}</span>;
}
```
