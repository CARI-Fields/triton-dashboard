# Triton Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every authenticated Triton Board surface as the approved desktop-first, Notion-like Research OS with generic Type/Tags task metadata, a matching dark theme, and schema-driven experiment comparison.

**Architecture:** Keep the current Next.js App Router pages and Supabase client-side collaboration model, then add a thin task-domain adapter over the legacy `modules/module_id` storage names. Centralize semantic CSS tokens, theme state, shell navigation, and small UI primitives; preserve the existing realtime, draft, conflict, attachment, and compare derivation logic while replacing route markup and layout.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript 5, Supabase JS/CLI 2.110.0, Postgres 17 local stack, Vitest 4.1.10, Testing Library, global CSS imported from the root layout.

## Global Constraints

- Read and follow `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`, `05-server-and-client-components.md`, `11-css.md`, `13-fonts.md`, and `03-api-reference/02-components/script.md`; this repository uses Next.js 16.2.10, not older conventions.
- Use a Node runtime accepted by Vite/Rolldown: `^20.19.0 || ^22.12.0 || >=24.0.0`; the implementation target is Node `22.12.0`.
- Do not add a styling framework, icon dependency, font package, state library, or component library.
- Import global CSS only from `app/layout.tsx`; keep import order deterministic because Next.js production CSS ordering follows JavaScript import order.
- Keep `app/layout.tsx` a Server Component. Browser theme state belongs in narrowly scoped Client Components.
- Preserve all existing routes and all Supabase Auth, RLS, Realtime, Draft, Conflict, Attachment, Timeline, Retry, Duplicate, Baseline, and URL-share behavior.
- User-facing copy uses `Type` and `Owner`; it must not expose `Module`, `Foundation`, `Pipeline`, `Assignee`, or `Assignees`.
- The database continues to use `modules` and `tasks.module_id` as a compatibility layer in this release.
- Task Board defaults to `To do | In progress | Done | Blocked`; Distill, SFT, and RL are never fixed columns.
- `Type` is optional single-select metadata; `Tags` are optional multi-select metadata.
- Compare remains experiments-as-rows and schema-fields-as-columns. Columns are derived only by `buildCompareColumns`; only finite numeric Result metrics receive neutral current-minus-baseline Delta columns.
- Light and dark themes share semantic tokens. Dark baseline: canvas `#141414`, surface `#252525`, border `#414141`, primary text `#E6E6E6`, accent `#1E96EB`.
- Desktop visual baseline is `1536×1024`; required breakpoints are 1280px, 1024px, 768px, and 390px.
- Do not stage or modify unrelated `.agents/`, `.superpowers/`, or `skills-lock.json` files.
- Run Supabase CLI commands with `SUPABASE_TELEMETRY_DISABLED=1`.
- Create migration files with `supabase migration new`; do not invent migration timestamps.
- Every exposed table keeps RLS enabled. Existing authenticated grants remain explicit; no `anon` table privileges may be added.
- Use the TDD cycle for behavior changes: failing test, observed failure, minimal implementation, passing targeted test, then commit.
- Before claiming completion, use `superpowers:verification-before-completion`, `build-web-apps:frontend-testing-debugging`, and a browser verification skill.

## Visual Baselines

The approved concept assets remain in the original workspace and must be viewed before implementation and again during final comparison:

- `.superpowers/brainstorm/47989-1785174918/content/triton-task-board-concept-v2.png`
- `.superpowers/brainstorm/47989-1785174918/content/triton-add-task-concept.png`
- `.superpowers/brainstorm/47989-1785174918/content/triton-experiments-database-concept.png`
- `.superpowers/brainstorm/47989-1785174918/content/triton-experiment-detail-concept.png`
- `.superpowers/brainstorm/47989-1785174918/content/triton-compare-concept-v2.png`
- `.superpowers/brainstorm/47989-1785174918/content/triton-analytics-concept.png`
- `.superpowers/brainstorm/47989-1785174918/content/triton-task-board-dark-concept.png`
- `.superpowers/brainstorm/47989-1785174918/content/triton-experiments-dark-concept.png`

## Known Baseline

`npm test` currently exits before collecting tests because the shell provides Node `18.19.1`, while Next 16 requires Node `>=20.9.0` and Vite/Rolldown require `^20.19.0 || ^22.12.0 || >=24.0.0`. The observed error is:

```text
SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'
```

This is an environment mismatch, not an application-test failure. Task 1 fixes the runtime contract before any feature work.

## File Structure

### New focused files

- `.nvmrc` — repository-local Node target.
- `lib/tasks/model.ts` — storage/domain mapping, Type/Owner terminology, tag normalization, and task mutation payloads.
- `lib/tasks/analytics.ts` — pure task analytics derivation and CSV serialization.
- `lib/tasks/__tests__/model.test.ts` — task adapter and tag normalization tests.
- `lib/tasks/__tests__/analytics.test.ts` — analytics derivation tests.
- `components/theme/ThemeProvider.tsx` — persisted theme state and DOM synchronization.
- `components/theme/ThemeToggle.tsx` — accessible Light/Dark control.
- `components/ui/Icons.tsx` — shared `currentColor` line icons.
- `components/ui/Drawer.tsx` — focus-trapped responsive side sheet.
- `components/ui/PageHeader.tsx` — shared eyebrow/title/description/actions structure.
- `components/ui/StatusDot.tsx` — text-plus-dot task and experiment statuses.
- `components/ui/OwnerAvatar.tsx` — deterministic owner initials.
- `components/ui/Tag.tsx` — deterministic low-chroma tag tone.
- `components/ui/useModalFocus.ts` — shared modal focus management moved from the experiment folder.
- `components/tasks/AddTaskDrawer.tsx` — create-task form and inline Type/Tag creation.
- `components/tasks/TaskCard.tsx` — compact board card.
- `components/tasks/TaskBoardView.tsx` — Status/Type grouping and columns.
- `components/tasks/BoardSecondaryViews.tsx` — Types, Ownership, and Team views.
- `components/tasks/TaskProperties.tsx` — Task Detail property editor.
- New Testing Library files colocated under `components/**/__tests__/`.
- A CLI-generated `supabase/migrations/*_task_type_metadata.sql` — task metadata and safe Type foreign key.
- `supabase/tests/0007_task_type_metadata.sql` — transactional schema assertions.

### Existing files with retained responsibilities

- `app/layout.tsx` — root Server Component, CSS imports, pre-hydration theme script, shell.
- `app/globals.css` — reset, semantic tokens, shared primitives, shell, task/analytics layouts.
- `app/experiment-workspace.css` — experiment-specific layout only.
- `components/Navbar.tsx` — route-aware primary navigation.
- `components/AuthGate.tsx` — session gate and logout behavior.
- `components/Board.tsx` — Supabase loading, realtime subscriptions, mutation orchestration.
- `components/TaskDetail.tsx` — existing race-safe Task detail orchestration.
- `components/Analytics.tsx` — data loading and rendering of pure analytics output.
- `components/experiments/*` — existing experiment behavior with redesigned structure.
- `lib/types.ts` — shared storage and domain types.
- `app/__tests__/workspace-styles.test.ts` — semantic token and breakpoint contracts.

---

### Task 1: Establish the Supported Node Runtime and Green Baseline

**Files:**

- Create: `.nvmrc`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-27-triton-dashboard-design-system-design.md`

**Interfaces:**

- Consumes: installed Next.js/Vite package engine ranges.
- Produces: a reproducible Node `22.12.0` project runtime and a trustworthy pre-feature test baseline.

- [ ] **Step 1: Reproduce and record the runtime failure**

Run:

```bash
node --version
node -e "const u=require('node:util'); console.log(typeof u.styleText)"
npm test
```

Expected on the old shell: Node `v18.19.1`, `undefined`, then Vitest startup failure before test collection.

- [ ] **Step 2: Declare the exact runtime contract**

Create `.nvmrc`:

```text
22.12.0
```

Add to the root of `package.json`:

```json
"engines": {
  "node": "^20.19.0 || ^22.12.0 || >=24.0.0"
}
```

Add this README prerequisite:

```markdown
### Runtime

Use Node 22.12.0 (`nvm use`) for local development. The accepted engine range is
`^20.19.0 || ^22.12.0 || >=24.0.0`.
```

Change the design spec status to:

```markdown
**状态：** 已通过书面 Spec 复核，允许进入实施
```

- [ ] **Step 3: Activate Node 22.12.0 and refresh lock metadata**

This Linux ARM64 workspace currently has no `nvm`, `fnm`, `mise`, or Volta.
After obtaining network approval, install the official portable runtime under
`/tmp` so no user-level toolchain directory is mutated:

```bash
curl -fsSLo /tmp/node-v22.12.0-linux-arm64.tar.xz https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-arm64.tar.xz
tar -xJf /tmp/node-v22.12.0-linux-arm64.tar.xz -C /tmp
export PATH="/tmp/node-v22.12.0-linux-arm64/bin:$PATH"
node --version
npm install
```

Expected: `node --version` prints `v22.12.0`; `npm install` uses that runtime;
the root package entry in `package-lock.json` contains the same `engines.node`
range. Keep this PATH active for every later Node, npm, npx, and browser-server
command in the plan. Developers with `nvm` can use `.nvmrc` instead.

- [ ] **Step 4: Establish the clean baseline**

Run:

```bash
npm test
npm run build
```

Expected: all pre-existing tests pass and Next.js 16.2.10 completes a production build. If a test now fails, stop and diagnose it as an independent pre-existing issue before continuing.

- [ ] **Step 5: Commit**

```bash
git add .nvmrc package.json package-lock.json README.md docs/superpowers/specs/2026-07-27-triton-dashboard-design-system-design.md
git commit -m "chore: declare supported Node runtime"
```

---

### Task 2: Add Safe Task Metadata to Supabase

**Files:**

- Create via CLI: the exact path printed by `supabase migration new task_type_metadata`
- Create: `supabase/tests/0007_task_type_metadata.sql`

**Interfaces:**

- Consumes: existing `public.modules`, `public.tasks`, authenticated grants, RLS policies, and `tasks_module_id_idx`.
- Produces: nullable `tasks.module_id`, `ON DELETE SET NULL`, `tags text[]`, checked `priority text`, and nullable `due_date date`.

- [ ] **Step 1: Create the migration through the installed CLI**

Run:

```bash
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase migration new task_type_metadata
```

Expected: the CLI prints one new migration path ending in
`_task_type_metadata.sql`. Copy that exact printed path into subsequent edit and
Git commands; do not construct a timestamp manually.

- [ ] **Step 2: Write the failing transactional schema test**

Create `supabase/tests/0007_task_type_metadata.sql`:

```sql
\set ON_ERROR_STOP on

begin;

do $verify$
declare
  v_type uuid;
  v_typed_task uuid;
  v_untyped_task uuid;
begin
  insert into public.modules (name, kind, objective, position)
  values ('migration-type', 'pipeline', 'compatibility row', 999998)
  returning id into v_type;

  insert into public.tasks (
    module_id, title, status, assignees, tags, priority, due_date, position
  )
  values (
    v_type, 'typed task', 'todo', array['Maya'],
    array['NPU', 'Verifier'], 'high', date '2026-08-01', 999998
  )
  returning id into v_typed_task;

  insert into public.tasks (
    module_id, title, status, assignees, tags, priority, position
  )
  values (
    null, 'untyped task', 'todo', '{}', '{}', 'medium', 999999
  )
  returning id into v_untyped_task;

  delete from public.modules where id = v_type;

  if not exists (
    select 1 from public.tasks
    where id = v_typed_task and module_id is null
  ) then
    raise exception 'deleting a Type did not preserve and untype its Task';
  end if;

  begin
    update public.tasks set priority = 'critical' where id = v_untyped_task;
    raise exception 'invalid priority was accepted';
  exception
    when check_violation then null;
  end;

  if not has_table_privilege('authenticated', 'public.tasks', 'select,insert,update,delete') then
    raise exception 'authenticated task privileges are incomplete';
  end if;

  if has_table_privilege('anon', 'public.tasks', 'select') then
    raise exception 'anon unexpectedly has task access';
  end if;
end
$verify$;

rollback;
```

- [ ] **Step 3: Run the test to verify it fails before the migration**

Run against the existing local schema version:

```bash
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase db start
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase db query --local --file supabase/tests/0007_task_type_metadata.sql
```

Expected: FAIL because `tasks.tags`, `tasks.priority`, or `tasks.due_date` does not exist.

- [ ] **Step 4: Implement the migration**

Put this SQL in the CLI-generated migration:

```sql
alter table public.tasks
  add column if not exists tags text[] not null default '{}',
  add column if not exists priority text not null default 'medium',
  add column if not exists due_date date;

alter table public.tasks
  alter column module_id drop not null;

alter table public.tasks
  drop constraint if exists tasks_module_id_fkey;

alter table public.tasks
  add constraint tasks_module_id_fkey
  foreign key (module_id)
  references public.modules(id)
  on delete set null;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_priority_check'
  ) then
    alter table public.tasks
      add constraint tasks_priority_check
      check (priority in ('low', 'medium', 'high', 'urgent'));
  end if;
end
$constraints$;

create index if not exists tasks_module_id_idx
  on public.tasks (module_id);
```

Do not add new grants: the migration changes an already exposed, RLS-protected table and the tracked authenticated task grant covers its columns.

- [ ] **Step 5: Reset, verify, and run advisors**

Run:

```bash
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase db reset --local
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase db query --local --file supabase/tests/0007_task_type_metadata.sql
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase db advisors --local --type security --level warn --fail-on error
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase db advisors --local --type performance --level warn --fail-on error
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase migration list --local
```

Expected: schema test completes inside a rollback, both advisor commands have no error-level findings introduced by this migration, and the new migration is listed locally.

- [ ] **Step 6: Commit**

Use the exact CLI-generated migration path:

```bash
git add supabase/tests/0007_task_type_metadata.sql
git status --short supabase/migrations supabase/tests/0007_task_type_metadata.sql
```

Run `git add` once with the literal migration path printed in Step 1. Do not
use a migration glob. Confirm `git status --short` lists exactly that migration
plus `0007_task_type_metadata.sql`, then run:

```bash
git commit -m "feat: add generic task metadata"
```

---

### Task 3: Add the Task Domain Adapter

**Files:**

- Create: `lib/tasks/model.ts`
- Create: `lib/tasks/__tests__/model.test.ts`
- Modify: `lib/types.ts`
- Modify: `supabase/seed.sql`

**Interfaces:**

- Consumes: legacy storage rows with `module_id`, `assignees`, `objective`, and `kind`.
- Produces:
  - `TaskPriority = "low" | "medium" | "high" | "urgent"`
  - `TaskType`
  - `TaskModel`
  - `TaskPatch`
  - `NewTaskInput`
  - `taskFromStorage(row): TaskModel`
  - `taskPatchToStorage(patch): Record<string, unknown>`
  - `newTaskToStorage(input, position): Record<string, unknown>`
  - `taskTypeFromStorage(row): TaskType`
  - `taskTypePatchToStorage(patch): Record<string, unknown>`
  - `normalizeTags(tags): string[]`
  - `tagTone(tag): number`

- [ ] **Step 1: Write failing adapter tests**

Create `lib/tasks/__tests__/model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  normalizeTags,
  newTaskToStorage,
  tagTone,
  taskFromStorage,
  taskPatchToStorage,
  taskTypeFromStorage,
} from "@/lib/tasks/model";

describe("task domain mapping", () => {
  it("maps legacy storage names to Type and Owner terminology", () => {
    expect(taskFromStorage({
      id: "task-1",
      module_id: "type-1",
      title: "Benchmark kernels",
      status: "in_progress",
      assignees: ["Maya", "Yubai"],
      notes: "Measure pass@1",
      tags: ["NPU"],
      priority: "high",
      due_date: "2026-08-01",
      position: 0,
      created_at: "2026-07-27T00:00:00Z",
      updated_at: "2026-07-27T00:00:00Z",
    })).toMatchObject({
      typeId: "type-1",
      owners: ["Maya", "Yubai"],
      tags: ["NPU"],
      priority: "high",
    });
  });

  it("maps domain patches back to Supabase storage columns", () => {
    expect(taskPatchToStorage({
      typeId: null,
      owners: ["Maya"],
      tags: ["NPU", "Verifier"],
    })).toEqual({
      module_id: null,
      assignees: ["Maya"],
      tags: ["NPU", "Verifier"],
    });
  });

  it("normalizes tags and assigns a stable visual tone", () => {
    expect(normalizeTags([" NPU ", "npu", "", "Verifier"]))
      .toEqual(["NPU", "Verifier"]);
    expect(tagTone("NPU")).toBe(tagTone("npu"));
  });

  it("maps Module storage rows to user-defined Types", () => {
    expect(taskTypeFromStorage({
      id: "type-1",
      name: "Kernel",
      kind: "foundation",
      objective: "Kernel work",
      position: 2,
      created_at: "2026-07-27T00:00:00Z",
    })).toEqual({
      id: "type-1",
      name: "Kernel",
      description: "Kernel work",
      position: 2,
      created_at: "2026-07-27T00:00:00Z",
    });
  });

  it("creates storage payloads with optional Type and normalized Tags", () => {
    expect(newTaskToStorage({
      title: "Validate kernels",
      status: "todo",
      typeId: null,
      tags: [" NPU ", "npu"],
      owners: [],
      priority: "medium",
      dueDate: null,
      description: "",
    }, -1)).toMatchObject({
      module_id: null,
      title: "Validate kernels",
      assignees: [],
      tags: ["NPU"],
      due_date: null,
      position: -1,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run lib/tasks/__tests__/model.test.ts
```

Expected: FAIL because `@/lib/tasks/model` does not exist.

- [ ] **Step 3: Define the exact domain types**

Add to `lib/types.ts`:

```ts
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface TaskType {
  id: string;
  name: string;
  description: string;
  position: number;
  created_at: string;
}

export interface TaskModel {
  id: string;
  typeId: string | null;
  title: string;
  status: Status;
  owners: string[];
  notes: string;
  tags: string[];
  priority: TaskPriority;
  dueDate: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export type TaskPatch = Partial<Pick<
  TaskModel,
  "typeId" | "title" | "status" | "owners" | "notes" |
  "tags" | "priority" | "dueDate" | "position"
>>;

export interface NewTaskInput {
  title: string;
  status: Status;
  typeId: string | null;
  tags: string[];
  owners: string[];
  priority: TaskPriority;
  dueDate: string | null;
  description: string;
}
```

Extend the existing storage `Task` interface with:

```ts
module_id: string | null;
tags: string[];
priority: TaskPriority;
due_date: string | null;
```

- [ ] **Step 4: Implement the adapter**

Create `lib/tasks/model.ts` with explicit mappings. The tag functions must use trim, case-insensitive de-duplication, and a deterministic FNV-style hash:

```ts
import type {
  Module,
  NewTaskInput,
  Task,
  TaskModel,
  TaskPatch,
  TaskType,
} from "@/lib/types";

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.flatMap((tag) => {
    const trimmed = tag.trim();
    const key = trimmed.toLocaleLowerCase();
    if (!trimmed || seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  });
}

export function tagTone(tag: string): number {
  let hash = 2166136261;
  for (const character of tag.trim().toLocaleLowerCase()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 6;
}

export function taskFromStorage(row: Task): TaskModel {
  return {
    id: row.id,
    typeId: row.module_id,
    title: row.title,
    status: row.status,
    owners: [...row.assignees],
    notes: row.notes,
    tags: normalizeTags(row.tags),
    priority: row.priority,
    dueDate: row.due_date,
    position: row.position,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function taskPatchToStorage(patch: TaskPatch): Record<string, unknown> {
  const storage: Record<string, unknown> = {};
  if ("typeId" in patch) storage.module_id = patch.typeId;
  if ("title" in patch) storage.title = patch.title;
  if ("status" in patch) storage.status = patch.status;
  if ("owners" in patch) storage.assignees = patch.owners;
  if ("notes" in patch) storage.notes = patch.notes;
  if ("tags" in patch) storage.tags = normalizeTags(patch.tags ?? []);
  if ("priority" in patch) storage.priority = patch.priority;
  if ("dueDate" in patch) storage.due_date = patch.dueDate;
  if ("position" in patch) storage.position = patch.position;
  return storage;
}

export function newTaskToStorage(
  input: NewTaskInput,
  position: number,
): Record<string, unknown> {
  return {
    module_id: input.typeId,
    title: input.title.trim(),
    status: input.status,
    assignees: input.owners,
    notes: input.description.trim(),
    tags: normalizeTags(input.tags),
    priority: input.priority,
    due_date: input.dueDate,
    position,
  };
}

export function taskTypeFromStorage(row: Module): TaskType {
  return {
    id: row.id,
    name: row.name,
    description: row.objective,
    position: row.position,
    created_at: row.created_at,
  };
}

export function taskTypePatchToStorage(
  patch: Partial<Pick<TaskType, "name" | "description" | "position">>,
): Record<string, unknown> {
  const storage: Record<string, unknown> = {};
  if ("name" in patch) storage.name = patch.name;
  if ("description" in patch) storage.objective = patch.description;
  if ("position" in patch) storage.position = patch.position;
  return storage;
}
```

- [ ] **Step 5: Make seed inserts explicit**

Update the Task seed insert to include the new columns:

```sql
insert into tasks (
  module_id, title, status, assignees, tags, priority, due_date, position
)
select
  m.id, t.title, t.status, t.assignees, '{}'::text[], 'medium', null, t.position
from (values
  ('SFT', 'GLM + CC evaluation', 'in_progress', array['Bruce'], 0),
  ('SFT', 'SFT data processing', 'in_progress', array['Harish'], 1),
  (
    'Harness Development',
    'Automated harness evaluation',
    'in_progress',
    array['Eason', 'Zahra'],
    0
  )
) as t(module_name, title, status, assignees, position)
join modules m on m.name = t.module_name;
```

- [ ] **Step 6: Run tests and build**

```bash
npx vitest run lib/tasks/__tests__/model.test.ts
npm test
npm run build
```

Expected: adapter tests and the existing suite pass; the build has no TypeScript errors from the added storage fields.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/tasks/model.ts lib/tasks/__tests__/model.test.ts supabase/seed.sql
git commit -m "refactor: add task domain adapter"
```

---

### Task 4: Build the Theme Foundation and App Shell

**Files:**

- Create: `components/theme/ThemeProvider.tsx`
- Create: `components/theme/ThemeToggle.tsx`
- Create: `components/ui/Icons.tsx`
- Create: `components/theme/__tests__/ThemeToggle.test.tsx`
- Create: `components/__tests__/AuthGate.test.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`
- Modify: `app/task/[id]/page.tsx`
- Modify: `app/experiments/page.tsx`
- Modify: `app/experiments/[id]/page.tsx`
- Modify: `app/experiments/compare/page.tsx`
- Modify: `app/analytics/page.tsx`
- Modify: `app/experiments/__tests__/page.test.tsx`
- Modify: `app/globals.css`
- Modify: `components/Navbar.tsx`
- Modify: `components/AuthGate.tsx`
- Modify: `components/__tests__/Navbar.test.tsx`
- Modify: `app/__tests__/workspace-styles.test.ts`

**Interfaces:**

- Consumes: root Server Component and `usePathname`.
- Produces:
  - `Theme = "light" | "dark"`
  - `useTheme(): { theme: Theme; setTheme(theme: Theme): void }`
  - `useAuthActions(): { logout(): Promise<void> }`
  - `<ThemeToggle />`
  - `<Icon name size />`
  - one root Auth boundary, root `data-theme`, persisted key `triton-theme`,
    a 256px desktop shell, compact icon rail, and narrow navigation sheet.

- [ ] **Step 1: Write failing theme and shell tests**

Create `components/theme/__tests__/ThemeToggle.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ThemeProvider from "@/components/theme/ThemeProvider";
import ThemeToggle from "@/components/theme/ThemeToggle";

describe("ThemeToggle", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("persists dark mode and updates the root semantic theme", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("triton-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark theme" })
      .getAttribute("aria-pressed")).toBe("true");
  });
});
```

Update the Navbar test to require icons, project context, the theme control, and the same single active route. Update the style contract test to assert:

```ts
expect(globals).toContain("--canvas: #ffffff");
expect(globals).toContain("--surface-subtle: #f8faff");
expect(globals).toContain("--accent: #1e96eb");
expect(globals).toMatch(/\[data-theme="dark"\][\s\S]*--canvas:\s*#141414/);
expect(ruleBody(globals, ".app-shell"))
  .toMatch(/grid-template-columns\s*:\s*256px\s+minmax\(0,\s*1fr\)/);
```

Add Auth coverage proving the Shell is not visible before authentication and
the authenticated children use one session boundary:

```tsx
render(
  <AuthGate>
    <div data-testid="authenticated-shell">Shell</div>
  </AuthGate>,
);
expect(screen.queryByTestId("authenticated-shell")).toBeNull();
expect(await screen.findByRole("heading", { name: "Enter the team password" }))
  .toBeDefined();
expect(mockAuth.onAuthStateChange).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npx vitest run components/theme/__tests__/ThemeToggle.test.tsx components/__tests__/Navbar.test.tsx app/__tests__/workspace-styles.test.ts
```

Expected: FAIL because theme components and new semantic tokens do not exist.

- [ ] **Step 3: Implement the pre-hydration theme boundary**

In `app/layout.tsx`, keep the layout server-rendered and use Next 16's documented `Script` boundary:

```tsx
import Script from "next/script";
import ThemeProvider from "@/components/theme/ThemeProvider";
import AuthGate from "@/components/AuthGate";

const themeScript = `
  try {
    const saved = localStorage.getItem("triton-theme");
    const theme = saved === "light" || saved === "dark"
      ? saved
      : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {}
`;

<html lang="en" suppressHydrationWarning>
  <body>
    <Script id="theme-init" strategy="beforeInteractive">
      {themeScript}
    </Script>
    <ThemeProvider>
      <AuthGate>
        <div className="app-shell">
          <Navbar />
          <main className="app-content">{children}</main>
        </div>
      </AuthGate>
    </ThemeProvider>
  </body>
</html>
```

`ThemeProvider` owns only theme state and children. On mount it reads the
already-applied root dataset, and `setTheme` synchronously updates state,
`data-theme`, `colorScheme`, and `localStorage`.

Move the duplicated route-level Auth wrappers to this root boundary. Each of
the six route page files returns only its existing route component; async
`params`/`searchParams` handling remains unchanged. Update the Experiment page
test to assert the thin route component instead of mocking AuthGate.

`AuthGate` exports `useAuthActions`. The provider value contains the existing
`logout` function; it wraps children only for configured/authenticated or
unconfigured setup states. Loading and login return their dedicated full-page
states, so the authenticated Sidebar is never displayed behind the password
form.

- [ ] **Step 4: Implement shared icons and navigation**

`components/ui/Icons.tsx` exports an `IconName` union:

```ts
export type IconName =
  | "board" | "experiment" | "compare" | "analytics"
  | "sun" | "moon" | "logout" | "users" | "plus"
  | "filter" | "more" | "menu" | "close" | "search";
```

All SVGs use:

```tsx
<svg
  aria-hidden="true"
  fill="none"
  stroke="currentColor"
  strokeWidth="1.5"
  viewBox="0 0 24 24"
/>
```

Update Navbar to render the exact destinations, 256px shell content, static project context without a fake dropdown, Shared team board, `<ThemeToggle />`, and a logout slot styled for AuthGate's existing action.

Use `useAuthActions()` for the Log out button. Define the exact route source:

```ts
const NAV_ITEMS = [
  {
    href: "/",
    label: "Task Board",
    icon: "board",
    active: (pathname: string) => (
      pathname === "/" || pathname.startsWith("/task/")
    ),
  },
  {
    href: "/experiments",
    label: "Experiments",
    icon: "experiment",
    active: (pathname: string) => (
      (pathname === "/experiments" || pathname.startsWith("/experiments/"))
      && pathname !== "/experiments/compare"
      && !pathname.startsWith("/experiments/compare/")
    ),
  },
  {
    href: "/experiments/compare",
    label: "Compare",
    icon: "compare",
    active: (pathname: string) => (
      pathname === "/experiments/compare"
      || pathname.startsWith("/experiments/compare/")
    ),
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: "analytics",
    active: (pathname: string) => pathname === "/analytics",
  },
] satisfies Array<{
  href: string;
  label: string;
  icon: IconName;
  active(pathname: string): boolean;
}>;
```

Add `const [mobileOpen, setMobileOpen] = useState(false)` and close it whenever
`pathname` changes. The component renders:

```tsx
<>
  <header className="mobile-app-bar">
    <Link href="/" className="brand">Triton Board</Link>
    <button
      type="button"
      className="nav-menu-toggle"
      aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
      aria-controls="workspace-navigation"
      aria-expanded={mobileOpen}
      onClick={() => setMobileOpen((open) => !open)}
    >
      <Icon name={mobileOpen ? "close" : "menu"} />
    </button>
  </header>
  <aside className={`app-sidebar ${mobileOpen ? "is-open" : ""}`}>
    <nav id="workspace-navigation" aria-label="Primary">
      <Link href="/" className="brand">Triton Board</Link>
      <p className="project-context">Triton Kernel Agent</p>
      <div className="nav-section">
        {NAV_ITEMS.map((item) => {
          const active = item.active(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-btn ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
    <div className="sidebar-footer">
      <span>Shared team board</span>
      <ThemeToggle />
      <button type="button" onClick={() => void logout()}>
        <Icon name="logout" />
        <span>Log out</span>
      </button>
    </div>
  </aside>
  {mobileOpen && (
    <button
      type="button"
      className="nav-backdrop"
      aria-label="Close navigation"
      onClick={() => setMobileOpen(false)}
    />
  )}
</>
```

Add a Navbar test that clicks Open navigation, verifies
`aria-expanded="true"`, then changes the mocked pathname and verifies the sheet
closes.

- [ ] **Step 5: Replace global colors with semantic tokens**

At the top of `app/globals.css`, define:

```css
:root {
  color-scheme: light;
  --canvas: #ffffff;
  --surface: #ffffff;
  --surface-subtle: #f8faff;
  --surface-hover: #f3f3f3;
  --border: #e6e6e6;
  --border-strong: #d8dde8;
  --text-primary: #141414;
  --text-secondary: #6f748c;
  --text-tertiary: #929292;
  --accent: #1e96eb;
  --accent-subtle: #eaf5fd;
  --status-todo: #abb3bf;
  --status-progress: #1e96eb;
  --status-done: #248569;
  --status-blocked: #d45d62;
  --status-warning: #c88719;
  --focus-ring: 0 0 0 2px var(--canvas), 0 0 0 4px var(--accent);
}

[data-theme="dark"] {
  color-scheme: dark;
  --canvas: #141414;
  --surface: #252525;
  --surface-subtle: #1b1b1b;
  --surface-hover: #303030;
  --border: #414141;
  --border-strong: #525252;
  --text-primary: #e6e6e6;
  --text-secondary: #929292;
  --text-tertiary: #7a7a7a;
  --accent: #1e96eb;
  --accent-subtle: rgb(30 150 235 / 12%);
}

.app-shell {
  display: grid;
  grid-template-columns: 256px minmax(0, 1fr);
  min-height: 100dvh;
  background: var(--canvas);
  color: var(--text-primary);
}

.app-sidebar {
  position: sticky;
  z-index: 20;
  top: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  height: 100dvh;
  border-right: 1px solid var(--border);
  background: var(--surface-subtle);
}

.app-content {
  min-width: 0;
  padding-inline: 32px;
}

.mobile-app-bar,
.nav-backdrop {
  display: none;
}
```

Use the approved system font stack and remove decorative gradients and hard-coded light-only backgrounds.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run components/theme/__tests__/ThemeToggle.test.tsx components/__tests__/AuthGate.test.tsx components/__tests__/Navbar.test.tsx app/experiments/__tests__/page.test.tsx app/__tests__/workspace-styles.test.ts
npm run build
git add app/layout.tsx app/page.tsx app/task/[id]/page.tsx app/experiments/page.tsx app/experiments/[id]/page.tsx app/experiments/compare/page.tsx app/analytics/page.tsx app/experiments/__tests__/page.test.tsx app/globals.css components/Navbar.tsx components/AuthGate.tsx components/theme components/ui/Icons.tsx components/__tests__/AuthGate.test.tsx components/__tests__/Navbar.test.tsx app/__tests__/workspace-styles.test.ts
git commit -m "feat: add semantic themes and app shell"
```

Expected: targeted tests pass, the build has no hydration/type error, and no new runtime dependency appears.

---

### Task 5: Add Shared Workspace Primitives

**Files:**

- Create: `components/ui/Drawer.tsx`
- Create: `components/ui/PageHeader.tsx`
- Create: `components/ui/StatusDot.tsx`
- Create: `components/ui/OwnerAvatar.tsx`
- Create: `components/ui/Tag.tsx`
- Create: `components/ui/useModalFocus.ts`
- Create: `components/ui/__tests__/Drawer.test.tsx`
- Modify: `components/experiments/CreateExperimentDialog.tsx`
- Modify: `components/experiments/DuplicateExperimentDialog.tsx`
- Modify imports in experiment dialog tests
- Delete: `components/experiments/useModalFocus.ts`
- Modify: `app/globals.css`

**Interfaces:**

- Consumes: `TaskStatus`, `ExperimentStatus`, `Member`, `tagTone`, and existing modal behavior.
- Produces:
  - `<Drawer open titleId onClose footer blocked children />`
  - `<PageHeader eyebrow title description actions />`
  - `<StatusDot status label />`
  - `<OwnerAvatar name initials size />`
  - `<Tag value removable onRemove />`
  - shared `useModalFocus({ open, onClose, blocked })` behavior.

- [ ] **Step 1: Write the failing Drawer accessibility test**

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Drawer from "@/components/ui/Drawer";

describe("Drawer", () => {
  afterEach(cleanup);

  it("is modal, closes on Escape, and restores trigger focus", () => {
    const close = vi.fn();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();

    render(
      <Drawer open titleId="drawer-title" onClose={close} footer={<button>Save</button>}>
        <h2 id="drawer-title">Create task</h2>
        <input aria-label="Title" />
      </Drawer>,
    );

    const dialog = screen.getByRole("dialog", { name: "Create task" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run components/ui/__tests__/Drawer.test.tsx
```

Expected: FAIL because shared Drawer does not exist.

- [ ] **Step 3: Move focus logic and implement primitives**

Move the existing proven focus code into `components/ui/useModalFocus.ts`. `Drawer` uses a backdrop, `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape close, backdrop close only when `event.target === event.currentTarget`, and the shared focus hook.

`PageHeader` accepts renderable title and action content so editable record
titles do not need a second header implementation:

```tsx
export interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <div className="page-description">{description}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
```

`StatusDot` maps semantic classes without hard-coded inline color:

```tsx
export default function StatusDot({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  return (
    <span className={`status-dot status-${status}`}>
      <i aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
```

`Tag` writes `data-tone={tagTone(value)}` and uses a real button for removal.

- [ ] **Step 4: Update both experiment dialogs to the shared focus hook**

Only change the import path:

```ts
import { useModalFocus } from "@/components/ui/useModalFocus";
```

Do not change create/duplicate submit, disabled, or focus-inert behavior in this task.

- [ ] **Step 5: Add primitive CSS**

Add these primitive rules to `app/globals.css`:

```css
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-block: 24px 16px;
  border-bottom: 1px solid var(--border);
}

.page-header-copy { min-width: 0; }
.page-header h1 { margin: 4px 0 0; }
.page-description {
  max-width: 70ch;
  margin-top: 8px;
  color: var(--text-secondary);
}
.page-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.drawer-backdrop {
  position: fixed;
  z-index: 50;
  inset: 0;
  display: grid;
  justify-items: end;
  background: rgb(20 20 20 / 38%);
}

.drawer-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(520px, 100%);
  height: 100%;
  overflow: hidden;
  border-left: 1px solid var(--border);
  background: var(--surface);
  box-shadow: -12px 0 36px rgb(20 20 20 / 18%);
}

.status-dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
}
.status-dot > i {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
}

.owner-avatar {
  display: inline-grid;
  place-items: center;
  aspect-ratio: 1;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-subtle);
  color: var(--text-primary);
}

.tag {
  --tag-accent: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--tag-accent) 12%, var(--surface));
  color: var(--text-primary);
}
.tag[data-tone="0"] { --tag-accent: #1e96eb; }
.tag[data-tone="1"] { --tag-accent: #248569; }
.tag[data-tone="2"] { --tag-accent: #8b6fc0; }
.tag[data-tone="3"] { --tag-accent: #c88719; }
.tag[data-tone="4"] { --tag-accent: #c46b8a; }
.tag[data-tone="5"] { --tag-accent: #6f748c; }
```

Use 1px semantic borders, 6–12px radii, no card shadow, and only the approved Drawer shadow.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run components/ui/__tests__/Drawer.test.tsx components/experiments/__tests__/CreateExperimentDialog.test.tsx components/experiments/__tests__/DuplicateExperimentDialog.test.tsx
npm run build
git add components/ui components/experiments/CreateExperimentDialog.tsx components/experiments/DuplicateExperimentDialog.tsx components/experiments/__tests__ app/globals.css
git add -u components/experiments/useModalFocus.ts
git commit -m "refactor: add shared workspace primitives"
```

---

### Task 6: Rebuild the Generic Task Board and Add Task Flow

**Files:**

- Create: `components/tasks/AddTaskDrawer.tsx`
- Create: `components/tasks/TaskCard.tsx`
- Create: `components/tasks/TaskBoardView.tsx`
- Create: `components/tasks/BoardSecondaryViews.tsx`
- Create: `components/tasks/__tests__/AddTaskDrawer.test.tsx`
- Create: `components/__tests__/Board.test.tsx`
- Modify: `components/Board.tsx`
- Modify: `app/globals.css`

**Interfaces:**

- Consumes: `TaskModel`, `TaskType`, `NewTaskInput`, task adapter functions, shared primitives, existing Supabase tables and realtime reload.
- Produces:
  - `BoardView = "board" | "types" | "ownership" | "team"`
  - `GroupBy = "status" | "type"`
  - `<AddTaskDrawer onCreate(input) onCreateType(name) />`
  - Status and Type board grouping with `No type`.

- [ ] **Step 1: Write failing Add Task tests**

The tests must assert exact approved semantics:

```tsx
it("creates a generic task with Type, Tags, Owner, Priority, and Due date", async () => {
  const create = vi.fn().mockResolvedValue(undefined);
  renderDrawer({ onCreate: create });

  fireEvent.change(screen.getByLabelText("Task title"), {
    target: { value: "Validate NPU kernels" },
  });
  fireEvent.change(screen.getByLabelText("Type"), {
    target: { value: "type-kernel" },
  });
  fireEvent.change(screen.getByLabelText("Tags"), {
    target: { value: "NPU, npu, Verifier" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Maya" }));
  fireEvent.change(screen.getByLabelText("Priority"), {
    target: { value: "high" },
  });
  fireEvent.change(screen.getByLabelText("Due date"), {
    target: { value: "2026-08-01" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));

  await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
    title: "Validate NPU kernels",
    typeId: "type-kernel",
    tags: ["NPU", "Verifier"],
    owners: ["Maya"],
    priority: "high",
    dueDate: "2026-08-01",
  })));
});

it("uses Owner copy and never exposes Module or Assignee copy", () => {
  renderDrawer();
  expect(screen.getByText("Owner")).toBeDefined();
  expect(screen.queryByText(/Module|Assignee/i)).toBeNull();
});
```

Add Board tests for:

```tsx
expect(screen.getByRole("heading", { name: "To do" })).toBeDefined();
expect(screen.getByRole("heading", { name: "In progress" })).toBeDefined();
expect(screen.getByRole("heading", { name: "Done" })).toBeDefined();
expect(screen.getByRole("heading", { name: "Blocked" })).toBeDefined();
expect(screen.queryByRole("heading", { name: "SFT" })).toBeNull();
expect(screen.getByRole("tab", { name: "Types" })).toBeDefined();
```

Add secondary-view and destructive-flow assertions:

```tsx
fireEvent.click(screen.getByRole("tab", { name: "Types" }));
expect(screen.getByRole("columnheader", { name: "Type" })).toBeDefined();
expect(screen.getByRole("columnheader", { name: "Task count" })).toBeDefined();
expect(screen.getByRole("columnheader", { name: "Progress" })).toBeDefined();

fireEvent.click(screen.getByRole("tab", { name: "Ownership" }));
for (const heading of ["Owner", "Task", "Type", "Status", "Updated"]) {
  expect(screen.getByRole("columnheader", { name: heading })).toBeDefined();
}
expect(screen.getByText("No owner yet")).toBeDefined();

fireEvent.click(screen.getByRole("tab", { name: "Team" }));
fireEvent.click(screen.getByRole("button", { name: "Remove Maya" }));
const taskUpdateIndex = mutationTrace.findIndex((entry) => (
  entry.table === "tasks" && entry.operation === "update"
));
const memberDeleteIndex = mutationTrace.findIndex((entry) => (
  entry.table === "members" && entry.operation === "delete"
));
expect(taskUpdateIndex).toBeGreaterThanOrEqual(0);
expect(memberDeleteIndex).toBeGreaterThan(taskUpdateIndex);
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run components/tasks/__tests__/AddTaskDrawer.test.tsx components/__tests__/Board.test.tsx
```

Expected: FAIL because the generic board components do not exist and the current UI still renders Modules.

- [ ] **Step 3: Implement AddTaskDrawer**

Use the exact draft:

```ts
const EMPTY_DRAFT: NewTaskInput = {
  title: "",
  status: "todo",
  typeId: null,
  tags: [],
  owners: [],
  priority: "medium",
  dueDate: null,
  description: "",
};
```

The form order is Title, Status, Type, Tags, Owner, Priority, Due date, Description. Type includes a `Create type` action. Tags accept comma/Enter input and render removable `<Tag>` values. Submit works through the button and `Meta/Ctrl + Enter`; failed submission keeps draft values and shows an inline alert.

- [ ] **Step 4: Implement board views**

`TaskBoardView` receives:

```ts
interface TaskBoardViewProps {
  tasks: TaskModel[];
  types: TaskType[];
  members: Member[];
  groupBy: "status" | "type";
  onOpenCreate(defaults: { status?: Status; typeId?: string | null }): void;
  onPatchTask(id: string, patch: TaskPatch): Promise<void>;
  onDeleteTask(id: string): Promise<void>;
}
```

Status grouping uses `STATUS_OPTIONS`. Type grouping uses all Types plus:

```ts
const noType = {
  id: "no-type",
  name: "No type",
  tasks: tasks.filter((task) => task.typeId === null),
};
```

`TaskCard` shows Title, Type, Tags, Owner Avatar(s), relative Updated time, and Status only in Type grouping. Quick edit and delete remain in an accessible overflow menu.

`BoardSecondaryViews` receives:

```ts
interface BoardSecondaryViewsProps {
  view: Exclude<BoardView, "board">;
  tasks: TaskModel[];
  types: TaskType[];
  members: Member[];
  onCreateType(name: string): Promise<void>;
  onPatchType(id: string, patch: Partial<TaskType>): Promise<void>;
  onDeleteType(type: TaskType): Promise<void>;
  onAddMember(name: string): Promise<void>;
  onRemoveMember(member: Member): Promise<void>;
}
```

The Types table columns are Type, Description, Task count, Progress, and
Position. Progress is calculated only from tasks with the matching `typeId`.
The Ownership table uses this exact flattening so multi-owner tasks retain one
row per Owner and unowned tasks remain visible:

```ts
const ownershipRows = tasks.flatMap((task) => {
  const type = types.find((item) => item.id === task.typeId) ?? null;
  const owners = task.owners.length > 0 ? task.owners : [null];
  return owners.map((owner) => ({
    id: `${task.id}:${owner ?? "unowned"}`,
    owner: owner ?? "No owner yet",
    task,
    type,
  }));
});
```

Render Ownership as a real table with Owner, Task, Type, Status, Updated. Team
keeps the current member add/list/remove controls in a compact list.

- [ ] **Step 5: Convert Board orchestration without changing realtime**

In `reload`, map storage rows:

```ts
setTypes((m.data ?? []).map((row) => taskTypeFromStorage(row as Module)));
setTasks((t.data ?? []).map((row) => taskFromStorage(row as Task)));
```

Writes use `newTaskToStorage` and `taskPatchToStorage`. New Types still write compatibility storage:

```ts
await supabase.from("modules").insert({
  name: name.trim(),
  objective: "",
  kind: "pipeline",
  position: nextPosition(types),
});
```

Delete Type copy is:

```text
Remove Type “Kernel”? Its tasks will remain and move to No type.
```

Delete Task copy is:

```text
Delete task “Validate NPU kernels”? This cannot be undone.
```

When removing a Member, first update every affected Task's `assignees` storage
array through `taskPatchToStorage({ owners })`; only after every update
succeeds may the member row be deleted. On any failure, stop the sequence,
keep the member, show the mutation error, and reload the authoritative rows.

Board views are Board, Types, Ownership, Team. Remove all visual and
computational branching on `module.kind`. Every create/patch/delete handler
checks the Supabase error before reloading and exposes a stable error banner;
do not silently ignore failed writes.

- [ ] **Step 6: Add board CSS**

Implement the desktop base:

```css
.board-view-tabs,
.board-toolbar {
  position: sticky;
  z-index: 10;
  top: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--border);
  background: var(--canvas);
}

.task-board {
  display: grid;
  grid-template-columns: repeat(4, minmax(260px, 1fr));
  min-width: 1120px;
}

.task-column {
  min-width: 0;
  padding: 12px;
  border-right: 1px solid var(--border);
}
.task-column:last-child { border-right: 0; }

.task-card {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
.task-card + .task-card { margin-top: 8px; }

.task-card:hover,
.task-card:focus-within {
  border-color: var(--border-strong);
  background: var(--surface-hover);
}
```

Task 12 supplies the horizontal overflow below 1280px and full-screen Add Task
Sheet below 768px.

- [ ] **Step 7: Verify and commit**

```bash
npx vitest run components/tasks/__tests__/AddTaskDrawer.test.tsx components/__tests__/Board.test.tsx
npm test
npm run build
git add components/Board.tsx components/tasks app/globals.css
git commit -m "feat: redesign the generic task board"
```

---

### Task 7: Redesign Task Detail Around Type, Tags, and Owner

**Files:**

- Create: `lib/attachments/repository.ts`
- Create: `lib/attachments/__tests__/repository.test.ts`
- Create: `components/tasks/TaskProperties.tsx`
- Create: `components/tasks/__tests__/TaskProperties.test.tsx`
- Modify: `components/TaskDetail.tsx`
- Modify: `components/__tests__/TaskDetail.test.tsx`
- Modify: `components/experiments/AttachmentGallery.tsx`
- Modify: `components/experiments/CreateExperimentDialog.tsx`
- Modify: `components/experiments/ExperimentDetail.tsx`
- Modify: `components/experiments/__tests__/CreateExperimentDialog.test.tsx`
- Modify: `components/experiments/__tests__/ExperimentEvidence.test.tsx`
- Modify: `components/experiments/TaskExperimentsPanel.tsx`
- Modify: `components/experiments/__tests__/TaskExperimentsPanel.test.tsx`
- Modify: `lib/experiments/repository.ts`
- Modify: `lib/experiments/__tests__/repository.test.ts`
- Modify: `app/globals.css`

**Interfaces:**

- Consumes: existing Task Detail visit/version/mutation queues, `TaskModel`, `TaskType`, `TaskPatch`, and task adapter.
- Produces:
  - document-style Task record with Type, Tags, Owner, Priority, Due date, Notes, Experiments, Attachments, and Activity Rail.
  - `AttachmentScope { taskId: string; experimentId: string | null }`.
  - `uploadAttachment(scope, file, position)`, `updateAttachmentCaption(id, caption)`, and `deleteAttachment(attachment)`.
  - a scope-aware `AttachmentGallery` shared by Task Detail and Experiment Detail.

- [ ] **Step 1: Write failing property tests**

```tsx
it("renders editable task properties with approved terminology", () => {
  render(
    <TaskProperties
      task={taskModel}
      types={[kernelType]}
      members={[maya]}
      onPatch={vi.fn()}
    />,
  );

  expect(screen.getByLabelText("Task status")).toBeDefined();
  expect(screen.getByLabelText("Task type")).toBeDefined();
  expect(screen.getByLabelText("Task tags")).toBeDefined();
  expect(screen.getByText("Owner")).toBeDefined();
  expect(screen.getByLabelText("Task priority")).toBeDefined();
  expect(screen.getByLabelText("Task due date")).toBeDefined();
  expect(screen.queryByText(/Module|Assignee/i)).toBeNull();
});
```

Extend TaskDetail integration fixtures with `tags`, `priority`, and `due_date`, then assert storage updates:

```ts
expect(updateCalls).toContainEqual({
  table: "tasks",
  patch: { module_id: null, tags: ["NPU"], priority: "high" },
});
```

Add attachment repository coverage for a Task-level upload:

```ts
await uploadAttachment(
  { taskId: "task-a", experimentId: null },
  new File(["plot"], "plot.png"),
  0,
);

expect(storageUpload.path).toMatch(
  /^task-a\/task\/[0-9a-f-]+-plot\.png$/,
);
expect(attachmentInsert).toEqual({
  task_id: "task-a",
  experiment_id: null,
  url: "https://storage.test/task-a/task/plot.png",
  path: storageUpload.path,
  caption: "",
  position: 0,
});
```

In `TaskDetail.test.tsx`, extend the Supabase harness with `.is()` and an
`attachments` response, then assert that only Task-level records are requested:

```ts
expect(queryTrace).toContainEqual({
  table: "attachments",
  operation: "select",
  filters: [
    ["eq", "task_id", "task-a"],
    ["is", "experiment_id", null],
  ],
});
expect(await screen.findByRole("img", { name: "Task attachment" }))
  .toBeDefined();
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run lib/attachments/__tests__/repository.test.ts components/tasks/__tests__/TaskProperties.test.tsx components/__tests__/TaskDetail.test.tsx components/experiments/__tests__/ExperimentEvidence.test.tsx
```

Expected: FAIL on the missing attachment repository, missing properties, and
legacy copy.

- [ ] **Step 3: Preserve orchestration and change only the data boundary**

Keep `visitRef`, request versions, mutation queues, owner coordination,
experiment/activity dedupe, retry tokens, and realtime conflict handling.
Replace the single current-Module query with the ordered Type collection:

```ts
const nextTask = taskFromStorage(taskResult.data as Task);
const [typesResult, experimentsResult, membersResult, attachmentsResult, activityResult] =
  await Promise.all([
    supabase.from("modules").select("*").order("position"),
    supabase
      .from("experiments")
      .select("*")
      .eq("task_id", requestedVisit.id)
      .order("position")
      .order("experiment_no", { ascending: true }),
    supabase.from("members").select("*").order("position"),
    supabase
      .from("attachments")
      .select("*")
      .eq("task_id", requestedVisit.id)
      .is("experiment_id", null)
      .order("position"),
    supabase
      .from("activity")
      .select("*")
      .eq("task_id", requestedVisit.id)
      .order("created_at", { ascending: false }),
  ]);

const nextTypes = (typesResult.data ?? [])
  .map((row) => taskTypeFromStorage(row as Module));
const nextAttachments = (attachmentsResult.data ?? []) as Attachment[];
```

Change Task Detail state from storage `Task`/`Module` to
`TaskModel`/`TaskType[]`. Clear `attachments` and its ID set when the visit
changes or the task is missing. Write every mutation through:

```ts
await supabase
  .from("tasks")
  .update(taskPatchToStorage(patch))
  .eq("id", requestedVisit.id);
```

Expand `MutationField` to `title | status | notes | owners | typeId | tags |
priority | dueDate | delete`, choose a queue by the changed domain property,
and rename UI-local coordinator variables from `assignee` to `owner` without
altering queue semantics. The only storage-name references remaining in this
component are the adapter calls and the compatibility table names.

Change `TaskExperimentsPanel.task` from `Task` to `TaskModel`. Because
`CreateExperimentDialog` only reads Task identity and title, narrow its prop
instead of converting the domain model back to storage:

```ts
interface CreateExperimentDialogProps {
  open: boolean;
  tasks: Array<{ id: string; title: string }>;
  members: Member[];
  fixedTaskId?: string;
  onClose: () => void;
  onCreated: (experiment: Experiment) => void;
}
```

Keep every Create Experiment validation, pending, stale-dialog, and submit test
unchanged apart from the narrower Task fixture type.

- [ ] **Step 4: Extract scope-aware attachment persistence and UI**

Create `lib/attachments/repository.ts` with this public contract:

```ts
import { supabase } from "@/lib/supabase";
import type { Attachment } from "@/lib/types";

export interface AttachmentScope {
  taskId: string;
  experimentId: string | null;
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function uploadAttachment(
  scope: AttachmentScope,
  file: File,
  position: number,
): Promise<void> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const parent = scope.experimentId ?? "task";
  const path =
    `${scope.taskId}/${parent}/${crypto.randomUUID()}-${safeName}`;
  const storage = client().storage.from("task-images");
  const upload = await storage.upload(path, file, { upsert: false });
  throwIfError(upload.error);
  const { data: publicUrl } = storage.getPublicUrl(path);
  const { error } = await client().from("attachments").insert({
    task_id: scope.taskId,
    experiment_id: scope.experimentId,
    url: publicUrl.publicUrl,
    path,
    caption: "",
    position,
  });
  if (!error) return;
  const cleanup = await storage.remove([path]);
  if (cleanup.error) {
    throw new Error(
      `Attachment insert failed: ${error.message}; `
      + `Storage cleanup failed: ${cleanup.error.message}`,
    );
  }
  throw new Error(error.message);
}

export async function updateAttachmentCaption(
  attachmentId: string,
  caption: string,
): Promise<void> {
  const { error } = await client()
    .from("attachments")
    .update({ caption })
    .eq("id", attachmentId);
  throwIfError(error);
}

export async function deleteAttachment(
  attachment: Attachment,
): Promise<void> {
  const { error } = await client()
    .from("attachments")
    .delete()
    .eq("id", attachment.id);
  throwIfError(error);
  if (!attachment.path) return;
  const cleanup = await client()
    .storage.from("task-images")
    .remove([attachment.path]);
  if (cleanup.error) {
    throw new Error(
      "Attachment record was deleted, but Storage cleanup failed: "
      + cleanup.error.message,
    );
  }
}
```

Keep the experiment repository API stable by making
`uploadExperimentAttachment` delegate to `uploadAttachment` and aliasing the
two generic mutations:

```ts
export async function uploadExperimentAttachment(
  experiment: Experiment,
  file: File,
  position: number,
): Promise<void> {
  return uploadAttachment(
    { taskId: experiment.task_id, experimentId: experiment.id },
    file,
    position,
  );
}

export const updateExperimentAttachment = updateAttachmentCaption;
export const deleteExperimentAttachment = deleteAttachment;
```

Change `AttachmentGallery` to:

```ts
export interface AttachmentGalleryProps {
  scope: AttachmentScope;
  visitKey: string;
  attachments: Attachment[];
  title: string;
  emptyMessage: string;
  altFallback: string;
  onChanged: () => void;
}
```

Use `visitKey` for its committed-visit race guard and call the generic
attachment functions. Experiment Detail passes
`{ taskId: server.task_id, experimentId: server.id }`; Task Detail passes
`{ taskId: task.id, experimentId: null }`. Keep upload serialization, stale
visit protection, caption-on-blur, confirm-before-delete, cleanup errors, and
all existing Evidence tests.

Subscribe Task Detail to attachment INSERT/UPDATE/DELETE events. Refresh only
when the row has `experiment_id === null` or its ID is in the loaded Task
attachment ID set; this prevents an Experiment plot update from repainting the
Task-level gallery.

- [ ] **Step 5: Implement the record layout and delete overflow**

Import `useRouter` and add a guarded Task delete:

```ts
async function removeTask() {
  if (
    !task
    || deleting
    || !window.confirm(`Delete task “${task.title}”? This cannot be undone.`)
  ) {
    return;
  }
  const requestedVisit = visitRef.current;
  if (!requestedVisit || !supabase) return;
  setDeleting(true);
  setMutationErrors((current) => {
    const next = { ...current };
    delete next.delete;
    return next;
  });
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", requestedVisit.id);
  if (error && visitRef.current === requestedVisit) {
    setMutationErrors((current) => ({
      ...current,
      delete: `Could not delete task. ${error.message}`,
    }));
    setDeleting(false);
    return;
  }
  if (visitRef.current === requestedVisit) router.push("/");
}
```

The loaded-state outer structure is:

```tsx
<div className="record-page task-detail-page">
  <div className="record-main">
    <Link className="back-link" href="/">← Task Board</Link>
    <PageHeader
      eyebrow="Task"
      title={
        <EditableText
          value={task.title}
          ariaLabel="Task title"
          onSave={(title) => void updateTask({ title })}
        />
      }
      actions={
        <details className="action-menu">
          <summary aria-label="More task actions">•••</summary>
          <div role="menu">
            <button
              type="button"
              role="menuitem"
              className="danger-subtle"
              disabled={deleting}
              onClick={() => void removeTask()}
            >
              {deleting ? "Deleting…" : "Delete task"}
            </button>
          </div>
        </details>
      }
    />
    <TaskProperties
      task={task}
      types={types}
      members={members}
      onPatch={(patch) => void updateTask(patch)}
    />
    <section id="description" aria-labelledby="task-description-title">
      <h2 id="task-description-title">Description</h2>
      <MarkdownField
        value={task.notes}
        onSave={(notes) => void updateTask({ notes })}
        placeholder="Add context, acceptance criteria, or links"
      />
    </section>
    <TaskExperimentsPanel />
    <section id="attachments" aria-labelledby="task-attachments-title">
      <h2 id="task-attachments-title">Attachments</h2>
      <AttachmentGallery
        scope={{ taskId: task.id, experimentId: null }}
        visitKey={`task:${task.id}`}
        attachments={attachments}
        title="Task files & images"
        emptyMessage="No task attachments yet."
        altFallback="Task attachment"
        onChanged={() => {
          const currentVisit = visitRef.current;
          if (currentVisit) void loadTask(currentVisit, "refresh");
        }}
      />
    </section>
  </div>
  <aside className="activity-rail" aria-label="Task activity">
    <h2>Activity</h2>
    <div className="timeline-add">
      <input
        value={draftNote}
        placeholder="Add a note to the timeline…"
        onChange={(event) => setDraftNote(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void addTimelineNote();
        }}
        aria-label="Add a note to the timeline"
      />
      <button
        type="button"
        className="btn primary"
        onClick={() => void addTimelineNote()}
        disabled={notePending}
      >
        {notePending ? "Adding…" : "Add note"}
      </button>
    </div>
    {activity.length === 0
      ? <p className="muted">No activity yet.</p>
      : (
        <div className="timeline">
          {activity.map((event, index) => (
            <div className="tl-row" key={event.id}>
              <div className="tl-rail">
                <span
                  className="tl-dot"
                  style={{
                    background: KIND_COLOR[event.kind] ?? "var(--status-todo)",
                  }}
                />
                {index < activity.length - 1 && (
                  <span className="tl-line" />
                )}
              </div>
              <div className="tl-body">
                <div className="tl-text">{event.text}</div>
                <div className="tl-time">
                  {relTime(event.created_at)} · {fmtDate(event.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
  </aside>
</div>
```

Render `mutationErrors.timeline` in the existing page-level error banner.
Keep Experiment create/compare, loading, not-found, error, retry, and realtime
behavior. The desktop grid is main document plus a 320px rail; below 1280px the
rail becomes the final full-width section.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run lib/attachments/__tests__/repository.test.ts lib/experiments/__tests__/repository.test.ts components/tasks/__tests__/TaskProperties.test.tsx components/__tests__/TaskDetail.test.tsx components/experiments/__tests__/TaskExperimentsPanel.test.tsx components/experiments/__tests__/ExperimentEvidence.test.tsx
npm test
npm run build
git add lib/attachments lib/experiments/repository.ts lib/experiments/__tests__/repository.test.ts components/TaskDetail.tsx components/__tests__/TaskDetail.test.tsx components/tasks/TaskProperties.tsx components/tasks/__tests__/TaskProperties.test.tsx components/experiments/AttachmentGallery.tsx components/experiments/CreateExperimentDialog.tsx components/experiments/ExperimentDetail.tsx components/experiments/TaskExperimentsPanel.tsx components/experiments/__tests__/CreateExperimentDialog.test.tsx components/experiments/__tests__/ExperimentEvidence.test.tsx components/experiments/__tests__/TaskExperimentsPanel.test.tsx app/globals.css
git commit -m "feat: redesign task detail records"
```

---

### Task 8: Redesign the Experiments Database

**Files:**

- Modify: `components/experiments/ExperimentsDatabase.tsx`
- Modify: `components/experiments/ExperimentFilters.tsx`
- Modify: `components/experiments/ExperimentTable.tsx`
- Modify: `components/experiments/CreateExperimentDialog.tsx`
- Modify: `components/experiments/__tests__/ExperimentsDatabase.test.tsx`
- Modify: `components/experiments/__tests__/ExperimentFilters.test.tsx`
- Modify: `components/experiments/__tests__/ExperimentTable.test.tsx`
- Modify: `components/experiments/__tests__/CreateExperimentDialog.test.tsx`
- Modify: `app/experiment-workspace.css`

**Interfaces:**

- Consumes: existing `ExperimentFilterState`, `applyExperimentFilters`, selection URL serialization, and create dialog repository behavior.
- Produces: compact database header, saved views, one-line filter toolbar,
  `ExperimentFilters` result count, selected action strip, and dense table.

- [ ] **Step 1: Add failing structural tests**

Add these expectations:

```tsx
expect(screen.getByRole("heading", { name: "Experiments" })).toBeDefined();
expect(screen.getByText("Research database")).toBeDefined();
expect(screen.getByRole("button", { name: "All" })
  .getAttribute("aria-pressed")).toBe("true");
expect(screen.getByText(/experiments$/)).toBeDefined();
expect(screen.getByRole("columnheader", { name: "Featured metrics" }))
  .toBeDefined();
```

After selecting two rows:

```tsx
expect(screen.getByText("2 selected")).toBeDefined();
expect(screen.getByRole("link", { name: "Compare selected (2)" }))
  .toBeDefined();
expect(screen.getByRole("button", { name: "Clear selection" }))
  .toBeDefined();
```

Saved-view tests continue to require the real five views:

```text
All, Running, Blocked, Needs Decision, Recently Completed
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run components/experiments/__tests__/ExperimentsDatabase.test.tsx components/experiments/__tests__/ExperimentFilters.test.tsx components/experiments/__tests__/ExperimentTable.test.tsx
```

Expected: FAIL on the new header/count/selection-strip structure.

- [ ] **Step 3: Implement the database structure**

Use `<PageHeader>` with `Research database`, exact existing actions, and no
fabricated Archived view. Add `resultCount: number` to `ExperimentFilters`,
pass `resultCount={visibleRows.length}` from `ExperimentsDatabase`, and render:

```tsx
<div className="database-toolbar">
  <label className="search-control">
    <span className="sr-only">Search experiments</span>
    <input
      type="search"
      value={value.search}
      onChange={(event) => set("search", event.target.value)}
      placeholder="Search experiments…"
    />
  </label>
  <label>
    <span className="sr-only">Task</span>
    <select value={value.taskId} onChange={(event) => set("taskId", event.target.value)}>
      <option value="">All tasks</option>
      {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
    </select>
  </label>
  <label>
    <span className="sr-only">Owner</span>
    <select value={value.ownerId} onChange={(event) => set("ownerId", event.target.value)}>
      <option value="">All owners</option>
      <option value="unassigned">Unassigned</option>
      {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
    </select>
  </label>
  <label>
    <span className="sr-only">Status</span>
    <select value={value.status} onChange={(event) => set("status", event.target.value as ExperimentStatus | "")}>
      <option value="">All statuses</option>
      {(Object.entries(EXPERIMENT_STATUS_LABELS) as [ExperimentStatus, string][])
        .map(([status, label]) => (
          <option key={status} value={status}>{label}</option>
        ))}
    </select>
  </label>
  <label>
    <span className="sr-only">Decision</span>
    <select value={value.decision} onChange={(event) => set("decision", event.target.value as DecisionOutcome | "none" | "")}>
      <option value="">All decisions</option>
      <option value="none">No decision</option>
      {(Object.entries(DECISION_LABELS) as [DecisionOutcome, string][])
        .map(([decision, label]) => (
          <option key={decision} value={decision}>{label}</option>
        ))}
    </select>
  </label>
  <span className="result-count">{resultCount} experiments</span>
</div>
```

When selection is non-empty:

```tsx
<div className="selection-strip" role="status">
  <strong>{selectedIds.size} selected</strong>
  <button type="button" onClick={() => setSelectedIds(new Set())}>
    Clear selection
  </button>
</div>
```

Keep all existing reload race guards, selection reconciliation, realtime subscription, retry, and create navigation.
Set `aria-selected={selectedIds.has(row.id)}` and `className="selected-row"`
on selected Experiment table rows; do not change the table's current columns
or Featured Metric calculation.

- [ ] **Step 4: Style the database without changing data semantics**

Use a full-width table with 1px dividers, 40–48px rows, sticky header, compact Status Dot + Text, and quiet selected rows. Keep the exact current columns and Featured Metric derivation. Do not add pagination unless the repository becomes server-paginated in a separate feature.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run components/experiments/__tests__/ExperimentsDatabase.test.tsx components/experiments/__tests__/ExperimentFilters.test.tsx components/experiments/__tests__/ExperimentTable.test.tsx components/experiments/__tests__/CreateExperimentDialog.test.tsx
npm test
npm run build
git add components/experiments app/experiment-workspace.css
git commit -m "feat: redesign the experiments database"
```

---

### Task 9: Redesign the Experiment Record

**Files:**

- Modify: `components/experiments/ExperimentDetail.tsx`
- Modify: `components/experiments/ExperimentSection.tsx`
- Modify: `components/experiments/ExperimentTimeline.tsx`
- Modify: `components/experiments/ResultEditor.tsx`
- Modify: `components/experiments/AttachmentGallery.tsx`
- Modify: `components/experiments/__tests__/ExperimentDetail.test.tsx`
- Modify: `components/experiments/__tests__/ExperimentDetailMarkdown.integration.test.tsx`
- Modify: `components/experiments/__tests__/ExperimentEvidence.test.tsx`
- Modify: `app/experiment-workspace.css`

**Interfaces:**

- Consumes: all existing Experiment Detail draft, save, validation, baseline, realtime, duplicate, attachment, and timeline behavior.
- Produces: document record header/properties, sticky section anchors, main document column, Activity Rail, and sticky Save Bar.

- [ ] **Step 1: Write failing layout tests**

Add:

```tsx
expect(screen.getByRole("navigation", { name: "Experiment sections" }))
  .toBeDefined();
for (const name of ["Data", "Object", "Environment", "Config", "Result", "Decision", "Note"]) {
  expect(screen.getByRole("link", { name })).toBeDefined();
}
expect(screen.getByRole("complementary", { name: "Experiment activity" }))
  .toBeDefined();
expect(screen.getByText(/Saved|Unsaved changes/)).toBeDefined();
expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
expect(screen.getByRole("button", { name: "More experiment actions" }))
  .toBeDefined();
```

Keep every existing race/conflict/draft assertion intact.

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run components/experiments/__tests__/ExperimentDetail.test.tsx components/experiments/__tests__/ExperimentDetailMarkdown.integration.test.tsx components/experiments/__tests__/ExperimentEvidence.test.tsx
```

Expected: FAIL on section navigation, complementary Activity semantics, and action placement.

- [ ] **Step 3: Restructure only the render tree**

Do not rewrite the effect/mutation section of `ExperimentDetail.tsx`. Define
the anchor source once, outside the component:

```ts
const EXPERIMENT_SECTION_LINKS = [
  { id: "data", label: "Data" },
  { id: "object", label: "Object" },
  { id: "environment", label: "Environment" },
  { id: "config", label: "Config" },
  { id: "result", label: "Result" },
  { id: "decision", label: "Decision" },
  { id: "note", label: "Note" },
] as const;
```

Change the loaded-state outer class from
`workspace-page experiment-detail-page` to
`record-page experiment-detail-page`, and change
`experiment-main-column` to `record-main experiment-main-column`. Keep the
existing Back Link, conflict banner, error banner, properties, seven editor
sections, Baseline Summary, validation summary, Save Bar, Timeline, and
Duplicate dialog in their current order. Replace only the current record
header with this compile-ready `PageHeader`:

```tsx
<PageHeader
  eyebrow={formatExperimentId(draft.experiment_no)}
  title={
    <input
      className="experiment-title-input"
      aria-label="Experiment Name"
      value={draft.name}
      onChange={(event) => patchDraft({ name: event.target.value })}
    />
  }
  actions={
    <>
      <Link
        className={`btn ${compareBlocked ? "disabled" : ""}`}
        aria-disabled={compareBlocked}
        title={reloadingLatest
          ? "Wait for the latest saved data before comparing."
          : hasLocalChanges
            ? "Finish and save changes before comparing."
            : "Compare saved data."}
        href={compareBlocked
          ? `/experiments/${draft.id}`
          : `/experiments/compare?${compareQuery}`}
        onClick={(event) => {
          if (compareBlocked) event.preventDefault();
        }}
      >
        Compare
      </Link>
      <button
        type="button"
        className="btn"
        disabled={
          hasLocalChanges
          || saving
          || deleting
          || reloadingLatest
          || Boolean(remoteConflict)
          || remoteDeleted
        }
        title={hasLocalChanges
          ? "Finish and save changes before duplicating."
          : "Duplicate saved context."}
        onClick={() => setDuplicateOpen(true)}
      >
        Duplicate
      </button>
      <details className="action-menu">
        <summary aria-label="More experiment actions">•••</summary>
        <div role="menu">
          <button
            type="button"
            role="menuitem"
            className="danger-subtle"
            disabled={saving || deleting || reloadingLatest}
            onClick={() => void removeExperiment()}
          >
            {deleting ? "Deleting…" : "Delete experiment"}
          </button>
        </div>
      </details>
    </>
  }
/>
```

Immediately after the existing `experiment-properties` section, insert:

```tsx
<nav className="section-anchors" aria-label="Experiment sections">
  {EXPERIMENT_SECTION_LINKS.map((section) => (
    <a key={section.id} href={`#${section.id}`}>
      {section.label}
    </a>
  ))}
</nav>
```

Add the missing `id` to the semantic section root:

```tsx
<section
  id={id}
  className="experiment-section"
  aria-labelledby={`${id}-title`}
>
```

In `ExperimentTimeline`, keep its existing props and callbacks but change the
root to:

```tsx
<aside
  className="activity-rail experiment-timeline"
  aria-label="Experiment activity"
  aria-labelledby="experiment-timeline-title"
  aria-busy={saving}
>
```

Compare and Duplicate remain visible secondary actions. Delete is the only
menu action. Preserve every original disable rule.

- [ ] **Step 4: Make sections and evidence quiet**

`ExperimentSection` keeps a semantic `<section id>` and description. Result Metrics become aligned property rows; featured keys use the existing star control. Attachments remain real file/evidence entries with all existing Upload, Caption, Open, and Delete behaviors.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run components/experiments/__tests__/ExperimentDetail.test.tsx components/experiments/__tests__/ExperimentDetailMarkdown.integration.test.tsx components/experiments/__tests__/ExperimentEvidence.test.tsx components/experiments/__tests__/ExperimentEditors.test.tsx
npm test
npm run build
git add components/experiments/ExperimentDetail.tsx components/experiments/ExperimentSection.tsx components/experiments/ExperimentTimeline.tsx components/experiments/ResultEditor.tsx components/experiments/AttachmentGallery.tsx components/experiments/__tests__ app/experiment-workspace.css
git commit -m "feat: redesign experiment records"
```

---

### Task 10: Polish the Horizontal Schema-Driven Compare Table

**Files:**

- Modify: `components/experiments/ExperimentCompare.tsx`
- Modify: `components/experiments/__tests__/ExperimentCompare.test.tsx`
- Modify: `lib/experiments/__tests__/compare.test.ts`
- Modify: `app/experiment-workspace.css`

**Interfaces:**

- Consumes: unchanged `buildCompareColumns`, `orderWithBaseline`, Compare URL parser/serializer, and selected Experiment rows.
- Produces: selected-item strip, schema-group popover, sticky Experiment/Task/Status columns, keyboard-scrollable wide table, copied Share URL, exact explanatory footnote.

- [ ] **Step 1: Strengthen failing orientation and schema tests**

Add component assertions:

```tsx
const bodyRows = await screen.findAllByRole("row");
expect(within(bodyRows[1]).getByText("EXP-0001")).toBeDefined();
expect(within(bodyRows[2]).getByText("EXP-0002")).toBeDefined();
expect(screen.getByRole("columnheader", { name: /Dataset 1 Name/ }))
  .toBeDefined();
expect(screen.queryByRole("rowheader", { name: /Dataset 1 Name/ }))
  .toBeNull();
expect(screen.getByRole("region", { name: "Experiment comparison table" })
  .getAttribute("tabindex")).toBe("0");
expect(screen.getByText(/flattened from the Experiment schema/)).toBeDefined();
```

Add a pure compare test proving no non-schema field is synthesized:

```ts
const keys = buildCompareColumns(
  [
    { ...baseline, metrics: { "pass@1": 0.42 }, result_summary: "" },
    { ...current, metrics: { "pass@1": 0.48 }, result_summary: "" },
  ],
  { groups: ["result"], baselineId: null, diffOnly: false },
)
  .map((column) => column.key);
expect(keys).toEqual(["result.metrics.pass@1"]);
```

The test's only recorded metric is `pass@1`; it does not maintain a second
allow-list of metric names.

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run components/experiments/__tests__/ExperimentCompare.test.tsx lib/experiments/__tests__/compare.test.ts
```

Expected: existing schema tests pass; new layout/accessibility tests fail until the markup is polished.

- [ ] **Step 3: Implement controls and selection strip**

Keep the current Add, Baseline, Diff only, and URL behavior. Add:

```ts
type ShareState = "idle" | "copying" | "copied" | "error";

const [shareState, setShareState] = useState<ShareState>("idle");

useEffect(() => {
  setShareState("idle");
}, [selection.baselineId, selection.ids]);

async function copyShareUrl() {
  setShareState("copying");
  try {
    await navigator.clipboard.writeText(window.location.href);
    setShareState("copied");
  } catch {
    setShareState("error");
  }
}
```

Render the baseline-ordered `selected` array in this strip. This becomes the
single Remove control; remove the button from the table row identity cell:

```tsx
<div className="compare-selection" aria-label="Selected experiments">
  <span>{selected.length} selected</span>
  <ul>
    {selected.map((row) => (
      <li key={row.id}>
        <span>
          {formatExperimentId(row.experiment_no)} · {row.name}
          {row.id === selection.baselineId ? " · Baseline" : ""}
        </span>
        <button
          type="button"
          aria-label={`Remove ${formatExperimentId(row.experiment_no)}`}
          onClick={() => replaceSelection({
            ids: selectionRef.current.ids.filter((id) => id !== row.id),
            baselineId: selectionRef.current.baselineId === row.id
              ? null
              : selectionRef.current.baselineId,
          })}
        >
          Remove
        </button>
      </li>
    ))}
  </ul>
  <button
    type="button"
    className="btn"
    disabled={shareState === "copying"}
    onClick={() => void copyShareUrl()}
  >
    {shareState === "copying"
      ? "Copying…"
      : shareState === "copied"
        ? "Copied"
        : "Share"}
  </button>
  {shareState === "error" && (
    <span className="form-error" role="alert">Could not copy link</span>
  )}
</div>
```

Replace the always-expanded group checkboxes with an accessible `<details>`:

```tsx
<details className="field-groups">
  <summary>Fields · {groups.length} groups</summary>
  <div className="field-groups-menu">
    {GROUPS.map((group) => (
      <label key={group.value}>
        <input
          type="checkbox"
          checked={groups.includes(group.value)}
          onChange={(event) => setGroups((current) => {
            if (event.target.checked) {
              return current.includes(group.value)
                ? current
                : [...current, group.value];
            }
            return current.filter((value) => value !== group.value);
          })}
        />
        {group.label}
      </label>
    ))}
  </div>
</details>
```

Clipboard failure leaves selection and URL state untouched.

- [ ] **Step 4: Keep experiments as rows and make three identity columns sticky**

Add classes:

```text
compare-experiment-column
compare-task-column
compare-status-column
```

Apply them to both header and body cells. Use CSS custom widths so left offsets are consistent:

```css
.compare-table {
  --compare-experiment-width: 220px;
  --compare-task-width: 180px;
  --compare-status-width: 120px;
  min-width: max-content;
}

.compare-experiment-column,
.compare-task-column,
.compare-status-column {
  position: sticky;
  z-index: 2;
  background: var(--surface);
}

.compare-table thead .compare-experiment-column,
.compare-table thead .compare-task-column,
.compare-table thead .compare-status-column {
  z-index: 4;
  background: var(--surface-subtle);
}

.compare-experiment-column {
  left: 0;
  width: var(--compare-experiment-width);
  min-width: var(--compare-experiment-width);
}
.compare-task-column {
  left: var(--compare-experiment-width);
  width: var(--compare-task-width);
  min-width: var(--compare-task-width);
}
.compare-status-column {
  left: calc(var(--compare-experiment-width) + var(--compare-task-width));
  width: var(--compare-status-width);
  min-width: var(--compare-status-width);
  box-shadow: 1px 0 0 var(--border);
}

.baseline-row > .compare-experiment-column,
.baseline-row > .compare-task-column,
.baseline-row > .compare-status-column {
  background: var(--accent-subtle);
}

.compare-table-scroll {
  overflow: auto;
  scrollbar-gutter: stable;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.compare-table-scroll:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
```

The scroll wrapper is:

```tsx
<div
  className="compare-table-scroll"
  role="region"
  aria-label="Experiment comparison table"
  aria-describedby="compare-table-help"
  tabIndex={0}
>
  <table className="compare-table">
    <thead>
      <tr>
        <th scope="col" className="compare-experiment-column">
          Experiment
        </th>
        <th scope="col" className="compare-task-column">Task</th>
        <th scope="col" className="compare-status-column">Status</th>
        {columns.map((column) => (
          <th
            key={JSON.stringify(column.identity)}
            scope="col"
            className={column.kind === "delta" ? "neutral-delta" : ""}
          >
            <span>{column.label}</span>
            <small>
              {GROUPS.find((group) => group.value === column.group)?.label}
            </small>
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {selected.map((row) => (
        <tr
          key={row.id}
          className={row.id === selection.baselineId ? "baseline-row" : ""}
        >
          <th scope="row" className="compare-experiment-column">
            <Link href={`/experiments/${row.id}`}>
              {formatExperimentId(row.experiment_no)}
            </Link>
            <strong>{row.name}</strong>
            {row.id === selection.baselineId && (
              <span className="baseline-chip">Baseline</span>
            )}
          </th>
          <td className="compare-task-column">
            {row.task?.title ?? "—"}
          </td>
          <td className="compare-status-column">
            {EXPERIMENT_STATUS_LABELS[row.status]}
          </td>
          {columns.map((column) => (
            <td
              key={JSON.stringify(column.identity)}
              className={column.kind === "delta" ? "neutral-delta" : ""}
            >
              {displayValue(
                column.values[row.id] ?? null,
                column.kind === "delta",
                column.key,
              )}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

Render the footnote with the referenced ID and exact text:

```tsx
<p id="compare-table-help" className="field-help">
  Missing values are shown as —. Context fields are flattened from the
  Experiment schema; numeric Result deltas are current minus baseline.
</p>
```

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run components/experiments/__tests__/ExperimentCompare.test.tsx lib/experiments/__tests__/compare.test.ts lib/experiments/__tests__/compare-url.test.ts
npm test
npm run build
git add components/experiments/ExperimentCompare.tsx components/experiments/__tests__/ExperimentCompare.test.tsx lib/experiments/__tests__/compare.test.ts app/experiment-workspace.css
git commit -m "feat: polish schema-driven experiment compare"
```

---

### Task 11: Rebuild Analytics From Current Task Data

**Files:**

- Create: `lib/tasks/analytics.ts`
- Create: `lib/tasks/__tests__/analytics.test.ts`
- Create: `components/__tests__/Analytics.test.tsx`
- Modify: `components/Analytics.tsx`
- Modify: `app/globals.css`

**Interfaces:**

- Consumes: mapped `TaskModel[]`, `TaskType[]`, `Member[]`, and Status options.
- Produces:
  - `deriveTaskAnalytics(tasks, types, members): TaskAnalytics`
  - `taskAnalyticsCsv(analytics): string`
  - KPI strip, Status progress, Needs attention, Type progress, Owner workload.

- [ ] **Step 1: Write failing pure analytics tests**

```ts
import { describe, expect, it } from "vitest";
import {
  deriveTaskAnalytics,
  taskAnalyticsCsv,
} from "@/lib/tasks/analytics";

it("derives only current snapshot data by Status, Type, and Owner", () => {
  const analytics = deriveTaskAnalytics(tasks, types, members);
  expect(analytics.kpis).toEqual({
    total: 4,
    inProgress: 1,
    done: 1,
    blocked: 1,
    completion: 25,
  });
  expect(analytics.needsAttention.map((task) => task.title))
    .toEqual(["Recover failed NPU runner"]);
  expect(analytics.byType[0]).toMatchObject({
    name: "Infrastructure",
    total: 2,
    blocked: 1,
  });
  expect(analytics).not.toHaveProperty("trend");
});

it("exports the visible snapshot without Module terminology", () => {
  const csv = taskAnalyticsCsv(deriveTaskAnalytics(tasks, types, members));
  expect(csv).toContain("Type,Tasks,Done,In progress,Blocked,Owner coverage");
  expect(csv).not.toContain("Module");
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run lib/tasks/__tests__/analytics.test.ts components/__tests__/Analytics.test.tsx
```

Expected: FAIL because analytics derivation and the redesigned component do not exist.

- [ ] **Step 3: Implement pure derivation**

Define:

```ts
export interface TaskAnalytics {
  kpis: {
    total: number;
    inProgress: number;
    done: number;
    blocked: number;
    completion: number;
  };
  byStatus: Array<{ status: Status; count: number; percentage: number }>;
  needsAttention: TaskModel[];
  byType: Array<{
    id: string;
    name: string;
    total: number;
    todo: number;
    inProgress: number;
    done: number;
    blocked: number;
    ownerCoverage: number;
  }>;
  byOwner: Array<{
    name: string;
    total: number;
    todo: number;
    inProgress: number;
    done: number;
    blocked: number;
  }>;
}
```

All values derive from current arrays. Completion is
`Math.round(done / total * 100)` or `0` for an empty task set. Sort
`needsAttention` by `updated_at` descending and include only `blocked` Tasks.
`No type` receives its own row when needed. Owner coverage is the percentage
of Tasks in the Type with at least one Owner. `byOwner` uses the union of
member names and names still present in Task owner arrays, so a stale legacy
name cannot silently disappear from the snapshot. No time trend, forecast, or
significance field exists.

- [ ] **Step 4: Render the approved analytics hierarchy**

`Analytics.tsx` keeps the current three-table realtime subscription, adds the
same request-version stale-response guard used by the Experiment index, checks
all three Supabase errors, maps storage rows, and calls
`deriveTaskAnalytics`. A failed refresh retains the last successful snapshot
and shows Error + Retry.

Define:

```ts
const typeNameById = new Map(types.map((type) => [type.id, type.name]));
const analytics = useMemo(
  () => deriveTaskAnalytics(tasks, types, members),
  [members, tasks, types],
);

function exportCsv() {
  const blob = new Blob([taskAnalyticsCsv(analytics)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "triton-task-analytics.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
```

Render this hierarchy:

```tsx
<div className="workspace-page analytics-page">
  <PageHeader
    eyebrow="Live snapshot"
    title="Analytics"
    description="Current Task progress, attention, Type coverage, and Owner workload."
    actions={
      <button type="button" className="btn" onClick={exportCsv}>
        Export CSV
      </button>
    }
  />

  <dl className="kpi-strip">
    {[
      ["Total tasks", analytics.kpis.total],
      ["In progress", analytics.kpis.inProgress],
      ["Done", analytics.kpis.done],
      ["Blocked", analytics.kpis.blocked],
      ["Completion", `${analytics.kpis.completion}%`],
    ].map(([label, value]) => (
      <div key={label}>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    ))}
  </dl>

  <div className="analytics-split">
    <section aria-labelledby="progress-status-title">
      <h2 id="progress-status-title">Progress by status</h2>
      <div
        className="status-progress-track"
        role="img"
        aria-label={`${analytics.kpis.completion}% complete`}
      >
        {analytics.byStatus.map((item) => (
          <span
            key={item.status}
            className={`status-segment status-${item.status}`}
            style={{ width: `${item.percentage}%` }}
          />
        ))}
      </div>
      <ul className="status-legend">
        {analytics.byStatus.map((item) => (
          <li key={item.status}>
            <StatusDot status={item.status} label={statusLabel(item.status)} />
            <strong>{item.count}</strong>
          </li>
        ))}
      </ul>
    </section>

    <section aria-labelledby="needs-attention-title">
      <h2 id="needs-attention-title">Needs attention</h2>
      {analytics.needsAttention.length === 0
        ? <p className="muted">No blocked Tasks.</p>
        : (
          <ul className="attention-list">
            {analytics.needsAttention.map((task) => (
              <li key={task.id}>
                <Link href={`/task/${task.id}`}>{task.title}</Link>
                <span>
                  {task.typeId
                    ? typeNameById.get(task.typeId) ?? "No type"
                    : "No type"}
                  {" · "}
                  {task.owners.join(", ") || "No owner yet"}
                  {" · "}
                  {relTime(task.updated_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
    </section>
  </div>

  <section aria-labelledby="progress-type-title">
    <h2 id="progress-type-title">Progress by type</h2>
    <table className="analytics-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Tasks</th>
          <th>Done</th>
          <th>In progress</th>
          <th>Blocked</th>
          <th>Owner coverage</th>
        </tr>
      </thead>
      <tbody>
        {analytics.byType.map((row) => (
          <tr key={row.id}>
            <th scope="row">{row.name}</th>
            <td>{row.total}</td>
            <td>{row.done}</td>
            <td>{row.inProgress}</td>
            <td>{row.blocked}</td>
            <td>{row.ownerCoverage}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>

  <section aria-labelledby="workload-owner-title">
    <h2 id="workload-owner-title">Workload by owner</h2>
    <table className="analytics-table">
      <thead>
        <tr>
          <th>Owner</th>
          <th>Tasks</th>
          <th>Workload</th>
        </tr>
      </thead>
      <tbody>
        {analytics.byOwner.map((row) => (
          <tr key={row.name}>
            <th scope="row">{row.name}</th>
            <td>{row.total}</td>
            <td>
              <span className="workload-segments" aria-label={
                `${row.done} done, ${row.inProgress} in progress, `
                + `${row.todo} to do, ${row.blocked} blocked`
              }>
                {(["done", "inProgress", "todo", "blocked"] as const)
                  .map((key) => (
                    <i
                      key={key}
                      className={`status-${key === "inProgress" ? "in_progress" : key}`}
                      style={{
                        width: `${row.total ? row[key] / row.total * 100 : 0}%`,
                      }}
                    />
                  ))}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
</div>
```

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run lib/tasks/__tests__/analytics.test.ts components/__tests__/Analytics.test.tsx
npm test
npm run build
git add lib/tasks/analytics.ts lib/tasks/__tests__/analytics.test.ts components/Analytics.tsx components/__tests__/Analytics.test.tsx app/globals.css
git commit -m "feat: redesign task analytics"
```

---

### Task 12: Complete Responsive, State, Accessibility, and Visual Verification

**Files:**

- Create: `components/ui/WorkspaceSkeleton.tsx`
- Create: `components/ui/__tests__/WorkspaceSkeleton.test.tsx`
- Modify: `app/globals.css`
- Modify: `app/experiment-workspace.css`
- Modify: `app/__tests__/workspace-styles.test.ts`
- Modify: `components/Navbar.tsx`
- Modify: `components/__tests__/Navbar.test.tsx`
- Modify loading/empty branches in `components/Board.tsx`,
  `components/TaskDetail.tsx`, `components/Analytics.tsx`, and
  `components/experiments/{ExperimentsDatabase,ExperimentDetail,ExperimentCompare}.tsx`
- Modify: `components/__tests__/Board.test.tsx`
- Modify: `components/__tests__/TaskDetail.test.tsx`
- Modify: `components/__tests__/Analytics.test.tsx`
- Modify: `components/experiments/__tests__/ExperimentsDatabase.test.tsx`
- Modify: `components/experiments/__tests__/ExperimentDetail.test.tsx`
- Modify: `components/experiments/__tests__/ExperimentCompare.test.tsx`
- Modify: `docs/superpowers/specs/2026-07-27-triton-dashboard-design-system-design.md`

**Interfaces:**

- Consumes: every completed route and approved concept.
- Produces: verified 1280/1024/768/390 behavior, focus/accessibility coverage, visual screenshots, a fidelity ledger, and final spec status.

- [ ] **Step 1: Write failing CSS contract tests for every breakpoint**

Replace obsolete warm-gray/232px assertions with:

```ts
it("keeps desktop, compact, and narrow workspace contracts", () => {
  expect(ruleBody(globals, ".app-shell"))
    .toMatch(/grid-template-columns\s*:\s*256px\s+minmax\(0,\s*1fr\)/);

  const compact = mediaBody(globals, 1279);
  expect(compact).toMatch(/\.task-board-scroll[\s\S]*overflow-x\s*:\s*auto/);
  expect(compact).toMatch(/\.activity-rail[\s\S]*position\s*:\s*static/);

  const narrow = mediaBody(globals, 767);
  expect(narrow).toMatch(/\.drawer-panel[\s\S]*width\s*:\s*100%/);
  expect(narrow).toMatch(/min-height\s*:\s*44px/);
});
```

Add dark-theme contracts for Table, Input, Card, Drawer, focus ring, reduced motion, and `color-scheme`.

Add a semantic loading-state test:

```tsx
render(<WorkspaceSkeleton variant="board" label="Loading Tasks" />);
expect(screen.getByRole("status", { name: "Loading Tasks" })).toBeDefined();
expect(document.querySelectorAll(".skeleton-board-column")).toHaveLength(4);
expect(document.querySelector(".skeleton-visual")?.getAttribute("aria-hidden"))
  .toBe("true");
```

- [ ] **Step 2: Run tests to identify remaining CSS gaps**

```bash
npx vitest run app/__tests__/workspace-styles.test.ts components/ui/__tests__/WorkspaceSkeleton.test.tsx
```

Expected: FAIL only for breakpoint/accessibility rules not yet added.

- [ ] **Step 3: Complete responsive and state CSS**

Create the shared loading shape:

```tsx
export type WorkspaceSkeletonVariant =
  | "board"
  | "table"
  | "record"
  | "analytics";

export default function WorkspaceSkeleton({
  variant,
  label,
}: {
  variant: WorkspaceSkeletonVariant;
  label: string;
}) {
  return (
    <div className={`workspace-skeleton skeleton-${variant}`} role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="skeleton-visual" aria-hidden="true">
        <i className="skeleton-title" />
        <i className="skeleton-toolbar" />
        {variant === "board" && (
          <div className="skeleton-board-columns">
            {Array.from({ length: 4 }, (_, column) => (
              <div className="skeleton-board-column" key={column}>
                <i />
                <i />
                <i />
              </div>
            ))}
          </div>
        )}
        {variant === "table" && (
          <div className="skeleton-table">
            {Array.from({ length: 7 }, (_, row) => <i key={row} />)}
          </div>
        )}
        {variant === "record" && (
          <div className="skeleton-record">
            <div>{Array.from({ length: 8 }, (_, row) => <i key={row} />)}</div>
            <aside>{Array.from({ length: 5 }, (_, row) => <i key={row} />)}</aside>
          </div>
        )}
        {variant === "analytics" && (
          <div className="skeleton-analytics">
            {Array.from({ length: 5 }, (_, item) => <i key={item} />)}
          </div>
        )}
      </div>
    </div>
  );
}
```

Use `board` for Board, `table` for Experiments and Compare, `record` for both
Detail pages, and `analytics` for Analytics. Only replace initial one-line
loading states; keep stale content visible during background refreshes. Empty
states keep one contextual action: Add Task, New Experiment, or Back to the
parent surface.

Implement exact responsive and reduced-motion rules:

```css
.workspace-skeleton {
  padding: 24px;
}
.skeleton-visual i {
  display: block;
  border-radius: 6px;
  background: var(--surface-subtle);
  animation: skeleton-pulse 1.4s ease-in-out infinite alternate;
}
.skeleton-title { width: min(360px, 55%); height: 32px; }
.skeleton-toolbar { width: 100%; height: 44px; margin-top: 20px; }
.skeleton-board-columns {
  display: grid;
  grid-template-columns: repeat(4, minmax(240px, 1fr));
  gap: 1px;
  margin-top: 16px;
  background: var(--border);
}
.skeleton-board-column {
  display: grid;
  align-content: start;
  gap: 8px;
  min-height: 440px;
  padding: 12px;
  background: var(--canvas);
}
.skeleton-board-column i { height: 92px; }
.skeleton-table,
.skeleton-analytics {
  display: grid;
  gap: 1px;
  margin-top: 16px;
  background: var(--border);
}
.skeleton-table i { height: 44px; }
.skeleton-analytics {
  grid-template-columns: repeat(5, 1fr);
}
.skeleton-analytics i { height: 108px; }
.skeleton-record {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 32px;
  margin-top: 16px;
}
.skeleton-record > div,
.skeleton-record > aside {
  display: grid;
  gap: 12px;
  align-content: start;
}
.skeleton-record i { height: 52px; }

@keyframes skeleton-pulse {
  from { opacity: 0.55; }
  to { opacity: 1; }
}

@media (max-width: 1279px) {
  .app-shell {
    grid-template-columns: 72px minmax(0, 1fr);
  }
  .app-sidebar .brand,
  .app-sidebar .project-context,
  .app-sidebar .nav-btn > span,
  .app-sidebar .sidebar-footer > span,
  .app-sidebar .sidebar-footer button > span {
    overflow: hidden;
    width: 1px;
    height: 1px;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .task-board-scroll,
  .compare-table-scroll,
  .experiment-table-scroll {
    overflow-x: auto;
    scrollbar-gutter: stable;
  }
  .record-page,
  .skeleton-record {
    grid-template-columns: minmax(0, 1fr);
  }
  .activity-rail {
    position: static;
    grid-column: 1;
  }
  .database-toolbar {
    flex-wrap: wrap;
  }
}

@media (max-width: 1023px) {
  .app-content {
    padding-inline: 24px;
  }
  .page-header {
    gap: 16px;
  }
  .analytics-split {
    grid-template-columns: minmax(0, 1fr);
  }
  .skeleton-analytics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .app-shell {
    display: block;
  }
  .mobile-app-bar {
    position: sticky;
    z-index: 40;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 56px;
    padding-inline: 16px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .app-sidebar {
    position: fixed;
    z-index: 60;
    inset: 0 auto 0 0;
    width: min(320px, calc(100vw - 48px));
    transform: translateX(-100%);
    transition: transform 160ms ease;
  }
  .app-sidebar.is-open {
    transform: translateX(0);
  }
  .app-sidebar.is-open .brand,
  .app-sidebar.is-open .project-context,
  .app-sidebar.is-open .nav-btn > span,
  .app-sidebar.is-open .sidebar-footer > span,
  .app-sidebar.is-open .sidebar-footer button > span {
    width: auto;
    height: auto;
    clip-path: none;
    white-space: normal;
  }
  .nav-backdrop {
    position: fixed;
    z-index: 50;
    inset: 0;
    display: block;
    border: 0;
    background: rgb(20 20 20 / 38%);
  }
  .app-content {
    padding: 16px;
  }
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
  .page-actions {
    justify-content: flex-start;
  }
  .drawer-panel,
  .dialog-panel {
    width: 100%;
    max-width: none;
    height: 100%;
    border: 0;
    border-radius: 0;
  }
  button,
  [role="button"],
  input,
  select,
  textarea {
    min-height: 44px;
  }
  .database-toolbar > label,
  .database-toolbar input,
  .database-toolbar select {
    width: 100%;
  }
  .kpi-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .skeleton-board-columns {
    overflow-x: auto;
  }
}

@media (max-width: 479px) {
  .app-content,
  .workspace-skeleton {
    padding-inline: 12px;
  }
  .kpi-strip,
  .skeleton-analytics {
    grid-template-columns: minmax(0, 1fr);
  }
  .page-actions > * {
    flex: 1 1 auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Required behavior:

- Desktop: 256px sidebar, four board columns, Activity Rail.
- Compact: collapsible/icon navigation, horizontally scrollable Board/Compare, Activity below record.
- Narrow: compact app header/navigation sheet, full-screen Drawer/Dialog, tables stay tables and scroll.
- All narrow interactive controls: minimum 44px target.
- Horizontal regions: focusable with visible outline and explanatory text.
- Loading skeletons preserve page structure.
- Empty states contain one relevant action.
- Disabled and error states remain readable in both themes.

- [ ] **Step 4: Run automated verification**

```bash
npm test
npm run build
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase db reset --local
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase db query --local --file supabase/tests/0006_experiment_workspace.sql
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase db query --local --file supabase/tests/0007_task_type_metadata.sql
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase db advisors --local --type security --level warn --fail-on error
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase db advisors --local --type performance --level warn --fail-on error
```

Expected: all tests pass, production build succeeds, both transactional database suites pass, and no new error-level advisor finding appears.

- [ ] **Step 5: Start the app and perform browser verification**

Precondition: `.env.local` points to an authenticated Supabase environment with the migrations applied. Never print or copy its values into logs.

Run:

```bash
npm run dev
```

Use the browser verification skill at these viewports:

```text
1536×1024 light
1536×1024 dark
1024×768 light and dark
390×844 light and dark
```

Verify `/`, `/experiments`, and `/analytics` directly. Reach Task Detail by
opening a rendered Task card, reach Experiment Detail by opening a rendered
Experiment row, and reach Compare by selecting two rendered Experiments and
using `Compare selected`; this exercises the actual dynamic URLs without
hard-coded IDs. Do not paste credentials or database contents into terminal
output.

Exercise:

1. Theme persists after refresh with no visible flash.
2. Add Task retains input on failure and creates Type/Tags/Owner metadata.
3. Board switches Status/Type grouping.
4. Task Detail edits each new property.
5. Experiments filters and selection work.
6. Experiment Detail saves, duplicates, and handles unsaved state.
7. Compare scrolls horizontally and shows only schema-derived columns.
8. Analytics shows current snapshot only.
9. Keyboard Tab, Escape, focus restoration, and focus-visible states work.
10. Browser console has no hydration, invalid DOM, unhandled promise, or Supabase error.

- [ ] **Step 6: Produce the fidelity ledger**

View the latest browser screenshots and the approved concept images with the
image-viewing tool. Append an `Implementation Fidelity Ledger` section to the
design spec with a table whose columns are
`Surface`, `Concept match`, `Deliberate difference`, and `Reason`. It must have
rows for Task Board, Add Task, Experiments, Experiment Detail, Compare,
Analytics, Dark theme, and Narrow layout. Fill every cell with the observed
result; do not leave a difference unexplained. Compare differences must cite
Schema authority, Analytics differences must cite current-snapshot authority,
and copy differences must preserve `Type`, `Owner`, real Saved Views, and the
real Experiment Schema.

- [ ] **Step 7: Mark the design spec implemented and commit**

Change:

```markdown
**状态：** 已实现并通过自动化与浏览器验收
```

Then run:

```bash
git diff --check
git status --short
git add app/globals.css app/experiment-workspace.css app/__tests__/workspace-styles.test.ts components/ui/WorkspaceSkeleton.tsx components/ui/__tests__/WorkspaceSkeleton.test.tsx components/Navbar.tsx components/__tests__/Navbar.test.tsx components/Board.tsx components/__tests__/Board.test.tsx components/TaskDetail.tsx components/__tests__/TaskDetail.test.tsx components/Analytics.tsx components/__tests__/Analytics.test.tsx components/experiments/ExperimentsDatabase.tsx components/experiments/ExperimentDetail.tsx components/experiments/ExperimentCompare.tsx components/experiments/__tests__/ExperimentsDatabase.test.tsx components/experiments/__tests__/ExperimentDetail.test.tsx components/experiments/__tests__/ExperimentCompare.test.tsx docs/superpowers/specs/2026-07-27-triton-dashboard-design-system-design.md
git commit -m "test: verify dashboard redesign"
```

Expected: the commit contains only final responsive/verification adjustments and the spec status; unrelated `.agents/`, `.superpowers/`, and `skills-lock.json` remain unstaged.

## Final Review Gate

After Task 12:

```bash
git log --oneline --decorate -15
git diff HEAD~12..HEAD --stat
git status --short
```

Confirm:

- Each task has its own reviewable commit.
- No unrelated user files were committed.
- The implementation matches the written design spec.
- All routes, both themes, and all required viewports were verified.
- The final handoff includes the latest browser screenshot, the concept comparison, test/build/database results, and the fidelity ledger.
