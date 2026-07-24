# Triton Board Task + Experiment Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 1 of Triton Board as a Task-centered research workspace where manually recorded Experiments preserve Data, Object, Environment, Config, Result, Decision, Note, ownership, status, timeline, and explicit-baseline comparisons.

**Architecture:** Keep the existing Next.js App Router client-to-Supabase architecture and extend it with one additive migration. Put experiment policies, comparison derivation, URL state, optimistic concurrency, and Supabase access in focused `lib/experiments/*` modules; keep route files thin and compose the UI from focused experiment components rather than growing `TaskDetail.tsx`.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript 5 strict mode, Supabase/PostgreSQL, plain CSS, Vitest, React Testing Library.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-07-24-task-experiment-workspace-design.md`.
- Scope is Phase 1 only: `Project → Task → Experiment`; do not add Subtask, multiple Projects, team feed/following, risk prediction, per-person authentication, automatic result ingestion, automatic significance claims, automatic metric good/bad coloring, or automatic Task status changes.
- All experiment content is manually entered. Do not read `triton-op-agent`, `result.txt`, Git commits, or run directories.
- New Experiment requires Name and Owner in the UI; legacy rows may have `owner_id = null`.
- Baseline is always explicit. Without a Baseline, render raw Result only and no Delta.
- Delta is `current - baseline`, is neutral-colored, and is never persisted.
- Dedicated Compare uses Experiment rows and field columns, pins the Baseline first, supports field groups and `Diff only`, stores UUIDs in the URL, and must render at least 20 selected Experiments without an application-level cap.
- Preserve existing Experiment notes, numeric metrics, attachments, timestamps, Task timeline, AuthGate, Realtime, and Analytics.
- Experiment update and automatic Experiment Activity must commit in one database transaction; the UI must not duplicate trigger-generated events.
- Realtime must never overwrite a dirty local draft. Saves use `id` plus the previously loaded `updated_at`.
- Migration `0006` is additive and idempotent. Never edit migrations `0001`–`0005`.
- Production migration is a maintainer action after staging verification and backup; implementation must not point local development at the live database.
- Existing root worktree has user-owned changes in `package-lock.json` and `.superpowers/`. At execution time invoke `superpowers:using-git-worktrees`, create a feature worktree from current `HEAD`, and do not stage either pre-existing path from the root worktree.
- Before changing Next.js route, component-boundary, CSS, or test setup code, re-read the matching local Next 16 guide under `node_modules/next/dist/docs/`. In particular, dynamic `params` and page `searchParams` are promises, global CSS belongs in the root layout, and Vitest does not test async Server Components.
- UI copy is English, matching the existing application.
- Every task ends with its focused tests plus `npx tsc --noEmit`; route-level tasks also run `npm run build`.

## File Structure

### Create

- `supabase/migrations/0006_experiment_workspace.sql` — additive Experiment schema, constraints, indexes, timestamps, and transaction-safe anonymous Activity triggers.
- `supabase/tests/0006_experiment_workspace.sql` — disposable staging verification transaction for the migration.
- `vitest.config.mts` — official Next/Vitest jsdom setup.
- `lib/experiments/policy.ts` — status transitions, stage validation, duplicate copy/reset policy, display IDs.
- `lib/experiments/compare.ts` — context flattening, field alignment, neutral metric Delta columns, `Diff only`.
- `lib/experiments/compare-url.ts` — parse and serialize shareable compare query state.
- `lib/experiments/draft.ts` — realtime draft reconciliation and editable patch extraction.
- `lib/experiments/repository.ts` — all Experiment, attachment, Activity, and comparison Supabase calls.
- `lib/experiments/filters.ts` — global list filters and four saved views.
- `lib/experiments/__tests__/policy.test.ts`
- `lib/experiments/__tests__/compare.test.ts`
- `lib/experiments/__tests__/compare-url.test.ts`
- `lib/experiments/__tests__/draft.test.ts`
- `lib/experiments/__tests__/filters.test.ts`
- `components/experiments/ExperimentStatusBadge.tsx`
- `components/experiments/ExperimentTable.tsx`
- `components/experiments/ExperimentFilters.tsx`
- `components/experiments/CreateExperimentDialog.tsx`
- `components/experiments/DuplicateExperimentDialog.tsx`
- `components/experiments/ExperimentsDatabase.tsx`
- `components/experiments/TaskExperimentsPanel.tsx`
- `components/experiments/ExperimentSection.tsx`
- `components/experiments/CommaListInput.tsx`
- `components/experiments/DataEditor.tsx`
- `components/experiments/ObjectEditor.tsx`
- `components/experiments/EnvironmentEditor.tsx`
- `components/experiments/ConfigEditor.tsx`
- `components/experiments/ResultEditor.tsx`
- `components/experiments/DecisionEditor.tsx`
- `components/experiments/BaselinePicker.tsx`
- `components/experiments/BaselineSummary.tsx`
- `components/experiments/AttachmentGallery.tsx`
- `components/experiments/ExperimentTimeline.tsx`
- `components/experiments/ExperimentDetail.tsx`
- `components/experiments/ExperimentCompare.tsx`
- `components/experiments/__tests__/ExperimentTable.test.tsx`
- `components/experiments/__tests__/CreateExperimentDialog.test.tsx`
- `components/experiments/__tests__/ExperimentEditors.test.tsx`
- `components/experiments/__tests__/ExperimentEvidence.test.tsx`
- `components/experiments/__tests__/DuplicateExperimentDialog.test.tsx`
- `components/experiments/__tests__/ExperimentCompare.test.tsx`
- `components/experiments/__tests__/TaskExperimentsPanel.test.tsx`
- `app/experiments/page.tsx`
- `app/experiments/[id]/page.tsx`
- `app/experiments/[id]/loading.tsx`
- `app/experiments/compare/page.tsx`
- `app/task/[id]/loading.tsx`
- `app/experiment-workspace.css`

### Modify

- `package.json` and `package-lock.json` — Vitest toolchain and scripts, in the clean feature worktree only.
- `lib/types.ts` — structured Experiment types, joined list row, nullable Experiment Activity link.
- `lib/activity.ts` — optional `experiment_id` for manual timeline notes only.
- `components/MarkdownField.tsx` — optional edit-state callback so Realtime treats active Markdown editing as a dirty draft.
- `components/TaskDetail.tsx` — replace inline Experiment cards/charts with compact table, creation, selection, and navigation.
- `app/task/[id]/page.tsx` — use the Next 16 promised `params` contract.
- `components/Navbar.tsx` — Board, Experiments, Compare, and Analytics navigation in the Notion-inspired shell.
- `app/layout.tsx` — app shell and workspace stylesheet.
- `app/globals.css` — remove the decorative dot grid and establish neutral shell tokens/responsive layout.
- `README.md` — routes, schema, migration `0006`, manual-entry semantics, baseline semantics, and staging rollout.

---

### Task 1: Additive Experiment Workspace Migration

**Files:**
- Create: `supabase/migrations/0006_experiment_workspace.sql`
- Create: `supabase/tests/0006_experiment_workspace.sql`

**Interfaces:**
- Consumes: tables, RLS, Realtime, `set_updated_at()`, and `experiments_set_updated_at` from migrations `0001`–`0005`.
- Produces: the exact columns and foreign-key name `experiments_baseline_experiment_id_fkey` consumed by `lib/experiments/repository.ts`; automatic anonymous Activity rows for Experiment inserts and updates.

- [ ] **Step 1: Write the disposable migration verification first**

Create `supabase/tests/0006_experiment_workspace.sql` with a transaction that asserts schema, lifecycle timestamps, trigger Activity, completion protection, baseline cleanup, and authenticated RLS:

```sql
\set ON_ERROR_STOP on

begin;

do $verify$
declare
  v_module uuid;
  v_task uuid;
  v_owner uuid;
  v_baseline uuid;
  v_candidate uuid;
  v_started_at timestamptz;
  v_activity_count integer;
  v_baseline_after_delete uuid;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'experiments'
      and column_name = 'experiment_no'
  ) then
    raise exception 'experiment_no is missing';
  end if;

  insert into modules (name, kind, objective, position)
  values ('migration-test-module', 'pipeline', '', 999999)
  returning id into v_module;

  insert into tasks (module_id, title, status, assignees, position)
  values (v_module, 'migration-test-task', 'in_progress', '{}', 999999)
  returning id into v_task;

  insert into members (name, initials, position)
  values ('Migration Test Owner', 'MT', 999999)
  returning id into v_owner;

  insert into experiments (
    task_id,
    owner_id,
    name,
    status,
    data_spec,
    object_spec,
    environment_spec,
    config,
    metrics,
    decision_outcome,
    position
  )
  values (
    v_task,
    v_owner,
    'baseline',
    'completed',
    '{"datasets":[{"role":"evaluation","name":"fixture"}]}'::jsonb,
    '{"model":"fixture-model","harness":"","parent_harness":"","prompt":"","prompt_change":"","skills":[],"tools":[]}'::jsonb,
    '{"platform":"npu","server":"fixture-server","devices":["npu:0"],"hardware":"","evaluator":"","revision":"","precision_policy":""}'::jsonb,
    '{"profile":"defaults"}'::jsonb,
    '{"pass@1":0.1}'::jsonb,
    'reference',
    0
  )
  returning id into v_baseline;

  insert into experiments (
    task_id,
    owner_id,
    name,
    status,
    baseline_experiment_id,
    data_spec,
    object_spec,
    environment_spec,
    config,
    position
  )
  values (
    v_task,
    v_owner,
    'candidate',
    'planned',
    v_baseline,
    '{"datasets":[{"role":"evaluation","name":"fixture"}]}'::jsonb,
    '{"model":"fixture-model","harness":"","parent_harness":"","prompt":"","prompt_change":"","skills":[],"tools":[]}'::jsonb,
    '{"platform":"npu","server":"fixture-server","devices":["npu:1"],"hardware":"","evaluator":"","revision":"","precision_policy":""}'::jsonb,
    '{"temperature":0.1}'::jsonb,
    1
  )
  returning id into v_candidate;

  update experiments set status = 'running' where id = v_candidate;
  select started_at into v_started_at from experiments where id = v_candidate;
  if v_started_at is null then
    raise exception 'running did not set started_at';
  end if;

  begin
    update experiments set status = 'completed' where id = v_candidate;
    raise exception 'completed without decision was accepted';
  exception
    when check_violation then null;
  end;

  update experiments
  set
    status = 'analyzing',
    metrics = '{"pass@1":0.2}'::jsonb,
    result_summary = 'candidate result',
    decision_outcome = 'accepted',
    decision_notes = 'keep this configuration'
  where id = v_candidate;

  update experiments set status = 'completed' where id = v_candidate;
  if (select completed_at from experiments where id = v_candidate) is null then
    raise exception 'completed did not set completed_at';
  end if;

  update experiments set status = 'analyzing' where id = v_candidate;
  if (select completed_at from experiments where id = v_candidate) is not null then
    raise exception 'reopen did not clear completed_at';
  end if;
  if (select started_at from experiments where id = v_candidate) is distinct from v_started_at then
    raise exception 'reopen changed first started_at';
  end if;

  select count(*) into v_activity_count
  from activity
  where experiment_id = v_candidate;
  if v_activity_count < 5 then
    raise exception 'expected trigger activity, got %', v_activity_count;
  end if;

  delete from experiments where id = v_baseline;
  select baseline_experiment_id into v_baseline_after_delete
  from experiments
  where id = v_candidate;
  if v_baseline_after_delete is not null then
    raise exception 'baseline delete did not set reference to null';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'experiments'
      and policyname = 'auth access'
      and 'authenticated' = any(roles)
  ) then
    raise exception 'authenticated experiment RLS policy is missing';
  end if;
end
$verify$;

rollback;
```

- [ ] **Step 2: Run the verification against a disposable database before the migration**

Run only with a non-production URL:

```bash
psql "$TEST_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0006_experiment_workspace.sql
```

Expected: non-zero exit with `experiment_no is missing`. If `TEST_SUPABASE_DB_URL` is unset or points at production, stop this task without running the command.

- [ ] **Step 3: Write the additive idempotent migration**

Create `supabase/migrations/0006_experiment_workspace.sql`:

```sql
-- Phase 1: Task + Experiment knowledge loop.
-- Additive and safe for the previous web version.

alter table experiments
  add column if not exists experiment_no bigint generated by default as identity;
alter table experiments add column if not exists owner_id uuid;
alter table experiments add column if not exists status text;
alter table experiments add column if not exists baseline_experiment_id uuid;
alter table experiments add column if not exists data_spec jsonb not null default '{}'::jsonb;
alter table experiments add column if not exists object_spec jsonb not null default '{}'::jsonb;
alter table experiments add column if not exists environment_spec jsonb not null default '{}'::jsonb;
alter table experiments add column if not exists config jsonb not null default '{}'::jsonb;
alter table experiments add column if not exists featured_metric_keys text[] not null default '{}';
alter table experiments add column if not exists result_summary text not null default '';
alter table experiments add column if not exists decision_outcome text;
alter table experiments add column if not exists decision_notes text not null default '';
alter table experiments add column if not exists started_at timestamptz;
alter table experiments add column if not exists completed_at timestamptz;

update experiments
set status = case
  when jsonb_typeof(metrics) = 'object' and metrics <> '{}'::jsonb then 'analyzing'
  else 'planned'
end
where status is null;

alter table experiments alter column status set default 'planned';
alter table experiments alter column status set not null;

create unique index if not exists experiments_experiment_no_key
  on experiments (experiment_no);
create index if not exists experiments_task_status_updated_idx
  on experiments (task_id, status, updated_at desc);
create index if not exists experiments_owner_status_idx
  on experiments (owner_id, status);
create index if not exists experiments_baseline_idx
  on experiments (baseline_experiment_id);

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'experiments'::regclass
      and conname = 'experiments_owner_id_fkey'
  ) then
    alter table experiments
      add constraint experiments_owner_id_fkey
      foreign key (owner_id) references members(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'experiments'::regclass
      and conname = 'experiments_baseline_experiment_id_fkey'
  ) then
    alter table experiments
      add constraint experiments_baseline_experiment_id_fkey
      foreign key (baseline_experiment_id)
      references experiments(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'experiments'::regclass
      and conname = 'experiments_status_check'
  ) then
    alter table experiments
      add constraint experiments_status_check
      check (status in ('planned', 'running', 'analyzing', 'completed', 'blocked', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'experiments'::regclass
      and conname = 'experiments_decision_outcome_check'
  ) then
    alter table experiments
      add constraint experiments_decision_outcome_check
      check (
        decision_outcome is null
        or decision_outcome in ('reference', 'accepted', 'rejected', 'inconclusive')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'experiments'::regclass
      and conname = 'experiments_baseline_not_self_check'
  ) then
    alter table experiments
      add constraint experiments_baseline_not_self_check
      check (baseline_experiment_id is null or baseline_experiment_id <> id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'experiments'::regclass
      and conname = 'experiments_completed_decision_check'
  ) then
    alter table experiments
      add constraint experiments_completed_decision_check
      check (status <> 'completed' or decision_outcome is not null);
  end if;
end
$constraints$;

alter table activity add column if not exists experiment_id uuid;

do $activity_constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'activity'::regclass
      and conname = 'activity_experiment_id_fkey'
  ) then
    alter table activity
      add constraint activity_experiment_id_fkey
      foreign key (experiment_id) references experiments(id) on delete set null;
  end if;
end
$activity_constraint$;

create index if not exists activity_experiment_created_idx
  on activity (experiment_id, created_at desc);

create or replace function set_experiment_status_timestamps()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'INSERT' then
    if new.status = 'running' and new.started_at is null then
      new.started_at = now();
    end if;
    if new.status = 'completed' and new.completed_at is null then
      new.completed_at = now();
    end if;
    return new;
  end if;

  if old.status is distinct from new.status then
    if new.status = 'running' and new.started_at is null then
      new.started_at = now();
    end if;
    if new.status = 'completed' then
      new.completed_at = now();
    elsif old.status = 'completed' then
      new.completed_at = null;
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists experiments_status_timestamps on experiments;
create trigger experiments_status_timestamps
  before insert or update on experiments
  for each row execute function set_experiment_status_timestamps();

create or replace function log_experiment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_owner_name text;
  v_baseline_no bigint;
begin
  if tg_op = 'INSERT' then
    if new.baseline_experiment_id is null then
      insert into activity (task_id, experiment_id, text, kind)
      values (new.task_id, new.id, 'Experiment created', 'experiment');
    else
      select experiment_no into v_baseline_no
      from experiments
      where id = new.baseline_experiment_id;
      insert into activity (task_id, experiment_id, text, kind)
      values (
        new.task_id,
        new.id,
        format('Experiment duplicated from EXP-%s', to_char(v_baseline_no, 'FM0000')),
        'experiment'
      );
    end if;
    return new;
  end if;

  if old.owner_id is distinct from new.owner_id then
    select name into v_owner_name from members where id = new.owner_id;
    insert into activity (task_id, experiment_id, text, kind)
    values (
      new.task_id,
      new.id,
      case
        when new.owner_id is null then 'Owner cleared'
        else format('Owner changed to %s', coalesce(v_owner_name, 'Unknown member'))
      end,
      'assign'
    );
  end if;

  if old.status is distinct from new.status then
    insert into activity (task_id, experiment_id, text, kind)
    values (new.task_id, new.id, format('Status changed to %s', new.status), 'status');
  end if;

  if old.data_spec is distinct from new.data_spec then
    insert into activity (task_id, experiment_id, text, kind)
    values (new.task_id, new.id, 'Data updated', 'edit');
  end if;
  if old.object_spec is distinct from new.object_spec then
    insert into activity (task_id, experiment_id, text, kind)
    values (new.task_id, new.id, 'Object updated', 'edit');
  end if;
  if old.environment_spec is distinct from new.environment_spec then
    insert into activity (task_id, experiment_id, text, kind)
    values (new.task_id, new.id, 'Environment updated', 'edit');
  end if;
  if old.config is distinct from new.config then
    insert into activity (task_id, experiment_id, text, kind)
    values (new.task_id, new.id, 'Config updated', 'edit');
  end if;

  if old.metrics is distinct from new.metrics
    or old.featured_metric_keys is distinct from new.featured_metric_keys
    or old.result_summary is distinct from new.result_summary then
    insert into activity (task_id, experiment_id, text, kind)
    values (new.task_id, new.id, 'Result updated', 'experiment');
  end if;

  if old.decision_outcome is distinct from new.decision_outcome
    or old.decision_notes is distinct from new.decision_notes then
    insert into activity (task_id, experiment_id, text, kind)
    values (new.task_id, new.id, 'Decision recorded', 'note');
  end if;

  return new;
end
$function$;

drop trigger if exists experiments_activity on experiments;
create trigger experiments_activity
  after insert or update on experiments
  for each row execute function log_experiment_activity();
```

- [ ] **Step 4: Apply and verify twice on a disposable Supabase project**

Run:

```bash
SUPABASE_DB_URL="$TEST_SUPABASE_DB_URL" npm run db:migrate
psql "$TEST_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0006_experiment_workspace.sql
psql "$TEST_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0006_experiment_workspace.sql
psql "$TEST_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0006_experiment_workspace.sql
SUPABASE_DB_URL="$TEST_SUPABASE_DB_URL" npm run db:migrate
```

Expected: both verification runs end with `ROLLBACK`; directly re-running the SQL produces no duplicate-object error; the second migration-runner invocation reports no unapplied migration.

- [ ] **Step 5: Verify legacy backfill on the disposable database**

Before applying `0006` to a fresh disposable clone, record:

```sql
select count(*) as experiment_count from experiments;
select count(*) as attachment_count from attachments;
select id, notes, metrics from experiments order by id;
```

After applying `0006`, run:

```sql
select count(*) as experiment_count from experiments;
select count(*) as attachment_count from attachments;
select id, notes, metrics, status, owner_id, baseline_experiment_id
from experiments
order by id;
```

Expected: counts, IDs, notes, metrics, and attachments are unchanged; rows with non-empty metrics are `analyzing`; rows with empty metrics are `planned`; owner and baseline are null.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0006_experiment_workspace.sql supabase/tests/0006_experiment_workspace.sql
git commit -m "feat(db): add experiment workspace schema"
```

---

### Task 2: Experiment Domain Types, Lifecycle Policy, and Duplicate Policy

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `lib/types.ts`
- Create: `vitest.config.mts`
- Create: `lib/experiments/policy.ts`
- Create: `lib/experiments/__tests__/policy.test.ts`

**Interfaces:**
- Consumes: migration column names from Task 1.
- Produces:
  - `ExperimentStatus`, `DecisionOutcome`, `DataSpec`, `ObjectSpec`, `EnvironmentSpec`, `ExperimentConfig`, extended `Experiment`, and `ExperimentListRow`.
  - `formatExperimentId(experimentNo: number): string`
  - `canTransition(from: ExperimentStatus, to: ExperimentStatus): boolean`
  - `validateForStatus(experiment: Experiment, target: ExperimentStatus): ValidationIssue[]`
  - `validateBaseline(experimentId: string, baselineId: string | null): ValidationIssue[]`
  - `buildDuplicateInsert(source: Experiment, input: DuplicateInput): ExperimentInsert`

- [ ] **Step 1: Install the official Next.js Vitest toolchain in the clean feature worktree**

Run:

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths
```

Update `package.json` scripts to contain:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "node --env-file=.env.local scripts/migrate.mjs",
    "db:baseline": "node --env-file=.env.local scripts/migrate.mjs --baseline"
  }
}
```

Create `vitest.config.mts`:

```ts
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    include: ["**/__tests__/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 2: Replace the Experiment type and extend Activity in `lib/types.ts`**

Keep the existing `Module`, `Task`, `Member`, and `Attachment` definitions. Replace the existing `Experiment` block and add the following types before `Attachment`:

```ts
export type ExperimentStatus =
  | "planned"
  | "running"
  | "analyzing"
  | "completed"
  | "blocked"
  | "cancelled";

export type DecisionOutcome =
  | "reference"
  | "accepted"
  | "rejected"
  | "inconclusive";

export type DatasetRole = "training" | "evaluation";

export interface DatasetSpec {
  role: DatasetRole;
  name: string;
  split: string;
  revision: string;
  task_count: number | null;
  samples_per_task: number | null;
}

export interface DataSpec {
  datasets: DatasetSpec[];
}

export interface ObjectSpec {
  model: string;
  harness: string;
  parent_harness: string;
  prompt: string;
  prompt_change: string;
  skills: string[];
  tools: string[];
}

export interface EnvironmentSpec {
  platform: "npu" | "gpu" | "";
  server: string;
  devices: string[];
  hardware: string;
  evaluator: string;
  revision: string;
  precision_policy: string;
}

export type ConfigValue = string | number | boolean | null;
export type ExperimentConfig = Record<string, ConfigValue>;

export interface Experiment {
  id: string;
  experiment_no: number;
  task_id: string;
  owner_id: string | null;
  name: string;
  status: ExperimentStatus;
  baseline_experiment_id: string | null;
  data_spec: DataSpec;
  object_spec: ObjectSpec;
  environment_spec: EnvironmentSpec;
  config: ExperimentConfig;
  notes: string;
  metrics: Record<string, number>;
  featured_metric_keys: string[];
  result_summary: string;
  decision_outcome: DecisionOutcome | null;
  decision_notes: string;
  position: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExperimentListRow extends Experiment {
  task: Pick<Task, "id" | "title"> | null;
  owner: Member | null;
}
```

Add `experiment_id` to `Activity`:

```ts
export interface Activity {
  id: string;
  task_id: string;
  experiment_id: string | null;
  text: string;
  kind: ActivityKind;
  created_at: string;
}
```

- [ ] **Step 3: Write lifecycle and duplicate tests**

Create `lib/experiments/__tests__/policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Experiment } from "@/lib/types";
import {
  buildDuplicateInsert,
  canTransition,
  formatExperimentId,
  validateBaseline,
  validateForStatus,
} from "@/lib/experiments/policy";

const completeContext: Experiment = {
  id: "00000000-0000-4000-8000-000000000001",
  experiment_no: 12,
  task_id: "00000000-0000-4000-8000-000000000010",
  owner_id: "00000000-0000-4000-8000-000000000020",
  name: "Ascend guardrail run",
  status: "planned",
  baseline_experiment_id: null,
  data_spec: {
    datasets: [{
      role: "evaluation",
      name: "dr-kernel-rl",
      split: "tier1-gen1",
      revision: "seed20260717-gen1",
      task_count: 20,
      samples_per_task: 1,
    }],
  },
  object_spec: {
    model: "Qwen3.6-35B-A3B",
    harness: "cand_0000",
    parent_harness: "seed",
    prompt: "prompts/ascend.md",
    prompt_change: "+6 lines of Ascend guardrails",
    skills: ["kernel-designer"],
    tools: ["verify.py"],
  },
  environment_spec: {
    platform: "npu",
    server: "localhost.localdomain",
    devices: ["npu:14", "npu:15"],
    hardware: "Ascend910_9372",
    evaluator: "triton-evaluation",
    revision: "r18",
    precision_policy: "fp32 reference",
  },
  config: { max_turns: 18, temperature: 0.1 },
  metrics: { "pass@1": 0.2, tokens: 671552 },
  featured_metric_keys: ["pass@1"],
  result_summary: "4 of 20 tasks passed.",
  decision_outcome: "accepted",
  decision_notes: "Keep the guardrail.",
  notes: "Compiler failures remain.",
  position: 2,
  started_at: "2026-07-24T10:00:00.000Z",
  completed_at: null,
  created_at: "2026-07-24T09:00:00.000Z",
  updated_at: "2026-07-24T11:00:00.000Z",
};

describe("experiment lifecycle", () => {
  it("allows only the approved status graph", () => {
    expect(canTransition("planned", "running")).toBe(true);
    expect(canTransition("planned", "completed")).toBe(false);
    expect(canTransition("running", "blocked")).toBe(true);
    expect(canTransition("analyzing", "completed")).toBe(true);
    expect(canTransition("blocked", "analyzing")).toBe(true);
    expect(canTransition("cancelled", "planned")).toBe(true);
    expect(canTransition("completed", "analyzing")).toBe(true);
    expect(canTransition("completed", "running")).toBe(false);
  });

  it("requires owner and runnable context before running", () => {
    const invalid = {
      ...completeContext,
      owner_id: null,
      data_spec: { datasets: [] },
      object_spec: { ...completeContext.object_spec, model: "" },
      environment_spec: { ...completeContext.environment_spec, server: "", devices: [] },
      config: {},
    };
    expect(validateForStatus(invalid, "running").map((issue) => issue.field)).toEqual([
      "owner_id",
      "data_spec.datasets",
      "object_spec.model",
      "environment_spec.server_or_devices",
      "config",
    ]);
  });

  it("requires a result before analyzing", () => {
    const invalid = {
      ...completeContext,
      status: "running" as const,
      metrics: {},
      result_summary: "",
    };
    expect(validateForStatus(invalid, "analyzing")).toEqual([
      { field: "result", message: "Add a numeric metric or Result Summary before analyzing." },
    ]);
  });

  it("requires runnable context, result, and a decision before completion", () => {
    const invalid = {
      ...completeContext,
      status: "analyzing" as const,
      metrics: {},
      result_summary: "",
      decision_outcome: null,
    };
    expect(validateForStatus(invalid, "completed").map((issue) => issue.field)).toEqual([
      "result",
      "decision_outcome",
    ]);
  });

  it("rejects self baseline and formats stable display IDs", () => {
    expect(validateBaseline(completeContext.id, completeContext.id)).toEqual([
      { field: "baseline_experiment_id", message: "An experiment cannot use itself as Baseline." },
    ]);
    expect(formatExperimentId(12)).toBe("EXP-0012");
  });
});

describe("duplicate policy", () => {
  it("copies context and clears evidence, decision, notes, attachments, and times", () => {
    const duplicate = buildDuplicateInsert(completeContext, {
      name: "Ascend guardrail run v2",
      ownerId: "00000000-0000-4000-8000-000000000021",
      position: 3,
    });
    expect(duplicate).toEqual({
      task_id: completeContext.task_id,
      owner_id: "00000000-0000-4000-8000-000000000021",
      name: "Ascend guardrail run v2",
      status: "planned",
      baseline_experiment_id: completeContext.id,
      data_spec: completeContext.data_spec,
      object_spec: completeContext.object_spec,
      environment_spec: completeContext.environment_spec,
      config: completeContext.config,
      metrics: {},
      featured_metric_keys: [],
      result_summary: "",
      decision_outcome: null,
      decision_notes: "",
      notes: "",
      position: 3,
      started_at: null,
      completed_at: null,
    });
    expect(duplicate.data_spec).not.toBe(completeContext.data_spec);
    expect(duplicate.config).not.toBe(completeContext.config);
  });
});
```

- [ ] **Step 4: Run the policy test and confirm red**

Run:

```bash
npm test -- lib/experiments/__tests__/policy.test.ts
```

Expected: FAIL because `@/lib/experiments/policy` does not exist.

- [ ] **Step 5: Implement lifecycle, validation, ID formatting, and duplicate reset**

Create `lib/experiments/policy.ts`:

```ts
import type {
  DecisionOutcome,
  Experiment,
  ExperimentConfig,
  ExperimentStatus,
} from "@/lib/types";

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface DuplicateInput {
  name: string;
  ownerId: string;
  position: number;
}

export interface ExperimentInsert {
  task_id: string;
  owner_id: string;
  name: string;
  status: ExperimentStatus;
  baseline_experiment_id: string | null;
  data_spec: Experiment["data_spec"];
  object_spec: Experiment["object_spec"];
  environment_spec: Experiment["environment_spec"];
  config: ExperimentConfig;
  metrics: Record<string, number>;
  featured_metric_keys: string[];
  result_summary: string;
  decision_outcome: DecisionOutcome | null;
  decision_notes: string;
  notes: string;
  position: number;
  started_at: string | null;
  completed_at: string | null;
}

export const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, string> = {
  planned: "Planned",
  running: "Running",
  analyzing: "Analyzing",
  completed: "Completed",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

export const DECISION_LABELS: Record<DecisionOutcome, string> = {
  reference: "Reference",
  accepted: "Accepted",
  rejected: "Rejected",
  inconclusive: "Inconclusive",
};

const TRANSITIONS: Record<ExperimentStatus, ExperimentStatus[]> = {
  planned: ["running", "cancelled"],
  running: ["analyzing", "blocked", "cancelled"],
  analyzing: ["completed", "blocked", "cancelled"],
  completed: ["analyzing"],
  blocked: ["planned", "running", "analyzing", "cancelled"],
  cancelled: ["planned"],
};

function hasConfigValue(config: ExperimentConfig): boolean {
  return Object.entries(config).some(([key, value]) => {
    if (!key.trim()) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return value !== null;
  });
}

function hasResult(experiment: Experiment): boolean {
  const hasMetric = Object.values(experiment.metrics).some(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
  return hasMetric || experiment.result_summary.trim().length > 0;
}

function runnableIssues(experiment: Experiment): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!experiment.owner_id) {
    issues.push({ field: "owner_id", message: "Choose an Owner before running." });
  }
  if (!experiment.data_spec.datasets.some((dataset) => dataset.name.trim().length > 0)) {
    issues.push({
      field: "data_spec.datasets",
      message: "Add at least one named training or evaluation Dataset before running.",
    });
  }
  if (!experiment.object_spec.model.trim()) {
    issues.push({ field: "object_spec.model", message: "Add a Model before running." });
  }
  const environment = experiment.environment_spec;
  if (!environment.platform) {
    issues.push({
      field: "environment_spec.platform",
      message: "Choose NPU or GPU before running.",
    });
  }
  if (!environment.server.trim() && !environment.devices.some((device) => device.trim())) {
    issues.push({
      field: "environment_spec.server_or_devices",
      message: "Add a Server or Device before running.",
    });
  }
  if (!hasConfigValue(experiment.config)) {
    issues.push({
      field: "config",
      message: 'Add an explicit parameter or set profile to "defaults" before running.',
    });
  }
  return issues;
}

export function formatExperimentId(experimentNo: number): string {
  return `EXP-${String(experimentNo).padStart(4, "0")}`;
}

export function canTransition(from: ExperimentStatus, to: ExperimentStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function allowedTargets(from: ExperimentStatus): ExperimentStatus[] {
  return [from, ...TRANSITIONS[from]];
}

export function validateForStatus(
  experiment: Experiment,
  target: ExperimentStatus,
): ValidationIssue[] {
  if (!canTransition(experiment.status, target)) {
    return [{
      field: "status",
      message: `Cannot move from ${EXPERIMENT_STATUS_LABELS[experiment.status]} to ${EXPERIMENT_STATUS_LABELS[target]}.`,
    }];
  }
  if (target === "running") return runnableIssues(experiment);
  if (target === "analyzing") {
    return hasResult(experiment)
      ? []
      : [{ field: "result", message: "Add a numeric metric or Result Summary before analyzing." }];
  }
  if (target === "completed") {
    const issues = runnableIssues(experiment);
    if (!hasResult(experiment)) {
      issues.push({
        field: "result",
        message: "Add a numeric metric or Result Summary before completing.",
      });
    }
    if (!experiment.decision_outcome) {
      issues.push({
        field: "decision_outcome",
        message: "Choose a Decision Outcome before completing.",
      });
    }
    return issues;
  }
  return [];
}

export function validateBaseline(
  experimentId: string,
  baselineId: string | null,
): ValidationIssue[] {
  return baselineId === experimentId
    ? [{
        field: "baseline_experiment_id",
        message: "An experiment cannot use itself as Baseline.",
      }]
    : [];
}

export function buildDuplicateInsert(
  source: Experiment,
  input: DuplicateInput,
): ExperimentInsert {
  return {
    task_id: source.task_id,
    owner_id: input.ownerId,
    name: input.name.trim(),
    status: "planned",
    baseline_experiment_id: source.id,
    data_spec: structuredClone(source.data_spec),
    object_spec: structuredClone(source.object_spec),
    environment_spec: structuredClone(source.environment_spec),
    config: structuredClone(source.config),
    metrics: {},
    featured_metric_keys: [],
    result_summary: "",
    decision_outcome: null,
    decision_notes: "",
    notes: "",
    position: input.position,
    started_at: null,
    completed_at: null,
  };
}
```

- [ ] **Step 6: Run tests and type-check**

Run:

```bash
npm test -- lib/experiments/__tests__/policy.test.ts
npx tsc --noEmit
```

Expected: policy test PASS; TypeScript exits 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.mts lib/types.ts lib/experiments/policy.ts lib/experiments/__tests__/policy.test.ts
git commit -m "feat: define experiment lifecycle policies"
```

---

### Task 3: Comparison Derivation and Shareable URL State

**Files:**
- Create: `lib/experiments/compare.ts`
- Create: `lib/experiments/compare-url.ts`
- Create: `lib/experiments/__tests__/compare.test.ts`
- Create: `lib/experiments/__tests__/compare-url.test.ts`

**Interfaces:**
- Consumes: `Experiment` and `ExperimentListRow` from Task 2.
- Produces:
  - `flattenContext(experiment: Experiment): FlatField[]`
  - `compareContexts(current: Experiment, baseline: Experiment): ContextDifference[]`
  - `buildCompareColumns(experiments: Experiment[], options: CompareOptions): CompareColumn[]`
  - `orderWithBaseline(experiments: Experiment[], baselineId: string | null): Experiment[]`
  - `parseCompareSearchParams(params: CompareSearchParams): CompareSelection`
  - `serializeCompareSelection(selection: CompareSelection): string`

- [ ] **Step 1: Write comparison tests**

Create `lib/experiments/__tests__/compare.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Experiment } from "@/lib/types";
import {
  buildCompareColumns,
  compareContexts,
  orderWithBaseline,
} from "@/lib/experiments/compare";

function experiment(id: string, passAt1: number, device: string): Experiment {
  return {
    id,
    experiment_no: Number(id.slice(-2)),
    task_id: "00000000-0000-4000-8000-000000000010",
    owner_id: "00000000-0000-4000-8000-000000000020",
    name: `run-${id.slice(-2)}`,
    status: "analyzing",
    baseline_experiment_id: null,
    data_spec: {
      datasets: [{
        role: "evaluation",
        name: "dr-kernel-rl",
        split: "tier1",
        revision: "r1",
        task_count: 20,
        samples_per_task: 1,
      }],
    },
    object_spec: {
      model: "Qwen",
      harness: "candidate",
      parent_harness: "seed",
      prompt: "prompt.md",
      prompt_change: "",
      skills: ["kernel-designer"],
      tools: ["verify.py"],
    },
    environment_spec: {
      platform: "npu",
      server: "worker-1",
      devices: [device],
      hardware: "Ascend910",
      evaluator: "triton-evaluation",
      revision: "r18",
      precision_policy: "fp32",
    },
    config: { temperature: 0.1, max_turns: 18 },
    metrics: { "pass@1": passAt1 },
    featured_metric_keys: ["pass@1"],
    result_summary: "",
    decision_outcome: null,
    decision_notes: "",
    notes: "",
    position: 0,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-24T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
  };
}

describe("comparison derivation", () => {
  it("does not produce Delta columns without a Baseline", () => {
    const columns = buildCompareColumns(
      [experiment("00000000-0000-4000-8000-000000000001", 0.1, "npu:0")],
      { groups: ["result"], baselineId: null, diffOnly: false },
    );
    expect(columns.length).toBeGreaterThan(0);
    expect(columns.every((column) => column.kind === "value")).toBe(true);
  });

  it("aligns numeric metrics and derives current minus baseline", () => {
    const baseline = experiment("00000000-0000-4000-8000-000000000001", 0.1, "npu:0");
    const current = experiment("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");
    const columns = buildCompareColumns([current, baseline], {
      groups: ["result"],
      baselineId: baseline.id,
      diffOnly: false,
    });
    const delta = columns.find((column) => column.key === "result.metrics.pass@1.delta");
    expect(delta?.values[current.id]).toBeCloseTo(0.15);
    expect(delta?.values[baseline.id]).toBe(0);
  });

  it("shows a missing metric as null instead of fabricating a Delta", () => {
    const baseline = experiment("00000000-0000-4000-8000-000000000001", 0.1, "npu:0");
    const current = { ...experiment("00000000-0000-4000-8000-000000000002", 0.2, "npu:1"), metrics: {} };
    const columns = buildCompareColumns([baseline, current], {
      groups: ["result"],
      baselineId: baseline.id,
      diffOnly: false,
    });
    expect(
      columns.find((column) => column.key === "result.metrics.pass@1.delta")?.values[current.id],
    ).toBeNull();
  });

  it("returns only changed context and removes all-equal fields in Diff only mode", () => {
    const baseline = experiment("00000000-0000-4000-8000-000000000001", 0.1, "npu:0");
    const current = experiment("00000000-0000-4000-8000-000000000002", 0.2, "npu:1");
    expect(compareContexts(current, baseline).map((difference) => difference.key)).toEqual([
      "environment.devices",
    ]);
    const columns = buildCompareColumns([baseline, current], {
      groups: ["data", "environment"],
      baselineId: baseline.id,
      diffOnly: true,
    });
    expect(columns.map((column) => column.key)).toEqual(["environment.devices"]);
  });

  it("pins the explicit Baseline and keeps all 20 selected experiments", () => {
    const experiments = Array.from({ length: 20 }, (_, index) =>
      experiment(
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        index / 100,
        `npu:${index}`,
      ),
    );
    const ordered = orderWithBaseline(experiments, experiments[13].id);
    expect(ordered).toHaveLength(20);
    expect(ordered[0].id).toBe(experiments[13].id);
  });
});
```

- [ ] **Step 2: Write URL codec tests**

Create `lib/experiments/__tests__/compare-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  parseCompareSearchParams,
  serializeCompareSelection,
} from "@/lib/experiments/compare-url";

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";

describe("compare URL state", () => {
  it("deduplicates IDs, rejects invalid IDs, and includes the Baseline", () => {
    expect(parseCompareSearchParams({
      ids: `${second},invalid,${second}`,
      baseline: first,
    })).toEqual({
      ids: [first, second],
      baselineId: first,
    });
  });

  it("round trips a shareable query without an item cap", () => {
    const ids = Array.from(
      { length: 20 },
      (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );
    const query = serializeCompareSelection({ ids, baselineId: ids[4] });
    const params = new URLSearchParams(query);
    expect(parseCompareSearchParams({
      ids: params.get("ids") ?? undefined,
      baseline: params.get("baseline") ?? undefined,
    })).toEqual({ ids: [ids[4], ...ids.filter((id) => id !== ids[4])], baselineId: ids[4] });
  });

  it("omits Baseline when none is selected", () => {
    expect(serializeCompareSelection({ ids: [first, second], baselineId: null })).toBe(
      `ids=${encodeURIComponent(`${first},${second}`)}`,
    );
  });
});
```

- [ ] **Step 3: Run both tests and confirm red**

Run:

```bash
npm test -- lib/experiments/__tests__/compare.test.ts lib/experiments/__tests__/compare-url.test.ts
```

Expected: FAIL because both implementation modules are missing.

- [ ] **Step 4: Implement flattened fields, context differences, Delta columns, and row ordering**

Create `lib/experiments/compare.ts`:

```ts
import type { Experiment } from "@/lib/types";

export type CompareGroup =
  | "data"
  | "object"
  | "environment"
  | "config"
  | "result"
  | "decision_note";

export type CompareValue = string | number | boolean | null;

export interface FlatField {
  key: string;
  label: string;
  group: CompareGroup;
  value: CompareValue;
}

export interface ContextDifference {
  key: string;
  label: string;
  group: Exclude<CompareGroup, "result" | "decision_note">;
  current: CompareValue;
  baseline: CompareValue;
}

export interface CompareOptions {
  groups: CompareGroup[];
  baselineId: string | null;
  diffOnly: boolean;
}

export interface CompareColumn {
  key: string;
  label: string;
  group: CompareGroup;
  kind: "value" | "delta";
  values: Record<string, CompareValue>;
}

function titleFromKey(key: string): string {
  const humanize = (value: string) => value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
  const dataset = key.match(/datasets\[(\d+)\]\.([^.]+)$/);
  if (dataset) {
    return `Dataset ${Number(dataset[1]) + 1} ${humanize(dataset[2])}`;
  }
  return humanize(key.split(".").at(-1)!);
}

function scalar(value: unknown): CompareValue {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value);
}

function flattenRecord(
  group: CompareGroup,
  prefix: string,
  value: unknown,
  output: FlatField[],
): void {
  if (Array.isArray(value)) {
    if (value.length === 0) return;
    if (value.every((item) => typeof item !== "object" || item === null)) {
      output.push({
        key: prefix,
        label: titleFromKey(prefix),
        group,
        value: value.map(String).join(", ") || null,
      });
      return;
    }
    value.forEach((item, index) => flattenRecord(group, `${prefix}[${index}]`, item, output));
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      flattenRecord(group, prefix ? `${prefix}.${key}` : key, child, output);
    }
    return;
  }
  output.push({ key: prefix, label: titleFromKey(prefix), group, value: scalar(value) });
}

export function flattenContext(experiment: Experiment): FlatField[] {
  const fields: FlatField[] = [];
  flattenRecord("data", "data", experiment.data_spec, fields);
  flattenRecord("object", "object", experiment.object_spec, fields);
  flattenRecord("environment", "environment", experiment.environment_spec, fields);
  flattenRecord("config", "config", experiment.config, fields);
  return fields;
}

function flattenExperiment(experiment: Experiment): FlatField[] {
  const fields = flattenContext(experiment);
  for (const [key, value] of Object.entries(experiment.metrics).sort(([a], [b]) => a.localeCompare(b))) {
    fields.push({
      key: `result.metrics.${key}`,
      label: key,
      group: "result",
      value,
    });
  }
  fields.push({
    key: "result.summary",
    label: "Result Summary",
    group: "result",
    value: scalar(experiment.result_summary),
  });
  fields.push({
    key: "decision.outcome",
    label: "Decision Outcome",
    group: "decision_note",
    value: scalar(experiment.decision_outcome),
  });
  fields.push({
    key: "decision.notes",
    label: "Decision Notes",
    group: "decision_note",
    value: scalar(experiment.decision_notes),
  });
  fields.push({
    key: "note",
    label: "Note",
    group: "decision_note",
    value: scalar(experiment.notes),
  });
  return fields;
}

function sameValue(left: CompareValue, right: CompareValue): boolean {
  return Object.is(left, right);
}

export function compareContexts(
  current: Experiment,
  baseline: Experiment,
): ContextDifference[] {
  const currentMap = new Map(flattenContext(current).map((field) => [field.key, field]));
  const baselineMap = new Map(flattenContext(baseline).map((field) => [field.key, field]));
  const keys = [...new Set([...currentMap.keys(), ...baselineMap.keys()])].sort();
  return keys.flatMap((key) => {
    const currentField = currentMap.get(key);
    const baselineField = baselineMap.get(key);
    const currentValue = currentField?.value ?? null;
    const baselineValue = baselineField?.value ?? null;
    if (sameValue(currentValue, baselineValue)) return [];
    const source = currentField ?? baselineField!;
    return [{
      key: key.replace(/^(data|object|environment|config)\./, ""),
      label: source.label,
      group: source.group as ContextDifference["group"],
      current: currentValue,
      baseline: baselineValue,
    }];
  });
}

export function orderWithBaseline(
  experiments: Experiment[],
  baselineId: string | null,
): Experiment[] {
  if (!baselineId) return experiments;
  const baseline = experiments.find((experiment) => experiment.id === baselineId);
  if (!baseline) return experiments;
  return [baseline, ...experiments.filter((experiment) => experiment.id !== baselineId)];
}

export function buildCompareColumns(
  experiments: Experiment[],
  options: CompareOptions,
): CompareColumn[] {
  const flattened = new Map(
    experiments.map((experiment) => [
      experiment.id,
      new Map(flattenExperiment(experiment).map((field) => [field.key, field])),
    ]),
  );
  const fieldKeys = [...new Set(
    [...flattened.values()].flatMap((fieldMap) => [...fieldMap.keys()]),
  )].sort();
  const baseline = options.baselineId
    ? experiments.find((experiment) => experiment.id === options.baselineId) ?? null
    : null;

  const columns: CompareColumn[] = [];
  for (const key of fieldKeys) {
    const source = experiments
      .map((experiment) => flattened.get(experiment.id)?.get(key))
      .find((field): field is FlatField => Boolean(field));
    if (!source || !options.groups.includes(source.group)) continue;
    const values = Object.fromEntries(
      experiments.map((experiment) => [
        experiment.id,
        flattened.get(experiment.id)?.get(key)?.value ?? null,
      ]),
    );
    if (Object.values(values).every((value) => value === null)) continue;
    const distinct = new Set(Object.values(values).map((value) => JSON.stringify(value)));
    if (options.diffOnly && distinct.size <= 1) continue;
    columns.push({
      key,
      label: source.label,
      group: source.group,
      kind: "value",
      values,
    });

    if (baseline && key.startsWith("result.metrics.")) {
      const baselineValue = values[baseline.id];
      const deltas = Object.fromEntries(experiments.map((experiment) => {
        const currentValue = values[experiment.id];
        const delta = typeof currentValue === "number" && typeof baselineValue === "number"
          ? currentValue - baselineValue
          : null;
        return [experiment.id, delta];
      }));
      columns.push({
        key: `${key}.delta`,
        label: `Δ ${source.label}`,
        group: "result",
        kind: "delta",
        values: deltas,
      });
    }
  }
  return columns;
}
```

- [ ] **Step 5: Implement compare URL parsing and serialization**

Create `lib/experiments/compare-url.ts`:

```ts
export interface CompareSearchParams {
  ids?: string | string[];
  baseline?: string | string[];
}

export interface CompareSelection {
  ids: string[];
  baselineId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function parseCompareSearchParams(params: CompareSearchParams): CompareSelection {
  const ids = [...new Set(
    first(params.ids)
      .split(",")
      .map((id) => id.trim())
      .filter((id) => UUID.test(id)),
  )];
  const baselineCandidate = first(params.baseline).trim();
  const baselineId = UUID.test(baselineCandidate) ? baselineCandidate : null;
  if (baselineId && !ids.includes(baselineId)) ids.unshift(baselineId);
  if (baselineId) {
    return {
      ids: [baselineId, ...ids.filter((id) => id !== baselineId)],
      baselineId,
    };
  }
  return { ids, baselineId: null };
}

export function serializeCompareSelection(selection: CompareSelection): string {
  const params = new URLSearchParams();
  const ids = [...new Set(selection.ids)];
  if (ids.length > 0) params.set("ids", ids.join(","));
  if (selection.baselineId) params.set("baseline", selection.baselineId);
  return params.toString();
}
```

- [ ] **Step 6: Run focused tests and type-check**

Run:

```bash
npm test -- lib/experiments/__tests__/compare.test.ts lib/experiments/__tests__/compare-url.test.ts
npx tsc --noEmit
```

Expected: 8 tests PASS; TypeScript exits 0.

- [ ] **Step 7: Commit**

```bash
git add lib/experiments/compare.ts lib/experiments/compare-url.ts lib/experiments/__tests__/compare.test.ts lib/experiments/__tests__/compare-url.test.ts
git commit -m "feat: derive explicit baseline comparisons"
```

---

### Task 4: Experiment Repository and Conflict-Safe Draft Reconciliation

**Files:**
- Create: `lib/experiments/draft.ts`
- Create: `lib/experiments/repository.ts`
- Create: `lib/experiments/__tests__/draft.test.ts`
- Modify: `lib/activity.ts`

**Interfaces:**
- Consumes: `ExperimentInsert` and `buildDuplicateInsert` from Task 2; existing nullable browser client from `lib/supabase.ts`.
- Produces:
  - `editableExperimentPatch(experiment: Experiment): EditableExperimentPatch`
  - `reconcileRealtime(draft, remote, dirty, saving): RealtimeResolution`
  - `listExperimentRows(): Promise<ExperimentListRow[]>`
  - `loadExperimentReferenceData(): Promise<ExperimentReferenceData>`
  - `loadExperimentBundle(id: string): Promise<ExperimentBundle | null>`
  - `createExperiment(input: NewExperimentInput): Promise<Experiment>`
  - `duplicateExperiment(source: Experiment, input: DuplicateExperimentInput): Promise<Experiment>`
  - `updateExperiment(id, expectedUpdatedAt, patch): Promise<ExperimentUpdateResult>`
  - `loadExperimentsForCompare(ids: string[]): Promise<ExperimentListRow[]>`
  - attachment, manual note, delete, and Realtime functions used by later components.

- [ ] **Step 1: Write draft reconciliation tests**

Create `lib/experiments/__tests__/draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Experiment } from "@/lib/types";
import {
  editableExperimentPatch,
  reconcileRealtime,
} from "@/lib/experiments/draft";

const draft = {
  id: "00000000-0000-4000-8000-000000000001",
  experiment_no: 1,
  task_id: "00000000-0000-4000-8000-000000000010",
  owner_id: "00000000-0000-4000-8000-000000000020",
  name: "local name",
  status: "planned",
  baseline_experiment_id: null,
  data_spec: { datasets: [] },
  object_spec: {
    model: "",
    harness: "",
    parent_harness: "",
    prompt: "",
    prompt_change: "",
    skills: [],
    tools: [],
  },
  environment_spec: {
    platform: "",
    server: "",
    devices: [],
    hardware: "",
    evaluator: "",
    revision: "",
    precision_policy: "",
  },
  config: {},
  metrics: {},
  featured_metric_keys: [],
  result_summary: "",
  decision_outcome: null,
  decision_notes: "",
  notes: "",
  position: 0,
  started_at: null,
  completed_at: null,
  created_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T00:00:00.000Z",
} satisfies Experiment;

describe("realtime draft reconciliation", () => {
  it("replaces a clean draft with the remote row", () => {
    const remote = { ...draft, name: "remote name", updated_at: "2026-07-24T00:01:00.000Z" };
    expect(reconcileRealtime(draft, remote, false, false)).toEqual({
      kind: "replace",
      draft: remote,
      remote,
    });
  });

  it("preserves a dirty draft and exposes a conflict", () => {
    const remote = { ...draft, name: "remote name", updated_at: "2026-07-24T00:01:00.000Z" };
    expect(reconcileRealtime(draft, remote, true, false)).toEqual({
      kind: "conflict",
      draft,
      remote,
    });
  });

  it("ignores a realtime echo while the local save is in flight", () => {
    const remote = { ...draft, name: "remote name", updated_at: "2026-07-24T00:01:00.000Z" };
    expect(reconcileRealtime(draft, remote, true, true)).toEqual({
      kind: "ignore",
      draft,
      remote,
    });
  });

  it("removes immutable and server-maintained fields from an update patch", () => {
    expect(editableExperimentPatch(draft)).not.toHaveProperty("id");
    expect(editableExperimentPatch(draft)).not.toHaveProperty("experiment_no");
    expect(editableExperimentPatch(draft)).not.toHaveProperty("task_id");
    expect(editableExperimentPatch(draft)).not.toHaveProperty("updated_at");
    expect(editableExperimentPatch(draft).name).toBe("local name");
  });
});
```

- [ ] **Step 2: Run the draft test and confirm red**

Run:

```bash
npm test -- lib/experiments/__tests__/draft.test.ts
```

Expected: FAIL because `@/lib/experiments/draft` does not exist.

- [ ] **Step 3: Implement the editable patch and realtime decision**

Create `lib/experiments/draft.ts`:

```ts
import type { Experiment } from "@/lib/types";

export type EditableExperimentPatch = Pick<
  Experiment,
  | "owner_id"
  | "name"
  | "status"
  | "baseline_experiment_id"
  | "data_spec"
  | "object_spec"
  | "environment_spec"
  | "config"
  | "metrics"
  | "featured_metric_keys"
  | "result_summary"
  | "decision_outcome"
  | "decision_notes"
  | "notes"
>;

export type RealtimeResolution =
  | { kind: "replace"; draft: Experiment; remote: Experiment }
  | { kind: "conflict"; draft: Experiment; remote: Experiment }
  | { kind: "ignore"; draft: Experiment; remote: Experiment };

export function editableExperimentPatch(
  experiment: Experiment,
): EditableExperimentPatch {
  return {
    owner_id: experiment.owner_id,
    name: experiment.name.trim(),
    status: experiment.status,
    baseline_experiment_id: experiment.baseline_experiment_id,
    data_spec: structuredClone(experiment.data_spec),
    object_spec: structuredClone(experiment.object_spec),
    environment_spec: structuredClone(experiment.environment_spec),
    config: structuredClone(experiment.config),
    metrics: { ...experiment.metrics },
    featured_metric_keys: [...experiment.featured_metric_keys],
    result_summary: experiment.result_summary,
    decision_outcome: experiment.decision_outcome,
    decision_notes: experiment.decision_notes,
    notes: experiment.notes,
  };
}

export function reconcileRealtime(
  draft: Experiment,
  remote: Experiment,
  dirty: boolean,
  saving: boolean,
): RealtimeResolution {
  if (saving) return { kind: "ignore", draft, remote };
  if (dirty) return { kind: "conflict", draft, remote };
  return { kind: "replace", draft: remote, remote };
}
```

- [ ] **Step 4: Add `experiment_id` support to manual Activity insertion**

Replace `logActivity` in `lib/activity.ts` with:

```ts
export async function logActivity(
  taskId: string,
  text: string,
  kind: ActivityKind,
  experimentId: string | null = null,
): Promise<void> {
  if (!supabase) return;
  await supabase.from("activity").insert({
    task_id: taskId,
    experiment_id: experimentId,
    text,
    kind,
  });
}
```

Existing three-argument Task callers remain valid. Experiment data updates must not call this helper because Task 1's trigger owns those events.

- [ ] **Step 5: Implement the Supabase repository**

Create `lib/experiments/repository.ts`:

```ts
import { supabase } from "@/lib/supabase";
import type {
  Activity,
  Attachment,
  Experiment,
  ExperimentListRow,
  Member,
  Task,
} from "@/lib/types";
import type { EditableExperimentPatch } from "@/lib/experiments/draft";
import {
  buildDuplicateInsert,
  type DuplicateInput,
} from "@/lib/experiments/policy";

export interface NewExperimentInput {
  taskId: string;
  name: string;
  ownerId: string;
}

export interface DuplicateExperimentInput {
  name: string;
  ownerId: string;
}

export interface ExperimentBundle {
  experiment: Experiment;
  task: ExperimentListRow["task"];
  owner: Member | null;
  baseline: ExperimentListRow | null;
  members: Member[];
  candidates: ExperimentListRow[];
  attachments: Attachment[];
  activity: Activity[];
}

export interface ExperimentReferenceData {
  tasks: Task[];
  members: Member[];
}

export type ExperimentUpdateResult =
  | { ok: true; experiment: Experiment }
  | { ok: false; conflict: true };

type JoinedExperiment = Experiment & {
  task: ExperimentListRow["task"];
  owner: Member | null;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const LIST_SELECT = [
  "*",
  "task:tasks(id,title)",
  "owner:members(id,name,initials,position,created_at)",
].join(",");

function normalizeExperiment(row: Experiment): Experiment {
  const data = row.data_spec as Partial<Experiment["data_spec"]> | null;
  const object = row.object_spec as Partial<Experiment["object_spec"]> | null;
  const environment = row.environment_spec as Partial<Experiment["environment_spec"]> | null;
  return {
    ...row,
    data_spec: {
      datasets: Array.isArray(data?.datasets) ? data.datasets : [],
    },
    object_spec: {
      model: object?.model ?? "",
      harness: object?.harness ?? "",
      parent_harness: object?.parent_harness ?? "",
      prompt: object?.prompt ?? "",
      prompt_change: object?.prompt_change ?? "",
      skills: Array.isArray(object?.skills) ? object.skills : [],
      tools: Array.isArray(object?.tools) ? object.tools : [],
    },
    environment_spec: {
      platform: environment?.platform ?? "",
      server: environment?.server ?? "",
      devices: Array.isArray(environment?.devices) ? environment.devices : [],
      hardware: environment?.hardware ?? "",
      evaluator: environment?.evaluator ?? "",
      revision: environment?.revision ?? "",
      precision_policy: environment?.precision_policy ?? "",
    },
    config: row.config && typeof row.config === "object" ? row.config : {},
    metrics: row.metrics && typeof row.metrics === "object" ? row.metrics : {},
    featured_metric_keys: Array.isArray(row.featured_metric_keys)
      ? row.featured_metric_keys
      : [],
  };
}

function normalizeJoined(row: JoinedExperiment): ExperimentListRow {
  return {
    ...normalizeExperiment(row),
    task: row.task,
    owner: row.owner,
  };
}

export async function listExperimentRows(): Promise<ExperimentListRow[]> {
  const { data, error } = await client()
    .from("experiments")
    .select(LIST_SELECT)
    .order("updated_at", { ascending: false });
  throwIfError(error);
  return ((data ?? []) as unknown as JoinedExperiment[]).map(normalizeJoined);
}

export async function loadExperimentReferenceData(): Promise<ExperimentReferenceData> {
  const [tasksResult, membersResult] = await Promise.all([
    client().from("tasks").select("*").order("position"),
    client().from("members").select("*").order("position"),
  ]);
  throwIfError(tasksResult.error);
  throwIfError(membersResult.error);
  return {
    tasks: (tasksResult.data ?? []) as Task[],
    members: (membersResult.data ?? []) as Member[],
  };
}

async function nextPosition(taskId: string): Promise<number> {
  const { data, error } = await client()
    .from("experiments")
    .select("position")
    .eq("task_id", taskId)
    .order("position", { ascending: false })
    .limit(1);
  throwIfError(error);
  return data?.length ? Number(data[0].position) + 1 : 0;
}

export async function createExperiment(
  input: NewExperimentInput,
): Promise<Experiment> {
  const position = await nextPosition(input.taskId);
  const { data, error } = await client()
    .from("experiments")
    .insert({
      task_id: input.taskId,
      owner_id: input.ownerId,
      name: input.name.trim(),
      status: "planned",
      baseline_experiment_id: null,
      data_spec: { datasets: [] },
      object_spec: {
        model: "",
        harness: "",
        parent_harness: "",
        prompt: "",
        prompt_change: "",
        skills: [],
        tools: [],
      },
      environment_spec: {
        platform: "",
        server: "",
        devices: [],
        hardware: "",
        evaluator: "",
        revision: "",
        precision_policy: "",
      },
      config: {},
      metrics: {},
      featured_metric_keys: [],
      result_summary: "",
      decision_outcome: null,
      decision_notes: "",
      notes: "",
      position,
    })
    .select("*")
    .single();
  throwIfError(error);
  return normalizeExperiment(data as Experiment);
}

export async function duplicateExperiment(
  source: Experiment,
  input: DuplicateExperimentInput,
): Promise<Experiment> {
  const duplicateInput: DuplicateInput = {
    name: input.name,
    ownerId: input.ownerId,
    position: await nextPosition(source.task_id),
  };
  const { data, error } = await client()
    .from("experiments")
    .insert(buildDuplicateInsert(source, duplicateInput))
    .select("*")
    .single();
  throwIfError(error);
  return normalizeExperiment(data as Experiment);
}

export async function updateExperiment(
  id: string,
  expectedUpdatedAt: string,
  patch: EditableExperimentPatch,
): Promise<ExperimentUpdateResult> {
  const { data, error } = await client()
    .from("experiments")
    .update(patch)
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("*")
    .maybeSingle();
  throwIfError(error);
  return data
    ? { ok: true, experiment: normalizeExperiment(data as Experiment) }
    : { ok: false, conflict: true };
}

export async function loadExperimentBundle(
  id: string,
): Promise<ExperimentBundle | null> {
  const { data, error } = await client()
    .from("experiments")
    .select(LIST_SELECT)
    .eq("id", id)
    .maybeSingle();
  throwIfError(error);
  if (!data) return null;
  const row = normalizeJoined(data as unknown as JoinedExperiment);
  const [membersResult, attachmentsResult, activityResult, candidates] = await Promise.all([
    client().from("members").select("*").order("position"),
    client().from("attachments").select("*").eq("experiment_id", id).order("position"),
    client().from("activity").select("*").eq("experiment_id", id).order("created_at", { ascending: false }),
    listExperimentRows(),
  ]);
  throwIfError(membersResult.error);
  throwIfError(attachmentsResult.error);
  throwIfError(activityResult.error);
  return {
    experiment: row,
    task: row.task,
    owner: row.owner,
    baseline: row.baseline_experiment_id
      ? candidates.find((candidate) => candidate.id === row.baseline_experiment_id) ?? null
      : null,
    members: (membersResult.data ?? []) as Member[],
    candidates: candidates.filter((candidate) => candidate.id !== id),
    attachments: (attachmentsResult.data ?? []) as Attachment[],
    activity: (activityResult.data ?? []) as Activity[],
  };
}

export async function loadExperimentsForCompare(
  ids: string[],
): Promise<ExperimentListRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client()
    .from("experiments")
    .select(LIST_SELECT)
    .in("id", ids);
  throwIfError(error);
  const rows = ((data ?? []) as unknown as JoinedExperiment[]).map(normalizeJoined);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

export async function addExperimentTimelineNote(
  experiment: Experiment,
  text: string,
): Promise<void> {
  const { error } = await client().from("activity").insert({
    task_id: experiment.task_id,
    experiment_id: experiment.id,
    text: text.trim(),
    kind: "comment",
  });
  throwIfError(error);
}

export async function deleteExperiment(experiment: Experiment): Promise<void> {
  const { data: attachments, error: attachmentError } = await client()
    .from("attachments")
    .select("path")
    .eq("experiment_id", experiment.id);
  throwIfError(attachmentError);
  const { error } = await client().from("experiments").delete().eq("id", experiment.id);
  throwIfError(error);
  const paths = (attachments ?? [])
    .map((attachment) => attachment.path)
    .filter((path): path is string => Boolean(path));
  if (paths.length > 0) {
    const removal = await client().storage.from("task-images").remove(paths);
    if (removal.error) {
      throw new Error(
        `Experiment was deleted, but Storage cleanup failed: ${removal.error.message}`,
      );
    }
  }
}

export async function uploadExperimentAttachment(
  experiment: Experiment,
  file: File,
  position: number,
): Promise<void> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${experiment.task_id}/${experiment.id}/${crypto.randomUUID()}-${safeName}`;
  const storage = client().storage.from("task-images");
  const upload = await storage.upload(path, file, { upsert: false });
  throwIfError(upload.error);
  const { data: publicUrl } = storage.getPublicUrl(path);
  const { error } = await client().from("attachments").insert({
    task_id: experiment.task_id,
    experiment_id: experiment.id,
    url: publicUrl.publicUrl,
    path,
    caption: "",
    position,
  });
  throwIfError(error);
}

export async function updateExperimentAttachment(
  attachmentId: string,
  caption: string,
): Promise<void> {
  const { error } = await client()
    .from("attachments")
    .update({ caption })
    .eq("id", attachmentId);
  throwIfError(error);
}

export async function deleteExperimentAttachment(
  attachment: Attachment,
): Promise<void> {
  if (attachment.path) {
    const removal = await client().storage.from("task-images").remove([attachment.path]);
    throwIfError(removal.error);
  }
  const { error } = await client().from("attachments").delete().eq("id", attachment.id);
  throwIfError(error);
}

export function watchExperiment(
  id: string,
  onExperimentChange: () => void,
  onRelatedChange: () => void,
): () => void {
  if (!supabase) return () => undefined;
  const supabaseClient = supabase;
  const channel = supabaseClient
    .channel(`experiment-detail-${id}-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "experiments" },
      (payload) => {
        const changedId = (
          payload.new as { id?: string } | null
        )?.id ?? (
          payload.old as { id?: string } | null
        )?.id;
        if (changedId === id) onExperimentChange();
        else onRelatedChange();
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "activity", filter: `experiment_id=eq.${id}` },
      onRelatedChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "attachments", filter: `experiment_id=eq.${id}` },
      onRelatedChange,
    )
    .subscribe();
  return () => {
    void supabaseClient.removeChannel(channel);
  };
}

export function watchExperimentIndex(onChange: () => void): () => void {
  if (!supabase) return () => undefined;
  const supabaseClient = supabase;
  const channel = supabaseClient
    .channel(`experiment-index-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "experiments" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "members" }, onChange)
    .subscribe();
  return () => {
    void supabaseClient.removeChannel(channel);
  };
}
```

- [ ] **Step 6: Run focused tests and type-check**

Run:

```bash
npm test -- lib/experiments/__tests__/draft.test.ts
npx tsc --noEmit
```

Expected: 4 tests PASS; TypeScript exits 0. If the Supabase generated relationship type is narrower than the explicit cast, keep the cast at the repository boundary rather than weakening application types.

- [ ] **Step 7: Commit**

```bash
git add lib/activity.ts lib/experiments/draft.ts lib/experiments/repository.ts lib/experiments/__tests__/draft.test.ts
git commit -m "feat: add conflict-safe experiment repository"
```

---

### Task 5: Experiment Filters and Reusable Table

**Files:**
- Create: `lib/experiments/filters.ts`
- Create: `lib/experiments/__tests__/filters.test.ts`
- Create: `components/experiments/ExperimentStatusBadge.tsx`
- Create: `components/experiments/ExperimentFilters.tsx`
- Create: `components/experiments/ExperimentTable.tsx`
- Create: `components/experiments/__tests__/ExperimentTable.test.tsx`

**Interfaces:**
- Consumes: `ExperimentListRow`, status and decision label maps, `formatExperimentId`, and `relTime`.
- Produces:
  - `applyExperimentFilters(rows, filters, now?): ExperimentListRow[]`
  - `ExperimentFilters` controlled filter UI.
  - `ExperimentTable` shared by the global database and Task Detail, with optional selection.

- [ ] **Step 1: Write saved-view and filter tests**

Create `lib/experiments/__tests__/filters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ExperimentListRow } from "@/lib/types";
import {
  applyExperimentFilters,
  EMPTY_EXPERIMENT_FILTERS,
} from "@/lib/experiments/filters";

function row(
  id: string,
  status: ExperimentListRow["status"],
  decision: ExperimentListRow["decision_outcome"],
  completedAt: string | null,
): ExperimentListRow {
  return {
    id,
    experiment_no: Number(id.slice(-1)),
    task_id: "00000000-0000-4000-8000-000000000010",
    owner_id: "00000000-0000-4000-8000-000000000020",
    name: `run-${id.slice(-1)}`,
    status,
    baseline_experiment_id: null,
    data_spec: { datasets: [] },
    object_spec: {
      model: "",
      harness: "",
      parent_harness: "",
      prompt: "",
      prompt_change: "",
      skills: [],
      tools: [],
    },
    environment_spec: {
      platform: "",
      server: "",
      devices: [],
      hardware: "",
      evaluator: "",
      revision: "",
      precision_policy: "",
    },
    config: {},
    metrics: {},
    featured_metric_keys: [],
    result_summary: "",
    decision_outcome: decision,
    decision_notes: "",
    notes: "",
    position: 0,
    started_at: null,
    completed_at: completedAt,
    created_at: "2026-07-20T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
    task: { id: "00000000-0000-4000-8000-000000000010", title: "Optimize conv2d" },
    owner: {
      id: "00000000-0000-4000-8000-000000000020",
      name: "Bruce",
      initials: "BX",
      position: 0,
      created_at: "2026-07-01T00:00:00.000Z",
    },
  };
}

const rows = [
  row("00000000-0000-4000-8000-000000000001", "running", null, null),
  row("00000000-0000-4000-8000-000000000002", "blocked", null, null),
  row("00000000-0000-4000-8000-000000000003", "analyzing", null, null),
  row("00000000-0000-4000-8000-000000000004", "completed", "accepted", "2026-07-20T00:00:00.000Z"),
  row("00000000-0000-4000-8000-000000000005", "completed", "rejected", "2026-06-01T00:00:00.000Z"),
];

describe("experiment filters", () => {
  it("implements the four named saved views", () => {
    const now = new Date("2026-07-24T00:00:00.000Z").getTime();
    expect(applyExperimentFilters(rows, { ...EMPTY_EXPERIMENT_FILTERS, savedView: "running" }, now))
      .toHaveLength(1);
    expect(applyExperimentFilters(rows, { ...EMPTY_EXPERIMENT_FILTERS, savedView: "blocked" }, now))
      .toHaveLength(1);
    expect(applyExperimentFilters(rows, { ...EMPTY_EXPERIMENT_FILTERS, savedView: "needs_decision" }, now)[0].status)
      .toBe("analyzing");
    expect(applyExperimentFilters(rows, { ...EMPTY_EXPERIMENT_FILTERS, savedView: "recently_completed" }, now)
      .map((item) => item.id)).toEqual(["00000000-0000-4000-8000-000000000004"]);
  });

  it("combines owner, task, status, decision, and search filters", () => {
    expect(applyExperimentFilters(rows, {
      savedView: "all",
      ownerId: "00000000-0000-4000-8000-000000000020",
      taskId: "00000000-0000-4000-8000-000000000010",
      status: "completed",
      decision: "accepted",
      search: "conv2d",
    })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run filter tests and confirm red**

Run:

```bash
npm test -- lib/experiments/__tests__/filters.test.ts
```

Expected: FAIL because `@/lib/experiments/filters` does not exist.

- [ ] **Step 3: Implement deterministic filters and saved views**

Create `lib/experiments/filters.ts`:

```ts
import type {
  DecisionOutcome,
  ExperimentListRow,
  ExperimentStatus,
} from "@/lib/types";

export type ExperimentSavedView =
  | "all"
  | "running"
  | "blocked"
  | "needs_decision"
  | "recently_completed";

export interface ExperimentFilterState {
  savedView: ExperimentSavedView;
  ownerId: string;
  taskId: string;
  status: ExperimentStatus | "";
  decision: DecisionOutcome | "none" | "";
  search: string;
}

export const EMPTY_EXPERIMENT_FILTERS: ExperimentFilterState = {
  savedView: "all",
  ownerId: "",
  taskId: "",
  status: "",
  decision: "",
  search: "",
};

const RECENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function applyExperimentFilters(
  rows: ExperimentListRow[],
  filters: ExperimentFilterState,
  now = Date.now(),
): ExperimentListRow[] {
  const query = filters.search.trim().toLowerCase();
  return rows
    .filter((row) => {
      if (filters.savedView === "running" && row.status !== "running") return false;
      if (filters.savedView === "blocked" && row.status !== "blocked") return false;
      if (
        filters.savedView === "needs_decision"
        && (row.status !== "analyzing" || row.decision_outcome !== null)
      ) return false;
      if (filters.savedView === "recently_completed") {
        if (row.status !== "completed" || !row.completed_at) return false;
        const completed = new Date(row.completed_at).getTime();
        if (!Number.isFinite(completed) || now - completed > RECENT_WINDOW_MS) return false;
      }
      if (filters.ownerId === "unassigned" && row.owner_id !== null) return false;
      if (
        filters.ownerId
        && filters.ownerId !== "unassigned"
        && row.owner_id !== filters.ownerId
      ) return false;
      if (filters.taskId && row.task_id !== filters.taskId) return false;
      if (filters.status && row.status !== filters.status) return false;
      if (filters.decision === "none" && row.decision_outcome !== null) return false;
      if (
        filters.decision
        && filters.decision !== "none"
        && row.decision_outcome !== filters.decision
      ) return false;
      if (query) {
        const haystack = [
          row.name,
          row.task?.title ?? "",
          row.owner?.name ?? "",
          `exp-${String(row.experiment_no).padStart(4, "0")}`,
        ].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    })
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}
```

- [ ] **Step 4: Create the status badge**

Create `components/experiments/ExperimentStatusBadge.tsx`:

```tsx
import type { ExperimentStatus } from "@/lib/types";
import { EXPERIMENT_STATUS_LABELS } from "@/lib/experiments/policy";

export default function ExperimentStatusBadge({
  status,
}: {
  status: ExperimentStatus;
}) {
  return (
    <span className={`experiment-status experiment-status-${status}`}>
      {EXPERIMENT_STATUS_LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 5: Create the controlled filter bar**

Create `components/experiments/ExperimentFilters.tsx`:

```tsx
"use client";

import type {
  DecisionOutcome,
  ExperimentListRow,
  ExperimentStatus,
} from "@/lib/types";
import {
  type ExperimentFilterState,
  type ExperimentSavedView,
} from "@/lib/experiments/filters";
import {
  DECISION_LABELS,
  EXPERIMENT_STATUS_LABELS,
} from "@/lib/experiments/policy";

const SAVED_VIEWS: { value: ExperimentSavedView; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "blocked", label: "Blocked" },
  { value: "needs_decision", label: "Needs Decision" },
  { value: "recently_completed", label: "Recently Completed" },
];

export default function ExperimentFilters({
  rows,
  value,
  onChange,
}: {
  rows: ExperimentListRow[];
  value: ExperimentFilterState;
  onChange: (value: ExperimentFilterState) => void;
}) {
  const owners = [...new Map(
    rows.flatMap((row) => row.owner ? [[row.owner.id, row.owner] as const] : []),
  ).values()].sort((left, right) => left.name.localeCompare(right.name));
  const tasks = [...new Map(
    rows.flatMap((row) => row.task ? [[row.task.id, row.task] as const] : []),
  ).values()].sort((left, right) => left.title.localeCompare(right.title));
  const set = <K extends keyof ExperimentFilterState>(
    key: K,
    next: ExperimentFilterState[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <div className="experiment-filter-stack">
      <div className="saved-view-tabs" aria-label="Experiment saved views">
        {SAVED_VIEWS.map((view) => (
          <button
            key={view.value}
            type="button"
            className={value.savedView === view.value ? "active" : ""}
            onClick={() => set("savedView", view.value)}
          >
            {view.label}
          </button>
        ))}
      </div>
      <div className="experiment-filter-row">
        <label>
          <span>Search</span>
          <input
            type="search"
            value={value.search}
            onChange={(event) => set("search", event.target.value)}
            placeholder="Name, ID, Task, or Owner"
          />
        </label>
        <label>
          <span>Owner</span>
          <select value={value.ownerId} onChange={(event) => set("ownerId", event.target.value)}>
            <option value="">All owners</option>
            <option value="unassigned">Unassigned</option>
            {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={value.status}
            onChange={(event) => set("status", event.target.value as ExperimentStatus | "")}
          >
            <option value="">All statuses</option>
            {(Object.entries(EXPERIMENT_STATUS_LABELS) as [ExperimentStatus, string][])
              .map(([status, label]) => <option key={status} value={status}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Task</span>
          <select value={value.taskId} onChange={(event) => set("taskId", event.target.value)}>
            <option value="">All tasks</option>
            {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
        </label>
        <label>
          <span>Decision</span>
          <select
            value={value.decision}
            onChange={(event) => set(
              "decision",
              event.target.value as DecisionOutcome | "none" | "",
            )}
          >
            <option value="">All decisions</option>
            <option value="none">No decision</option>
            {(Object.entries(DECISION_LABELS) as [DecisionOutcome, string][])
              .map(([decision, label]) => (
                <option key={decision} value={decision}>{label}</option>
              ))}
          </select>
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write the table component test**

Create `components/experiments/__tests__/ExperimentTable.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExperimentListRow } from "@/lib/types";
import ExperimentTable from "@/components/experiments/ExperimentTable";

const row = {
  id: "00000000-0000-4000-8000-000000000001",
  experiment_no: 7,
  task_id: "00000000-0000-4000-8000-000000000010",
  owner_id: null,
  name: "Manual NPU run",
  status: "analyzing",
  baseline_experiment_id: null,
  data_spec: { datasets: [] },
  object_spec: {
    model: "",
    harness: "",
    parent_harness: "",
    prompt: "",
    prompt_change: "",
    skills: [],
    tools: [],
  },
  environment_spec: {
    platform: "",
    server: "",
    devices: [],
    hardware: "",
    evaluator: "",
    revision: "",
    precision_policy: "",
  },
  config: {},
  metrics: { "pass@1": 0.2, tokens: 1000 },
  featured_metric_keys: ["pass@1"],
  result_summary: "",
  decision_outcome: null,
  decision_notes: "",
  notes: "",
  position: 0,
  started_at: null,
  completed_at: null,
  created_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T00:00:00.000Z",
  task: { id: "00000000-0000-4000-8000-000000000010", title: "Optimize conv2d" },
  owner: null,
} satisfies ExperimentListRow;

describe("ExperimentTable", () => {
  it("renders real stored fields and only featured metrics", () => {
    render(<ExperimentTable rows={[row]} showTask selectable={false} />);
    expect(screen.getByText("EXP-0007")).toBeDefined();
    expect(screen.getByText("Manual NPU run")).toBeDefined();
    expect(screen.getByText("Optimize conv2d")).toBeDefined();
    expect(screen.getByText("Unassigned")).toBeDefined();
    expect(screen.getByText("pass@1 0.2")).toBeDefined();
    expect(screen.queryByText(/tokens/)).toBeNull();
  });

  it("reports explicit selection by UUID", () => {
    const onToggle = vi.fn();
    render(
      <ExperimentTable
        rows={[row]}
        showTask={false}
        selectable
        selectedIds={new Set()}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0007" }));
    expect(onToggle).toHaveBeenCalledWith(row.id);
  });
});
```

- [ ] **Step 7: Run the table test and confirm red**

Run:

```bash
npm test -- components/experiments/__tests__/ExperimentTable.test.tsx
```

Expected: FAIL because `ExperimentTable` does not exist.

- [ ] **Step 8: Create the compact reusable table**

Create `components/experiments/ExperimentTable.tsx`:

```tsx
import Link from "next/link";
import type { ExperimentListRow } from "@/lib/types";
import { relTime } from "@/lib/time";
import {
  DECISION_LABELS,
  formatExperimentId,
} from "@/lib/experiments/policy";
import ExperimentStatusBadge from "@/components/experiments/ExperimentStatusBadge";

function metricValue(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : Number(value.toPrecision(5)).toString();
}

export default function ExperimentTable({
  rows,
  showTask,
  selectable,
  selectedIds = new Set<string>(),
  onToggle,
}: {
  rows: ExperimentListRow[];
  showTask: boolean;
  selectable: boolean;
  selectedIds?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
}) {
  if (rows.length === 0) {
    return <div className="experiment-empty">No experiments match this view.</div>;
  }
  return (
    <div className="experiment-table-scroll">
      <table className="experiment-table">
        <thead>
          <tr>
            {selectable && <th className="select-column"><span className="sr-only">Select</span></th>}
            <th>ID</th>
            <th>Name</th>
            {showTask && <th>Task</th>}
            <th>Owner</th>
            <th>Status</th>
            <th>Decision</th>
            <th>Featured metrics</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const displayId = formatExperimentId(row.experiment_no);
            return (
              <tr key={row.id}>
                {selectable && (
                  <td className="select-column">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => onToggle?.(row.id)}
                      aria-label={`Select ${displayId}`}
                    />
                  </td>
                )}
                <td className="experiment-id-cell">{displayId}</td>
                <td><Link className="experiment-name-link" href={`/experiments/${row.id}`}>{row.name}</Link></td>
                {showTask && (
                  <td>
                    {row.task
                      ? <Link href={`/task/${row.task.id}`}>{row.task.title}</Link>
                      : <span className="muted">Deleted task</span>}
                  </td>
                )}
                <td>
                  {row.owner
                    ? <span className="owner-inline"><span className="av">{row.owner.initials}</span>{row.owner.name}</span>
                    : <span className="muted">Unassigned</span>}
                </td>
                <td><ExperimentStatusBadge status={row.status} /></td>
                <td>
                  {row.decision_outcome
                    ? DECISION_LABELS[row.decision_outcome]
                    : <span className="muted">—</span>}
                </td>
                <td>
                  <div className="featured-metrics">
                    {row.featured_metric_keys.length === 0 && <span className="muted">—</span>}
                    {row.featured_metric_keys.map((key) => (
                      <span key={key}>
                        {key} {key in row.metrics ? metricValue(row.metrics[key]) : "—"}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="experiment-updated">{relTime(row.updated_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 9: Run focused tests and type-check**

Run:

```bash
npm test -- lib/experiments/__tests__/filters.test.ts components/experiments/__tests__/ExperimentTable.test.tsx
npx tsc --noEmit
```

Expected: 4 tests PASS; TypeScript exits 0.

- [ ] **Step 10: Commit**

```bash
git add lib/experiments/filters.ts lib/experiments/__tests__/filters.test.ts components/experiments/ExperimentStatusBadge.tsx components/experiments/ExperimentFilters.tsx components/experiments/ExperimentTable.tsx components/experiments/__tests__/ExperimentTable.test.tsx
git commit -m "feat: add experiment table and saved views"
```

---

### Task 6: Global Experiment Database and New Experiment Flow

**Files:**
- Create: `components/experiments/CreateExperimentDialog.tsx`
- Create: `components/experiments/ExperimentsDatabase.tsx`
- Create: `components/experiments/__tests__/CreateExperimentDialog.test.tsx`
- Create: `app/experiments/page.tsx`

**Interfaces:**
- Consumes: repository list/reference/create/watch functions, Task 5 filters/table, and Task 3 URL serializer.
- Produces: `/experiments` with real manual database rows, four saved views, combined filters, required Name/Owner/Task creation, selected-row compare links, and Realtime refresh.

- [ ] **Step 1: Write the creation-dialog behavior test**

Create `components/experiments/__tests__/CreateExperimentDialog.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Experiment, Member, Task } from "@/lib/types";
import CreateExperimentDialog from "@/components/experiments/CreateExperimentDialog";
import { createExperiment } from "@/lib/experiments/repository";

vi.mock("@/lib/experiments/repository", () => ({
  createExperiment: vi.fn(),
}));

const task = {
  id: "00000000-0000-4000-8000-000000000010",
  module_id: "00000000-0000-4000-8000-000000000011",
  title: "Optimize conv2d",
  status: "in_progress",
  assignees: [],
  notes: "",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T00:00:00.000Z",
} satisfies Task;

const member = {
  id: "00000000-0000-4000-8000-000000000020",
  name: "Bruce",
  initials: "BX",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
} satisfies Member;

describe("CreateExperimentDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires Name, Owner, and Task and creates a planned row", async () => {
    vi.mocked(createExperiment).mockResolvedValue({ id: "new-experiment" } as Experiment);
    const onCreated = vi.fn();
    render(
      <CreateExperimentDialog
        open
        tasks={[task]}
        members={[member]}
        onClose={() => undefined}
        onCreated={onCreated}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create experiment" }));
    expect(screen.getByText("Name, Owner, and Task are required.")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Experiment name"), {
      target: { value: "NPU guardrail run" },
    });
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: task.id } });
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: member.id } });
    fireEvent.click(screen.getByRole("button", { name: "Create experiment" }));

    await waitFor(() => expect(createExperiment).toHaveBeenCalledWith({
      taskId: task.id,
      ownerId: member.id,
      name: "NPU guardrail run",
    }));
    expect(onCreated).toHaveBeenCalledWith({ id: "new-experiment" });
  });
});
```

- [ ] **Step 2: Run the dialog test and confirm red**

Run:

```bash
npm test -- components/experiments/__tests__/CreateExperimentDialog.test.tsx
```

Expected: FAIL because the dialog component does not exist.

- [ ] **Step 3: Implement the required-field creation dialog**

Create `components/experiments/CreateExperimentDialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Experiment, Member, Task } from "@/lib/types";
import { createExperiment } from "@/lib/experiments/repository";

export default function CreateExperimentDialog({
  open,
  tasks,
  members,
  fixedTaskId,
  onClose,
  onCreated,
}: {
  open: boolean;
  tasks: Task[];
  members: Member[];
  fixedTaskId?: string;
  onClose: () => void;
  onCreated: (experiment: Experiment) => void;
}) {
  const [name, setName] = useState("");
  const [taskId, setTaskId] = useState(fixedTaskId ?? "");
  const [ownerId, setOwnerId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setTaskId(fixedTaskId ?? "");
    setOwnerId("");
    setError("");
    setSaving(false);
  }, [fixedTaskId, open]);

  if (!open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !taskId || !ownerId) {
      setError("Name, Owner, and Task are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const experiment = await createExperiment({
        taskId,
        ownerId,
        name: name.trim(),
      });
      onCreated(experiment);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the experiment.");
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="experiment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-experiment-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">New record</p>
            <h2 id="new-experiment-title">Create experiment</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <form onSubmit={submit}>
          <label>
            <span>Name</span>
            <input
              aria-label="Experiment name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </label>
          <label>
            <span>Task</span>
            <select
              aria-label="Task"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              disabled={Boolean(fixedTaskId)}
            >
              <option value="">Choose a Task</option>
              {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
          </label>
          <label>
            <span>Owner</span>
            <select
              aria-label="Owner"
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
            >
              <option value="">Choose an Owner</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          </label>
          <p className="dialog-help">
            Starts as Planned with empty Data, Object, Environment, Config, Result, Decision, and Note.
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Creating…" : "Create experiment"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Implement the global database client**

Create `components/experiments/ExperimentsDatabase.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExperimentListRow, Member, Task } from "@/lib/types";
import {
  applyExperimentFilters,
  EMPTY_EXPERIMENT_FILTERS,
  type ExperimentFilterState,
} from "@/lib/experiments/filters";
import {
  listExperimentRows,
  loadExperimentReferenceData,
  watchExperimentIndex,
} from "@/lib/experiments/repository";
import { serializeCompareSelection } from "@/lib/experiments/compare-url";
import CreateExperimentDialog from "@/components/experiments/CreateExperimentDialog";
import ExperimentFilters from "@/components/experiments/ExperimentFilters";
import ExperimentTable from "@/components/experiments/ExperimentTable";

export default function ExperimentsDatabase() {
  const router = useRouter();
  const [rows, setRows] = useState<ExperimentListRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filters, setFilters] = useState<ExperimentFilterState>(EMPTY_EXPERIMENT_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const [nextRows, references] = await Promise.all([
        listExperimentRows(),
        loadExperimentReferenceData(),
      ]);
      setRows(nextRows);
      setTasks(references.tasks);
      setMembers(references.members);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load experiments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return watchExperimentIndex(() => void reload());
  }, [reload]);

  const visibleRows = useMemo(
    () => applyExperimentFilters(rows, filters),
    [filters, rows],
  );

  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const compareQuery = serializeCompareSelection({
    ids: [...selectedIds],
    baselineId: null,
  });

  return (
    <div className="workspace-page">
      <header className="workspace-page-header">
        <div>
          <p className="eyebrow">Research database</p>
          <h1>Experiments</h1>
          <p>Manual run context, evidence, and decisions across every Task.</p>
        </div>
        <div className="workspace-actions">
          <Link
            className={`btn ${selectedIds.size < 2 ? "disabled" : ""}`}
            aria-disabled={selectedIds.size < 2}
            href={selectedIds.size >= 2 ? `/experiments/compare?${compareQuery}` : "/experiments"}
            onClick={(event) => { if (selectedIds.size < 2) event.preventDefault(); }}
          >
            Compare selected ({selectedIds.size})
          </Link>
          <button type="button" className="btn primary" onClick={() => setCreateOpen(true)}>
            New experiment
          </button>
        </div>
      </header>

      <ExperimentFilters rows={rows} value={filters} onChange={setFilters} />
      {error && <div className="error-banner">{error}</div>}
      {loading
        ? <p className="state-note">Loading experiments…</p>
        : (
          <ExperimentTable
            rows={visibleRows}
            showTask
            selectable
            selectedIds={selectedIds}
            onToggle={toggle}
          />
        )}

      <CreateExperimentDialog
        open={createOpen}
        tasks={tasks}
        members={members}
        onClose={() => setCreateOpen(false)}
        onCreated={(experiment) => router.push(`/experiments/${experiment.id}`)}
      />
    </div>
  );
}
```

- [ ] **Step 5: Add the thin route**

Create `app/experiments/page.tsx`:

```tsx
import AuthGate from "@/components/AuthGate";
import ExperimentsDatabase from "@/components/experiments/ExperimentsDatabase";

export default function ExperimentsPage() {
  return (
    <AuthGate>
      <ExperimentsDatabase />
    </AuthGate>
  );
}
```

- [ ] **Step 6: Run focused tests, type-check, and production build**

Run:

```bash
npm test -- components/experiments/__tests__/CreateExperimentDialog.test.tsx
npx tsc --noEmit
npm run build
```

Expected: dialog test PASS; TypeScript exits 0; build lists `/experiments` and exits 0.

- [ ] **Step 7: Commit**

```bash
git add components/experiments/CreateExperimentDialog.tsx components/experiments/ExperimentsDatabase.tsx components/experiments/__tests__/CreateExperimentDialog.test.tsx app/experiments/page.tsx
git commit -m "feat: add global experiment database"
```

---

### Task 7: Structured Data, Object, Environment, and Config Editors

**Files:**
- Create: `components/experiments/ExperimentSection.tsx`
- Create: `components/experiments/CommaListInput.tsx`
- Create: `components/experiments/DataEditor.tsx`
- Create: `components/experiments/ObjectEditor.tsx`
- Create: `components/experiments/EnvironmentEditor.tsx`
- Create: `components/experiments/ConfigEditor.tsx`
- Create: `components/experiments/__tests__/ExperimentEditors.test.tsx`

**Interfaces:**
- Consumes: structured types from Task 2.
- Produces: controlled editors that emit valid typed objects and never expose raw JSON.

- [ ] **Step 1: Write editor behavior tests**

Create `components/experiments/__tests__/ExperimentEditors.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ConfigEditor from "@/components/experiments/ConfigEditor";
import DataEditor from "@/components/experiments/DataEditor";
import ObjectEditor from "@/components/experiments/ObjectEditor";

describe("structured experiment editors", () => {
  it("adds a typed evaluation Dataset", () => {
    const onChange = vi.fn();
    render(<DataEditor value={{ datasets: [] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Add dataset" }));
    expect(onChange).toHaveBeenCalledWith({
      datasets: [{
        role: "evaluation",
        name: "",
        split: "",
        revision: "",
        task_count: null,
        samples_per_task: null,
      }],
    });
  });

  it("edits Model while retaining Harness fields", () => {
    const onChange = vi.fn();
    render(
      <ObjectEditor
        value={{
          model: "",
          harness: "cand_0000",
          parent_harness: "seed",
          prompt: "prompt.md",
          prompt_change: "",
          skills: [],
          tools: [],
        }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "Qwen3.6" } });
    expect(onChange).toHaveBeenCalledWith({
      model: "Qwen3.6",
      harness: "cand_0000",
      parent_harness: "seed",
      prompt: "prompt.md",
      prompt_change: "",
      skills: [],
      tools: [],
    });
  });

  it("preserves numeric Config values as numbers", () => {
    const onChange = vi.fn();
    render(<ConfigEditor value={{ temperature: 0.1 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("temperature value"), { target: { value: "0.2" } });
    expect(onChange).toHaveBeenCalledWith({ temperature: 0.2 });
  });
});
```

- [ ] **Step 2: Run the editor test and confirm red**

Run:

```bash
npm test -- components/experiments/__tests__/ExperimentEditors.test.tsx
```

Expected: FAIL because the editor components do not exist.

- [ ] **Step 3: Create the shared section shell**

Create `components/experiments/ExperimentSection.tsx`:

```tsx
export default function ExperimentSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="experiment-section" aria-labelledby={`${id}-title`}>
      <div className="experiment-section-heading">
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="experiment-section-body">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: Create a controlled comma-list field that does not eat separators**

Create `components/experiments/CommaListInput.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

export default function CommaListInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState(value.join(", "));
  useEffect(() => setDraft(value.join(", ")), [value]);
  return (
    <label>
      <span>{label}</span>
      <input
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onChange(
          draft.split(",").map((item) => item.trim()).filter(Boolean),
        )}
      />
    </label>
  );
}
```

- [ ] **Step 5: Create the Dataset array editor**

Create `components/experiments/DataEditor.tsx`:

```tsx
"use client";

import type { DataSpec, DatasetSpec } from "@/lib/types";

const EMPTY_DATASET: DatasetSpec = {
  role: "evaluation",
  name: "",
  split: "",
  revision: "",
  task_count: null,
  samples_per_task: null,
};

function nullableNumber(raw: string): number | null {
  return raw.trim() === "" ? null : Number(raw);
}

export default function DataEditor({
  value,
  onChange,
}: {
  value: DataSpec;
  onChange: (value: DataSpec) => void;
}) {
  function patch(index: number, next: Partial<DatasetSpec>) {
    onChange({
      datasets: value.datasets.map((dataset, datasetIndex) =>
        datasetIndex === index ? { ...dataset, ...next } : dataset),
    });
  }
  function remove(index: number) {
    onChange({ datasets: value.datasets.filter((_, datasetIndex) => datasetIndex !== index) });
  }
  return (
    <div className="structured-editor">
      {value.datasets.map((dataset, index) => (
        <fieldset className="dataset-row" key={`${dataset.role}-${index}`}>
          <legend>Dataset {index + 1}</legend>
          <label>
            <span>Role</span>
            <select
              aria-label={`Dataset ${index + 1} role`}
              value={dataset.role}
              onChange={(event) => patch(index, {
                role: event.target.value as DatasetSpec["role"],
              })}
            >
              <option value="training">Training</option>
              <option value="evaluation">Evaluation</option>
            </select>
          </label>
          <label>
            <span>Name</span>
            <input
              aria-label={`Dataset ${index + 1} name`}
              value={dataset.name}
              onChange={(event) => patch(index, { name: event.target.value })}
            />
          </label>
          <label>
            <span>Split</span>
            <input
              aria-label={`Dataset ${index + 1} split`}
              value={dataset.split}
              onChange={(event) => patch(index, { split: event.target.value })}
            />
          </label>
          <label>
            <span>Revision</span>
            <input
              aria-label={`Dataset ${index + 1} revision`}
              value={dataset.revision}
              onChange={(event) => patch(index, { revision: event.target.value })}
            />
          </label>
          <label>
            <span>Task count</span>
            <input
              aria-label={`Dataset ${index + 1} task count`}
              type="number"
              min="0"
              value={dataset.task_count ?? ""}
              onChange={(event) => patch(index, { task_count: nullableNumber(event.target.value) })}
            />
          </label>
          <label>
            <span>Samples / task</span>
            <input
              aria-label={`Dataset ${index + 1} samples per task`}
              type="number"
              min="0"
              value={dataset.samples_per_task ?? ""}
              onChange={(event) => patch(index, {
                samples_per_task: nullableNumber(event.target.value),
              })}
            />
          </label>
          <button type="button" className="btn danger-subtle" onClick={() => remove(index)}>
            Remove dataset
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() => onChange({
          datasets: [...value.datasets, structuredClone(EMPTY_DATASET)],
        })}
      >
        Add dataset
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Create the Model and Harness editor**

Create `components/experiments/ObjectEditor.tsx`:

```tsx
"use client";

import type { ObjectSpec } from "@/lib/types";
import CommaListInput from "@/components/experiments/CommaListInput";

export default function ObjectEditor({
  value,
  onChange,
}: {
  value: ObjectSpec;
  onChange: (value: ObjectSpec) => void;
}) {
  const set = <K extends keyof ObjectSpec>(key: K, next: ObjectSpec[K]) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="property-grid">
      <label><span>Model</span><input aria-label="Model" value={value.model} onChange={(event) => set("model", event.target.value)} /></label>
      <label><span>Harness</span><input aria-label="Harness" value={value.harness} onChange={(event) => set("harness", event.target.value)} /></label>
      <label><span>Parent Harness</span><input aria-label="Parent Harness" value={value.parent_harness} onChange={(event) => set("parent_harness", event.target.value)} /></label>
      <label><span>Prompt</span><input aria-label="Prompt" value={value.prompt} onChange={(event) => set("prompt", event.target.value)} /></label>
      <label className="property-span-2">
        <span>Change Summary</span>
        <textarea aria-label="Change Summary" value={value.prompt_change} onChange={(event) => set("prompt_change", event.target.value)} />
      </label>
      <CommaListInput label="Skills" value={value.skills} onChange={(skills) => set("skills", skills)} />
      <CommaListInput label="Tools" value={value.tools} onChange={(tools) => set("tools", tools)} />
    </div>
  );
}
```

- [ ] **Step 7: Create the Environment editor**

Create `components/experiments/EnvironmentEditor.tsx`:

```tsx
"use client";

import type { EnvironmentSpec } from "@/lib/types";
import CommaListInput from "@/components/experiments/CommaListInput";

export default function EnvironmentEditor({
  value,
  onChange,
}: {
  value: EnvironmentSpec;
  onChange: (value: EnvironmentSpec) => void;
}) {
  const set = <K extends keyof EnvironmentSpec>(key: K, next: EnvironmentSpec[K]) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="property-grid">
      <label>
        <span>Platform</span>
        <select
          aria-label="Platform"
          value={value.platform}
          onChange={(event) => set("platform", event.target.value as EnvironmentSpec["platform"])}
        >
          <option value="">Choose platform</option>
          <option value="npu">NPU</option>
          <option value="gpu">GPU</option>
        </select>
      </label>
      <label><span>Server</span><input aria-label="Server" value={value.server} onChange={(event) => set("server", event.target.value)} /></label>
      <CommaListInput label="Devices" value={value.devices} onChange={(devices) => set("devices", devices)} />
      <label><span>Hardware</span><input aria-label="Hardware" value={value.hardware} onChange={(event) => set("hardware", event.target.value)} /></label>
      <label><span>Evaluator / Grader</span><input aria-label="Evaluator or Grader" value={value.evaluator} onChange={(event) => set("evaluator", event.target.value)} /></label>
      <label><span>Revision</span><input aria-label="Environment Revision" value={value.revision} onChange={(event) => set("revision", event.target.value)} /></label>
      <label className="property-span-2"><span>Precision policy</span><input aria-label="Precision policy" value={value.precision_policy} onChange={(event) => set("precision_policy", event.target.value)} /></label>
    </div>
  );
}
```

- [ ] **Step 8: Create the typed key/value Config editor**

Create `components/experiments/ConfigEditor.tsx`:

```tsx
"use client";

import type { ConfigValue, ExperimentConfig } from "@/lib/types";

type ValueType = "string" | "number" | "boolean" | "null";

function valueType(value: ConfigValue): ValueType {
  if (value === null) return "null";
  return typeof value as Exclude<ValueType, "null">;
}

function changeType(type: ValueType): ConfigValue {
  if (type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "null") return null;
  return "";
}

export default function ConfigEditor({
  value,
  onChange,
}: {
  value: ExperimentConfig;
  onChange: (value: ExperimentConfig) => void;
}) {
  function rename(oldKey: string, newKey: string) {
    const trimmed = newKey.trim();
    if (!trimmed || trimmed === oldKey || trimmed in value) return;
    const next = { ...value };
    const currentValue = next[oldKey];
    delete next[oldKey];
    next[trimmed] = currentValue;
    onChange(next);
  }
  function setValue(key: string, raw: string) {
    const current = value[key];
    let next: ConfigValue = raw;
    if (typeof current === "number") next = raw === "" ? 0 : Number(raw);
    if (typeof current === "boolean") next = raw === "true";
    if (current === null) next = null;
    onChange({ ...value, [key]: next });
  }
  function remove(key: string) {
    const next = { ...value };
    delete next[key];
    onChange(next);
  }
  function add() {
    let index = Object.keys(value).length + 1;
    let key = `parameter_${index}`;
    while (key in value) {
      index += 1;
      key = `parameter_${index}`;
    }
    onChange({ ...value, [key]: "" });
  }
  return (
    <div className="key-value-editor">
      {Object.entries(value).map(([key, current]) => (
        <div className="key-value-row" key={key}>
          <input
            aria-label={`${key} key`}
            defaultValue={key}
            onBlur={(event) => rename(key, event.target.value)}
          />
          <select
            aria-label={`${key} type`}
            value={valueType(current)}
            onChange={(event) => onChange({
              ...value,
              [key]: changeType(event.target.value as ValueType),
            })}
          >
            <option value="string">Text</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
            <option value="null">Null</option>
          </select>
          {typeof current === "boolean"
            ? (
              <select
                aria-label={`${key} value`}
                value={String(current)}
                onChange={(event) => setValue(key, event.target.value)}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            )
            : (
              <input
                aria-label={`${key} value`}
                type={typeof current === "number" ? "number" : "text"}
                value={current ?? ""}
                disabled={current === null}
                onChange={(event) => setValue(key, event.target.value)}
              />
            )}
          <button type="button" className="icon-btn" onClick={() => remove(key)} aria-label={`Remove ${key}`}>×</button>
        </div>
      ))}
      <button type="button" className="btn" onClick={add}>Add parameter</button>
      {Object.keys(value).length === 0 && (
        <p className="field-help">
          Add explicit parameters, or add a text parameter named profile with value defaults.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Run focused tests and type-check**

Run:

```bash
npm test -- components/experiments/__tests__/ExperimentEditors.test.tsx
npx tsc --noEmit
```

Expected: 3 tests PASS; TypeScript exits 0.

- [ ] **Step 10: Commit**

```bash
git add components/experiments/ExperimentSection.tsx components/experiments/CommaListInput.tsx components/experiments/DataEditor.tsx components/experiments/ObjectEditor.tsx components/experiments/EnvironmentEditor.tsx components/experiments/ConfigEditor.tsx components/experiments/__tests__/ExperimentEditors.test.tsx
git commit -m "feat: add structured experiment context editors"
```

---

### Task 8: Result, Decision, Baseline Summary, Attachments, and Anonymous Timeline

**Files:**
- Modify: `components/MarkdownField.tsx`
- Create: `components/experiments/ResultEditor.tsx`
- Create: `components/experiments/DecisionEditor.tsx`
- Create: `components/experiments/BaselinePicker.tsx`
- Create: `components/experiments/BaselineSummary.tsx`
- Create: `components/experiments/AttachmentGallery.tsx`
- Create: `components/experiments/ExperimentTimeline.tsx`
- Create: `components/experiments/__tests__/ExperimentEvidence.test.tsx`

**Interfaces:**
- Consumes: comparison derivation, repository attachment/note calls, `ExperimentListRow`, `Activity`, and `Attachment`.
- Produces: controlled Result/Decision fields, explicit Baseline selection with cross-Task context warning, neutral one-to-one comparison, preserved plot uploads, and actor-free Experiment timeline.

- [ ] **Step 1: Write evidence and Baseline tests**

Create `components/experiments/__tests__/ExperimentEvidence.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExperimentListRow } from "@/lib/types";
import BaselineSummary from "@/components/experiments/BaselineSummary";
import ResultEditor from "@/components/experiments/ResultEditor";

function row(id: string, passAt1: number, device: string): ExperimentListRow {
  return {
    id,
    experiment_no: Number(id.slice(-1)),
    task_id: "00000000-0000-4000-8000-000000000010",
    owner_id: null,
    name: `run-${id.slice(-1)}`,
    status: "analyzing",
    baseline_experiment_id: null,
    data_spec: { datasets: [] },
    object_spec: {
      model: "Qwen",
      harness: "candidate",
      parent_harness: "seed",
      prompt: "prompt.md",
      prompt_change: "",
      skills: [],
      tools: [],
    },
    environment_spec: {
      platform: "npu",
      server: "worker",
      devices: [device],
      hardware: "Ascend910",
      evaluator: "grader",
      revision: "r1",
      precision_policy: "fp32",
    },
    config: { temperature: 0.1 },
    metrics: { "pass@1": passAt1 },
    featured_metric_keys: ["pass@1"],
    result_summary: "",
    decision_outcome: null,
    decision_notes: "",
    notes: "",
    position: 0,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-24T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
    task: { id: "00000000-0000-4000-8000-000000000010", title: "Optimize conv2d" },
    owner: null,
  };
}

describe("experiment evidence", () => {
  it("marks an existing numeric metric as featured", () => {
    const onChange = vi.fn();
    render(
      <ResultEditor
        metrics={{ "pass@1": 0.2 }}
        featuredMetricKeys={[]}
        resultSummary=""
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Feature pass@1" }));
    expect(onChange).toHaveBeenCalledWith({
      metrics: { "pass@1": 0.2 },
      featuredMetricKeys: ["pass@1"],
      resultSummary: "",
    });
  });

  it("renders neutral current-minus-baseline Delta and context differences", () => {
    const baseline = row("00000000-0000-4000-8000-000000000001", 0.1, "npu:0");
    const current = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");
    render(<BaselineSummary current={current} baseline={baseline} />);
    expect(screen.getByText("EXP-0001 · run-1")).toBeDefined();
    expect(screen.getByText("+0.15")).toBeDefined();
    expect(screen.getByText("Devices")).toBeDefined();
    expect(screen.getByText("npu:0")).toBeDefined();
    expect(screen.getByText("npu:1")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the evidence test and confirm red**

Run:

```bash
npm test -- components/experiments/__tests__/ExperimentEvidence.test.tsx
```

Expected: FAIL because ResultEditor and BaselineSummary do not exist.

- [ ] **Step 3: Implement the typed Result editor**

Create `components/experiments/ResultEditor.tsx`:

```tsx
"use client";

export interface ResultValue {
  metrics: Record<string, number>;
  featuredMetricKeys: string[];
  resultSummary: string;
}

export default function ResultEditor({
  metrics,
  featuredMetricKeys,
  resultSummary,
  onChange,
}: ResultValue & {
  onChange: (value: ResultValue) => void;
}) {
  function emit(
    nextMetrics = metrics,
    nextFeatured = featuredMetricKeys,
    nextSummary = resultSummary,
  ) {
    onChange({
      metrics: nextMetrics,
      featuredMetricKeys: nextFeatured.filter((key) => key in nextMetrics),
      resultSummary: nextSummary,
    });
  }
  function rename(oldKey: string, rawKey: string) {
    const key = rawKey.trim();
    if (!key || key === oldKey || key in metrics) return;
    const next = { ...metrics };
    const value = next[oldKey];
    delete next[oldKey];
    next[key] = value;
    emit(
      next,
      featuredMetricKeys.map((featured) => featured === oldKey ? key : featured),
    );
  }
  function remove(key: string) {
    const next = { ...metrics };
    delete next[key];
    emit(next, featuredMetricKeys.filter((featured) => featured !== key));
  }
  function add() {
    let index = Object.keys(metrics).length + 1;
    let key = `metric_${index}`;
    while (key in metrics) {
      index += 1;
      key = `metric_${index}`;
    }
    emit({ ...metrics, [key]: 0 });
  }
  return (
    <div className="result-editor">
      <div className="metric-editor">
        {Object.entries(metrics).map(([key, value]) => (
          <div className="metric-edit-row" key={key}>
            <input
              aria-label={`${key} metric name`}
              defaultValue={key}
              onBlur={(event) => rename(key, event.target.value)}
            />
            <input
              aria-label={`${key} metric value`}
              type="number"
              value={value}
              onChange={(event) => emit({
                ...metrics,
                [key]: event.target.value === "" ? 0 : Number(event.target.value),
              })}
            />
            <label className="featured-toggle">
              <input
                type="checkbox"
                aria-label={`Feature ${key}`}
                checked={featuredMetricKeys.includes(key)}
                onChange={(event) => emit(
                  metrics,
                  event.target.checked
                    ? [...featuredMetricKeys, key]
                    : featuredMetricKeys.filter((featured) => featured !== key),
                )}
              />
              Featured
            </label>
            <button type="button" className="icon-btn" onClick={() => remove(key)} aria-label={`Remove ${key}`}>×</button>
          </div>
        ))}
        <button type="button" className="btn" onClick={add}>Add metric</button>
      </div>
      <label className="stacked-field">
        <span>Result Summary</span>
        <textarea
          aria-label="Result Summary"
          value={resultSummary}
          onChange={(event) => emit(metrics, featuredMetricKeys, event.target.value)}
          placeholder="Qualitative outcome, failures, and observations"
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Make active Markdown editing visible to the conflict guard**

In `components/MarkdownField.tsx`, extend the props and editing transitions with:

```tsx
export default function MarkdownField({
  value,
  onSave,
  onEditingChange,
  placeholder = "Click to edit — Markdown supported",
  minHeight = 76,
}: {
  value: string;
  onSave: (v: string) => void;
  onEditingChange?: (editing: boolean) => void;
  placeholder?: string;
  minHeight?: number;
}) {
```

Replace `commit` and add `beginEditing`:

```tsx
  function beginEditing() {
    setEditing(true);
    onEditingChange?.(true);
  }

  function commit() {
    setEditing(false);
    onEditingChange?.(false);
    const t = draft.replace(/\s+$/, "");
    if (t !== value) onSave(t);
  }
```

Replace the Escape branch with:

```tsx
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
              onEditingChange?.(false);
            }
```

Replace the idle `<div>` interaction props with:

```tsx
      onClick={beginEditing}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          beginEditing();
        }
      }}
```

Existing callers that omit the new prop retain their current behavior.

- [ ] **Step 5: Implement the structured Decision editor**

Create `components/experiments/DecisionEditor.tsx`:

```tsx
"use client";

import MarkdownField from "@/components/MarkdownField";
import type { DecisionOutcome } from "@/lib/types";
import { DECISION_LABELS } from "@/lib/experiments/policy";

export default function DecisionEditor({
  outcome,
  notes,
  onChange,
  onEditingChange,
}: {
  outcome: DecisionOutcome | null;
  notes: string;
  onChange: (outcome: DecisionOutcome | null, notes: string) => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  return (
    <div className="decision-editor">
      <label>
        <span>Outcome</span>
        <select
          aria-label="Decision Outcome"
          value={outcome ?? ""}
          onChange={(event) => onChange(
            event.target.value ? event.target.value as DecisionOutcome : null,
            notes,
          )}
        >
          <option value="">No decision</option>
          {(Object.entries(DECISION_LABELS) as [DecisionOutcome, string][])
            .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <div className="stacked-field">
        <span>Decision Notes</span>
        <MarkdownField
          value={notes}
          onSave={(nextNotes) => onChange(outcome, nextNotes)}
          onEditingChange={onEditingChange}
          placeholder="Why this outcome was chosen and what happens next"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Implement explicit Baseline selection with cross-Task context disclosure**

Create `components/experiments/BaselinePicker.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import type { Experiment, ExperimentListRow } from "@/lib/types";
import { compareContexts } from "@/lib/experiments/compare";
import { formatExperimentId } from "@/lib/experiments/policy";

export default function BaselinePicker({
  current,
  candidates,
  value,
  onChange,
}: {
  current: Experiment;
  candidates: ExperimentListRow[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return candidates
      .filter((candidate) => !query || [
        candidate.name,
        candidate.task?.title ?? "",
        formatExperimentId(candidate.experiment_no),
      ].join(" ").toLowerCase().includes(query))
      .sort((left, right) => {
        const leftSameTask = left.task_id === current.task_id ? 0 : 1;
        const rightSameTask = right.task_id === current.task_id ? 0 : 1;
        return leftSameTask - rightSameTask || right.updated_at.localeCompare(left.updated_at);
      });
  }, [candidates, current.task_id, search]);

  return (
    <div className="baseline-picker">
      <label>
        <span>Baseline</span>
        <select
          aria-label="Baseline"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">No Baseline</option>
          {visible.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {formatExperimentId(candidate.experiment_no)} · {candidate.name} · {candidate.task?.title ?? "Deleted task"}
            </option>
          ))}
        </select>
      </label>
      <input
        type="search"
        aria-label="Search Baseline experiments"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search current Task first, or find another Task"
      />
      {value && (() => {
        const selected = candidates.find((candidate) => candidate.id === value);
        if (!selected || selected.task_id === current.task_id) return null;
        const differenceCount = compareContexts(current, selected).length;
        return (
          <p className="context-warning">
            Cross-Task Baseline: {selected.task?.title ?? "Deleted task"} · {differenceCount} context fields differ.
          </p>
        );
      })()}
    </div>
  );
}
```

- [ ] **Step 7: Implement the one-to-one Baseline summary**

Create `components/experiments/BaselineSummary.tsx`:

```tsx
import type { Experiment } from "@/lib/types";
import { compareContexts } from "@/lib/experiments/compare";
import { formatExperimentId } from "@/lib/experiments/policy";

function value(value: string | number | boolean | null): string {
  if (value === null) return "—";
  if (typeof value === "number") return Number(value.toPrecision(6)).toString();
  return String(value);
}

function delta(value: number): string {
  if (value === 0) return "0";
  const formatted = Number(Math.abs(value).toPrecision(6)).toString();
  return `${value > 0 ? "+" : "−"}${formatted}`;
}

export default function BaselineSummary({
  current,
  baseline,
}: {
  current: Experiment;
  baseline: Experiment;
}) {
  const metricKeys = [...new Set([
    ...Object.keys(current.metrics),
    ...Object.keys(baseline.metrics),
  ])].sort();
  const contextDifferences = compareContexts(current, baseline);
  return (
    <section className="baseline-summary" aria-labelledby="baseline-summary-title">
      <header>
        <div>
          <p className="eyebrow">Explicit comparison</p>
          <h2 id="baseline-summary-title">Current vs Baseline</h2>
        </div>
        <span className="baseline-reference">
          {formatExperimentId(baseline.experiment_no)} · {baseline.name}
        </span>
      </header>
      <div className="baseline-metric-grid">
        <div className="baseline-grid-head">Metric</div>
        <div className="baseline-grid-head">Baseline</div>
        <div className="baseline-grid-head">Current</div>
        <div className="baseline-grid-head">Delta</div>
        {metricKeys.map((key) => {
          const baselineValue = baseline.metrics[key];
          const currentValue = current.metrics[key];
          const numericDelta = typeof baselineValue === "number" && typeof currentValue === "number"
            ? currentValue - baselineValue
            : null;
          return (
            <div className="baseline-grid-row" key={key}>
              <strong>{key}</strong>
              <span>{baselineValue === undefined ? "—" : value(baselineValue)}</span>
              <span>{currentValue === undefined ? "—" : value(currentValue)}</span>
              <span className="neutral-delta">{numericDelta === null ? "—" : delta(numericDelta)}</span>
            </div>
          );
        })}
      </div>
      <details open={contextDifferences.length > 0}>
        <summary>Context differences ({contextDifferences.length})</summary>
        {contextDifferences.length === 0
          ? <p className="muted">Recorded Data, Object, Environment, and Config are identical.</p>
          : (
            <div className="context-difference-list">
              {contextDifferences.map((difference) => (
                <div key={`${difference.group}-${difference.key}`}>
                  <strong>{difference.label}</strong>
                  <span>{value(difference.baseline)}</span>
                  <span>{value(difference.current)}</span>
                </div>
              ))}
            </div>
          )}
      </details>
      <p className="field-help">
        Differences describe recorded context only; Triton Board does not claim the runs are comparable or that a Delta is good.
      </p>
    </section>
  );
}
```

- [ ] **Step 8: Preserve Experiment plots and captions in a focused gallery**

Create `components/experiments/AttachmentGallery.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import type { Attachment, Experiment } from "@/lib/types";
import {
  deleteExperimentAttachment,
  updateExperimentAttachment,
  uploadExperimentAttachment,
} from "@/lib/experiments/repository";

export default function AttachmentGallery({
  experiment,
  attachments,
  onChanged,
}: {
  experiment: Experiment;
  attachments: Attachment[];
  onChanged: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function upload(files: FileList) {
    setWorking(true);
    setError("");
    try {
      let position = attachments.length
        ? Math.max(...attachments.map((attachment) => attachment.position)) + 1
        : 0;
      for (const file of Array.from(files)) {
        await uploadExperimentAttachment(experiment, file, position);
        position += 1;
      }
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not upload the attachment.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="attachment-gallery">
      <div className="attachment-actions">
        <strong>Plots &amp; images</strong>
        <button type="button" className="btn" disabled={working} onClick={() => fileInput.current?.click()}>
          {working ? "Uploading…" : "Upload images"}
        </button>
        <input
          ref={fileInput}
          hidden
          multiple
          type="file"
          accept="image/*"
          onChange={(event) => {
            if (event.target.files?.length) void upload(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {attachments.length === 0
        ? <p className="muted">No plots or images attached.</p>
        : (
          <div className="experiment-image-grid">
            {attachments.map((attachment) => (
              <figure key={attachment.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <a href={attachment.url} target="_blank" rel="noreferrer">
                  <img src={attachment.url} alt={attachment.caption || "Experiment plot"} />
                </a>
                <figcaption>
                  <input
                    aria-label={`Caption for ${attachment.caption || "plot"}`}
                    defaultValue={attachment.caption}
                    placeholder="Add a caption"
                    onBlur={(event) => {
                      if (event.target.value !== attachment.caption) {
                        void updateExperimentAttachment(attachment.id, event.target.value)
                          .then(onChanged)
                          .catch((caught) => setError(
                            caught instanceof Error ? caught.message : "Could not update caption.",
                          ));
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Delete image"
                    onClick={() => {
                      if (!window.confirm("Delete this image? This removes the Storage object.")) return;
                      void deleteExperimentAttachment(attachment)
                        .then(onChanged)
                        .catch((caught) => setError(
                          caught instanceof Error ? caught.message : "Could not delete image.",
                        ));
                    }}
                  >
                    ×
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
    </div>
  );
}
```

- [ ] **Step 9: Create the anonymous Experiment timeline**

Create `components/experiments/ExperimentTimeline.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Activity, Experiment } from "@/lib/types";
import { KIND_COLOR } from "@/lib/activity";
import { fmtDate, relTime } from "@/lib/time";
import { addExperimentTimelineNote } from "@/lib/experiments/repository";

export default function ExperimentTimeline({
  experiment,
  activity,
  onChanged,
}: {
  experiment: Experiment;
  activity: Activity[];
  onChanged: () => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function addNote() {
    if (!note.trim()) return;
    setSaving(true);
    setError("");
    try {
      await addExperimentTimelineNote(experiment, note);
      setNote("");
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the timeline note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="experiment-timeline" aria-labelledby="experiment-timeline-title">
      <h2 id="experiment-timeline-title">Timeline</h2>
      <p className="field-help">Anonymous events from the shared team account.</p>
      <div className="timeline-note-form">
        <textarea
          aria-label="Experiment timeline note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add a factual note"
        />
        <button type="button" className="btn" disabled={saving || !note.trim()} onClick={() => void addNote()}>
          Add note
        </button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="timeline">
        {activity.length === 0 && <p className="muted">No activity yet.</p>}
        {activity.map((event, index) => (
          <div className="tl-row" key={event.id}>
            <div className="tl-rail">
              <span className="tl-dot" style={{ background: KIND_COLOR[event.kind] }} />
              {index < activity.length - 1 && <span className="tl-line" />}
            </div>
            <div className="tl-body">
              <div className="tl-text">{event.text}</div>
              <div className="tl-time">{relTime(event.created_at)} · {fmtDate(event.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 10: Run focused tests and type-check**

Run:

```bash
npm test -- components/experiments/__tests__/ExperimentEvidence.test.tsx
npx tsc --noEmit
```

Expected: 2 tests PASS; TypeScript exits 0.

- [ ] **Step 11: Commit**

```bash
git add components/MarkdownField.tsx components/experiments/ResultEditor.tsx components/experiments/DecisionEditor.tsx components/experiments/BaselinePicker.tsx components/experiments/BaselineSummary.tsx components/experiments/AttachmentGallery.tsx components/experiments/ExperimentTimeline.tsx components/experiments/__tests__/ExperimentEvidence.test.tsx
git commit -m "feat: add experiment evidence and baseline UI"
```

---

### Task 9: Conflict-Safe Experiment Detail Page

**Files:**
- Create: `components/experiments/DuplicateExperimentDialog.tsx`
- Create: `components/experiments/ExperimentDetail.tsx`
- Create: `components/experiments/__tests__/DuplicateExperimentDialog.test.tsx`
- Create: `app/experiments/[id]/page.tsx`
- Create: `app/experiments/[id]/loading.tsx`

**Interfaces:**
- Consumes: all Task 2–8 domain, repository, editor, comparison, attachment, and timeline interfaces.
- Produces: `/experiments/[id]` with top properties, seven sections, one explicit Baseline, Duplicate, Compare, delete, a single conflict-safe draft save, and a right-side anonymous timeline.

- [ ] **Step 1: Write the Duplicate confirmation test**

Create `components/experiments/__tests__/DuplicateExperimentDialog.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Experiment, Member } from "@/lib/types";
import DuplicateExperimentDialog from "@/components/experiments/DuplicateExperimentDialog";
import { duplicateExperiment } from "@/lib/experiments/repository";

vi.mock("@/lib/experiments/repository", () => ({
  duplicateExperiment: vi.fn(),
}));

const source = {
  id: "00000000-0000-4000-8000-000000000001",
  experiment_no: 9,
  task_id: "00000000-0000-4000-8000-000000000010",
  owner_id: "00000000-0000-4000-8000-000000000020",
  name: "Source run",
  status: "completed",
  baseline_experiment_id: null,
  data_spec: { datasets: [] },
  object_spec: {
    model: "Qwen",
    harness: "candidate",
    parent_harness: "seed",
    prompt: "prompt.md",
    prompt_change: "",
    skills: [],
    tools: [],
  },
  environment_spec: {
    platform: "npu",
    server: "worker",
    devices: ["npu:0"],
    hardware: "Ascend910",
    evaluator: "grader",
    revision: "r1",
    precision_policy: "fp32",
  },
  config: { temperature: 0.1 },
  metrics: { "pass@1": 0.2 },
  featured_metric_keys: ["pass@1"],
  result_summary: "result",
  decision_outcome: "accepted",
  decision_notes: "keep",
  notes: "note",
  position: 0,
  started_at: "2026-07-24T00:00:00.000Z",
  completed_at: "2026-07-24T01:00:00.000Z",
  created_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T01:00:00.000Z",
} satisfies Experiment;

const member = {
  id: "00000000-0000-4000-8000-000000000020",
  name: "Bruce",
  initials: "BX",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
} satisfies Member;

describe("DuplicateExperimentDialog", () => {
  it("shows the explicit Source Baseline and copy/reset boundary", async () => {
    vi.mocked(duplicateExperiment).mockResolvedValue({ id: "duplicate" } as Experiment);
    const onCreated = vi.fn();
    render(
      <DuplicateExperimentDialog
        open
        source={source}
        members={[member]}
        onClose={() => undefined}
        onCreated={onCreated}
      />,
    );
    expect(screen.getByText("Baseline = EXP-0009 · Source run")).toBeDefined();
    expect(screen.getByText("Copies: Task, Owner, Data, Object, Environment, Config")).toBeDefined();
    expect(screen.getByText("Clears: Result, Decision, Note, attachments, timeline, run times")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate experiment" }));
    await waitFor(() => expect(duplicateExperiment).toHaveBeenCalledWith(source, {
      name: "Source run copy",
      ownerId: member.id,
    }));
    expect(onCreated).toHaveBeenCalledWith({ id: "duplicate" });
  });
});
```

- [ ] **Step 2: Run the Duplicate test and confirm red**

Run:

```bash
npm test -- components/experiments/__tests__/DuplicateExperimentDialog.test.tsx
```

Expected: FAIL because the dialog does not exist.

- [ ] **Step 3: Implement the Duplicate confirmation**

Create `components/experiments/DuplicateExperimentDialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Experiment, Member } from "@/lib/types";
import {
  duplicateExperiment,
} from "@/lib/experiments/repository";
import { formatExperimentId } from "@/lib/experiments/policy";

export default function DuplicateExperimentDialog({
  open,
  source,
  members,
  onClose,
  onCreated,
}: {
  open: boolean;
  source: Experiment;
  members: Member[];
  onClose: () => void;
  onCreated: (experiment: Experiment) => void;
}) {
  const [name, setName] = useState(`${source.name} copy`);
  const [ownerId, setOwnerId] = useState(source.owner_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(`${source.name} copy`);
    setOwnerId(source.owner_id ?? "");
    setSaving(false);
    setError("");
  }, [open, source.name, source.owner_id]);

  if (!open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !ownerId) {
      setError("Name and Owner are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      onCreated(await duplicateExperiment(source, { name: name.trim(), ownerId }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not duplicate the experiment.");
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="experiment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-experiment-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">New planned record</p>
            <h2 id="duplicate-experiment-title">Duplicate experiment</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <form onSubmit={submit}>
          <div className="baseline-confirmation">
            Baseline = {formatExperimentId(source.experiment_no)} · {source.name}
          </div>
          <p>Copies: Task, Owner, Data, Object, Environment, Config</p>
          <p>Clears: Result, Decision, Note, attachments, timeline, run times</p>
          <label>
            <span>Name</span>
            <input aria-label="Duplicate name" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span>Owner</span>
            <select aria-label="Duplicate Owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              <option value="">Choose an Owner</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Duplicating…" : "Duplicate experiment"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Implement the complete draft-based detail client**

Create `components/experiments/ExperimentDetail.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Experiment } from "@/lib/types";
import { fmtDate } from "@/lib/time";
import MarkdownField from "@/components/MarkdownField";
import {
  editableExperimentPatch,
  reconcileRealtime,
} from "@/lib/experiments/draft";
import {
  allowedTargets,
  EXPERIMENT_STATUS_LABELS,
  formatExperimentId,
  validateBaseline,
  validateForStatus,
  type ValidationIssue,
} from "@/lib/experiments/policy";
import {
  deleteExperiment,
  loadExperimentBundle,
  updateExperiment,
  watchExperiment,
  type ExperimentBundle,
} from "@/lib/experiments/repository";
import { serializeCompareSelection } from "@/lib/experiments/compare-url";
import AttachmentGallery from "@/components/experiments/AttachmentGallery";
import BaselinePicker from "@/components/experiments/BaselinePicker";
import BaselineSummary from "@/components/experiments/BaselineSummary";
import ConfigEditor from "@/components/experiments/ConfigEditor";
import DataEditor from "@/components/experiments/DataEditor";
import DecisionEditor from "@/components/experiments/DecisionEditor";
import DuplicateExperimentDialog from "@/components/experiments/DuplicateExperimentDialog";
import EnvironmentEditor from "@/components/experiments/EnvironmentEditor";
import ExperimentSection from "@/components/experiments/ExperimentSection";
import ExperimentStatusBadge from "@/components/experiments/ExperimentStatusBadge";
import ExperimentTimeline from "@/components/experiments/ExperimentTimeline";
import ObjectEditor from "@/components/experiments/ObjectEditor";
import ResultEditor from "@/components/experiments/ResultEditor";

export default function ExperimentDetail({ id }: { id: string }) {
  const router = useRouter();
  const [bundle, setBundle] = useState<ExperimentBundle | null>(null);
  const [server, setServer] = useState<Experiment | null>(null);
  const [draft, setDraft] = useState<Experiment | null>(null);
  const [remoteConflict, setRemoteConflict] = useState<Experiment | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const draftRef = useRef<Experiment | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const markdownEditingRef = useRef(false);

  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { savingRef.current = saving; }, [saving]);

  const loadInitial = useCallback(async () => {
    try {
      const next = await loadExperimentBundle(id);
      if (!next) {
        setNotFound(true);
        return;
      }
      setBundle(next);
      setServer(next.experiment);
      setDraft(structuredClone(next.experiment));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the experiment.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadRelated = useCallback(async () => {
    try {
      const next = await loadExperimentBundle(id);
      if (!next) return;
      setBundle((current) => current ? {
        ...next,
        experiment: current.experiment,
      } : next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh related data.");
    }
  }, [id]);

  const loadRealtimeExperiment = useCallback(async () => {
    try {
      const next = await loadExperimentBundle(id);
      const currentDraft = draftRef.current;
      if (!next || !currentDraft) return;
      const resolution = reconcileRealtime(
        currentDraft,
        next.experiment,
        dirtyRef.current || markdownEditingRef.current,
        savingRef.current,
      );
      setBundle((current) => ({
        ...next,
        experiment: resolution.kind === "replace"
          ? next.experiment
          : current?.experiment ?? next.experiment,
      }));
      if (resolution.kind === "replace") {
        setServer(next.experiment);
        setDraft(structuredClone(next.experiment));
        setRemoteConflict(null);
      }
      if (resolution.kind === "conflict") setRemoteConflict(next.experiment);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh the experiment.");
    }
  }, [id]);

  useEffect(() => {
    void loadInitial();
    return watchExperiment(
      id,
      () => void loadRealtimeExperiment(),
      () => void loadRelated(),
    );
  }, [id, loadInitial, loadRealtimeExperiment, loadRelated]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  function patchDraft(patch: Partial<Experiment>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
    setDirty(true);
    dirtyRef.current = true;
    setIssues([]);
  }

  async function save() {
    if (!server || !draft) return;
    const nextIssues: ValidationIssue[] = [];
    if (!draft.name.trim()) {
      nextIssues.push({ field: "name", message: "Experiment Name is required." });
    }
    nextIssues.push(...validateBaseline(draft.id, draft.baseline_experiment_id));
    nextIssues.push(...validateForStatus({ ...draft, status: server.status }, draft.status));
    if (nextIssues.length > 0) {
      setIssues(nextIssues);
      return;
    }
    setSaving(true);
    savingRef.current = true;
    setError("");
    try {
      const result = await updateExperiment(
        draft.id,
        server.updated_at,
        editableExperimentPatch(draft),
      );
      if (!result.ok) {
        const fresh = await loadExperimentBundle(id);
        if (fresh) setRemoteConflict(fresh.experiment);
        return;
      }
      setServer(result.experiment);
      setDraft(structuredClone(result.experiment));
      setBundle((current) => current ? { ...current, experiment: result.experiment } : current);
      setDirty(false);
      dirtyRef.current = false;
      setRemoteConflict(null);
      setIssues([]);
      await loadRelated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the experiment.");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  const baseline = useMemo(() => {
    if (!draft?.baseline_experiment_id || !bundle) return null;
    return bundle.candidates.find(
      (candidate) => candidate.id === draft.baseline_experiment_id,
    ) ?? null;
  }, [bundle, draft?.baseline_experiment_id]);

  if (loading) return <div className="workspace-page"><p className="state-note">Loading experiment…</p></div>;
  if (notFound || !bundle || !server || !draft) {
    return (
      <div className="workspace-page">
        <Link href="/experiments" className="back-link">← Experiments</Link>
        <p className="state-note">Experiment not found. It may have been deleted.</p>
      </div>
    );
  }

  const compareQuery = serializeCompareSelection({
    ids: baseline ? [baseline.id, draft.id] : [draft.id],
    baselineId: baseline?.id ?? null,
  });

  return (
    <div className="workspace-page experiment-detail-page">
      <div className="experiment-main-column">
        <Link href={bundle.task ? `/task/${bundle.task.id}` : "/experiments"} className="back-link">
          ← {bundle.task?.title ?? "Experiments"}
        </Link>

        {remoteConflict && (
          <div className="conflict-banner" role="alert">
            <div>
              <strong>This experiment changed remotely.</strong>
              <p>Your local draft was not overwritten. Load the latest version before reapplying your edits.</p>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (!window.confirm("Discard the local draft and load the remote version?")) return;
                setServer(remoteConflict);
                setDraft(structuredClone(remoteConflict));
                setDirty(false);
                dirtyRef.current = false;
                markdownEditingRef.current = false;
                setRemoteConflict(null);
                setIssues([]);
              }}
            >
              Load latest
            </button>
          </div>
        )}
        {error && <div className="error-banner">{error}</div>}

        <header className="experiment-detail-header">
          <div className="experiment-title-line">
            <span className="experiment-display-id">{formatExperimentId(draft.experiment_no)}</span>
            <input
              className="experiment-title-input"
              aria-label="Experiment Name"
              value={draft.name}
              onChange={(event) => patchDraft({ name: event.target.value })}
            />
          </div>
          <div className="workspace-actions">
            <Link
              className={`btn ${dirty ? "disabled" : ""}`}
              aria-disabled={dirty}
              title={dirty ? "Save changes before comparing." : "Compare saved data."}
              href={dirty ? `/experiments/${draft.id}` : `/experiments/compare?${compareQuery}`}
              onClick={(event) => { if (dirty) event.preventDefault(); }}
            >
              Compare
            </Link>
            <button
              type="button"
              className="btn"
              disabled={dirty}
              title={dirty ? "Save changes before duplicating." : "Duplicate saved context."}
              onClick={() => setDuplicateOpen(true)}
            >
              Duplicate
            </button>
            <button
              type="button"
              className="btn danger-subtle"
              onClick={() => {
                if (!window.confirm(`Delete ${formatExperimentId(draft.experiment_no)}? The record, attachment rows, and stored images will be removed.`)) return;
                void deleteExperiment(draft)
                  .then(() => router.push(bundle.task ? `/task/${bundle.task.id}` : "/experiments"))
                  .catch((caught) => setError(
                    caught instanceof Error ? caught.message : "Could not delete the experiment.",
                  ));
              }}
            >
              Delete
            </button>
          </div>
        </header>

        <section className="experiment-properties" aria-label="Experiment properties">
          <label>
            <span>Task</span>
            <Link href={bundle.task ? `/task/${bundle.task.id}` : "/experiments"}>
              {bundle.task?.title ?? "Deleted task"}
            </Link>
          </label>
          <label>
            <span>Owner</span>
            <select
              aria-label="Experiment Owner"
              value={draft.owner_id ?? ""}
              onChange={(event) => patchDraft({ owner_id: event.target.value || null })}
            >
              <option value="">Unassigned legacy row</option>
              {bundle.members.map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              aria-label="Experiment Status"
              value={draft.status}
              onChange={(event) => patchDraft({
                status: event.target.value as Experiment["status"],
              })}
            >
              {allowedTargets(server.status).map((status) => (
                <option key={status} value={status}>{EXPERIMENT_STATUS_LABELS[status]}</option>
              ))}
            </select>
          </label>
          <div>
            <span>Current status</span>
            <ExperimentStatusBadge status={server.status} />
          </div>
          <div><span>Created</span><strong>{fmtDate(draft.created_at)}</strong></div>
          <div><span>Started</span><strong>{fmtDate(draft.started_at) || "—"}</strong></div>
          <div><span>Completed</span><strong>{fmtDate(draft.completed_at) || "—"}</strong></div>
          <BaselinePicker
            current={draft}
            candidates={bundle.candidates}
            value={draft.baseline_experiment_id}
            onChange={(baselineId) => patchDraft({ baseline_experiment_id: baselineId })}
          />
        </section>

        <ExperimentSection id="data" title="Data" description="Training and evaluation datasets used by this run.">
          <DataEditor value={draft.data_spec} onChange={(data_spec) => patchDraft({ data_spec })} />
        </ExperimentSection>
        <ExperimentSection id="object" title="Object" description="Model plus the Prompt, Skills, and Tools that make up the Harness.">
          <ObjectEditor value={draft.object_spec} onChange={(object_spec) => patchDraft({ object_spec })} />
        </ExperimentSection>
        <ExperimentSection id="environment" title="Environment" description="NPU or GPU placement and evaluator context.">
          <EnvironmentEditor value={draft.environment_spec} onChange={(environment_spec) => patchDraft({ environment_spec })} />
        </ExperimentSection>
        <ExperimentSection id="config" title="Config" description="Typed experiment parameters; values are stored as structured JSON properties.">
          <ConfigEditor value={draft.config} onChange={(config) => patchDraft({ config })} />
        </ExperimentSection>
        <ExperimentSection id="result" title="Result" description="Manual numeric metrics, qualitative summary, plots, and captions.">
          <ResultEditor
            metrics={draft.metrics}
            featuredMetricKeys={draft.featured_metric_keys}
            resultSummary={draft.result_summary}
            onChange={(result) => patchDraft({
              metrics: result.metrics,
              featured_metric_keys: result.featuredMetricKeys,
              result_summary: result.resultSummary,
            })}
          />
          <AttachmentGallery
            experiment={server}
            attachments={bundle.attachments}
            onChanged={() => void loadRelated()}
          />
        </ExperimentSection>
        <ExperimentSection id="decision" title="Decision" description="A structured outcome and the reasoning that should guide the Task.">
          <DecisionEditor
            outcome={draft.decision_outcome}
            notes={draft.decision_notes}
            onChange={(decision_outcome, decision_notes) => patchDraft({
              decision_outcome,
              decision_notes,
            })}
            onEditingChange={(editing) => { markdownEditingRef.current = editing; }}
          />
        </ExperimentSection>
        <ExperimentSection id="note" title="Note" description="Freeform experiment-specific Markdown source.">
          <div className="stacked-field">
            <span>Experiment Note</span>
            <MarkdownField
              value={draft.notes}
              minHeight={180}
              onSave={(notes) => patchDraft({ notes })}
              onEditingChange={(editing) => { markdownEditingRef.current = editing; }}
              placeholder="Observations, caveats, links, and follow-up ideas"
            />
          </div>
        </ExperimentSection>

        {baseline && <BaselineSummary current={draft} baseline={baseline} />}

        {issues.length > 0 && (
          <div className="validation-summary" role="alert">
            <strong>Resolve these fields before saving:</strong>
            <ul>{issues.map((issue) => <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>)}</ul>
          </div>
        )}
        <div className="experiment-save-bar">
          <span>{dirty ? "Unsaved changes" : `Saved · updated ${fmtDate(server.updated_at)}`}</span>
          <button
            type="button"
            className="btn"
            disabled={!dirty || saving}
            onClick={() => {
              setDraft(structuredClone(server));
              setDirty(false);
              dirtyRef.current = false;
              setIssues([]);
            }}
          >
            Discard
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!dirty || saving || Boolean(remoteConflict)}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <ExperimentTimeline
        experiment={server}
        activity={bundle.activity}
        onChanged={() => void loadRelated()}
      />

      <DuplicateExperimentDialog
        open={duplicateOpen}
        source={server}
        members={bundle.members}
        onClose={() => setDuplicateOpen(false)}
        onCreated={(experiment) => router.push(`/experiments/${experiment.id}`)}
      />
    </div>
  );
}
```

- [ ] **Step 5: Add the Next 16 dynamic route and loading boundary**

Create `app/experiments/[id]/page.tsx`:

```tsx
import AuthGate from "@/components/AuthGate";
import ExperimentDetail from "@/components/experiments/ExperimentDetail";

export default async function ExperimentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AuthGate>
      <ExperimentDetail id={id} />
    </AuthGate>
  );
}
```

Create `app/experiments/[id]/loading.tsx`:

```tsx
export default function ExperimentLoading() {
  return (
    <div className="workspace-page">
      <p className="state-note">Loading experiment…</p>
    </div>
  );
}
```

- [ ] **Step 6: Run focused tests, full unit tests, type-check, and build**

Run:

```bash
npm test -- components/experiments/__tests__/DuplicateExperimentDialog.test.tsx lib/experiments/__tests__/draft.test.ts lib/experiments/__tests__/policy.test.ts
npm test
npx tsc --noEmit
npm run build
```

Expected: all tests PASS; TypeScript exits 0; build lists `/experiments/[id]` and exits 0. Manually confirm the build does not report synchronous access to `params`.

- [ ] **Step 7: Commit**

```bash
git add components/experiments/DuplicateExperimentDialog.tsx components/experiments/ExperimentDetail.tsx components/experiments/__tests__/DuplicateExperimentDialog.test.tsx app/experiments/[id]/page.tsx app/experiments/[id]/loading.tsx
git commit -m "feat: add experiment detail knowledge loop"
```

---

### Task 10: Dedicated Multi-Experiment Compare

**Files:**
- Create: `components/experiments/ExperimentCompare.tsx`
- Create: `components/experiments/__tests__/ExperimentCompare.test.tsx`
- Create: `app/experiments/compare/page.tsx`

**Interfaces:**
- Consumes: Task 3 comparison/URL functions, Task 4 list/Realtime functions, and Task 2 labels.
- Produces: `/experiments/compare?ids=<uuid>,<uuid>&baseline=<uuid>` with Experiment rows, sticky identity column, optional pinned Baseline, group toggles, neutral Delta columns, `Diff only`, missing values, and no application-level selection cap.

- [ ] **Step 1: Write the Compare table integration test**

Create `components/experiments/__tests__/ExperimentCompare.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExperimentListRow } from "@/lib/types";
import ExperimentCompare from "@/components/experiments/ExperimentCompare";
import { listExperimentRows } from "@/lib/experiments/repository";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/lib/experiments/repository", () => ({
  listExperimentRows: vi.fn(),
  watchExperimentIndex: () => () => undefined,
}));

function row(id: string, no: number, passAt1: number): ExperimentListRow {
  return {
    id,
    experiment_no: no,
    task_id: "00000000-0000-4000-8000-000000000010",
    owner_id: null,
    name: `run-${no}`,
    status: "analyzing",
    baseline_experiment_id: null,
    data_spec: { datasets: [] },
    object_spec: {
      model: "Qwen",
      harness: "candidate",
      parent_harness: "seed",
      prompt: "prompt.md",
      prompt_change: "",
      skills: [],
      tools: [],
    },
    environment_spec: {
      platform: "npu",
      server: "worker",
      devices: ["npu:0"],
      hardware: "Ascend910",
      evaluator: "grader",
      revision: "r1",
      precision_policy: "fp32",
    },
    config: { temperature: 0.1 },
    metrics: { "pass@1": passAt1 },
    featured_metric_keys: ["pass@1"],
    result_summary: "",
    decision_outcome: null,
    decision_notes: "",
    notes: "",
    position: 0,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-24T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
    task: { id: "00000000-0000-4000-8000-000000000010", title: "Optimize conv2d" },
    owner: null,
  };
}

describe("ExperimentCompare", () => {
  it("pins Baseline first and renders raw plus neutral Delta columns", async () => {
    const current = row("00000000-0000-4000-8000-000000000002", 2, 0.25);
    const baseline = row("00000000-0000-4000-8000-000000000001", 1, 0.1);
    vi.mocked(listExperimentRows).mockResolvedValue([current, baseline]);
    render(
      <ExperimentCompare
        initialSelection={{
          ids: [current.id, baseline.id],
          baselineId: baseline.id,
        }}
      />,
    );
    await waitFor(() => expect(screen.getByRole("columnheader", { name: "Δ pass@1" })).toBeDefined());
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("EXP-0001")).toBeDefined();
    expect(within(rows[1]).getByText("Baseline")).toBeDefined();
    expect(within(rows[2]).getByText("+0.15")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the Compare test and confirm red**

Run:

```bash
npm test -- components/experiments/__tests__/ExperimentCompare.test.tsx
```

Expected: FAIL because `ExperimentCompare` does not exist.

- [ ] **Step 3: Implement the URL-backed Compare client**

Create `components/experiments/ExperimentCompare.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExperimentListRow } from "@/lib/types";
import {
  buildCompareColumns,
  orderWithBaseline,
  type CompareGroup,
  type CompareValue,
} from "@/lib/experiments/compare";
import {
  serializeCompareSelection,
  type CompareSelection,
} from "@/lib/experiments/compare-url";
import {
  listExperimentRows,
  watchExperimentIndex,
} from "@/lib/experiments/repository";
import {
  EXPERIMENT_STATUS_LABELS,
  formatExperimentId,
} from "@/lib/experiments/policy";

const GROUPS: { value: CompareGroup; label: string }[] = [
  { value: "data", label: "Data" },
  { value: "object", label: "Object" },
  { value: "environment", label: "Environment" },
  { value: "config", label: "Config" },
  { value: "result", label: "Result" },
  { value: "decision_note", label: "Decision & Note" },
];

function displayValue(value: CompareValue, delta: boolean): string {
  if (value === null) return "—";
  if (typeof value !== "number") return String(value);
  const magnitude = Number(Math.abs(value).toPrecision(6)).toString();
  if (!delta || value === 0) return Number(value.toPrecision(6)).toString();
  return `${value > 0 ? "+" : "−"}${magnitude}`;
}

export default function ExperimentCompare({
  initialSelection,
}: {
  initialSelection: CompareSelection;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ExperimentListRow[]>([]);
  const [selection, setSelection] = useState(initialSelection);
  const [groups, setGroups] = useState<CompareGroup[]>(GROUPS.map((group) => group.value));
  const [diffOnly, setDiffOnly] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => setSelection(initialSelection), [initialSelection]);

  const reload = useCallback(async () => {
    try {
      setRows(await listExperimentRows());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load experiments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return watchExperimentIndex(() => void reload());
  }, [reload]);

  function replaceSelection(next: CompareSelection) {
    const normalized = {
      ids: [...new Set(next.ids)],
      baselineId: next.baselineId,
    };
    setSelection(normalized);
    const query = serializeCompareSelection(normalized);
    router.replace(query ? `/experiments/compare?${query}` : "/experiments/compare");
  }

  const selected = useMemo(() => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    return orderWithBaseline(
      selection.ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
      }),
      selection.baselineId,
    ) as ExperimentListRow[];
  }, [rows, selection]);

  const columns = useMemo(
    () => buildCompareColumns(selected, {
      groups,
      baselineId: selection.baselineId,
      diffOnly,
    }),
    [diffOnly, groups, selected, selection.baselineId],
  );
  const available = rows.filter((row) => !selection.ids.includes(row.id));

  return (
    <div className="workspace-page compare-page">
      <header className="workspace-page-header">
        <div>
          <p className="eyebrow">Shareable analysis</p>
          <h1>Compare experiments</h1>
          <p>Experiments are rows. Recorded fields are columns. Baseline and Delta are explicit.</p>
        </div>
        <Link href="/experiments" className="btn">Back to database</Link>
      </header>

      <section className="compare-controls" aria-label="Compare controls">
        <div className="compare-picker">
          <select
            aria-label="Add experiment"
            value={candidateId}
            onChange={(event) => setCandidateId(event.target.value)}
          >
            <option value="">Choose an experiment</option>
            {available.map((row) => (
              <option key={row.id} value={row.id}>
                {formatExperimentId(row.experiment_no)} · {row.name} · {row.task?.title ?? "Deleted task"}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            disabled={!candidateId}
            onClick={() => {
              if (!candidateId) return;
              replaceSelection({ ...selection, ids: [...selection.ids, candidateId] });
              setCandidateId("");
            }}
          >
            Add
          </button>
        </div>
        <label>
          <span>Baseline</span>
          <select
            aria-label="Compare Baseline"
            value={selection.baselineId ?? ""}
            onChange={(event) => replaceSelection({
              ids: selection.ids,
              baselineId: event.target.value || null,
            })}
          >
            <option value="">No Baseline</option>
            {selected.map((row) => (
              <option key={row.id} value={row.id}>
                {formatExperimentId(row.experiment_no)} · {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="diff-toggle">
          <input
            type="checkbox"
            checked={diffOnly}
            onChange={(event) => setDiffOnly(event.target.checked)}
          />
          Diff only
        </label>
        <div className="compare-groups" aria-label="Field groups">
          {GROUPS.map((group) => (
            <label key={group.value}>
              <input
                type="checkbox"
                checked={groups.includes(group.value)}
                onChange={(event) => setGroups((current) =>
                  event.target.checked
                    ? [...current, group.value]
                    : current.filter((value) => value !== group.value))}
              />
              {group.label}
            </label>
          ))}
        </div>
      </section>

      {error && <div className="error-banner">{error}</div>}
      {loading
        ? <p className="state-note">Loading comparison…</p>
        : selected.length === 0
          ? <div className="experiment-empty">Add experiments to build a comparison.</div>
          : (
            <div className="compare-table-scroll">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th className="compare-identity">Experiment</th>
                    <th>Task</th>
                    <th>Status</th>
                    {columns.map((column) => (
                      <th key={column.key} className={column.kind === "delta" ? "neutral-delta" : ""}>
                        <span>{column.label}</span>
                        <small>{GROUPS.find((group) => group.value === column.group)?.label}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected.map((row) => (
                    <tr key={row.id} className={row.id === selection.baselineId ? "baseline-row" : ""}>
                      <td className="compare-identity">
                        <Link href={`/experiments/${row.id}`}>{formatExperimentId(row.experiment_no)}</Link>
                        <strong>{row.name}</strong>
                        {row.id === selection.baselineId && <span className="baseline-chip">Baseline</span>}
                        <button
                          type="button"
                          className="remove-compare"
                          aria-label={`Remove ${formatExperimentId(row.experiment_no)}`}
                          onClick={() => replaceSelection({
                            ids: selection.ids.filter((id) => id !== row.id),
                            baselineId: selection.baselineId === row.id ? null : selection.baselineId,
                          })}
                        >
                          Remove
                        </button>
                      </td>
                      <td>{row.task?.title ?? "—"}</td>
                      <td>{EXPERIMENT_STATUS_LABELS[row.status]}</td>
                      {columns.map((column) => (
                        <td key={column.key} className={column.kind === "delta" ? "neutral-delta" : ""}>
                          {displayValue(column.values[row.id] ?? null, column.kind === "delta")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      <p className="field-help">
        Missing values are shown as —. Context differences are descriptive; no statistical significance or good/bad direction is inferred.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Add the Next 16 page using awaited `searchParams`**

Create `app/experiments/compare/page.tsx`:

```tsx
import AuthGate from "@/components/AuthGate";
import ExperimentCompare from "@/components/experiments/ExperimentCompare";
import { parseCompareSearchParams } from "@/lib/experiments/compare-url";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{
    ids?: string | string[];
    baseline?: string | string[];
  }>;
}) {
  const selection = parseCompareSearchParams(await searchParams);
  return (
    <AuthGate>
      <ExperimentCompare initialSelection={selection} />
    </AuthGate>
  );
}
```

- [ ] **Step 5: Run focused tests, all domain tests, type-check, and build**

Run:

```bash
npm test -- components/experiments/__tests__/ExperimentCompare.test.tsx lib/experiments/__tests__/compare.test.ts lib/experiments/__tests__/compare-url.test.ts
npx tsc --noEmit
npm run build
```

Expected: focused tests PASS; TypeScript exits 0; build lists `/experiments/compare` and exits 0 without a missing `useSearchParams` Suspense error.

- [ ] **Step 6: Commit**

```bash
git add components/experiments/ExperimentCompare.tsx components/experiments/__tests__/ExperimentCompare.test.tsx app/experiments/compare/page.tsx
git commit -m "feat: add shareable multi-experiment compare"
```

---

### Task 11: Replace Task Inline Cards with the Compact Experiment Knowledge Table

**Files:**
- Create: `components/experiments/TaskExperimentsPanel.tsx`
- Create: `components/experiments/__tests__/TaskExperimentsPanel.test.tsx`
- Modify: `components/TaskDetail.tsx`
- Modify: `app/task/[id]/page.tsx`
- Create: `app/task/[id]/loading.tsx`

**Interfaces:**
- Consumes: shared ExperimentTable/Create dialog, explicit compare URL state, existing Task/Member/Experiment data and Task timeline.
- Produces: Task Detail as the collaboration center with compact Experiment ID/Name/Owner/Status/Decision/Updated/Featured Metrics rows, New Experiment, Compare selected, and links to independent Experiment pages.

- [ ] **Step 1: Write the Task panel test**

Create `components/experiments/__tests__/TaskExperimentsPanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Experiment, Member, Task } from "@/lib/types";
import TaskExperimentsPanel from "@/components/experiments/TaskExperimentsPanel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const task = {
  id: "00000000-0000-4000-8000-000000000010",
  module_id: "00000000-0000-4000-8000-000000000011",
  title: "Optimize conv2d",
  status: "in_progress",
  assignees: [],
  notes: "",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T00:00:00.000Z",
} satisfies Task;

const member = {
  id: "00000000-0000-4000-8000-000000000020",
  name: "Bruce",
  initials: "BX",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
} satisfies Member;

function experiment(id: string, no: number): Experiment {
  return {
    id,
    experiment_no: no,
    task_id: task.id,
    owner_id: member.id,
    name: `run-${no}`,
    status: "analyzing",
    baseline_experiment_id: null,
    data_spec: { datasets: [] },
    object_spec: {
      model: "",
      harness: "",
      parent_harness: "",
      prompt: "",
      prompt_change: "",
      skills: [],
      tools: [],
    },
    environment_spec: {
      platform: "",
      server: "",
      devices: [],
      hardware: "",
      evaluator: "",
      revision: "",
      precision_policy: "",
    },
    config: {},
    metrics: { "pass@1": no / 10 },
    featured_metric_keys: ["pass@1"],
    result_summary: "",
    decision_outcome: null,
    decision_notes: "",
    notes: "",
    position: no,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-24T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
  };
}

describe("TaskExperimentsPanel", () => {
  it("links compact rows and builds an explicit selected comparison", () => {
    const experiments = [
      experiment("00000000-0000-4000-8000-000000000001", 1),
      experiment("00000000-0000-4000-8000-000000000002", 2),
    ];
    render(
      <TaskExperimentsPanel
        task={task}
        experiments={experiments}
        members={[member]}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0001" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0002" }));
    const compare = screen.getByRole("link", { name: "Compare selected (2)" });
    expect(compare.getAttribute("href")).toContain("/experiments/compare?ids=");
    expect(screen.getByRole("link", { name: "run-1" }).getAttribute("href")).toBe(
      "/experiments/00000000-0000-4000-8000-000000000001",
    );
  });
});
```

- [ ] **Step 2: Run the panel test and confirm red**

Run:

```bash
npm test -- components/experiments/__tests__/TaskExperimentsPanel.test.tsx
```

Expected: FAIL because `TaskExperimentsPanel` does not exist.

- [ ] **Step 3: Implement the focused Task Experiment panel**

Create `components/experiments/TaskExperimentsPanel.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Experiment,
  ExperimentListRow,
  Member,
  Task,
} from "@/lib/types";
import { serializeCompareSelection } from "@/lib/experiments/compare-url";
import CreateExperimentDialog from "@/components/experiments/CreateExperimentDialog";
import ExperimentTable from "@/components/experiments/ExperimentTable";

export default function TaskExperimentsPanel({
  task,
  experiments,
  members,
}: {
  task: Task;
  experiments: Experiment[];
  members: Member[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const rows = useMemo<ExperimentListRow[]>(() => experiments.map((experiment) => ({
    ...experiment,
    task: { id: task.id, title: task.title },
    owner: members.find((member) => member.id === experiment.owner_id) ?? null,
  })), [experiments, members, task.id, task.title]);

  useEffect(() => {
    const existing = new Set(experiments.map((experiment) => experiment.id));
    setSelectedIds((current) => new Set([...current].filter((id) => existing.has(id))));
  }, [experiments]);

  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const compareQuery = serializeCompareSelection({
    ids: [...selectedIds],
    baselineId: null,
  });

  return (
    <section className="detail-section task-experiments-section">
      <div className="detail-section-head">
        <div>
          <h2>Experiments</h2>
          <p className="field-help">Structured evidence for this Task. Open a row to edit full context.</p>
        </div>
        <div className="workspace-actions">
          <Link
            className={`btn ${selectedIds.size < 2 ? "disabled" : ""}`}
            aria-disabled={selectedIds.size < 2}
            href={selectedIds.size >= 2 ? `/experiments/compare?${compareQuery}` : `/task/${task.id}`}
            onClick={(event) => { if (selectedIds.size < 2) event.preventDefault(); }}
          >
            Compare selected ({selectedIds.size})
          </Link>
          <button type="button" className="btn primary" onClick={() => setCreateOpen(true)}>
            New experiment
          </button>
        </div>
      </div>
      <ExperimentTable
        rows={rows}
        showTask={false}
        selectable
        selectedIds={selectedIds}
        onToggle={toggle}
      />
      <CreateExperimentDialog
        open={createOpen}
        tasks={[task]}
        members={members}
        fixedTaskId={task.id}
        onClose={() => setCreateOpen(false)}
        onCreated={(experiment) => router.push(`/experiments/${experiment.id}`)}
      />
    </section>
  );
}
```

- [ ] **Step 4: Remove the inline Experiment implementation from `TaskDetail.tsx`**

Replace the import block with:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import MarkdownField from "@/components/MarkdownField";
import TaskExperimentsPanel from "@/components/experiments/TaskExperimentsPanel";
import { supabase } from "@/lib/supabase";
import { KIND_COLOR, logActivity } from "@/lib/activity";
import { STATUS_OPTIONS, statusLabel } from "@/lib/status";
import { fmtDate, relTime } from "@/lib/time";
import type { Activity, Experiment, Member, Module, Task } from "@/lib/types";
```

Delete `formatNum`, `nextPosition`, `BarChart`, `MetricsEditor`, and `ExperimentCard`. Keep `initialsFromName`, `avatarText`, `useClickOutside`, and `EditableText`.

Replace the state declarations at the start of `TaskDetail` with:

```tsx
  const [task, setTask] = useState<Task | null>(null);
  const [module, setModule] = useState<Module | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [draftNote, setDraftNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const assignRef = useClickOutside(() => setAssignOpen(false));
```

Replace `reload` with:

```tsx
  const reload = useCallback(async () => {
    if (!supabase || !id) return;
    const { data: t } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
    if (!t) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setTask(t as Task);
    const [modRes, expRes, memRes, actRes] = await Promise.all([
      supabase.from("modules").select("*").eq("id", (t as Task).module_id).maybeSingle(),
      supabase.from("experiments").select("*").eq("task_id", id).order("position"),
      supabase.from("members").select("*").order("position"),
      supabase.from("activity").select("*").eq("task_id", id).order("created_at", { ascending: false }),
    ]);
    setModule((modRes.data as Module) ?? null);
    setExperiments((expRes.data ?? []) as Experiment[]);
    setMembers((memRes.data ?? []) as Member[]);
    setActivity((actRes.data ?? []) as Activity[]);
    setLoading(false);
  }, [id]);
```

Replace the Realtime channel with:

```tsx
    const channel = client
      .channel(`task-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "experiments" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity" }, reload)
      .subscribe();
```

Delete `addExperiment`, `updateExperiment`, `deleteExperiment`, `uploadToExperiment`, `deleteAttachment`, `updateAttachment`, and the `metricKeys` memo. Keep Task mutations, assignee mutations, and `addTimelineNote`.

Delete the `err` banner, `Results at a glance` chart section, and the old inline `Experiments` section. Insert this immediately before `Activity timeline`:

```tsx
      <TaskExperimentsPanel
        task={task}
        experiments={experiments}
        members={members}
      />
```

- [ ] **Step 5: Convert the Task route to the documented Next 16 params contract**

Replace `app/task/[id]/page.tsx` with:

```tsx
import AuthGate from "@/components/AuthGate";
import TaskDetail from "@/components/TaskDetail";

export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AuthGate>
      <TaskDetail id={id} />
    </AuthGate>
  );
}
```

Create `app/task/[id]/loading.tsx`:

```tsx
export default function TaskLoading() {
  return (
    <div className="wrap">
      <p className="state-note">Loading task…</p>
    </div>
  );
}
```

- [ ] **Step 6: Verify the old inline editor is gone and the compact panel passes**

Run:

```bash
rg -n "BarChart|MetricsEditor|ExperimentCard|uploadToExperiment|metricKeys" components/TaskDetail.tsx
npm test -- components/experiments/__tests__/TaskExperimentsPanel.test.tsx components/experiments/__tests__/ExperimentTable.test.tsx
npx tsc --noEmit
npm run build
```

Expected: `rg` exits 1 with no matches; focused tests PASS; TypeScript exits 0; build lists `/task/[id]` and exits 0.

- [ ] **Step 7: Commit**

```bash
git add components/experiments/TaskExperimentsPanel.tsx components/experiments/__tests__/TaskExperimentsPanel.test.tsx components/TaskDetail.tsx app/task/[id]/page.tsx app/task/[id]/loading.tsx
git commit -m "refactor: make task experiments a compact linked table"
```

---

### Task 12: Notion-Inspired Application Shell and Workspace Styling

**Files:**
- Modify: `components/Navbar.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Create: `app/experiment-workspace.css`

**Interfaces:**
- Consumes: every route and class name from Tasks 5–11.
- Produces: warm-gray navigation, white content canvas, restrained semantic status chips, visible keyboard focus, neutral Delta, sticky and horizontally scrollable data tables, and narrow-screen behavior.

- [ ] **Step 1: Replace Navbar with the workspace navigation**

Replace `components/Navbar.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();
  const boardActive = pathname === "/" || pathname.startsWith("/task/");
  const compareActive = pathname.startsWith("/experiments/compare");
  const experimentsActive = pathname.startsWith("/experiments") && !compareActive;
  return (
    <nav className="navbar" aria-label="Primary">
      <div className="navbar-inner">
        <Link href="/" className="brand">
          <span className="brand-logo" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 2.5 L13.5 12 H2.5 Z" fill="#fff" />
              <path d="M8 6.2 L11 11.4 H5 Z" fill="var(--accent)" />
            </svg>
          </span>
          <span>
            <strong>Triton Board</strong>
            <small>Team workspace</small>
          </span>
        </Link>
        <div className="nav-section">
          <span className="nav-section-label">Project</span>
          <Link href="/" className={`nav-btn ${boardActive ? "active" : ""}`}>Task Board</Link>
          <Link href="/experiments" className={`nav-btn ${experimentsActive ? "active" : ""}`}>Experiments</Link>
          <Link href="/experiments/compare" className={`nav-btn ${compareActive ? "active" : ""}`}>Compare</Link>
          <Link href="/analytics" className={`nav-btn ${pathname === "/analytics" ? "active" : ""}`}>Analytics</Link>
        </div>
        <span className="navbar-spacer" />
        <span className="live-badge">Shared team board</span>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Mount the shell and workspace stylesheet**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import "./globals.css";
import "./experiment-workspace.css";

export const metadata: Metadata = {
  title: "Triton Board — Team Experiment Workspace",
  description: "Task-centered experiment context, evidence, comparison, and decisions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <Navbar />
          <main className="app-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Remove the decorative background and replace the old Navbar CSS**

In `app/globals.css`, replace the `body` block with:

```css
body {
  font-family: var(--sans);
  color: var(--ink);
  background: var(--paper);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
```

Replace the complete old `/* ---------- Navbar ---------- */` block through `.nav-btn.active` with:

```css
/* ---------- Application shell ---------- */
.app-shell { min-height: 100vh; display: grid; grid-template-columns: 232px minmax(0, 1fr); }
.app-content { min-width: 0; background: var(--paper); }
.navbar {
  position: sticky; top: 0; z-index: 40; height: 100vh;
  background: #f7f6f3; border-right: 1px solid #e8e6e1;
}
.navbar-inner {
  height: 100%; display: flex; flex-direction: column; gap: 18px; padding: 18px 12px;
}
.brand {
  display: flex; align-items: center; gap: 10px; padding: 4px 6px;
  color: var(--ink); text-decoration: none;
}
.brand > span:last-child { display: flex; flex-direction: column; min-width: 0; }
.brand strong { font-size: 14px; line-height: 1.3; }
.brand small { color: #787774; font-size: 11px; font-weight: 400; }
.brand-logo {
  width: 28px; height: 28px; border-radius: 6px;
  background: #37352f; display: inline-flex; align-items: center; justify-content: center;
}
.nav-section { display: flex; flex-direction: column; gap: 3px; }
.nav-section-label {
  padding: 0 8px 5px; color: #9b9a97; font-size: 11px; font-weight: 600;
  letter-spacing: .04em; text-transform: uppercase;
}
.nav-btn {
  padding: 7px 9px; border-radius: 5px; color: #5f5e5b;
  font-size: 13.5px; text-decoration: none;
}
.nav-btn:hover { background: rgba(55, 53, 47, .06); color: #37352f; }
.nav-btn.active { background: rgba(55, 53, 47, .09); color: #37352f; font-weight: 600; }
.navbar-spacer { flex: 1; }
.live-badge {
  display: flex; align-items: center; padding: 6px 8px;
  color: #787774; font-family: var(--mono); font-size: 10.5px;
}
```

Append this responsive shell rule to `app/globals.css`:

```css
@media (max-width: 860px) {
  .app-shell { display: block; }
  .app-content { min-height: calc(100vh - 52px); }
  .navbar { position: sticky; height: auto; border-right: 0; border-bottom: 1px solid #e8e6e1; }
  .navbar-inner {
    height: 52px; flex-direction: row; align-items: center; gap: 8px;
    padding: 7px 12px; overflow-x: auto;
  }
  .brand small, .nav-section-label, .live-badge { display: none; }
  .nav-section { flex-direction: row; }
  .nav-btn { white-space: nowrap; }
  .navbar-spacer { display: none; }
  .wrap { padding-inline: 18px; }
}
```

- [ ] **Step 4: Create the complete Experiment workspace stylesheet**

Create `app/experiment-workspace.css`:

```css
.workspace-page {
  width: min(1440px, 100%);
  margin: 0 auto;
  padding: 42px clamp(22px, 4vw, 64px) 96px;
}

.workspace-page a { color: inherit; }
.workspace-page-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 24px; margin-bottom: 28px;
}
.workspace-page-header h1 { margin-bottom: 8px; }
.workspace-page-header p:not(.eyebrow) {
  max-width: 720px; margin: 0; color: #787774; font-size: 14px;
}
.workspace-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.btn { text-decoration: none; }
.btn.disabled, .btn:disabled { opacity: .48; pointer-events: none; }
.btn.danger-subtle { color: var(--crit); border-color: transparent; background: transparent; }
.btn.danger-subtle:hover { border-color: color-mix(in srgb, var(--crit) 35%, #fff); background: var(--crit-soft); }
.field-help { margin: 5px 0 0; color: #9b9a97; font-size: 12px; }
.form-error { margin: 8px 0 0; color: var(--crit); font-size: 13px; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

.saved-view-tabs {
  display: flex; gap: 3px; overflow-x: auto; border-bottom: 1px solid #e9e9e7;
}
.saved-view-tabs button {
  border: 0; border-bottom: 2px solid transparent; background: transparent;
  padding: 9px 10px; color: #787774; cursor: pointer; white-space: nowrap;
}
.saved-view-tabs button:hover { color: #37352f; background: #f7f6f3; }
.saved-view-tabs button.active { color: #37352f; border-bottom-color: #37352f; font-weight: 600; }
.experiment-filter-stack { margin-bottom: 18px; }
.experiment-filter-row {
  display: grid; grid-template-columns: minmax(210px, 1.4fr) repeat(4, minmax(135px, 1fr));
  gap: 10px; padding: 14px 0;
}
.experiment-filter-row label,
.experiment-dialog label,
.experiment-properties label,
.decision-editor label,
.baseline-picker label {
  display: flex; flex-direction: column; gap: 5px; min-width: 0;
}
.experiment-filter-row label > span,
.experiment-dialog label > span,
.experiment-properties label > span,
.property-grid label > span,
.dataset-row label > span,
.stacked-field > span,
.decision-editor label > span,
.baseline-picker label > span {
  color: #787774; font-size: 11.5px; font-weight: 600;
}
.experiment-filter-row input,
.experiment-filter-row select,
.experiment-dialog input,
.experiment-dialog select,
.experiment-properties input,
.experiment-properties select,
.property-grid input,
.property-grid select,
.property-grid textarea,
.dataset-row input,
.dataset-row select,
.stacked-field textarea,
.decision-editor select,
.decision-editor textarea,
.baseline-picker input,
.baseline-picker select,
.key-value-row input,
.key-value-row select,
.metric-edit-row input {
  width: 100%; min-width: 0; border: 1px solid #dfdedb; border-radius: 4px;
  background: #fff; color: #37352f; font: inherit; font-size: 13px;
  padding: 7px 9px; outline: none;
}
.experiment-filter-row input:focus,
.experiment-filter-row select:focus,
.experiment-dialog input:focus,
.experiment-dialog select:focus,
.experiment-properties input:focus,
.experiment-properties select:focus,
.property-grid input:focus,
.property-grid select:focus,
.property-grid textarea:focus,
.dataset-row input:focus,
.dataset-row select:focus,
.stacked-field textarea:focus,
.decision-editor select:focus,
.decision-editor textarea:focus,
.baseline-picker input:focus,
.baseline-picker select:focus,
.key-value-row input:focus,
.key-value-row select:focus,
.metric-edit-row input:focus {
  border-color: #9b9a97; box-shadow: 0 0 0 2px rgba(55, 53, 47, .08);
}

.experiment-table-scroll,
.compare-table-scroll {
  overflow: auto; border: 1px solid #e9e9e7; border-radius: 5px; background: #fff;
}
.experiment-table { min-width: 980px; }
.experiment-table th,
.experiment-table td,
.compare-table th,
.compare-table td {
  border-bottom: 1px solid #eeeeec; padding: 10px 12px; vertical-align: middle;
}
.experiment-table th,
.compare-table th {
  background: #fbfbfa; color: #787774; font-size: 10.5px;
  font-weight: 600; letter-spacing: .04em; text-transform: none;
}
.experiment-table tbody tr:hover,
.compare-table tbody tr:hover { background: #fbfbfa; }
.select-column { width: 36px; text-align: center; }
.experiment-id-cell,
.experiment-display-id,
.experiment-updated { color: #787774; font-family: var(--mono); font-size: 11px; white-space: nowrap; }
.experiment-name-link { color: #37352f; font-weight: 600; text-decoration: none; }
.experiment-name-link:hover { text-decoration: underline; }
.owner-inline { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.featured-metrics { display: flex; gap: 5px; flex-wrap: wrap; }
.featured-metrics > span {
  border-radius: 4px; background: #f1f1ef; padding: 2px 6px;
  font-family: var(--mono); font-size: 10.5px; white-space: nowrap;
}
.experiment-empty {
  border: 1px dashed #dfdedb; border-radius: 5px; padding: 28px;
  color: #9b9a97; text-align: center;
}

.experiment-status {
  display: inline-flex; border-radius: 999px; padding: 2px 8px;
  font-size: 11px; font-weight: 600; white-space: nowrap;
}
.experiment-status-planned { color: #5f5e5b; background: #eeeeec; }
.experiment-status-running { color: #6940a5; background: #f0e8f8; }
.experiment-status-analyzing { color: #24567a; background: #e7f3f8; }
.experiment-status-completed { color: #2b593f; background: #e7f0eb; }
.experiment-status-blocked { color: #9f6b00; background: #fbecdd; }
.experiment-status-cancelled { color: #9b3b38; background: #f8e6e5; }

.dialog-backdrop {
  position: fixed; inset: 0; z-index: 100; display: grid; place-items: center;
  padding: 20px; background: rgba(15, 15, 15, .28);
}
.experiment-dialog {
  width: min(520px, 100%); max-height: calc(100vh - 40px); overflow: auto;
  border: 1px solid #dfdedb; border-radius: 8px; background: #fff;
  box-shadow: 0 18px 60px rgba(15, 15, 15, .18); padding: 20px;
}
.experiment-dialog > header {
  display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px;
}
.experiment-dialog h2 { margin: 0; font-size: 20px; }
.experiment-dialog .eyebrow { margin-bottom: 5px; }
.experiment-dialog form { display: flex; flex-direction: column; gap: 13px; }
.experiment-dialog footer {
  display: flex; justify-content: flex-end; gap: 8px; margin: 8px 0 0;
  font-family: inherit; text-align: initial;
}
.dialog-help { color: #787774; font-size: 12px; margin: 0; }
.baseline-confirmation { padding: 10px 12px; border-radius: 5px; background: #f7f6f3; font-weight: 600; }

.experiment-detail-page {
  display: grid; grid-template-columns: minmax(0, 1fr) 280px;
  gap: clamp(28px, 4vw, 56px); align-items: start;
}
.experiment-main-column { min-width: 0; }
.experiment-detail-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 20px; padding-bottom: 18px; border-bottom: 1px solid #e9e9e7;
}
.experiment-title-line { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
.experiment-title-input {
  width: 100%; border: 0; outline: none; background: transparent;
  color: #37352f; font: inherit; font-size: clamp(25px, 4vw, 36px);
  font-weight: 650; letter-spacing: -.025em;
}
.experiment-title-input:focus { box-shadow: inset 0 -1px #9b9a97; }
.experiment-properties {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px 18px; margin: 18px 0 28px; padding: 14px 0;
}
.experiment-properties > div { display: flex; flex-direction: column; gap: 5px; }
.experiment-properties > div > span { color: #787774; font-size: 11.5px; font-weight: 600; }
.baseline-picker { grid-column: span 2; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.baseline-picker .context-warning { grid-column: 1 / -1; }
.context-warning {
  margin: 0; border-left: 3px solid var(--warn); background: #fbecdd;
  color: #815500; padding: 7px 9px; font-size: 12px;
}

.experiment-section {
  display: grid; grid-template-columns: 180px minmax(0, 1fr);
  gap: 28px; padding: 28px 0; border-top: 1px solid #e9e9e7;
}
.experiment-section-heading h2 { margin: 0 0 5px; font-size: 16px; }
.experiment-section-heading p { margin: 0; color: #9b9a97; font-size: 12px; }
.experiment-section-body { min-width: 0; }
.structured-editor { display: flex; flex-direction: column; gap: 12px; }
.dataset-row {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px;
  margin: 0; padding: 14px; border: 1px solid #e9e9e7; border-radius: 5px;
}
.dataset-row legend { padding: 0 5px; color: #787774; font-size: 11px; font-weight: 600; }
.dataset-row label { display: flex; flex-direction: column; gap: 4px; }
.dataset-row .danger-subtle { justify-self: start; }
.property-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.property-grid label { display: flex; flex-direction: column; gap: 4px; }
.property-grid textarea { min-height: 82px; resize: vertical; }
.property-span-2 { grid-column: span 2; }
.key-value-editor, .metric-editor { display: flex; flex-direction: column; gap: 8px; }
.key-value-row { display: grid; grid-template-columns: 1fr 100px 1fr 30px; gap: 7px; }
.metric-edit-row { display: grid; grid-template-columns: 1fr 140px auto 30px; gap: 7px; align-items: center; }
.featured-toggle { display: inline-flex; gap: 5px; align-items: center; color: #787774; font-size: 11px; }
.result-editor { display: flex; flex-direction: column; gap: 18px; }
.stacked-field { display: flex; flex-direction: column; gap: 5px; }
.stacked-field textarea, .decision-editor textarea { min-height: 110px; resize: vertical; }
.stacked-field textarea.long-note { min-height: 220px; font-family: var(--mono); font-size: 12.5px; }
.decision-editor { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 12px; align-items: start; }

.attachment-gallery { margin-top: 22px; padding-top: 18px; border-top: 1px solid #eeeeec; }
.attachment-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.experiment-image-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px; margin-top: 12px;
}
.experiment-image-grid figure { margin: 0; border: 1px solid #e9e9e7; border-radius: 5px; overflow: hidden; }
.experiment-image-grid img { display: block; width: 100%; height: 140px; object-fit: cover; background: #f7f6f3; }
.experiment-image-grid figcaption { display: flex; align-items: center; gap: 5px; padding: 7px; }
.experiment-image-grid figcaption input { min-width: 0; flex: 1; border: 0; outline: none; font: inherit; font-size: 12px; }

.baseline-summary { margin-top: 28px; padding: 20px; border: 1px solid #dfdedb; border-radius: 6px; }
.baseline-summary > header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
}
.baseline-summary h2 { margin: 0; font-size: 17px; }
.baseline-summary .eyebrow { margin-bottom: 4px; }
.baseline-reference, .baseline-chip {
  border-radius: 4px; background: #f1f1ef; padding: 3px 7px; font-size: 11px; white-space: nowrap;
}
.baseline-metric-grid {
  display: grid; grid-template-columns: minmax(120px, 1fr) repeat(3, minmax(90px, .65fr));
  margin: 16px 0; border-top: 1px solid #eeeeec; border-left: 1px solid #eeeeec;
}
.baseline-grid-head {
  padding: 7px 9px; border-right: 1px solid #eeeeec; border-bottom: 1px solid #eeeeec;
  background: #fbfbfa; color: #787774; font-size: 10.5px; font-weight: 600;
}
.baseline-grid-row { display: contents; }
.baseline-grid-row > * {
  padding: 8px 9px; border-right: 1px solid #eeeeec; border-bottom: 1px solid #eeeeec; font-size: 12px;
}
.neutral-delta { color: #5f5e5b; font-family: var(--mono); }
.baseline-summary details summary { cursor: pointer; font-size: 12px; font-weight: 600; }
.context-difference-list { margin-top: 8px; border-top: 1px solid #eeeeec; }
.context-difference-list > div {
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;
  padding: 7px 0; border-bottom: 1px solid #eeeeec; font-size: 12px;
}

.experiment-save-bar {
  position: sticky; bottom: 14px; z-index: 20; display: flex; align-items: center;
  justify-content: flex-end; gap: 8px; margin-top: 24px; padding: 10px 12px;
  border: 1px solid #dfdedb; border-radius: 6px; background: rgba(255, 255, 255, .94);
  box-shadow: 0 8px 30px rgba(15, 15, 15, .1); backdrop-filter: blur(8px);
}
.experiment-save-bar > span { margin-right: auto; color: #787774; font-size: 12px; }
.conflict-banner, .validation-summary {
  display: flex; justify-content: space-between; gap: 16px; margin-bottom: 16px;
  border: 1px solid #e7c889; border-radius: 5px; background: #fff7e8; padding: 12px;
  color: #6f5000; font-size: 13px;
}
.conflict-banner p { margin: 3px 0 0; }
.validation-summary { display: block; }
.validation-summary ul { margin: 7px 0 0; padding-left: 20px; }

.experiment-timeline {
  position: sticky; top: 28px; max-height: calc(100vh - 56px); overflow: auto;
  border-left: 1px solid #e9e9e7; padding-left: 22px;
}
.experiment-timeline h2 { margin: 0; font-size: 15px; }
.timeline-note-form { display: flex; flex-direction: column; gap: 7px; margin: 14px 0 18px; }
.timeline-note-form textarea {
  min-height: 72px; resize: vertical; border: 1px solid #dfdedb; border-radius: 4px;
  padding: 7px; font: inherit; font-size: 12px;
}
.timeline-note-form .btn { align-self: flex-end; }

.compare-page { width: 100%; }
.compare-controls {
  display: flex; align-items: end; gap: 12px; flex-wrap: wrap;
  margin-bottom: 16px; padding: 13px; border: 1px solid #e9e9e7;
  border-radius: 5px; background: #fbfbfa;
}
.compare-picker { display: flex; gap: 6px; }
.compare-controls select {
  min-width: 210px; border: 1px solid #dfdedb; border-radius: 4px;
  background: #fff; padding: 7px 8px; font: inherit; font-size: 12px;
}
.compare-controls > label { display: flex; flex-direction: column; gap: 4px; color: #787774; font-size: 11px; }
.compare-controls .diff-toggle { flex-direction: row; align-items: center; padding-bottom: 7px; }
.compare-groups { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; margin-left: auto; }
.compare-groups label { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #5f5e5b; }
.compare-table { width: max-content; min-width: 100%; }
.compare-table th, .compare-table td { min-width: 145px; max-width: 260px; overflow-wrap: anywhere; }
.compare-table th small { display: block; margin-top: 2px; color: #9b9a97; font-weight: 400; }
.compare-table .compare-identity {
  position: sticky; left: 0; z-index: 2; min-width: 230px; background: #fff;
  box-shadow: 1px 0 #e9e9e7;
}
.compare-table thead .compare-identity { z-index: 3; background: #fbfbfa; }
.compare-table .compare-identity > * { display: block; margin-bottom: 3px; }
.compare-table .compare-identity a { font-family: var(--mono); font-size: 11px; color: #787774; }
.baseline-row td { background: #fbfbfa; }
.baseline-row .compare-identity { background: #fbfbfa; }
.remove-compare {
  border: 0; background: transparent; color: #9b9a97; padding: 0;
  font-size: 10px; cursor: pointer;
}
.remove-compare:hover { color: var(--crit); }

.task-experiments-section .detail-section-head { justify-content: space-between; align-items: flex-start; }
.task-experiments-section .detail-section-head h2 { margin-bottom: 3px; }

@media (max-width: 1120px) {
  .experiment-filter-row { grid-template-columns: repeat(3, minmax(150px, 1fr)); }
  .experiment-detail-page { grid-template-columns: 1fr; }
  .experiment-timeline {
    position: static; max-height: none; border-left: 0; border-top: 1px solid #e9e9e7;
    padding: 26px 0 0;
  }
}

@media (max-width: 760px) {
  .workspace-page { padding: 26px 16px 80px; }
  .workspace-page-header, .experiment-detail-header { flex-direction: column; }
  .experiment-filter-row { grid-template-columns: 1fr; }
  .experiment-properties { grid-template-columns: 1fr 1fr; }
  .baseline-picker { grid-column: 1 / -1; grid-template-columns: 1fr; }
  .experiment-section { grid-template-columns: 1fr; gap: 12px; }
  .dataset-row, .property-grid { grid-template-columns: 1fr; }
  .property-span-2 { grid-column: auto; }
  .key-value-row { grid-template-columns: 1fr 90px; }
  .key-value-row > :nth-child(3) { grid-column: 1 / -1; }
  .metric-edit-row { grid-template-columns: 1fr 100px; }
  .decision-editor { grid-template-columns: 1fr; }
  .baseline-summary > header { flex-direction: column; }
  .baseline-metric-grid { grid-template-columns: minmax(100px, 1fr) repeat(3, minmax(72px, .7fr)); overflow-x: auto; }
  .compare-groups { width: 100%; margin-left: 0; }
}
```

- [ ] **Step 5: Run automated visual-structure checks**

Run:

```bash
rg -n "background-image: radial-gradient" app/globals.css
rg -n "app-shell|experiment-detail-page|compare-table-scroll|neutral-delta" app/globals.css app/experiment-workspace.css app/layout.tsx
npm test
npx tsc --noEmit
npm run build
```

Expected: the first `rg` exits 1; the second finds every required shell/table class; all tests PASS; TypeScript and build exit 0.

- [ ] **Step 6: Perform keyboard and responsive acceptance against a non-production Supabase project**

Run `npm run dev`, then verify:

1. At 1440px, the warm-gray sidebar remains visible, Experiment Detail uses content plus Timeline columns, and Compare pins the Experiment identity column while horizontally scrolling fields.
2. At 760px and 390px, navigation becomes horizontal, tables retain horizontal scroll, forms stack, and no editor is clipped.
3. Tab through Navbar, saved views, filters, table links/checkboxes, all seven editor sections, save controls, Timeline, and Compare controls; focus remains visible.
4. Status is never conveyed by color alone because every chip includes its text.
5. Positive and negative Delta both use `.neutral-delta`; neither receives success/danger coloring.

Expected: all five checks pass without changing stored data in production.

- [ ] **Step 7: Commit**

```bash
git add components/Navbar.tsx app/layout.tsx app/globals.css app/experiment-workspace.css
git commit -m "style: add notion-inspired experiment workspace"
```

---

### Task 13: Documentation, Data-Integrity Gate, and Phase 1 Acceptance

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: completed Tasks 1–12.
- Produces: accurate operating documentation, staging evidence, final automated verification, and a safe production rollout checklist.

- [ ] **Step 1: Update migration and data-model documentation**

In `README.md`, extend the numbered migration list with:

```markdown
6. `0006_experiment_workspace.sql` — structured Experiment context, Owner/Status/Baseline,
   Result/Decision fields, lifecycle timestamps, Experiment Activity linkage, indexes, and
   transaction-safe anonymous Activity triggers
```

Replace the `experiments` and `activity` rows in the Data model table with:

```markdown
| `experiments` | `experiment_no`, `task_id`, `owner_id`, `status`, explicit `baseline_experiment_id`, structured `data_spec` / `object_spec` / `environment_spec` / `config`, numeric `metrics`, `featured_metric_keys`, `result_summary`, `decision_outcome`, `decision_notes`, Markdown `notes`, lifecycle timestamps |
| `activity` | `task_id`, nullable `experiment_id`, `text`, `kind`, timestamp — automatic Experiment events are anonymous because the Board uses one shared team account |
```

Add this section after the Data model table:

````markdown
## Task + Experiment workflow

The current Board represents one Project:

```text
Project
└── Task
    └── Experiment
```

- Task is the collaboration and progress unit.
- Experiment is manually recorded evidence under exactly one Task.
- New Experiments require Name and Owner and start as `planned`.
- Before `running`, record at least one Dataset, a Model, NPU/GPU plus Server or Device,
  and at least one Config property (or `profile: "defaults"`).
- Before `analyzing`, record a numeric Metric or Result Summary.
- Before `completed`, record runnable context, Result, and Decision Outcome.
- Duplicate copies Task, Owner, Data, Object, Environment, and Config; it clears Result,
  Decision, Note, attachments, timeline, and run times. The Source is shown explicitly as
  the new Baseline.
- Baseline is never guessed. Without an explicit Baseline, Triton Board shows no Delta.
- Delta is always `current - baseline`, is derived at render time, and has no automatic
  good/bad interpretation.

Routes:

- `/` — Task Board
- `/task/[id]` — Task Detail with compact Experiment table
- `/experiments` — global Experiment database and saved views
- `/experiments/[id]` — full Experiment record and one-to-one Baseline summary
- `/experiments/compare?ids=<uuid>,<uuid>&baseline=<uuid>` — shareable multi-run comparison
- `/analytics` — existing Task analytics

Experiment edits use optimistic concurrency on `updated_at`. If a remote change arrives while
the form is dirty, the local draft is preserved and saving is blocked until the latest version
is loaded and the edit is reapplied.
````

- [ ] **Step 2: Run the complete automated verification gate**

Invoke `superpowers:verification-before-completion`, then run fresh:

```bash
npm test
npx tsc --noEmit
npm run build
git diff --check
git status --short
```

Expected:

- Every Vitest file passes.
- TypeScript exits 0.
- Next build exits 0 and lists `/`, `/task/[id]`, `/experiments`, `/experiments/[id]`, `/experiments/compare`, and `/analytics`.
- `git diff --check` emits no output.
- `git status --short` contains only intended implementation and documentation paths in the feature worktree.

- [ ] **Step 3: Run staging migration and preservation checks**

Back up the staging database, apply migration `0006`, and run:

```bash
psql "$TEST_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0006_experiment_workspace.sql
```

Compare pre/post snapshots with:

```sql
select count(*) from experiments;
select count(*) from attachments;
select id, name, notes, metrics from experiments order by id;
select id, experiment_id, url, path, caption from attachments order by id;
```

Expected: verification rolls back its fixture; legacy Experiment and Attachment counts and stored values remain identical; only additive/backfilled Experiment columns differ.

- [ ] **Step 4: Run the full Phase 1 UI acceptance on staging**

Use two authenticated browser windows and complete this exact sequence:

1. From Task Detail, create a named Experiment with an Owner; confirm status `Planned`, a generated `EXP-####` ID, and an automatic `Experiment created` event.
2. Fill Data, Object, Environment, and Config; move to `Running`; confirm `started_at` appears once.
3. Attempt `Analyzing` without a Result; confirm the transition is blocked with a field-specific message.
4. Add manual metrics, feature at least one metric, add Result Summary, upload a plot, edit its caption, and move to `Analyzing`.
5. Attempt `Completed` without Decision; confirm it is blocked. Add Outcome and Decision Notes, complete it, and confirm `completed_at`.
6. Reopen the completed row to `Analyzing`; confirm `completed_at` clears while the original `started_at` remains.
7. Duplicate the Experiment; confirm Source is visibly the Baseline, context is copied, Owner can be changed, and Result/Decision/Note/attachments/times are empty.
8. On the duplicate, change one Config value and one Metric; confirm the one-to-one summary identifies the Config difference and computes `current - baseline` without green/red interpretation.
9. Clear Baseline; confirm every Delta disappears. Choose a cross-Task Baseline; confirm the selector discloses Task and context differences.
10. Select at least 20 Experiments on Dedicated Compare; confirm every selected row renders, Baseline pins first, field groups toggle, `Diff only` hides identical fields, the identity column stays fixed, and the copied URL reproduces the state.
11. In browser A, make an unsaved Note edit. In browser B, update the same Experiment and save. Confirm browser A preserves its draft, shows the remote-change warning, and cannot silently overwrite browser B.
12. Confirm Task Timeline contains automatic Experiment events through shared `task_id`, while Experiment Timeline contains only that Experiment's events and never claims a human Actor.
13. Delete a Baseline Experiment; confirm referencing rows receive `baseline_experiment_id = null` and Delta disappears.
14. Confirm Running, Blocked, Needs Decision, and Recently Completed saved views return only real rows matching their definitions.
15. Confirm no Task status changes as a side effect of an Experiment Decision.

Expected: all 15 checks pass against staging.

- [ ] **Step 5: Commit the documentation**

```bash
git add README.md
git commit -m "docs: document experiment workspace workflow"
```

- [ ] **Step 6: Prepare, but do not execute, production rollout**

Provide the maintainer this order:

1. Take a Production database backup.
2. Run `npm run db:migrate` with the Production `SUPABASE_DB_URL`.
3. Re-run count/value spot checks for Experiments and Attachments.
4. Deploy the verified Web commit.
5. Smoke-test Create, Duplicate, Realtime, Baseline, Compare, and legacy attachments.
6. If the UI must roll back, deploy the previous Web version and retain additive database fields; do not drop `0006` columns or constraints.

Expected: no Production command is run by the implementation agent without a new explicit maintainer request.
