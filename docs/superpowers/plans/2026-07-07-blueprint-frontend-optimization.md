# Triton Board — Blueprint Frontend Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `Triton Board.dc.html` design (claude.ai/design project "Triton Board前端优化") in the existing Next.js app: Blueprint visual retheme, top navbar, Analytics view, per-task activity timeline, and task/experiment `updated_at` timestamps.

**Architecture:** Keep the existing dependency-free architecture (client components + Supabase + hand-rolled CSS in `app/globals.css`). Do NOT install @blueprintjs — replicate the Blueprint look with CSS custom properties extracted from the design bundle. New DB objects (activity table, updated_at columns + triggers) ship as migration `0005` through the existing `scripts/migrate.mjs` runner.

**Tech Stack:** Next.js 16.2.10 (App Router), React 19, @supabase/supabase-js, plain CSS.

## Global Constraints

- Design source of truth: `Triton Board.dc.html` (fetched copy at the scratchpad; key values inlined in tasks below).
- Blueprint tokens (from design `_ds_bundle.css`): accent `#2D72D2`, hover `#215DB0`, success `#238551`, warning `#C87619`, danger `#CD4246`, text `#1C2127`, muted `#5F6B7C`, bg `#F6F7F9` (light-gray-5), tinted foundation bg `#EDEFF2` (light-gray-4), border default `#5F6B7C1F`, border strong `#5F6B7C40`, shadow-1 `0px 0px 0px 1px rgba(0,0,0,.1), 0px 1px 3px 0px rgba(0,0,0,.1), 0px 1px 2px -1px rgba(0,0,0,.1)`.
- Foundation cards use the design's DEFAULT `foundationStyle: "tinted"` (light gray), replacing the current dark-navy style.
- Card border-radius: 6px (design), replacing 8–10px.
- Status set unchanged: `todo | in_progress | done | blocked`. Status changes by CLICK-CYCLING a pill (todo → in_progress → done → blocked → todo), replacing `<select>`.
- Activity kinds and dot colors (design `eventColor`): create=success, status=warning, assign=accent, experiment=accent, note=gray, edit=gray, comment=success.
- Keep existing features the design prototype lacks: Markdown fields, attachments/plot uploads, AuthGate, SetupScreen, confirm dialogs.
- No test framework exists in this repo and none is added (CLAUDE.md simplicity rule). Each task's verify gate is `npx tsc --noEmit` and `npm run build`, plus visual checks in the final task. `.env.local` is absent locally, so `npm run db:migrate` is run by the maintainer, not by this plan.
- All UI copy in English, matching the design verbatim where given (e.g. "Last updated {rel} · everyone with the link", "Click to change status").

## File Structure

- Create: `supabase/migrations/0005_activity_and_timestamps.sql` — activity table, updated_at columns + triggers, RLS, realtime.
- Modify: `lib/types.ts` — `updated_at` on Task/Experiment; `Activity` type.
- Create: `lib/time.ts` — `relTime`, `fmtDate` (shared).
- Create: `lib/status.ts` — `STATUS_OPTIONS`, `statusLabel`, `nextStatus` (deduped from Board/TaskDetail).
- Create: `lib/activity.ts` — `logActivity` insert helper + `KIND_COLOR`.
- Create: `components/Navbar.tsx` — brand + LIVE + Board/Analytics nav.
- Create: `components/Analytics.tsx`, `app/analytics/page.tsx` — analytics view.
- Modify: `app/layout.tsx` — mount Navbar.
- Modify: `app/globals.css` — Blueprint retheme + navbar/timeline/analytics styles.
- Modify: `components/Board.tsx` — pill cycling, lastUpdated, per-task updated, pin-new-task-to-top + auto-open picker, activity logging.
- Modify: `components/TaskDetail.tsx` — created/updated meta, pill cycling, experiment updated, activity timeline, logging.
- Modify: `README.md` — mention analytics + timeline + migration 0005.

---

### Task 1: Migration 0005 + shared libs (types, time, status, activity)

**Files:**
- Create: `supabase/migrations/0005_activity_and_timestamps.sql`
- Modify: `lib/types.ts`
- Create: `lib/time.ts`
- Create: `lib/status.ts`
- Create: `lib/activity.ts`

**Interfaces:**
- Consumes: existing `lib/supabase.ts` (`supabase` nullable client), `lib/types.ts` `Status`.
- Produces (used by Tasks 4–6):
  - `relTime(ts: string | null | undefined): string`, `fmtDate(ts: string | null | undefined): string`
  - `STATUS_OPTIONS: { value: Status; label: string }[]`, `statusLabel(s: Status): string`, `nextStatus(s: Status): Status`
  - `logActivity(taskId: string, text: string, kind: ActivityKind): Promise<void>`, `KIND_COLOR: Record<ActivityKind, string>`
  - Types: `Task.updated_at: string`, `Experiment.updated_at: string`, `Activity { id, task_id, text, kind, created_at }`

- [ ] **Step 1: Write the migration**

`supabase/migrations/0005_activity_and_timestamps.sql`:

```sql
-- Task activity timeline + updated_at timestamps (design: Triton Board.dc.html).
-- Applied automatically by `npm run db:migrate`.

alter table tasks       add column if not exists updated_at timestamptz not null default now();
alter table experiments add column if not exists updated_at timestamptz not null default now();

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_set_updated_at on tasks;
create trigger tasks_set_updated_at
  before update on tasks
  for each row execute function set_updated_at();

drop trigger if exists experiments_set_updated_at on experiments;
create trigger experiments_set_updated_at
  before update on experiments
  for each row execute function set_updated_at();

create table if not exists activity (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  text       text not null,
  kind       text not null default 'edit',
  created_at timestamptz not null default now()
);

create index if not exists activity_task_id_idx on activity (task_id, created_at desc);

-- Same lockdown as 0004: authenticated-only.
alter table activity enable row level security;
drop policy if exists "auth access" on activity;
create policy "auth access" on activity for all to authenticated using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table activity;
exception when others then null; end $$;
```

- [ ] **Step 2: Extend `lib/types.ts`**

Add `updated_at: string;` directly after `created_at: string;` in BOTH `Task` and `Experiment`. Append at end of file:

```ts
export type ActivityKind =
  | "create"
  | "status"
  | "assign"
  | "experiment"
  | "note"
  | "edit"
  | "comment";

export interface Activity {
  id: string;
  task_id: string;
  text: string;
  kind: ActivityKind;
  created_at: string;
}
```

- [ ] **Step 3: Create `lib/time.ts`**

```ts
export function fmtDate(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "just now" / "37m ago" / "5h ago" / "3d ago", falling back to a date after 30 days. */
export function relTime(ts: string | null | undefined): string {
  if (!ts) return "";
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(ts);
}
```

- [ ] **Step 4: Create `lib/status.ts`** (single source; Tasks 4–5 delete their local copies)

```ts
import type { Status } from "@/lib/types";

export const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "blocked", label: "Blocked" },
];

export function statusLabel(s: Status): string {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
}

export function nextStatus(s: Status): Status {
  const order = STATUS_OPTIONS.map((o) => o.value);
  return order[(order.indexOf(s) + 1) % order.length];
}
```

- [ ] **Step 5: Create `lib/activity.ts`**

```ts
import { supabase } from "@/lib/supabase";
import type { ActivityKind } from "@/lib/types";

/** Fire-and-forget timeline event. Realtime pushes it to open task pages. */
export async function logActivity(taskId: string, text: string, kind: ActivityKind): Promise<void> {
  if (!supabase) return;
  await supabase.from("activity").insert({ task_id: taskId, text, kind });
}

export const KIND_COLOR: Record<ActivityKind, string> = {
  create: "var(--good)",
  status: "var(--warn)",
  assign: "var(--accent)",
  experiment: "var(--accent)",
  note: "var(--todo)",
  edit: "var(--todo)",
  comment: "var(--good)",
};
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0005_activity_and_timestamps.sql lib/types.ts lib/time.ts lib/status.ts lib/activity.ts
git commit -m "Add activity table, updated_at timestamps, and shared time/status/activity libs"
```

---

### Task 2: Blueprint retheme (globals.css tokens + tinted foundations)

**Files:**
- Modify: `app/globals.css` (`:root` block lines 5–28, `.stage.dark` rules, radii, body background)
- Modify: `components/Board.tsx:344-346` (`dark` → `found` class)

**Interfaces:**
- Consumes: nothing new.
- Produces: CSS variables `--accent`, `--accent-hover`, `--accent-soft`, `--found-bg`, `--shadow-1`, `--shadow-3` used by Tasks 3–6 CSS.

- [ ] **Step 1: Replace the `:root` token block** in `app/globals.css` with:

```css
:root {
  --ground: #f6f7f9;
  --paper: #ffffff;
  --ink: #1c2127;
  --ink-soft: #5f6b7c;
  --line: #5f6b7c1f;
  --line-strong: #5f6b7c40;
  --accent: #2d72d2;
  --accent-hover: #215db0;
  --accent-soft: color-mix(in srgb, var(--accent) 15%, #fff);
  --found-bg: #edeff2;
  --warn: #c87619;
  --warn-soft: color-mix(in srgb, var(--warn) 14%, #fff);
  --todo: #5f6b7c;
  --todo-soft: #edeff2;
  --good: #238551;
  --good-soft: color-mix(in srgb, var(--good) 13%, #fff);
  --crit: #cd4246;
  --crit-soft: color-mix(in srgb, var(--crit) 12%, #fff);
  --shadow-1: 0px 0px 0px 1px rgba(0, 0, 0, 0.1), 0px 1px 3px 0px rgba(0, 0, 0, 0.1),
    0px 1px 2px -1px rgba(0, 0, 0, 0.1);
  --shadow-3: 0px 0px 0px 1px rgba(0, 0, 0, 0.1), 0px 4px 6px -4px rgba(0, 0, 0, 0.1),
    0px 10px 15px -3px rgba(0, 0, 0, 0.1);
  --mono: "Cascadia Code", "Consolas", ui-monospace, "SFMono-Regular", monospace;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
```

(Removed: `--dark`, `--dark-soft`, `--on-dark`, `--on-dark-mute` — dark foundations are gone. `--line-strong` keeps its name but is now translucent.)

- [ ] **Step 2: Update body dot grid** (line 36): `background-image: radial-gradient(rgba(45, 114, 210, 0.12) 1px, transparent 1px);`

- [ ] **Step 3: Tinted foundation cards.** Delete every `.stage.dark …` rule (there are 15+: `.stage.dark`, `.stage.dark .task`, `.stage.dark .stage-name`, `.stage.dark .stage-obj`, `.stage.dark .empty`, `.stage.dark .editable:hover`, `.stage.dark .edit-input`, `.stage.dark .btn-add-task`(2), `.stage.dark .icon-btn`(2), `.stage.dark .add-owner`, `.stage.dark .task-title`, `.stage.dark .task-open:hover`, `.stage.dark .md-view:hover`, `.stage.dark .md-view.placeholder`, `.stage.dark .md-textarea`, `.stage.dark .md-hint`, and all `.stage.dark .markdown*` rules). Replace with:

```css
.stage.found {
  background: var(--found-bg);
  border-color: var(--line-strong);
  border-top-color: var(--line-strong);
}
.stage.found .task { background: var(--paper); border-color: var(--line-strong); }
.stage.found .empty { border-color: var(--line-strong); background: transparent; }
```

And update `.stage-tag` color from `var(--on-dark-mute)` to `var(--ink-soft)`.

- [ ] **Step 4: Blueprint surface polish.**
  - `.stage`: add `box-shadow: var(--shadow-1);` and change `border-radius: 10px` → `6px`.
  - `.legend`, `.table-scroll`, `.team-bar`, `.bar-chart`, `.exp-card`, `.img-card`, `.setup-card`, `.login-card`, `.error-banner`: `border-radius` → `6px`.
  - `.task`, `.empty`, `.menu`: `border-radius` → `6px`; `.menu` `box-shadow: var(--shadow-3);`.
  - `.markdown pre`: `background: var(--dark)` no longer exists → use `#252a31; color: #f6f7f9;`.
  - `.btn.primary:hover`: `#33409c` → `var(--accent-hover)` (both background and border-color).
  - `.av` border `#d8dcf4` → `var(--line)`.
  - `.dot.todo` background `var(--line-strong)` → `#abb3bf`.
- [ ] **Step 5: Change foundation class in Board.tsx** (line 344–346):

```tsx
  const found = module.kind === "foundation";
  return (
    <article className={`stage ${found ? "found" : ""}`}>
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: both exit 0. Grep check: `grep -c "stage.dark\|--on-dark\|--dark" app/globals.css` → `0`.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css components/Board.tsx
git commit -m "Retheme to Blueprint palette; foundations tinted instead of dark"
```

---

### Task 3: Navbar + layout

**Files:**
- Create: `components/Navbar.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css` (append navbar styles; trim `.wrap` top padding)

**Interfaces:**
- Consumes: `usePathname` from `next/navigation` (client component), CSS vars from Task 2.
- Produces: global `<Navbar />` on every page; `/analytics` link target (page arrives in Task 6 — the link 404s until then, acceptable mid-plan).

- [ ] **Step 1: Create `components/Navbar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();
  const boardActive = pathname === "/" || pathname.startsWith("/task");
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <span className="brand">
          <span className="brand-logo" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 2.5 L13.5 12 H2.5 Z" fill="#fff" />
              <path d="M8 6.2 L11 11.4 H5 Z" fill="var(--accent)" />
            </svg>
          </span>
          Triton Board
        </span>
        <span className="live-badge">
          <span className="live-dot" />
          LIVE
        </span>
        <span className="navbar-spacer" />
        <Link href="/" className={`nav-btn ${boardActive ? "active" : ""}`}>
          Board
        </Link>
        <Link href="/analytics" className={`nav-btn ${pathname === "/analytics" ? "active" : ""}`}>
          Analytics
        </Link>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Mount in `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Triton Kernel Agent — RL Training Board",
  description: "Live project board for the Triton kernel agent RL training project",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Append navbar CSS** to `app/globals.css` and change `.wrap` padding to `40px 28px 80px`:

```css
/* ================= Navbar ================= */
.navbar { background: var(--paper); box-shadow: var(--shadow-1); position: relative; z-index: 40; }
.navbar-inner {
  max-width: 1180px; margin: 0 auto; height: 50px;
  display: flex; align-items: center; gap: 14px; padding: 0 8px;
}
.brand {
  display: inline-flex; align-items: center; gap: 9px;
  font-weight: 600; font-size: 16px; letter-spacing: -0.01em; color: var(--ink);
}
.brand-logo {
  width: 28px; height: 28px; border-radius: 8px;
  background: linear-gradient(145deg, var(--accent), color-mix(in srgb, var(--accent) 65%, #111418));
  display: inline-flex; align-items: center; justify-content: center; color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), var(--shadow-1);
}
.live-badge {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em;
  color: var(--good); display: inline-flex; align-items: center; gap: 5px;
}
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--good); }
.navbar-spacer { flex: 1; }
.nav-btn {
  font-size: 14px; color: var(--ink); text-decoration: none;
  padding: 5px 12px; border-radius: 4px;
}
.nav-btn:hover { background: var(--found-bg); }
.nav-btn.active { background: var(--todo-soft); font-weight: 600; color: var(--accent); }
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: exit 0. Build output lists routes `/` and `/task/[id]`.

- [ ] **Step 5: Commit**

```bash
git add components/Navbar.tsx app/layout.tsx app/globals.css
git commit -m "Add global navbar with Board/Analytics navigation"
```

---

### Task 4: Board — status pill cycling, timestamps, pin-to-top add, activity logging

**Files:**
- Modify: `components/Board.tsx`
- Modify: `app/globals.css` (pill button + task-updated styles)

**Interfaces:**
- Consumes: `relTime` (lib/time), `statusLabel`, `nextStatus`, `STATUS_OPTIONS` (lib/status — delete Board's local copy lines 15–24), `logActivity` (lib/activity), `Task.updated_at`.
- Produces: `AssigneePicker` becomes controlled: props `{ task, members, open, onToggleOpen, onClose, onToggle, onAddMember }`. `TaskRow` gains `pickerOpen: boolean`, `onTogglePicker: () => void`, `onClosePicker: () => void`. Task 5 mirrors the pill-cycling pattern.

- [ ] **Step 1: Imports & dedupe.** In `components/Board.tsx` add imports and DELETE the local `STATUS_OPTIONS` and `statusLabel` (lines 15–24):

```tsx
import { relTime } from "@/lib/time";
import { nextStatus, statusLabel } from "@/lib/status";
import { logActivity } from "@/lib/activity";
```

- [ ] **Step 2: Controlled AssigneePicker.** Replace its signature and internal `open` state:

```tsx
function AssigneePicker({
  task,
  members,
  open,
  onToggleOpen,
  onClose,
  onToggle,
  onAddMember,
}: {
  task: Task;
  members: Member[];
  open: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  onToggle: (name: string) => void;
  onAddMember: (name: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const ref = useClickOutside(onClose);
  // …body unchanged except:
  //   <button className="add-owner" onClick={onToggleOpen} …>
  //   {open && ( <div className="menu" …> … )}
}
```

- [ ] **Step 3: TaskRow — pill button + updated + picker plumbing.** Replace the `<select className={`pill …`}>` block with a cycling button, add the relative-updated stamp next to the title, and pass picker props through:

```tsx
function TaskRow({ task, members, pickerOpen, onTogglePicker, onClosePicker, onPatch, onDelete, onToggleAssignee, onAddMember }: {
  task: Task;
  members: Member[];
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onClosePicker: () => void;
  onPatch: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onToggleAssignee: (name: string) => void;
  onAddMember: (name: string) => void;
}) {
```

In the title row, after the Link/rename button, add:

```tsx
        <span className="task-updated" title="Last updated">{relTime(task.updated_at)}</span>
```

Replace the status `<select>` with:

```tsx
          <button
            className={`pill ${task.status}`}
            title="Click to change status"
            aria-label={`Status: ${statusLabel(task.status)}. Click to change.`}
            onClick={() => onPatch({ status: nextStatus(task.status) })}
          >
            {statusLabel(task.status)}
          </button>
```

And render `<AssigneePicker task={task} members={members} open={pickerOpen} onToggleOpen={onTogglePicker} onClose={onClosePicker} onToggle={onToggleAssignee} onAddMember={onAddMember} />`.

- [ ] **Step 4: ModuleCard plumbing.** Add `pickerId: string | null` and `onSetPicker: (id: string | null) => void` props; pass to each TaskRow:

```tsx
          <TaskRow
            key={t.id}
            task={t}
            members={members}
            pickerOpen={pickerId === t.id}
            onTogglePicker={() => onSetPicker(pickerId === t.id ? null : t.id)}
            onClosePicker={() => { if (pickerId === t.id) onSetPicker(null); }}
            …
          />
```

- [ ] **Step 5: Board state + mutations.** In `Board()`:
  - Add `const [pickerId, setPickerId] = useState<string | null>(null);` and pass `pickerId`/`onSetPicker={setPickerId}` to every ModuleCard (pipeline + foundations).
  - `patchTask` — log status/title changes:

```tsx
  const patchTask = useCallback(
    async (id: string, patch: Partial<Task>) => {
      if (!supabase) return;
      await supabase.from("tasks").update(patch).eq("id", id);
      if (patch.status) logActivity(id, `Status set to ${statusLabel(patch.status)}`, "status");
      if (patch.title) logActivity(id, `Renamed to “${patch.title}”`, "edit");
      reload();
    },
    [reload]
  );
```

  - `addTask` — pin to top, log, auto-open picker (design: new tasks appear first and the assignee picker opens immediately):

```tsx
  const addTask = useCallback(
    async (moduleId: string) => {
      if (!supabase) return;
      const siblings = tasks.filter((t) => t.module_id === moduleId);
      const topPos = siblings.length ? Math.min(...siblings.map((i) => i.position)) - 1 : 0;
      const { data } = await supabase
        .from("tasks")
        .insert({ module_id: moduleId, title: "New task", status: "todo", assignees: [], position: topPos })
        .select("id")
        .single();
      if (data) {
        logActivity(data.id, "Task created", "create");
        setPickerId(data.id);
      }
      reload();
    },
    [tasks, reload]
  );
```

  - `toggleAssignee` — after the update: `logActivity(taskId, task.assignees.includes(name) ? \`Unassigned ${name}\` : \`Assigned ${name}\`, "assign");` (compute `had` before building `next`, mirroring existing code).
  - `addMemberToTask` — when the assignee update runs: `logActivity(taskId, \`Assigned ${n}\`, "assign");`
- [ ] **Step 6: Legend lastUpdated.** In `Board()` add:

```tsx
  const lastUpdated = useMemo(() => {
    const times = tasks.map((t) => new Date(t.updated_at ?? t.created_at).getTime()).filter((n) => !Number.isNaN(n));
    return times.length ? relTime(new Date(Math.max(...times)).toISOString()) : "just now";
  }, [tasks]);
```

Replace the legend line `Edits sync live · everyone with the link` with:

```tsx
          <span className="updated">Last updated {lastUpdated} · everyone with the link</span>
```

- [ ] **Step 7: CSS.** Append to `app/globals.css`:

```css
/* task updated stamp + pill-as-button */
.task-updated {
  font-family: var(--mono); font-size: 10.5px; color: var(--todo);
  flex: 0 0 auto; white-space: nowrap;
}
button.pill { font: inherit; font-family: var(--mono); font-size: 11px; }
button.pill:hover { filter: brightness(0.96); }
button.pill:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: exit 0. Grep check: `grep -c "STATUS_OPTIONS" components/Board.tsx` → `0` (moved to lib/status; Board no longer renders a select).

- [ ] **Step 9: Commit**

```bash
git add components/Board.tsx app/globals.css
git commit -m "Board: cycling status pills, updated stamps, pin-to-top add task, activity logging"
```

---

### Task 5: Task detail — meta line, pill cycling, experiment stamps, activity timeline

**Files:**
- Modify: `components/TaskDetail.tsx`
- Modify: `app/globals.css` (timeline styles)

**Interfaces:**
- Consumes: `relTime`, `fmtDate` (lib/time), `nextStatus`, `statusLabel` (lib/status — delete TaskDetail's local `STATUS_OPTIONS` lines 9–14), `logActivity`, `KIND_COLOR` (lib/activity), `Activity`, `Task.updated_at`, `Experiment.updated_at`.
- Produces: nothing consumed later.

- [ ] **Step 1: Imports & state.**

```tsx
import { fmtDate, relTime } from "@/lib/time";
import { nextStatus, statusLabel } from "@/lib/status";
import { KIND_COLOR, logActivity } from "@/lib/activity";
import type { Activity, /* keep existing */ } from "@/lib/types";
```

Delete local `STATUS_OPTIONS` (lines 9–14). Add state `const [activity, setActivity] = useState<Activity[]>([]);` and `const [draftNote, setDraftNote] = useState("");`

- [ ] **Step 2: Load + subscribe.** In `reload`, add to the `Promise.all`:

```tsx
      supabase.from("activity").select("*").eq("task_id", id).order("created_at", { ascending: false }),
```

and `setActivity((actRes.data ?? []) as Activity[]);`. In the realtime effect add:

```tsx
      .on("postgres_changes", { event: "*", schema: "public", table: "activity" }, reload)
```

- [ ] **Step 3: Logged mutations.**
  - `updateTask`: after the update — `if (patch.status) logActivity(id, \`Status set to ${statusLabel(patch.status)}\`, "status"); if (patch.title) logActivity(id, \`Renamed to “${patch.title}”\`, "edit"); if (patch.notes !== undefined) logActivity(id, "Updated progress notes", "note");`
  - `addExperiment`: build the name first, then `logActivity(id, \`Added experiment “${name}”\`, "experiment");`
  - `deleteExperiment`: look up the experiment before deleting; `logActivity(id, \`Removed experiment “${exp.name}”\`, "experiment");`
  - `toggleAssignee`: `logActivity(id, had ? \`Unassigned ${name}\` : \`Assigned ${name}\`, "assign");`
  - New: `async function addTimelineNote() { const v = draftNote.trim(); if (!v) return; await logActivity(id, v, "comment"); setDraftNote(""); reload(); }`
- [ ] **Step 4: Header meta.** Replace the status `<select>` with the same cycling pill button as Task 4 Step 3 (`onClick={() => updateTask({ status: nextStatus(task.status) })}`), and add at the end of `.detail-meta`:

```tsx
          <span className="detail-dates">
            Created {fmtDate(task.created_at)} · Updated {relTime(task.updated_at)}
          </span>
```

- [ ] **Step 5: Experiment stamps.** In `ExperimentCard` head, after the name, add (pass `exp.updated_at` via existing `exp` prop):

```tsx
        <span className="exp-updated">Updated {relTime(exp.updated_at)}</span>
```

- [ ] **Step 6: Timeline section.** After the Experiments `</section>`, add:

```tsx
      <section className="detail-section">
        <div className="detail-section-head"><h2>Activity timeline</h2></div>
        <div className="timeline-add">
          <input
            value={draftNote}
            placeholder="Add a note to the timeline…"
            onChange={(e) => setDraftNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTimelineNote(); }}
            aria-label="Add a note to the timeline"
          />
          <button className="btn primary" onClick={addTimelineNote}>Add note</button>
        </div>
        {activity.length === 0 ? (
          <p className="muted">No activity yet.</p>
        ) : (
          <div className="timeline">
            {activity.map((ev, i) => (
              <div className="tl-row" key={ev.id}>
                <div className="tl-rail">
                  <span className="tl-dot" style={{ background: KIND_COLOR[ev.kind] ?? "var(--todo)" }} />
                  {i < activity.length - 1 && <span className="tl-line" />}
                </div>
                <div className="tl-body">
                  <div className="tl-text">{ev.text}</div>
                  <div className="tl-time">{relTime(ev.created_at)} · {fmtDate(ev.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
```

- [ ] **Step 7: CSS.** Append to `app/globals.css`:

```css
/* ================= Activity timeline ================= */
.detail-dates { font-family: var(--mono); font-size: 12px; color: var(--todo); margin-left: auto; }
.exp-updated { font-family: var(--mono); font-size: 11px; color: var(--todo); white-space: nowrap; }
.timeline-add { display: flex; gap: 8px; align-items: center; margin-bottom: 20px; }
.timeline-add input {
  flex: 1; font: inherit; font-size: 14px; padding: 7px 10px;
  border: 1px solid var(--line-strong); border-radius: 4px; outline: none; background: var(--paper);
}
.timeline-add input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.timeline { display: flex; flex-direction: column; }
.tl-row { display: grid; grid-template-columns: 14px 1fr; gap: 14px; }
.tl-rail { display: flex; flex-direction: column; align-items: center; }
.tl-dot {
  width: 11px; height: 11px; border-radius: 50%; margin-top: 3px; flex: 0 0 auto;
  border: 2px solid var(--paper); box-shadow: 0 0 0 1px var(--line-strong);
}
.tl-line { flex: 1; width: 2px; background: var(--line); margin: 3px 0; }
.tl-body { padding-bottom: 18px; }
.tl-text { font-size: 14px; line-height: 1.4; color: var(--ink); }
.tl-time { font-family: var(--mono); font-size: 11.5px; color: var(--todo); margin-top: 2px; }
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: exit 0. Grep: `grep -c "STATUS_OPTIONS" components/TaskDetail.tsx` → `0`.

- [ ] **Step 9: Commit**

```bash
git add components/TaskDetail.tsx app/globals.css
git commit -m "Task detail: created/updated meta, cycling status, activity timeline"
```

---

### Task 6: Analytics view

**Files:**
- Create: `components/Analytics.tsx`
- Create: `app/analytics/page.tsx`
- Modify: `app/globals.css` (analytics styles)

**Interfaces:**
- Consumes: `supabase`, `isSupabaseConfigured`, types, `statusLabel`, `STATUS_OPTIONS` (lib/status), `initialsFromName` logic (duplicate the 6-line helper locally — it lives inside Board.tsx and is not exported).
- Produces: route `/analytics` (Navbar link from Task 3 now resolves).

- [ ] **Step 1: Create `app/analytics/page.tsx`**

```tsx
import Analytics from "@/components/Analytics";
import AuthGate from "@/components/AuthGate";

export default function AnalyticsPage() {
  return (
    <AuthGate>
      <Analytics />
    </AuthGate>
  );
}
```

- [ ] **Step 2: Create `components/Analytics.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { STATUS_OPTIONS } from "@/lib/status";
import type { Member, Module, Status, Task } from "@/lib/types";

const STATUS_COLOR: Record<Status, string> = {
  todo: "#abb3bf",
  in_progress: "var(--warn)",
  done: "var(--good)",
  blocked: "var(--crit)",
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Analytics() {
  const [modules, setModules] = useState<Module[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!supabase) return;
    const [m, t, mem] = await Promise.all([
      supabase.from("modules").select("*").order("position"),
      supabase.from("tasks").select("*").order("position"),
      supabase.from("members").select("*").order("position"),
    ]);
    setModules((m.data ?? []) as Module[]);
    setTasks((t.data ?? []) as Task[]);
    setMembers((mem.data ?? []) as Member[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    const client = supabase;
    reload();
    const channel = client
      .channel("analytics-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "modules" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "members" }, reload)
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [reload]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const counts: Record<Status, number> = { todo: 0, in_progress: 0, done: 0, blocked: 0 };
    for (const t of tasks) counts[t.status] += 1;
    const completion = total ? counts.done / total : 0;
    const maxCount = Math.max(1, ...Object.values(counts));

    const statusBars = STATUS_OPTIONS.map((o) => ({
      label: o.label,
      count: counts[o.value],
      width: `${((counts[o.value] / maxCount) * 100).toFixed(1)}%`,
      color: STATUS_COLOR[o.value],
    }));

    const workload = members
      .map((m) => {
        const mine = tasks.filter((t) => t.assignees.includes(m.name));
        const done = mine.filter((t) => t.status === "done").length;
        const prog = mine.filter((t) => t.status === "in_progress").length;
        const tot = mine.length || 1;
        return {
          name: m.name,
          initials: m.initials || initialsFromName(m.name),
          summary: `${mine.length} task${mine.length === 1 ? "" : "s"}`,
          doneWidth: `${((done / tot) * 100).toFixed(1)}%`,
          progWidth: `${((prog / tot) * 100).toFixed(1)}%`,
          count: mine.length,
        };
      })
      .filter((w) => w.count > 0);

    const moduleStats = modules.map((m) => {
      const mine = tasks.filter((t) => t.module_id === m.id);
      const done = mine.filter((t) => t.status === "done").length;
      const pct = mine.length ? done / mine.length : 0;
      return {
        id: m.id,
        name: m.name,
        kindLabel: m.kind === "foundation" ? "Foundation" : "Pipeline",
        pct,
        complete: pct >= 1,
        summary: `${done} / ${mine.length} done`,
      };
    });

    const kpis = [
      { label: "Total tasks", value: total, color: "var(--ink)" },
      { label: "In progress", value: counts.in_progress, color: "var(--warn)" },
      { label: "Done", value: counts.done, color: "var(--good)" },
      { label: "Blocked", value: counts.blocked, color: "var(--crit)" },
    ];

    return { total, counts, completion, statusBars, workload, moduleStats, kpis };
  }, [tasks, members, modules]);

  if (!isSupabaseConfigured) {
    return (
      <div className="wrap">
        <p className="state-note">
          Connect Supabase first — open the board for setup instructions.
        </p>
      </div>
    );
  }
  if (loading) return <div className="wrap"><p className="state-note">Loading analytics…</p></div>;

  return (
    <div className="wrap">
      <p className="eyebrow">Overview</p>
      <h1>Project Analytics</h1>

      <div className="kpi-grid">
        {stats.kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="panel-grid">
        <div className="panel">
          <div className="panel-title">Overall completion</div>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${stats.completion * 100}%` }} />
          </div>
          <div className="panel-sub">
            {Math.round(stats.completion * 100)}% of tasks done ({stats.counts.done} / {stats.total})
          </div>
          <div className="status-bars">
            {stats.statusBars.map((s) => (
              <div className="bar-row status-bar-row" key={s.label}>
                <span className="bar-label">{s.label}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: s.width, background: s.color }} />
                </div>
                <span className="bar-value">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Workload by member</div>
          {stats.workload.length === 0 ? (
            <p className="muted">No assignments yet.</p>
          ) : (
            <div className="workload">
              {stats.workload.map((w) => (
                <div key={w.name}>
                  <div className="workload-head">
                    <span className="av">{w.initials}</span>
                    <span className="workload-name">{w.name}</span>
                    <span className="workload-summary">{w.summary}</span>
                  </div>
                  <div className="workload-track">
                    <div style={{ width: w.doneWidth, background: "var(--good)" }} />
                    <div style={{ width: w.progWidth, background: "var(--warn)" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="section-label">
        Module progress<span className="rule" />
      </div>
      <div className="module-grid">
        {stats.moduleStats.map((m) => (
          <div className="panel module-panel" key={m.id}>
            <div className="module-head">
              <span className="module-name">{m.name}</span>
              <span className="module-kind">{m.kindLabel}</span>
            </div>
            <div className="progress slim">
              <div
                className="progress-fill"
                style={{ width: `${m.pct * 100}%`, background: m.complete ? "var(--good)" : "var(--accent)" }}
              />
            </div>
            <div className="panel-sub">{m.summary}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: CSS.** Append to `app/globals.css`:

```css
/* ================= Analytics ================= */
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; margin-bottom: 28px; }
.kpi { background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 18px; box-shadow: var(--shadow-1); }
.kpi-label {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--todo); margin-bottom: 8px;
}
.kpi-value { font-size: 32px; font-weight: 700; line-height: 1; }
.panel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
.panel { background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 20px; box-shadow: var(--shadow-1); }
.panel-title { font-size: 15px; font-weight: 600; margin-bottom: 16px; }
.panel-sub { font-family: var(--mono); font-size: 12px; color: var(--todo); margin-top: 8px; }
.progress { height: 10px; background: var(--found-bg); border-radius: 40px; overflow: hidden; }
.progress.slim { height: 8px; }
.progress-fill { height: 100%; background: var(--good); border-radius: 40px; min-width: 2px; }
.status-bars { margin-top: 20px; display: flex; flex-direction: column; gap: 12px; }
.status-bar-row { grid-template-columns: 90px 1fr 40px; }
.status-bars .bar-track { height: 12px; }
.workload { display: flex; flex-direction: column; gap: 14px; }
.workload-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.workload-head .av { width: 22px; height: 22px; font-size: 10px; }
.workload-name { font-size: 13.5px; font-weight: 550; flex: 1; }
.workload-summary { font-family: var(--mono); font-size: 12px; color: var(--todo); }
.workload-track { height: 10px; background: var(--found-bg); border-radius: 4px; overflow: hidden; display: flex; }
.workload-track > div { height: 100%; }
.module-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.module-panel { padding: 16px; display: flex; flex-direction: column; }
.module-head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 12px; }
.module-name { font-size: 14px; font-weight: 600; flex: 1; line-height: 1.3; }
.module-kind {
  flex: 0 0 auto; font-family: var(--mono); font-size: 11px; padding: 1px 7px;
  border-radius: 4px; background: var(--found-bg); color: var(--todo);
}
.module-panel .progress { margin-top: auto; }
@media (max-width: 820px) { .panel-grid { grid-template-columns: 1fr; } }
```

(Place the media query addition next to the existing 820px block.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: exit 0; build route list includes `/analytics`.

- [ ] **Step 5: Commit**

```bash
git add app/analytics/page.tsx components/Analytics.tsx app/globals.css
git commit -m "Add analytics view: KPIs, completion, workload, module progress"
```

---

### Task 7: Docs + end-to-end visual verification

**Files:**
- Modify: `README.md` (features list / migrations note)

- [ ] **Step 1: README.** In the features/overview section add one line each for: Analytics view (`/analytics`), per-task activity timeline, task/experiment "updated" stamps. In the migrations section note that `0005_activity_and_timestamps.sql` is applied by the usual `npm run db:migrate`.

- [ ] **Step 2: Full build check**

Run: `npx tsc --noEmit && npm run build`
Expected: exit 0.

- [ ] **Step 3: Visual verify (no DB locally).** Use the `run` skill: `npm run dev`, then check `/` (SetupScreen renders under the new navbar, Blueprint palette applied), `/analytics` ("Connect Supabase first" note under navbar, nav highlights Analytics). Screenshot both. Full data flows (timeline, pill cycling, lastUpdated) require the maintainer's Supabase env: after pulling, run `npm run db:migrate`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "README: document analytics view, activity timeline, migration 0005"
```

---

## Self-Review Notes

- Spec coverage: navbar ✅(T3), board header lastUpdated ✅(T4), pipeline/foundation cards tinted ✅(T2), status click-cycle ✅(T4/T5), per-task updated stamp ✅(T4), new-task pin-to-top + auto picker ✅(T4), ownership/team sections — unchanged, restyled by token swap (T2), task detail meta ✅(T5), charts — already exist, timeline ✅(T5), experiments updated stamp ✅(T5), analytics ✅(T6). Design props (accent picker, foundationStyle enum, showDotGrid toggle) are design-canvas theming knobs, NOT app features — fixed at their defaults (#2D72D2, tinted, dots on).
- Deliberate deviations from the design prototype (kept existing, richer app behavior): Markdown objectives/notes instead of plain EditableText; attachments/uploads kept; module delete confirm kept; EditableText rename for pipeline card titles kept; select→pill replaces select entirely.
- Type consistency: `Activity.created_at` (DB) vs design's `ts` — code always uses `created_at`. `logActivity(taskId, text, kind)` signature consistent across T1/T4/T5.
