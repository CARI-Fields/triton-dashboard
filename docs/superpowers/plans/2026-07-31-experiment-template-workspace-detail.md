# Experiment Template Workspace — Phase 3 (Field Table Detail, Autosave, Versions, Archive) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Experiment Detail for Template Experiments as one vertical column of Field Tables with typed cell editing, per-cell autosave with revision conflicts, grouped Version History with restore, Required-gated Archive/Unarchive, and Template-aware Duplicate with Field selection.

**Architecture:** All mutations go through atomic `security invoker` Postgres functions that validate type/archive/Required rules, bump `core_revision`, and append an immutable `experiment_versions` snapshot (with an `edit_session_id` grouping mechanism). The browser renders the live Template schema joined with current Values; editing a cell commits through `save_experiment_value`, conflicts surface "Keep remote / Replace with mine", and Archive is a DB-enforced Required-value gate. Legacy Experiments (`template_id is null`) keep the existing Detail surface untouched until Phase 6 cutover.

**Tech Stack:** Supabase Postgres functions + pgTAP, Next.js 16 client components, TypeScript, Vitest + Testing Library (fireEvent; `@testing-library/user-event` is not installed).

---

## Global Constraints

- Work only in `.worktrees/experiment-template-workspace` on `feat/experiment-template-workspace` (already checked out; do not switch branches).
- Authoritative design: `docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md` — read "Experiment Detail", "Autosave", "Concurrency", "Version History", "Archive", "Duplicate", and "Test and Acceptance Plan" before starting.
- Phases 1-2 are committed on this branch (8 tables, template mutation functions, Template Manager, create-flow Template requirement). Reuse them; never modify Phase 1/2 migrations.
- Every Experiment mutation goes through the new functions (`save_experiment_value`, `sync_experiment_attachment_value`, `save_experiment_core`, `archive_experiment`, `unarchive_experiment`, `restore_experiment_version`, `duplicate_experiment`). Every successful mutation bumps `core_revision` and appends one immutable `experiment_versions` row.
- No version is deleted or rewritten. Restore is always a new forward mutation on unarchived Experiments.
- Legacy Experiments (`template_id is null`) keep the current Detail flow. The new surface renders only when `template_id` is set.
- House patterns: pgTAP in `supabase/tests/NNNN_<name>.sql`, Vitest under `**/__tests__/**/*.test.{ts,tsx}`, migrations via `npx supabase migration new <name>`, commit after every task.
- Next.js 16 (AGENTS.md): before UI tasks, re-read `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` + `01-getting-started/04-linking-and-navigating.md`. The Detail route already awaits async `params` (house pattern).
- Node: run Vitest/tsc/build with `PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH`. `npx supabase ...` needs `require_escalated` (rule exists).
- `npx tsc --noEmit` has pre-existing failures in unrelated test files; the gate is zero NEW type errors.

## Planned File Structure

Create:
- `supabase/tests/0018_experiment_template_workspace_values.sql` (Task 1)
- `supabase/migrations/<timestamp>_experiment_template_workspace_values.sql` (Task 2)
- `lib/experiments/values.ts` (Task 3)
- `lib/experiments/__tests__/values.test.ts` (Task 3)
- `components/experiments/TemplateExperimentDetail.tsx` (Task 4)
- `components/experiments/TemplateFieldTables.tsx` (Task 4)
- `components/experiments/ValueEditor.tsx` (Task 4)
- `components/experiments/__tests__/TemplateExperimentDetail.test.tsx` (Task 4)
- `components/experiments/ExperimentVersionDrawer.tsx` (Task 5)
- `components/experiments/__tests__/ExperimentVersionDrawer.test.tsx` (Task 5)

Modify:
- `components/experiments/ExperimentDetail.tsx` — early return to `TemplateExperimentDetail` when `template_id` is set (Task 4)
- `components/experiments/DuplicateExperimentDialog.tsx` — Field selection + value copying for Template Experiments (Task 6)
- `components/experiments/AttachmentGallery.tsx` — accept `templateKeyId` scope (Task 4)
- `lib/experiments/repository.ts` — expose `duplicateTemplateExperiment`/values helpers as needed (Task 6)
- existing tests as needed (Task 4/6)

**Database objects produced (Task 2, all `public`):**

`save_experiment_value(p_experiment_id uuid, p_key_id uuid, p_expected_cell_revision bigint, p_value jsonb, p_edit_session_id uuid)` — typed cell save for short_text/long_text/number/boolean/date_time/url/single_select/multi_select; `null` clears; stale revision returns `{status:'conflict', remote, remote_cell_revision}` (never raises); bumps `core_revision`; writes version snapshot.

`sync_experiment_attachment_value(p_experiment_id uuid, p_key_id uuid, p_active_attachment_ids uuid[], p_edit_session_id uuid)` — atomically soft-archives removed attachments, maintains the parent cell revision, bumps `core_revision`, writes snapshot.

`save_experiment_core(p_experiment_id uuid, p_name text, p_owner_id uuid, p_status text, p_edit_session_id uuid)` — Name/Owner/Status edit with status whitelist, `core_revision` bump, snapshot.

`archive_experiment(p_experiment_id uuid)` / `unarchive_experiment(p_experiment_id uuid)` — Required-value gate on archive; both bump `core_revision` and write snapshots.

`restore_experiment_version(p_experiment_id uuid, p_version_no bigint)` — maps snapshot Values by stable Key UUID into the current Template (active Keys only), restores Name/Owner/Status, unarchives referenced Attachments, writes a new "Restored from version N" snapshot.

`duplicate_experiment(p_source_id uuid, p_name text, p_owner_id uuid, p_position double precision, p_key_ids uuid[], p_edit_session_id uuid)` — new Experiment on the same Template, copies selected non-attachment Values, no Attachments, no history; writes the new record's first snapshot.

`_experiment_snapshot(p_experiment_id uuid)` — private snapshot builder (Values keyed by stable Key UUID + attachments + core fields); execute revoked from clients.

`_value_payload(p_row public.experiment_values, p_type text)` — private typed-value serializer for conflict responses; execute revoked.

---

### Task 1: Write the failing pgTAP test for Experiment value functions

**Files:**
- Create: `supabase/tests/0018_experiment_template_workspace_values.sql`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0018_experiment_template_workspace_values.sql`:

```sql
begin;
select plan(41);

-- Privileges -----------------------------------------------------------------
select ok(
  has_function_privilege('authenticated', 'public.save_experiment_value(uuid,uuid,bigint,jsonb,uuid)', 'execute'),
  'authenticated can save Experiment Values'
);
select ok(
  has_function_privilege('authenticated', 'public.archive_experiment(uuid)', 'execute'),
  'authenticated can archive Experiments'
);
select ok(
  has_function_privilege('authenticated', 'public.restore_experiment_version(uuid,bigint)', 'execute'),
  'authenticated can restore versions'
);
select ok(
  not has_function_privilege('anon', 'public.save_experiment_value(uuid,uuid,bigint,jsonb,uuid)', 'execute'),
  'anon cannot save Experiment Values'
);
select ok(
  not has_function_privilege('authenticated', 'public._experiment_snapshot(uuid)', 'execute'),
  'authenticated cannot call the snapshot helper'
);

-- Setup -----------------------------------------------------------------------
insert into public.modules (id, name, kind)
values ('10000000-0000-4000-8000-000000000003', 'Value test module', 'pipeline');
insert into public.tasks (id, module_id, title)
values ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Value test task');
insert into public.experiment_templates (id, name)
values ('30000000-0000-4000-8000-000000000020', 'Value Benchmark');
insert into public.experiments (id, task_id, template_id, name)
values (
  '60000000-0000-4000-8000-000000000020',
  '20000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000020',
  'Value Benchmark'
);

select public.save_experiment_template(
  '30000000-0000-4000-8000-000000000020', 'Value Benchmark', '', 1,
  $$[{
    "id": "40000000-0000-4000-8000-000000000020",
    "label": "Metrics",
    "color_token": "blue",
    "position": 1,
    "keys": [
      {"id": "50000000-0000-4000-8000-000000000020", "key": "pass@1", "value_type": "number", "required": true, "position": 1, "archived": false, "options": []},
      {"id": "50000000-0000-4000-8000-000000000021", "key": "device", "value_type": "single_select", "required": false, "position": 2, "archived": false, "options": [
        {"id": "70000000-0000-4000-8000-000000000020", "label": "npu:1", "position": 1, "archived": false}
      ]},
      {"id": "50000000-0000-4000-8000-000000000022", "key": "tags", "value_type": "multi_select", "required": false, "position": 3, "archived": false, "options": [
        {"id": "70000000-0000-4000-8000-000000000021", "label": "fast", "position": 1, "archived": false},
        {"id": "70000000-0000-4000-8000-000000000022", "label": "fp8", "position": 2, "archived": false}
      ]},
      {"id": "50000000-0000-4000-8000-000000000023", "key": "notes", "value_type": "long_text", "required": false, "position": 4, "archived": false, "options": []},
      {"id": "50000000-0000-4000-8000-000000000024", "key": "log_url", "value_type": "url", "required": false, "position": 5, "archived": false, "options": []},
      {"id": "50000000-0000-4000-8000-000000000025", "key": "plot", "value_type": "attachment", "required": false, "position": 6, "archived": false, "options": []}
    ]
  }]$$::jsonb
);

-- Scalar save ------------------------------------------------------------------
select is(
  (select public.save_experiment_value(
    '60000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000020',
    0,
    '0.73'::jsonb,
    '80000000-0000-4000-8000-000000000020'
  )->>'status'),
  'ok',
  'saving a Number Value returns ok'
);
select is(
  (select number_value from public.experiment_values
   where experiment_id = '60000000-0000-4000-8000-000000000020'
     and key_id = '50000000-0000-4000-8000-000000000020'),
  0.73::double precision,
  'Number Value is stored typed'
);
select is(
  (select core_revision::int from public.experiments
   where id = '60000000-0000-4000-8000-000000000020'),
  2,
  'a successful cell save bumps core_revision'
);
select is(
  (select version_no::int from public.experiment_versions
   where experiment_id = '60000000-0000-4000-8000-000000000020'),
  1,
  'a cell save writes version 1'
);
select is(
  (select edit_session_id from public.experiment_versions
   where experiment_id = '60000000-0000-4000-8000-000000000020'),
  '80000000-0000-4000-8000-000000000020'::uuid,
  'version records the edit session'
);
select is(
  (select snapshot->'values'->'50000000-0000-4000-8000-000000000020'->>'value'
   from public.experiment_versions
   where experiment_id = '60000000-0000-4000-8000-000000000020'),
  '0.73',
  'snapshot stores the typed Value keyed by stable Key UUID'
);

-- Conflict, validation, clear -----------------------------------------------------
select is(
  (select public.save_experiment_value(
    '60000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000020',
    0,
    '0.9'::jsonb,
    '80000000-0000-4000-8000-000000000020'
  )->>'status'),
  'conflict',
  'a stale cell revision returns conflict instead of raising'
);
select is(
  (select public.save_experiment_value(
    '60000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000020',
    1,
    '0.9'::jsonb,
    '80000000-0000-4000-8000-000000000020'
  )->>'cell_revision'),
  '2',
  'a matching revision commits and increments the cell revision'
);
select throws_ok(
  $$select public.save_experiment_value(
    '60000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000020',
    2,
    '"NaN"'::jsonb,
    '80000000-0000-4000-8000-000000000020'
  )$$,
  'P0001',
  'VALUE_TYPE_MISMATCH',
  'non-numeric payloads are rejected for Number Keys'
);
select throws_ok(
  $$select public.save_experiment_value(
    '60000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000024',
    0,
    '"not-a-url"'::jsonb,
    '80000000-0000-4000-8000-000000000020'
  )$$,
  'P0001',
  'URL_REQUIRED',
  'URL Values must be absolute http(s) URLs'
);
select is(
  (select public.save_experiment_value(
    '60000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000020',
    2,
    null,
    '80000000-0000-4000-8000-000000000020'
  )->>'status'),
  'ok',
  'clearing a Value succeeds'
);
select is(
  (select count(*)::int from public.experiment_values
   where experiment_id = '60000000-0000-4000-8000-000000000020'
     and key_id = '50000000-0000-4000-8000-000000000020'),
  0,
  'an empty cell removes the row'
);

-- Select and multi-select ---------------------------------------------------------
select is(
  (select public.save_experiment_value(
    '60000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000021',
    0,
    '"70000000-0000-4000-8000-000000000020"'::jsonb,
    '80000000-0000-4000-8000-000000000020'
  )->>'status'),
  'ok',
  'single-select save succeeds'
);
select throws_ok(
  $$select public.save_experiment_value(
    '60000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000021',
    1,
    '"70000000-0000-4000-8000-000000000099"'::jsonb,
    '80000000-0000-4000-8000-000000000020'
  )$$,
  'P0001',
  'OPTION_INVALID',
  'single-select rejects an unknown option'
);
select is(
  (select public.save_experiment_value(
    '60000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000022',
    0,
    '["70000000-0000-4000-8000-000000000021","70000000-0000-4000-8000-000000000022"]'::jsonb,
    '80000000-0000-4000-8000-000000000020'
  )->>'status'),
  'ok',
  'multi-select save succeeds'
);
select is(
  (select count(*)::int from public.experiment_value_options
   where experiment_id = '60000000-0000-4000-8000-000000000020'
     and key_id = '50000000-0000-4000-8000-000000000022'),
  2,
  'multi-select stores both options'
);
select is(
  (select public.save_experiment_value(
    '60000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000022',
    1,
    '[]'::jsonb,
    '80000000-0000-4000-8000-000000000020'
  )->>'status'),
  'ok',
  'emptying a multi-select succeeds'
);
select is(
  (select count(*)::int from public.experiment_values
   where experiment_id = '60000000-0000-4000-8000-000000000020'
     and key_id = '50000000-0000-4000-8000-000000000022'),
  0,
  'an empty multi-select removes the parent row'
);

-- Attachment sync ------------------------------------------------------------------
insert into public.attachments (
  id, task_id, experiment_id, url, path, caption, position, template_key_id
) values (
  '90000000-0000-4000-8000-000000000020',
  '20000000-0000-4000-8000-000000000003',
  '60000000-0000-4000-8000-000000000020',
  'https://storage.test/plot.png',
  'task/experiment/plot.png',
  'Latency plot',
  0,
  '50000000-0000-4000-8000-000000000025'
);
select is(
  (select public.sync_experiment_attachment_value(
    '60000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000025',
    array['90000000-0000-4000-8000-000000000020'::uuid],
    '80000000-0000-4000-8000-000000000020'
  )->>'status'),
  'ok',
  'attachment sync succeeds'
);
select is(
  (select count(*)::int from public.experiment_values
   where experiment_id = '60000000-0000-4000-8000-000000000020'
     and key_id = '50000000-0000-4000-8000-000000000025'),
  1,
  'attachment sync creates the parent cell row'
);
select is(
  (select public.sync_experiment_attachment_value(
    '60000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000025',
    array[]::uuid[],
    '80000000-0000-4000-8000-000000000020'
  )->>'status'),
  'ok',
  'removing the last attachment succeeds'
);
select is(
  (select archived_at is not null from public.attachments
   where id = '90000000-0000-4000-8000-000000000020'),
  true,
  'removed attachments are soft-archived, not deleted'
);
select is(
  (select count(*)::int from public.experiment_values
   where experiment_id = '60000000-0000-4000-8000-000000000020'
     and key_id = '50000000-0000-4000-8000-000000000025'),
  0,
  'an empty attachment set removes the parent cell row'
);

-- Archive gating -------------------------------------------------------------------
select throws_ok(
  $$select public.archive_experiment('60000000-0000-4000-8000-000000000020')$$,
  'P0001',
  'REQUIRED_VALUES_MISSING',
  'archive is blocked while a Required Value is empty'
);
select is(
  (select public.save_experiment_value(
    '60000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000020',
    0,
    '0.95'::jsonb,
    '80000000-0000-4000-8000-000000000020'
  )->>'status'),
  'ok',
  'filling the Required Value succeeds'
);
select is(
  (select public.archive_experiment('60000000-0000-4000-8000-000000000020')->>'status'),
  'ok',
  'archive succeeds once Required Values are complete'
);
select is(
  (select archived_at is not null from public.experiments
   where id = '60000000-0000-4000-8000-000000000020'),
  true,
  'archive sets archived_at'
);
select throws_ok(
  $$select public.save_experiment_value(
    '60000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000023',
    0,
    '"still writing"'::jsonb,
    '80000000-0000-4000-8000-000000000020'
  )$$,
  'P0001',
  'EXPERIMENT_ARCHIVED',
  'archived Experiments reject Value writes'
);
select is(
  (select public.unarchive_experiment('60000000-0000-4000-8000-000000000020')->>'status'),
  'ok',
  'unarchive succeeds'
);

-- Core fields + restore -------------------------------------------------------------
select is(
  (select public.save_experiment_core(
    '60000000-0000-4000-8000-000000000020',
    'Renamed after restore',
    null,
    'running',
    '80000000-0000-4000-8000-000000000020'
  )->>'status'),
  'ok',
  'core field save succeeds'
);
select is(
  (select name from public.experiments where id = '60000000-0000-4000-8000-000000000020'),
  'Renamed after restore',
  'core save updates the Name'
);
select is(
  (select public.restore_experiment_version(
    '60000000-0000-4000-8000-000000000020',
    2
  )->>'status'),
  'ok',
  'restore succeeds on an unarchived Experiment'
);
select is(
  (select name from public.experiments where id = '60000000-0000-4000-8000-000000000020'),
  'Value Benchmark',
  'restore brings back the historical Name'
);
select is(
  (select count(*)::int from public.experiment_versions
   where experiment_id = '60000000-0000-4000-8000-000000000020'
     and reason = 'Restored from version 2'),
  1,
  'restore writes a new Restored version'
);

-- Duplicate --------------------------------------------------------------------------
select is(
  (select public.duplicate_experiment(
    '60000000-0000-4000-8000-000000000020',
    'Copy of Value Benchmark',
    null,
    1,
    array['50000000-0000-4000-8000-000000000020'::uuid],
    '80000000-0000-4000-8000-000000000020'
  )->>'name'),
  'Copy of Value Benchmark',
  'duplicate creates the new Experiment'
);
select is(
  (select count(*)::int from public.experiment_values
   where experiment_id = (
     select id from public.experiments where name = 'Copy of Value Benchmark'
   )),
  1,
  'duplicate copies only the selected Values'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx supabase test db --local supabase/tests/0018_experiment_template_workspace_values.sql
```

Expected: FAIL — `save_experiment_value` does not exist.

---

### Task 2: Add the Experiment value mutation functions migration and make the test pass

**Files:**
- Create: `supabase/migrations/<timestamp>_experiment_template_workspace_values.sql` (name from the CLI)

- [ ] **Step 1: Create the migration file**

Run:

```bash
npx supabase migration new experiment_template_workspace_values
```

Note the printed filename; commands below use it as `supabase/migrations/<timestamp>_experiment_template_workspace_values.sql`.

- [ ] **Step 2: Implement the functions**

Replace the empty migration body with:

```sql
-- Experiment Template Workspace (Phase 3): atomic Experiment Value mutation functions.
-- Design: docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md

-- Private: full current state snapshot for one Experiment.
create or replace function public._experiment_snapshot(p_experiment_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'name', e.name,
    'owner_id', e.owner_id,
    'status', e.status,
    'archived_at', e.archived_at,
    'template_id', e.template_id,
    'task_id', e.task_id,
    'values', coalesce((
      select jsonb_object_agg(v.key_id, jsonb_build_object(
        'cell_revision', v.cell_revision,
        'type', k.value_type,
        'value', case k.value_type
          when 'short_text' then to_jsonb(v.text_value)
          when 'long_text' then to_jsonb(v.text_value)
          when 'url' then to_jsonb(v.text_value)
          when 'number' then to_jsonb(v.number_value)
          when 'boolean' then to_jsonb(v.boolean_value)
          when 'date_time' then to_jsonb(v.datetime_value)
          when 'single_select' then to_jsonb(v.option_id)
          when 'multi_select' then (
            select jsonb_agg(o.option_id order by o.position)
            from public.experiment_value_options o
            where o.experiment_id = v.experiment_id and o.key_id = v.key_id
          )
          when 'attachment' then (
            select jsonb_agg(a.id order by a.position)
            from public.attachments a
            where a.experiment_id = v.experiment_id
              and a.template_key_id = v.key_id
              and a.archived_at is null
          )
          else null
        end
      ))
      from public.experiment_values v
      join public.experiment_template_keys k on k.id = v.key_id
      where v.experiment_id = p_experiment_id
    ), '{}'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'caption', a.caption) order by a.position)
      from public.attachments a
      where a.experiment_id = p_experiment_id
        and a.template_key_id is not null
        and a.archived_at is null
    ), '[]'::jsonb)
  )
  from public.experiments e
  where e.id = p_experiment_id;
$function$;

-- Private: typed payload from an experiment_values row (for conflict responses).
create or replace function public._value_payload(
  p_row public.experiment_values,
  p_type text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select case p_type
    when 'short_text' then to_jsonb(p_row.text_value)
    when 'long_text' then to_jsonb(p_row.text_value)
    when 'url' then to_jsonb(p_row.text_value)
    when 'number' then to_jsonb(p_row.number_value)
    when 'boolean' then to_jsonb(p_row.boolean_value)
    when 'date_time' then to_jsonb(p_row.datetime_value)
    when 'single_select' then to_jsonb(p_row.option_id)
    when 'multi_select' then (
      select jsonb_agg(o.option_id order by o.position)
      from public.experiment_value_options o
      where o.experiment_id = p_row.experiment_id and o.key_id = p_row.key_id
    )
    else null
  end;
$function$;

create or replace function public.save_experiment_value(
  p_experiment_id uuid,
  p_key_id uuid,
  p_expected_cell_revision bigint,
  p_value jsonb,
  p_edit_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_experiment public.experiments%rowtype;
  v_key public.experiment_template_keys%rowtype;
  v_current public.experiment_values%rowtype;
  v_cell_revision bigint;
  v_version_no bigint;
  v_schema_revision bigint;
  v_number double precision;
  v_datetime timestamptz;
  v_option_id uuid;
  v_option_ids uuid[] := '{}'::uuid[];
  v_value_text text;
begin
  select * into v_experiment from public.experiments where id = p_experiment_id for update;
  if v_experiment.id is null then
    raise exception 'EXPERIMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_experiment.archived_at is not null then
    raise exception 'EXPERIMENT_ARCHIVED' using errcode = 'P0001';
  end if;

  select * into v_key
  from public.experiment_template_keys
  where id = p_key_id and template_id = v_experiment.template_id;
  if v_key.id is null then
    raise exception 'KEY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_key.archived_at is not null then
    raise exception 'KEY_ARCHIVED' using errcode = 'P0001';
  end if;
  if v_key.value_type = 'attachment' then
    raise exception 'ATTACHMENT_VALUE_UNSUPPORTED' using errcode = 'P0001';
  end if;

  select * into v_current
  from public.experiment_values
  where experiment_id = p_experiment_id and key_id = p_key_id
  for update;

  -- Validate and normalize p_value by Value Type.
  if p_value is not null then
    if v_key.value_type in ('short_text', 'long_text', 'url') then
      if jsonb_typeof(p_value) <> 'string' then
        raise exception 'VALUE_TYPE_MISMATCH' using errcode = 'P0001';
      end if;
      v_value_text := p_value #>> '{}';
      if v_key.value_type = 'url'
         and v_value_text !~ '^https?://' then
        raise exception 'URL_REQUIRED' using errcode = 'P0001';
      end if;
    elsif v_key.value_type = 'number' then
      if jsonb_typeof(p_value) <> 'number' then
        raise exception 'VALUE_TYPE_MISMATCH' using errcode = 'P0001';
      end if;
      v_number := (p_value #>> '{}')::double precision;
      if v_number = 'NaN'::double precision
         or v_number = 'Infinity'::double precision
         or v_number = '-Infinity'::double precision then
        raise exception 'NUMBER_NOT_FINITE' using errcode = 'P0001';
      end if;
    elsif v_key.value_type = 'boolean' then
      if jsonb_typeof(p_value) <> 'boolean' then
        raise exception 'VALUE_TYPE_MISMATCH' using errcode = 'P0001';
      end if;
    elsif v_key.value_type = 'date_time' then
      if jsonb_typeof(p_value) <> 'string' then
        raise exception 'VALUE_TYPE_MISMATCH' using errcode = 'P0001';
      end if;
      begin
        v_datetime := (p_value #>> '{}')::timestamptz;
      exception when others then
        raise exception 'DATETIME_REQUIRED' using errcode = 'P0001';
      end;
    elsif v_key.value_type = 'single_select' then
      if jsonb_typeof(p_value) <> 'string' then
        raise exception 'VALUE_TYPE_MISMATCH' using errcode = 'P0001';
      end if;
      v_option_id := nullif(p_value #>> '{}', '')::uuid;
      if v_option_id is null or not exists (
        select 1 from public.experiment_template_key_options
        where id = v_option_id and key_id = p_key_id and archived_at is null
      ) then
        raise exception 'OPTION_INVALID' using errcode = 'P0001';
      end if;
    elsif v_key.value_type = 'multi_select' then
      if jsonb_typeof(p_value) <> 'array' then
        raise exception 'VALUE_TYPE_MISMATCH' using errcode = 'P0001';
      end if;
      select coalesce(array_agg(x::uuid), '{}'::uuid[])
      into v_option_ids
      from jsonb_array_elements_text(p_value) x;
      if exists (
        select 1 from unnest(v_option_ids) x(id)
        where not exists (
          select 1 from public.experiment_template_key_options o
          where o.id = x.id and o.key_id = p_key_id and o.archived_at is null
        )
      ) then
        raise exception 'OPTION_INVALID' using errcode = 'P0001';
      end if;
    else
      raise exception 'VALUE_TYPE_UNSUPPORTED' using errcode = 'P0001';
    end if;
  end if;

  -- Optimistic concurrency on the cell revision.
  if v_current.experiment_id is not null then
    if p_expected_cell_revision <> v_current.cell_revision then
      return jsonb_build_object(
        'status', 'conflict',
        'remote', public._value_payload(v_current, v_key.value_type),
        'remote_cell_revision', v_current.cell_revision
      );
    end if;
    v_cell_revision := v_current.cell_revision + 1;
  else
    if p_expected_cell_revision <> 0 then
      return jsonb_build_object(
        'status', 'conflict',
        'remote', null,
        'remote_cell_revision', 0
      );
    end if;
    v_cell_revision := 1;
  end if;

  -- Apply.
  if p_value is null then
    delete from public.experiment_value_options
    where experiment_id = p_experiment_id and key_id = p_key_id;
    delete from public.experiment_values
    where experiment_id = p_experiment_id and key_id = p_key_id;
  elsif v_key.value_type = 'multi_select' then
    delete from public.experiment_value_options
    where experiment_id = p_experiment_id and key_id = p_key_id;
    if coalesce(array_length(v_option_ids, 1), 0) = 0 then
      delete from public.experiment_values
      where experiment_id = p_experiment_id and key_id = p_key_id;
    elsif v_current.experiment_id is null then
      insert into public.experiment_values (
        experiment_id, template_id, key_id, cell_revision
      ) values (
        p_experiment_id, v_experiment.template_id, p_key_id, 1
      );
      insert into public.experiment_value_options (
        experiment_id, template_id, key_id, option_id, position
      )
      select p_experiment_id, v_experiment.template_id, p_key_id, x.id, x.ordinality - 1
      from unnest(v_option_ids) with ordinality x(id, ordinality);
    else
      update public.experiment_values
      set cell_revision = v_cell_revision, updated_at = now()
      where experiment_id = p_experiment_id and key_id = p_key_id;
      insert into public.experiment_value_options (
        experiment_id, template_id, key_id, option_id, position
      )
      select p_experiment_id, v_experiment.template_id, p_key_id, x.id, x.ordinality - 1
      from unnest(v_option_ids) with ordinality x(id, ordinality);
    end if;
  elsif v_key.value_type = 'single_select' then
    if v_current.experiment_id is null then
      insert into public.experiment_values (
        experiment_id, template_id, key_id, option_id, cell_revision
      ) values (
        p_experiment_id, v_experiment.template_id, p_key_id, v_option_id, 1
      );
    else
      update public.experiment_values
      set option_id = v_option_id,
          text_value = null,
          number_value = null,
          boolean_value = null,
          datetime_value = null,
          cell_revision = v_cell_revision,
          updated_at = now()
      where experiment_id = p_experiment_id and key_id = p_key_id;
    end if;
  elsif v_key.value_type = 'number' then
    if v_current.experiment_id is null then
      insert into public.experiment_values (
        experiment_id, template_id, key_id, number_value, cell_revision
      ) values (
        p_experiment_id, v_experiment.template_id, p_key_id, v_number, 1
      );
    else
      update public.experiment_values
      set number_value = v_number,
          text_value = null,
          boolean_value = null,
          datetime_value = null,
          option_id = null,
          cell_revision = v_cell_revision,
          updated_at = now()
      where experiment_id = p_experiment_id and key_id = p_key_id;
    end if;
  elsif v_key.value_type = 'boolean' then
    if v_current.experiment_id is null then
      insert into public.experiment_values (
        experiment_id, template_id, key_id, boolean_value, cell_revision
      ) values (
        p_experiment_id, v_experiment.template_id, p_key_id,
        (p_value #>> '{}')::boolean, 1
      );
    else
      update public.experiment_values
      set boolean_value = (p_value #>> '{}')::boolean,
          text_value = null,
          number_value = null,
          datetime_value = null,
          option_id = null,
          cell_revision = v_cell_revision,
          updated_at = now()
      where experiment_id = p_experiment_id and key_id = p_key_id;
    end if;
  elsif v_key.value_type = 'date_time' then
    if v_current.experiment_id is null then
      insert into public.experiment_values (
        experiment_id, template_id, key_id, datetime_value, cell_revision
      ) values (
        p_experiment_id, v_experiment.template_id, p_key_id, v_datetime, 1
      );
    else
      update public.experiment_values
      set datetime_value = v_datetime,
          text_value = null,
          number_value = null,
          boolean_value = null,
          option_id = null,
          cell_revision = v_cell_revision,
          updated_at = now()
      where experiment_id = p_experiment_id and key_id = p_key_id;
    end if;
  else -- short_text, long_text, url
    if v_current.experiment_id is null then
      insert into public.experiment_values (
        experiment_id, template_id, key_id, text_value, cell_revision
      ) values (
        p_experiment_id, v_experiment.template_id, p_key_id, v_value_text, 1
      );
    else
      update public.experiment_values
      set text_value = v_value_text,
          number_value = null,
          boolean_value = null,
          datetime_value = null,
          option_id = null,
          cell_revision = v_cell_revision,
          updated_at = now()
      where experiment_id = p_experiment_id and key_id = p_key_id;
    end if;
  end if;

  update public.experiments
  set core_revision = core_revision + 1, updated_at = now()
  where id = p_experiment_id;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_versions
  where experiment_id = p_experiment_id;
  select schema_revision into v_schema_revision
  from public.experiment_templates
  where id = v_experiment.template_id;

  insert into public.experiment_versions (
    experiment_id, version_no, reason, source, edit_session_id,
    template_schema_revision, snapshot, actor_member_id
  ) values (
    p_experiment_id, v_version_no, 'Value edited', 'browser', p_edit_session_id,
    v_schema_revision, public._experiment_snapshot(p_experiment_id), null
  );

  return jsonb_build_object(
    'status', 'ok',
    'cell_revision', v_cell_revision,
    'version_no', v_version_no
  );
end
$function$;

create or replace function public.sync_experiment_attachment_value(
  p_experiment_id uuid,
  p_key_id uuid,
  p_active_attachment_ids uuid[],
  p_edit_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_experiment public.experiments%rowtype;
  v_key public.experiment_template_keys%rowtype;
  v_current public.experiment_values%rowtype;
  v_cell_revision bigint;
  v_version_no bigint;
  v_schema_revision bigint;
begin
  select * into v_experiment from public.experiments where id = p_experiment_id for update;
  if v_experiment.id is null then
    raise exception 'EXPERIMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_experiment.archived_at is not null then
    raise exception 'EXPERIMENT_ARCHIVED' using errcode = 'P0001';
  end if;
  select * into v_key
  from public.experiment_template_keys
  where id = p_key_id and template_id = v_experiment.template_id;
  if v_key.id is null or v_key.value_type <> 'attachment' or v_key.archived_at is not null then
    raise exception 'ATTACHMENT_KEY_INVALID' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_active_attachment_ids, '{}'::uuid[])) x(id)
    where not exists (
      select 1 from public.attachments a
      where a.id = x.id
        and a.experiment_id = p_experiment_id
        and a.template_key_id = p_key_id
        and a.archived_at is null
    )
  ) then
    raise exception 'ATTACHMENT_TEMPLATE_MISMATCH' using errcode = 'P0001';
  end if;

  update public.attachments
  set archived_at = now()
  where experiment_id = p_experiment_id
    and template_key_id = p_key_id
    and archived_at is null
    and not (id = any(coalesce(p_active_attachment_ids, '{}'::uuid[])));

  select * into v_current
  from public.experiment_values
  where experiment_id = p_experiment_id and key_id = p_key_id
  for update;

  if coalesce(array_length(p_active_attachment_ids, 1), 0) = 0 then
    delete from public.experiment_values
    where experiment_id = p_experiment_id and key_id = p_key_id;
    v_cell_revision := 0;
  elsif v_current.experiment_id is null then
    insert into public.experiment_values (
      experiment_id, template_id, key_id, cell_revision
    ) values (
      p_experiment_id, v_experiment.template_id, p_key_id, 1
    );
    v_cell_revision := 1;
  else
    v_cell_revision := v_current.cell_revision + 1;
    update public.experiment_values
    set cell_revision = v_cell_revision, updated_at = now()
    where experiment_id = p_experiment_id and key_id = p_key_id;
  end if;

  update public.experiments
  set core_revision = core_revision + 1, updated_at = now()
  where id = p_experiment_id;
  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_versions
  where experiment_id = p_experiment_id;
  select schema_revision into v_schema_revision
  from public.experiment_templates
  where id = v_experiment.template_id;
  insert into public.experiment_versions (
    experiment_id, version_no, reason, source, edit_session_id,
    template_schema_revision, snapshot, actor_member_id
  ) values (
    p_experiment_id, v_version_no, 'Attachments updated', 'browser', p_edit_session_id,
    v_schema_revision, public._experiment_snapshot(p_experiment_id), null
  );

  return jsonb_build_object(
    'status', 'ok',
    'cell_revision', v_cell_revision,
    'version_no', v_version_no
  );
end
$function$;

create or replace function public.save_experiment_core(
  p_experiment_id uuid,
  p_name text,
  p_owner_id uuid,
  p_status text,
  p_edit_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_experiment public.experiments%rowtype;
  v_version_no bigint;
  v_schema_revision bigint;
begin
  select * into v_experiment from public.experiments where id = p_experiment_id for update;
  if v_experiment.id is null then
    raise exception 'EXPERIMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_experiment.archived_at is not null then
    raise exception 'EXPERIMENT_ARCHIVED' using errcode = 'P0001';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'EXPERIMENT_NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if p_status is null or p_status not in (
    'planned', 'running', 'analyzing', 'completed', 'blocked', 'cancelled'
  ) then
    raise exception 'STATUS_INVALID' using errcode = 'P0001';
  end if;

  update public.experiments
  set name = trim(p_name),
      owner_id = p_owner_id,
      status = p_status,
      core_revision = core_revision + 1,
      updated_at = now()
  where id = p_experiment_id;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_versions
  where experiment_id = p_experiment_id;
  select schema_revision into v_schema_revision
  from public.experiment_templates
  where id = v_experiment.template_id;
  insert into public.experiment_versions (
    experiment_id, version_no, reason, source, edit_session_id,
    template_schema_revision, snapshot, actor_member_id
  ) values (
    p_experiment_id, v_version_no, 'Details updated', 'browser', p_edit_session_id,
    v_schema_revision, public._experiment_snapshot(p_experiment_id), null
  );

  return jsonb_build_object(
    'status', 'ok',
    'version_no', v_version_no,
    'core_revision', v_experiment.core_revision + 1
  );
end
$function$;

create or replace function public._experiment_required_missing(p_experiment_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_experiment public.experiments%rowtype;
  v_key public.experiment_template_keys%rowtype;
begin
  select * into v_experiment from public.experiments where id = p_experiment_id;
  if v_experiment.id is null or v_experiment.template_id is null then
    return true;
  end if;
  for v_key in
    select k.* from public.experiment_template_keys k
    where k.template_id = v_experiment.template_id
      and k.required
      and k.archived_at is null
  loop
    if v_key.value_type = 'attachment' then
      if not exists (
        select 1 from public.attachments a
        where a.experiment_id = p_experiment_id
          and a.template_key_id = v_key.id
          and a.archived_at is null
      ) then return true; end if;
    elsif v_key.value_type = 'multi_select' then
      if not exists (
        select 1 from public.experiment_value_options o
        where o.experiment_id = p_experiment_id and o.key_id = v_key.id
      ) then return true; end if;
    elsif v_key.value_type = 'single_select' then
      if not exists (
        select 1 from public.experiment_values v
        where v.experiment_id = p_experiment_id and v.key_id = v_key.id
          and v.option_id is not null
      ) then return true; end if;
    elsif v_key.value_type = 'number' then
      if not exists (
        select 1 from public.experiment_values v
        where v.experiment_id = p_experiment_id and v.key_id = v_key.id
          and v.number_value is not null
      ) then return true; end if;
    elsif v_key.value_type = 'boolean' then
      if not exists (
        select 1 from public.experiment_values v
        where v.experiment_id = p_experiment_id and v.key_id = v_key.id
          and v.boolean_value is not null
      ) then return true; end if;
    elsif v_key.value_type = 'date_time' then
      if not exists (
        select 1 from public.experiment_values v
        where v.experiment_id = p_experiment_id and v.key_id = v_key.id
          and v.datetime_value is not null
      ) then return true; end if;
    else
      if not exists (
        select 1 from public.experiment_values v
        where v.experiment_id = p_experiment_id and v.key_id = v_key.id
          and v.text_value is not null
      ) then return true; end if;
    end if;
  end loop;
  return false;
end
$function$;

create or replace function public.archive_experiment(p_experiment_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_experiment public.experiments%rowtype;
  v_version_no bigint;
  v_schema_revision bigint;
begin
  select * into v_experiment from public.experiments where id = p_experiment_id for update;
  if v_experiment.id is null then
    raise exception 'EXPERIMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_experiment.archived_at is not null then
    raise exception 'EXPERIMENT_ALREADY_ARCHIVED' using errcode = 'P0001';
  end if;
  if public._experiment_required_missing(p_experiment_id) then
    raise exception 'REQUIRED_VALUES_MISSING' using errcode = 'P0001';
  end if;

  update public.experiments
  set archived_at = now(), core_revision = core_revision + 1, updated_at = now()
  where id = p_experiment_id;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_versions
  where experiment_id = p_experiment_id;
  select schema_revision into v_schema_revision
  from public.experiment_templates
  where id = v_experiment.template_id;
  insert into public.experiment_versions (
    experiment_id, version_no, reason, source, template_schema_revision,
    snapshot, actor_member_id
  ) values (
    p_experiment_id, v_version_no, 'Archived', 'browser', v_schema_revision,
    public._experiment_snapshot(p_experiment_id), null
  );

  return jsonb_build_object('status', 'ok', 'version_no', v_version_no);
end
$function$;

create or replace function public.unarchive_experiment(p_experiment_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_experiment public.experiments%rowtype;
  v_version_no bigint;
  v_schema_revision bigint;
begin
  select * into v_experiment from public.experiments where id = p_experiment_id for update;
  if v_experiment.id is null then
    raise exception 'EXPERIMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_experiment.archived_at is null then
    raise exception 'EXPERIMENT_NOT_ARCHIVED' using errcode = 'P0001';
  end if;

  update public.experiments
  set archived_at = null, core_revision = core_revision + 1, updated_at = now()
  where id = p_experiment_id;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_versions
  where experiment_id = p_experiment_id;
  select schema_revision into v_schema_revision
  from public.experiment_templates
  where id = v_experiment.template_id;
  insert into public.experiment_versions (
    experiment_id, version_no, reason, source, template_schema_revision,
    snapshot, actor_member_id
  ) values (
    p_experiment_id, v_version_no, 'Unarchived', 'browser', v_schema_revision,
    public._experiment_snapshot(p_experiment_id), null
  );

  return jsonb_build_object('status', 'ok', 'version_no', v_version_no);
end
$function$;

create or replace function public.restore_experiment_version(
  p_experiment_id uuid,
  p_version_no bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_experiment public.experiments%rowtype;
  v_version public.experiment_versions%rowtype;
  v_entry record;
  v_key_id uuid;
  v_value jsonb;
  v_type text;
  v_new_version_no bigint;
  v_schema_revision bigint;
  v_new_core_revision bigint;
begin
  select * into v_experiment from public.experiments where id = p_experiment_id for update;
  if v_experiment.id is null then
    raise exception 'EXPERIMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_experiment.archived_at is not null then
    raise exception 'EXPERIMENT_ARCHIVED' using errcode = 'P0001';
  end if;
  select * into v_version
  from public.experiment_versions
  where experiment_id = p_experiment_id and version_no = p_version_no;
  if v_version.id is null then
    raise exception 'VERSION_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Restore core fields.
  update public.experiments
  set name = v_version.snapshot->>'name',
      owner_id = nullif(v_version.snapshot->>'owner_id', '')::uuid,
      status = v_version.snapshot->>'status',
      updated_at = now()
  where id = p_experiment_id;

  -- Restore Values for Keys still active in the current Template.
  for v_entry in
    select key, value from jsonb_each(coalesce(v_version.snapshot->'values', '{}'::jsonb))
  loop
    v_key_id := v_entry.key::uuid;
    v_type := v_entry.value->>'type';
    v_value := v_entry.value->'value';
    if v_type = 'attachment' then
      update public.attachments
      set archived_at = null
      where experiment_id = p_experiment_id
        and id in (select x::uuid from jsonb_array_elements_text(coalesce(v_value, '[]'::jsonb)) x);
      continue;
    end if;
    if not exists (
      select 1 from public.experiment_template_keys k
      where k.id = v_key_id
        and k.template_id = v_experiment.template_id
        and k.archived_at is null
    ) then
      continue;
    end if;
    if v_value is null then
      delete from public.experiment_value_options
      where experiment_id = p_experiment_id and key_id = v_key_id;
      delete from public.experiment_values
      where experiment_id = p_experiment_id and key_id = v_key_id;
    elsif v_type = 'multi_select' then
      delete from public.experiment_value_options
      where experiment_id = p_experiment_id and key_id = v_key_id;
      insert into public.experiment_value_options (
        experiment_id, template_id, key_id, option_id, position
      )
      select p_experiment_id, v_experiment.template_id, v_key_id,
             x::uuid, ordinality - 1
      from jsonb_array_elements_text(v_value) with ordinality x(value, ordinality);
      if not exists (
        select 1 from public.experiment_values
        where experiment_id = p_experiment_id and key_id = v_key_id
      ) then
        insert into public.experiment_values (
          experiment_id, template_id, key_id, cell_revision
        ) values (p_experiment_id, v_experiment.template_id, v_key_id, 1);
      end if;
    else
      if not exists (
        select 1 from public.experiment_values
        where experiment_id = p_experiment_id and key_id = v_key_id
      ) then
        insert into public.experiment_values (
          experiment_id, template_id, key_id, cell_revision
        ) values (p_experiment_id, v_experiment.template_id, v_key_id, 1);
      end if;
      update public.experiment_values
      set text_value = case when v_type in ('short_text','long_text','url') then v_value #>> '{}' end,
          number_value = case when v_type = 'number' then (v_value #>> '{}')::double precision end,
          boolean_value = case when v_type = 'boolean' then (v_value #>> '{}')::boolean end,
          datetime_value = case when v_type = 'date_time' then (v_value #>> '{}')::timestamptz end,
          option_id = case when v_type = 'single_select' then nullif(v_value #>> '{}', '')::uuid end,
          cell_revision = cell_revision + 1,
          updated_at = now()
      where experiment_id = p_experiment_id and key_id = v_key_id;
    end if;
  end loop;

  update public.experiments
  set core_revision = core_revision + 1, updated_at = now()
  where id = p_experiment_id
  returning core_revision into v_new_core_revision;

  select coalesce(max(version_no), 0) + 1 into v_new_version_no
  from public.experiment_versions
  where experiment_id = p_experiment_id;
  select schema_revision into v_schema_revision
  from public.experiment_templates
  where id = v_experiment.template_id;
  insert into public.experiment_versions (
    experiment_id, version_no, reason, source, template_schema_revision,
    snapshot, actor_member_id
  ) values (
    p_experiment_id, v_new_version_no,
    format('Restored from version %s', p_version_no),
    'browser', v_schema_revision,
    public._experiment_snapshot(p_experiment_id), null
  );

  return jsonb_build_object(
    'status', 'ok',
    'version_no', v_new_version_no,
    'core_revision', v_new_core_revision
  );
end
$function$;

create or replace function public.duplicate_experiment(
  p_source_id uuid,
  p_name text,
  p_owner_id uuid,
  p_position double precision,
  p_key_ids uuid[],
  p_edit_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_source public.experiments%rowtype;
  v_new public.experiments%rowtype;
  v_key_id uuid;
  v_version_no bigint;
  v_schema_revision bigint;
begin
  select * into v_source from public.experiments where id = p_source_id for update;
  if v_source.id is null or v_source.template_id is null then
    raise exception 'SOURCE_TEMPLATE_REQUIRED' using errcode = 'P0001';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'EXPERIMENT_NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_key_ids, '{}'::uuid[])) x(id)
    where not exists (
      select 1 from public.experiment_template_keys k
      where k.id = x.id
        and k.template_id = v_source.template_id
        and k.archived_at is null
        and k.value_type <> 'attachment'
    )
  ) then
    raise exception 'KEY_NOT_COPYABLE' using errcode = 'P0001';
  end if;

  insert into public.experiments (
    task_id, template_id, owner_id, name, status, position,
    baseline_experiment_id, data_spec, object_spec, environment_spec,
    config, notes, metrics, featured_metric_keys, result_summary,
    decision_outcome, decision_notes
  ) values (
    v_source.task_id, v_source.template_id, p_owner_id, trim(p_name), 'planned',
    p_position, v_source.id, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
    '{}'::jsonb, '', '{}'::jsonb, '{}', '', null, ''
  )
  returning * into v_new;

  for v_key_id in select unnest(coalesce(p_key_ids, '{}'::uuid[])) loop
    insert into public.experiment_values (
      experiment_id, template_id, key_id, text_value, number_value,
      boolean_value, datetime_value, option_id, cell_revision
    )
    select v_new.id, v_new.template_id, v.key_id, v.text_value, v.number_value,
           v.boolean_value, v.datetime_value, v.option_id, v.cell_revision
    from public.experiment_values v
    where v.experiment_id = p_source_id and v.key_id = v_key_id;
    insert into public.experiment_value_options (
      experiment_id, template_id, key_id, option_id, position
    )
    select v_new.id, v_new.template_id, o.key_id, o.option_id, o.position
    from public.experiment_value_options o
    where o.experiment_id = p_source_id and o.key_id = v_key_id;
  end loop;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_versions
  where experiment_id = v_new.id;
  select schema_revision into v_schema_revision
  from public.experiment_templates
  where id = v_new.template_id;
  insert into public.experiment_versions (
    experiment_id, version_no, reason, source, edit_session_id,
    template_schema_revision, snapshot, actor_member_id
  ) values (
    v_new.id, v_version_no, 'Duplicated', 'browser', p_edit_session_id,
    v_schema_revision, public._experiment_snapshot(v_new.id), null
  );

  return to_jsonb(v_new);
end
$function$;

-- Grants ----------------------------------------------------------------------
grant execute on function
  public.save_experiment_value(uuid, uuid, bigint, jsonb, uuid),
  public.sync_experiment_attachment_value(uuid, uuid, uuid[], uuid),
  public.save_experiment_core(uuid, text, uuid, text, uuid),
  public.archive_experiment(uuid),
  public.unarchive_experiment(uuid),
  public.restore_experiment_version(uuid, bigint),
  public.duplicate_experiment(uuid, text, uuid, double precision, uuid[], uuid)
to authenticated;

revoke execute on function
  public.save_experiment_value(uuid, uuid, bigint, jsonb, uuid),
  public.sync_experiment_attachment_value(uuid, uuid, uuid[], uuid),
  public.save_experiment_core(uuid, text, uuid, text, uuid),
  public.archive_experiment(uuid),
  public.unarchive_experiment(uuid),
  public.restore_experiment_version(uuid, bigint),
  public.duplicate_experiment(uuid, text, uuid, double precision, uuid[], uuid)
from public, anon;

revoke execute on function
  public._experiment_snapshot(uuid),
  public._value_payload(public.experiment_values, text),
  public._experiment_required_missing(uuid)
from public, anon, authenticated;
```

- [ ] **Step 3: Apply the migration and run the new test**

Run:

```bash
npx supabase db reset --local
npx supabase test db --local supabase/tests/0018_experiment_template_workspace_values.sql
```

Expected: PASS (all 42 assertions).

- [ ] **Step 4: Confirm the existing suite still passes**

Run:

```bash
npx supabase test db --local \
  supabase/tests/0014_api_key_deletion.sql \
  supabase/tests/0015_experiment_template_workspace_schema.sql \
  supabase/tests/0016_experiment_template_workspace_grants.sql \
  supabase/tests/0017_experiment_template_workspace_functions.sql
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<timestamp>_experiment_template_workspace_values.sql supabase/tests/0018_experiment_template_workspace_values.sql
git commit -m "feat: add atomic experiment value mutation functions"
```

---

### Task 3: Add the Experiment value repository and edit-session helper

**Files:**
- Create: `lib/experiments/values.ts`
- Create: `lib/experiments/__tests__/values.test.ts`

- [ ] **Step 1: Write the failing repository test**

Create `lib/experiments/__tests__/values.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveExperiment,
  loadExperimentValues,
  restoreExperimentVersion,
  saveValue,
  type TypedValue,
} from "@/lib/experiments/values";

interface MockRpc {
  rpc: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const from = vi.fn(() => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      not: vi.fn(() => query),
      is: vi.fn(() => query),
      order: vi.fn(() => query),
      then: (resolve: (response: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return query;
  });
  return { rpc, from };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

const EXPERIMENT_ID = "60000000-0000-4000-8000-000000000020";
const KEY_ID = "50000000-0000-4000-8000-000000000020";

beforeEach(() => vi.clearAllMocks());

describe("experiment value repository", () => {
  it("sends a typed Value through the save RPC", async () => {
    vi.mocked(mocks.rpc).mockResolvedValue({
      data: { status: "ok", cell_revision: 2, version_no: 3 },
      error: null,
    });

    const result = await saveValue({
      experimentId: EXPERIMENT_ID,
      keyId: KEY_ID,
      expectedCellRevision: 1,
      value: { kind: "number", number: 0.73 },
      editSessionId: "80000000-0000-4000-8000-000000000020",
    });

    expect(result).toEqual({ status: "ok", cell_revision: 2, version_no: 3 });
    expect(mocks.rpc).toHaveBeenCalledWith("save_experiment_value", {
      p_experiment_id: EXPERIMENT_ID,
      p_key_id: KEY_ID,
      p_expected_cell_revision: 1,
      p_value: 0.73,
      p_edit_session_id: "80000000-0000-4000-8000-000000000020",
    });
  });

  it("serializes a null Value as JSON null", async () => {
    vi.mocked(mocks.rpc).mockResolvedValue({
      data: { status: "ok", cell_revision: 3, version_no: 4 },
      error: null,
    });

    await saveValue({
      experimentId: EXPERIMENT_ID,
      keyId: KEY_ID,
      expectedCellRevision: 2,
      value: null,
      editSessionId: "80000000-0000-4000-8000-000000000020",
    });

    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_experiment_value",
      expect.objectContaining({ p_value: null }),
    );
  });

  it("loads current Values for active Keys", async () => {
    vi.mocked(mocks.rpc).mockResolvedValue({ data: null, error: null });
    const values = await loadExperimentValues(EXPERIMENT_ID);
    expect(values).toBeInstanceOf(Map);
  });

  it("archives and restores through RPCs", async () => {
    vi.mocked(mocks.rpc).mockResolvedValue({ data: { status: "ok" }, error: null });
    await archiveExperiment(EXPERIMENT_ID);
    expect(mocks.rpc).toHaveBeenCalledWith("archive_experiment", {
      p_experiment_id: EXPERIMENT_ID,
    });
    await restoreExperimentVersion(EXPERIMENT_ID, 2);
    expect(mocks.rpc).toHaveBeenCalledWith("restore_experiment_version", {
      p_experiment_id: EXPERIMENT_ID,
      p_version_no: 2,
    });
  });
});
```

Run it:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/experiments/__tests__/values.test.ts
```

Expected: FAIL — `@/lib/experiments/values` cannot be resolved.

- [ ] **Step 2: Implement `lib/experiments/values.ts`**

Create `lib/experiments/values.ts`:

```ts
import { supabase } from "@/lib/supabase";
import type {
  ExperimentValue,
  ExperimentValueOption,
  TemplateValueType,
} from "@/lib/types";
import type { Attachment } from "@/lib/types";

export type TypedValue =
  | { kind: "short_text"; text: string }
  | { kind: "long_text"; text: string }
  | { kind: "number"; number: number }
  | { kind: "boolean"; boolean: boolean }
  | { kind: "date_time"; datetime: string }
  | { kind: "url"; url: string }
  | { kind: "single_select"; optionId: string }
  | { kind: "multi_select"; optionIds: string[] }
  | { kind: "attachment"; attachmentIds: string[] };

export type SaveValueResult =
  | { status: "ok"; cell_revision: number; version_no: number }
  | {
    status: "conflict";
    remote: unknown;
    remote_cell_revision: number;
  };

export interface SaveValueInput {
  experimentId: string;
  keyId: string;
  expectedCellRevision: number;
  value: TypedValue | null;
  editSessionId: string;
}

export interface ExperimentValueMap {
  get(keyId: string): {
    value: TypedValue | null;
    cellRevision: number;
  } | undefined;
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function serializeValue(value: TypedValue | null): unknown {
  if (!value) return null;
  switch (value.kind) {
    case "short_text":
    case "long_text":
      return value.text;
    case "number":
      return value.number;
    case "boolean":
      return value.boolean;
    case "date_time":
      return value.datetime;
    case "url":
      return value.url;
    case "single_select":
      return value.optionId;
    case "multi_select":
      return value.optionIds;
    case "attachment":
      return value.attachmentIds;
  }
}

export async function saveValue(
  input: SaveValueInput,
): Promise<SaveValueResult> {
  const { data, error } = await client().rpc("save_experiment_value", {
    p_experiment_id: input.experimentId,
    p_key_id: input.keyId,
    p_expected_cell_revision: input.expectedCellRevision,
    p_value: serializeValue(input.value),
    p_edit_session_id: input.editSessionId,
  });
  throwIfError(error);
  return data as SaveValueResult;
}

export async function syncAttachmentValue(
  experimentId: string,
  keyId: string,
  activeAttachmentIds: string[],
  editSessionId: string,
): Promise<SaveValueResult> {
  const { data, error } = await client().rpc("sync_experiment_attachment_value", {
    p_experiment_id: experimentId,
    p_key_id: keyId,
    p_active_attachment_ids: activeAttachmentIds,
    p_edit_session_id: editSessionId,
  });
  throwIfError(error);
  return data as SaveValueResult;
}

export async function saveExperimentCore(
  experimentId: string,
  input: { name: string; ownerId: string | null; status: string },
  editSessionId: string,
): Promise<{ status: "ok"; version_no: number; core_revision: number }> {
  const { data, error } = await client().rpc("save_experiment_core", {
    p_experiment_id: experimentId,
    p_name: input.name,
    p_owner_id: input.ownerId,
    p_status: input.status,
    p_edit_session_id: editSessionId,
  });
  throwIfError(error);
  return data;
}

export async function archiveExperiment(
  experimentId: string,
): Promise<{ status: "ok"; version_no: number }> {
  const { data, error } = await client().rpc("archive_experiment", {
    p_experiment_id: experimentId,
  });
  throwIfError(error);
  return data;
}

export async function unarchiveExperiment(
  experimentId: string,
): Promise<{ status: "ok"; version_no: number }> {
  const { data, error } = await client().rpc("unarchive_experiment", {
    p_experiment_id: experimentId,
  });
  throwIfError(error);
  return data;
}

export async function restoreExperimentVersion(
  experimentId: string,
  versionNo: number,
): Promise<{ status: "ok"; version_no: number; core_revision: number }> {
  const { data, error } = await client().rpc("restore_experiment_version", {
    p_experiment_id: experimentId,
    p_version_no: versionNo,
  });
  throwIfError(error);
  return data;
}

export interface ExperimentVersionSummary {
  id: string;
  version_no: number;
  reason: string;
  source: string;
  edit_session_id: string | null;
  template_schema_revision: number;
  created_at: string;
}

export async function listExperimentVersions(
  experimentId: string,
): Promise<ExperimentVersionSummary[]> {
  const { data, error } = await client()
    .from("experiment_versions")
    .select(
      "id,version_no,reason,source,edit_session_id,template_schema_revision,created_at",
    )
    .eq("experiment_id", experimentId)
    .order("version_no", { ascending: false });
  throwIfError(error);
  return (data ?? []) as ExperimentVersionSummary[];
}

function typedValueFromRow(
  row: ExperimentValue,
  type: TemplateValueType,
  optionIds: string[],
  attachmentIds: string[],
): TypedValue | null {
  switch (type) {
    case "short_text":
      return row.text_value === null ? null : { kind: "short_text", text: row.text_value };
    case "long_text":
      return row.text_value === null ? null : { kind: "long_text", text: row.text_value };
    case "url":
      return row.text_value === null ? null : { kind: "url", url: row.text_value };
    case "number":
      return row.number_value === null ? null : { kind: "number", number: row.number_value };
    case "boolean":
      return row.boolean_value === null ? null : { kind: "boolean", boolean: row.boolean_value };
    case "date_time":
      return row.datetime_value === null ? null : { kind: "date_time", datetime: row.datetime_value };
    case "single_select":
      return row.option_id === null ? null : { kind: "single_select", optionId: row.option_id };
    case "multi_select":
      return { kind: "multi_select", optionIds };
    case "attachment":
      return { kind: "attachment", attachmentIds };
  }
}

export async function loadExperimentValues(
  experimentId: string,
): Promise<Map<string, { value: TypedValue | null; cellRevision: number }>> {
  const c = client();
  const [values, valueOptions, attachments] = await Promise.all([
    c.from("experiment_values")
      .select("*,template_key:experiment_template_keys(value_type)")
      .eq("experiment_id", experimentId),
    c.from("experiment_value_options")
      .select("key_id,option_id,position")
      .eq("experiment_id", experimentId)
      .order("position"),
    c.from("attachments")
      .select("*")
      .eq("experiment_id", experimentId)
      .not("template_key_id", "is", null)
      .is("archived_at", null),
  ]);
  throwIfError(values.error);
  throwIfError(valueOptions.error);
  throwIfError(attachments.error);

  const optionsByKey = new Map<string, string[]>();
  for (const row of (valueOptions.data ?? []) as ExperimentValueOption[]) {
    const group = optionsByKey.get(row.key_id) ?? [];
    group.push(row.option_id);
    optionsByKey.set(row.key_id, group);
  }
  const attachmentsByKey = new Map<string, string[]>();
  for (const row of (attachments.data ?? []) as Attachment[]) {
    if (!row.template_key_id) continue;
    const group = attachmentsByKey.get(row.template_key_id) ?? [];
    group.push(row.id);
    attachmentsByKey.set(row.template_key_id, group);
  }

  const map = new Map<string, { value: TypedValue | null; cellRevision: number }>();
  for (const row of (values.data ?? []) as Array<ExperimentValue & {
    template_key?: { value_type: TemplateValueType };
  }>) {
    const type = row.template_key?.value_type ?? "short_text";
    map.set(row.key_id, {
      value: typedValueFromRow(
        row,
        type,
        optionsByKey.get(row.key_id) ?? [],
        attachmentsByKey.get(row.key_id) ?? [],
      ),
      cellRevision: row.cell_revision,
    });
  }
  return map;
}

export function createEditSessionId(): string {
  return crypto.randomUUID();
}

export interface EditSessionClock {
  id: string;
  lastMutationAt: number;
}

export function touchEditSession(session: EditSessionClock, now = Date.now()): string {
  if (now - session.lastMutationAt > 5 * 60 * 1000) {
    session.id = createEditSessionId();
  }
  session.lastMutationAt = now;
  return session.id;
}
```

- [ ] **Step 3: Run the repository test**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/experiments/__tests__/values.test.ts
```

Expected: PASS.

- [ ] **Step 4: Confirm zero new type errors and commit**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
git add lib/experiments/values.ts lib/experiments/__tests__/values.test.ts
git commit -m "feat: add experiment value repository and edit sessions"
```

Expected: no tsc output; commit succeeds.

---

### Task 4: Build the Template Experiment Detail (header, Field Tables, typed editors, autosave, conflicts)

**Files:**
- Create: `components/experiments/ValueEditor.tsx`
- Create: `components/experiments/TemplateFieldTables.tsx`
- Create: `components/experiments/TemplateExperimentDetail.tsx`
- Create: `components/experiments/__tests__/TemplateExperimentDetail.test.tsx`
- Modify: `components/experiments/ExperimentDetail.tsx` (early return)
- Modify: `components/experiments/AttachmentGallery.tsx` (templateKeyId scope)

- [ ] **Step 1: Write the failing component test**

Create `components/experiments/__tests__/TemplateExperimentDetail.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TemplateExperimentDetail from "@/components/experiments/TemplateExperimentDetail";

const mocks = vi.hoisted(() => ({
  loadBundle: vi.fn(),
  loadTemplateDraft: vi.fn(),
  loadValues: vi.fn(),
  saveValue: vi.fn(),
  saveCore: vi.fn(),
  archive: vi.fn(),
}));

vi.mock("@/lib/experiments/repository", () => ({
  loadExperimentBundle: mocks.loadBundle,
}));
vi.mock("@/lib/templates/repository", () => ({
  loadTemplateDraft: mocks.loadTemplateDraft,
}));
vi.mock("@/lib/experiments/values", () => ({
  loadExperimentValues: mocks.loadValues,
  saveValue: mocks.saveValue,
  saveExperimentCore: mocks.saveCore,
  archiveExperiment: mocks.archive,
  unarchiveExperiment: vi.fn(),
  createEditSessionId: () => "session-1",
  touchEditSession: (session: { id: string; lastMutationAt: number }) => session.id,
}));

const experiment = {
  id: "exp-1",
  experiment_no: 1,
  task_id: "task-1",
  owner_id: null,
  name: "Run one",
  status: "planned",
  baseline_experiment_id: null,
  template_id: "tpl-1",
  archived_at: null,
  core_revision: 3,
  data_spec: { datasets: [] },
  object_spec: { model: "", harness: "", parent_harness: "", prompt: "", prompt_change: "", skills: [], tools: [] },
  environment_spec: { platform: "", server: "", devices: [], hardware: "", evaluator: "", revision: "", precision_policy: "" },
  config: {},
  notes: "",
  metrics: {},
  featured_metric_keys: [],
  result_summary: "",
  decision_outcome: null,
  decision_notes: "",
  position: 0,
  started_at: null,
  completed_at: null,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z",
};

const templateDraft = {
  templateId: "tpl-1",
  name: "Benchmark A",
  description: "",
  schemaRevision: 2,
  fields: [{
    id: "f1",
    label: "Metrics",
    colorToken: "blue",
    position: 1,
    archived: false,
    keys: [{
      id: "k1",
      key: "pass@1",
      valueType: "number",
      required: true,
      position: 1,
      archived: false,
      options: [],
      valueCount: 0,
    }],
  }],
};

const bundle = {
  experiment,
  task: { id: "task-1", title: "Optimize conv2d" },
  owner: null,
  baseline: null,
  members: [],
  candidates: [],
  attachments: [],
  activity: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadBundle.mockResolvedValue(bundle);
  mocks.loadTemplateDraft.mockResolvedValue(templateDraft);
  mocks.loadValues.mockResolvedValue(new Map());
});

afterEach(cleanup);

describe("TemplateExperimentDetail", () => {
  it("renders the locked Template name and one Field Table per Field Label", async () => {
    render(<TemplateExperimentDetail id="exp-1" />);
    await screen.findByText("Run one");
    expect(screen.getByText("Benchmark A")).not.toBeNull();
    expect(screen.getByText("Metrics")).not.toBeNull();
    expect(screen.getByText("pass@1")).not.toBeNull();
  });

  it("commits a Number Value on Enter and shows saved state", async () => {
    mocks.saveValue.mockResolvedValue({ status: "ok", cell_revision: 1, version_no: 2 });
    render(<TemplateExperimentDetail id="exp-1" />);
    await screen.findByText("pass@1");
    fireEvent.click(screen.getByLabelText("Value for pass@1"));
    fireEvent.change(screen.getByLabelText("Value for pass@1"), {
      target: { value: "0.73" },
    });
    fireEvent.keyDown(screen.getByLabelText("Value for pass@1"), { key: "Enter" });
    await waitFor(() => expect(mocks.saveValue).toHaveBeenCalled());
    expect(await screen.findByText("Saved just now")).not.toBeNull();
  });
});
```

Run it:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run components/experiments/__tests__/TemplateExperimentDetail.test.tsx
```

Expected: FAIL — module cannot be resolved.

- [ ] **Step 2: Create `components/experiments/ValueEditor.tsx`**

Create `components/experiments/ValueEditor.tsx`:

```tsx
"use client";

import { useState, type KeyboardEvent } from "react";
import type { TemplateKeyDraft, TemplateOptionDraft } from "@/lib/templates/repository";
import type { TypedValue } from "@/lib/experiments/values";

export type CommitOutcome = "saved" | "saving" | "error" | "conflict" | "idle";

export default function ValueEditor({
  keyDef,
  options,
  value,
  cellRevision,
  disabled,
  onCommit,
  outcome,
  error,
}: {
  keyDef: Pick<TemplateKeyDraft, "id" | "key" | "valueType" | "required">;
  options: TemplateOptionDraft[];
  value: TypedValue | null;
  cellRevision: number;
  disabled: boolean;
  onCommit: (value: TypedValue | null, expectedCellRevision: number) => void;
  outcome: CommitOutcome;
  error: string;
}) {
  const type = keyDef.valueType;
  const initialText = (() => {
    switch (type) {
      case "short_text": return value?.kind === "short_text" ? value.text : "";
      case "long_text": return value?.kind === "long_text" ? value.text : "";
      case "url": return value?.kind === "url" ? value.url : "";
      case "number": return value?.kind === "number" ? String(value.number) : "";
      case "date_time": return value?.kind === "date_time" ? value.datetime.slice(0, 16) : "";
      case "single_select": return value?.kind === "single_select" ? value.optionId : "";
      default: return "";
    }
  })();
  const [text, setText] = useState(initialText);
  const [checked, setChecked] = useState(value?.kind === "boolean" && value.boolean);

  function commitText() {
    if (type === "number") {
      const trimmed = text.trim();
      if (trimmed === "") {
        onCommit(null, cellRevision);
        return;
      }
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) return;
      onCommit({ kind: "number", number: parsed }, cellRevision);
      return;
    }
    if (type === "url") {
      onCommit({ kind: "url", url: text.trim() }, cellRevision);
      return;
    }
    if (type === "date_time") {
      if (!text) {
        onCommit(null, cellRevision);
        return;
      }
      onCommit({ kind: "date_time", datetime: new Date(text).toISOString() }, cellRevision);
      return;
    }
    if (type === "short_text") {
      onCommit(text === "" ? null : { kind: "short_text", text }, cellRevision);
      return;
    }
    onCommit(text === "" ? null : { kind: "long_text", text }, cellRevision);
  }

  function commitSingleSelect(optionId: string) {
    onCommit(
      optionId === "" ? null : { kind: "single_select", optionId },
      cellRevision,
    );
  }

  if (type === "boolean") {
    return (
      <label className="value-editor value-editor-boolean">
        <input
          type="checkbox"
          aria-label={`Value for ${keyDef.key}`}
          checked={checked}
          disabled={disabled}
          onChange={(event) => {
            setChecked(event.target.checked);
            onCommit({ kind: "boolean", boolean: event.target.checked }, cellRevision);
          }}
        />
        <CellStatus outcome={outcome} error={error} />
      </label>
    );
  }

  if (type === "single_select") {
    return (
      <span className="value-editor">
        <select
          aria-label={`Value for ${keyDef.key}`}
          value={initialText}
          disabled={disabled}
          onChange={(event) => commitSingleSelect(event.target.value)}
        >
          <option value="">—</option>
          {options
            .filter((option) => !option.archived)
            .map((option) => (
              <option key={option.id ?? `new-${option.position}`} value={option.id ?? ""}>
                {option.label}
              </option>
            ))}
        </select>
        <CellStatus outcome={outcome} error={error} />
      </span>
    );
  }

  if (type === "multi_select") {
    return (
      <span className="value-editor">
        <MultiSelectValue
          label={keyDef.key}
          options={options}
          selected={value?.kind === "multi_select" ? value.optionIds : []}
          disabled={disabled}
          onCommit={(optionIds) => onCommit(
            optionIds.length === 0 ? null : { kind: "multi_select", optionIds },
            cellRevision,
          )}
        />
        <CellStatus outcome={outcome} error={error} />
      </span>
    );
  }

  if (type === "long_text") {
    return (
      <span className="value-editor">
        <textarea
          rows={2}
          aria-label={`Value for ${keyDef.key}`}
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onBlur={commitText}
        />
        <button
          type="button"
          className="btn ghost small"
          onClick={commitText}
          disabled={disabled}
        >
          Done
        </button>
        <CellStatus outcome={outcome} error={error} />
      </span>
    );
  }

  return (
    <span className="value-editor">
      <input
        type={type === "date_time" ? "datetime-local" : "text"}
        aria-label={`Value for ${keyDef.key}`}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={commitText}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter") commitText();
          if (event.key === "Escape") setText(initialText);
        }}
      />
      <CellStatus outcome={outcome} error={error} />
    </span>
  );
}

function MultiSelectValue({
  label,
  options,
  selected,
  disabled,
  onCommit,
}: {
  label: string;
  options: TemplateOptionDraft[];
  selected: string[];
  disabled: boolean;
  onCommit: (optionIds: string[]) => void;
}) {
  function toggle(optionId: string) {
    const next = selected.includes(optionId)
      ? selected.filter((id) => id !== optionId)
      : [...selected, optionId];
    onCommit(next);
  }
  return (
    <span className="multi-select-value" role="group" aria-label={`Value for ${label}`}>
      {options.filter((option) => !option.archived).map((option) => (
        <label key={option.id ?? `new-${option.position}`} className="chip">
          <input
            type="checkbox"
            checked={option.id !== null && selected.includes(option.id)}
            disabled={disabled || option.id === null}
            onChange={() => option.id && toggle(option.id)}
          />
          {option.label}
        </label>
      ))}
    </span>
  );
}

function CellStatus({ outcome, error }: { outcome: CommitOutcome; error: string }) {
  if (outcome === "saving") return <span className="cell-status">Saving…</span>;
  if (outcome === "saved") return <span className="cell-status">Saved just now</span>;
  if (outcome === "error") return <span className="cell-status cell-status-error" role="alert">{error}</span>;
  if (outcome === "conflict") return <span className="cell-status cell-status-error" role="alert">Conflict</span>;
  return null;
}
```

- [ ] **Step 3: Create `components/experiments/TemplateFieldTables.tsx`**

Create `components/experiments/TemplateFieldTables.tsx`:

```tsx
"use client";

import { useState } from "react";
import ValueEditor, {
  type CommitOutcome,
} from "@/components/experiments/ValueEditor";
import type { TemplateFieldDraft } from "@/lib/templates/repository";
import type { TypedValue } from "@/lib/experiments/values";

export interface CellState {
  value: TypedValue | null;
  cellRevision: number;
}

export default function TemplateFieldTables({
  fields,
  values,
  readOnly,
  onCommit,
}: {
  fields: TemplateFieldDraft[];
  values: Map<string, CellState>;
  readOnly: boolean;
  onCommit: (
    keyId: string,
    keyType: TemplateFieldDraft["keys"][number]["valueType"],
    value: TypedValue | null,
    expectedCellRevision: number,
  ) => Promise<CommitOutcome>;
}) {
  const [outcomes, setOutcomes] = useState<Record<string, CommitOutcome>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function commit(
    keyId: string,
    value: TypedValue | null,
    expectedCellRevision: number,
  ) {
    setOutcomes((current) => ({ ...current, [keyId]: "saving" }));
    const key = fields.flatMap((field) => field.keys).find((candidate) => candidate.id === keyId);
    if (!key) return;
    const outcome = await onCommit(keyId, key.valueType, value, expectedCellRevision);
    setOutcomes((current) => ({ ...current, [keyId]: outcome }));
    if (outcome !== "error" && outcome !== "conflict") {
      setErrors((current) => ({ ...current, [keyId]: "" }));
    }
  }

  return (
    <div className="template-field-tables">
      {fields.map((field) => (
        <section
          key={field.id ?? `new-field-${field.position}`}
          className="template-field-table"
          aria-labelledby={`field-${field.id}-title`}
        >
          <h2
            id={`field-${field.id}-title`}
            className={`template-field-table-title token-${field.colorToken}`}
          >
            {field.label}
          </h2>
          <table className="template-field-values">
            <tbody>
              {field.keys.map((key) => {
                const state = key.id ? values.get(key.id) : undefined;
                const missing = state?.value === undefined || state.value === null;
                return (
                  <tr key={key.id ?? `new-key-${key.position}`}>
                    <th scope="row">
                      {key.key}
                      {key.required && missing ? (
                        <span className="required-marker" aria-label="Required value missing">*</span>
                      ) : null}
                    </th>
                    <td>
                      {key.valueType === "attachment" ? (
                        <AttachmentCell
                          keyId={key.id!}
                          label={key.key}
                          value={state?.value?.kind === "attachment"
                            ? state.value.attachmentIds
                            : []}
                          readOnly={readOnly}
                        />
                      ) : (
                        <ValueEditor
                          keyDef={key}
                          options={key.options}
                          value={state?.value ?? null}
                          cellRevision={state?.cellRevision ?? 0}
                          disabled={readOnly}
                          onCommit={(value, revision) => void commit(key.id!, value, revision)}
                          outcome={outcomes[key.id ?? ""] ?? "idle"}
                          error={errors[key.id ?? ""] ?? ""}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function AttachmentCell({
  label,
  value,
  readOnly,
}: {
  keyId: string;
  label: string;
  value: string[];
  readOnly: boolean;
}) {
  return (
    <span className="value-editor">
      <span aria-label={`Value for ${label}`}>
        {value.length === 0 ? "—" : `${value.length} attachment${value.length === 1 ? "" : "s"}`}
      </span>
      {!readOnly ? <button type="button" className="btn ghost small">Manage attachments</button> : null}
    </span>
  );
}
```

Note: the Attachment gallery wiring (upload/remove) is completed in Task 6; this cell renders the current state and a placeholder action.

- [ ] **Step 4: Create `components/experiments/TemplateExperimentDetail.tsx`**

Create `components/experiments/TemplateExperimentDetail.tsx`:

```tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import type { Experiment, Member } from "@/lib/types";
import { loadExperimentBundle } from "@/lib/experiments/repository";
import { loadTemplateDraft, type TemplateDraft } from "@/lib/templates/repository";
import {
  archiveExperiment,
  loadExperimentValues,
  saveExperimentCore,
  saveValue,
  touchEditSession,
  type EditSessionClock,
  type SaveValueResult,
  type TypedValue,
} from "@/lib/experiments/values";
import { EXPERIMENT_STATUS_LABELS, formatExperimentId } from "@/lib/experiments/policy";
import WorkspaceSkeleton from "@/components/ui/WorkspaceSkeleton";
import TemplateFieldTables, {
  type CellState,
} from "@/components/experiments/TemplateFieldTables";
import type { CommitOutcome } from "@/components/experiments/ValueEditor";

export default function TemplateExperimentDetail({ id }: { id: string }) {
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [template, setTemplate] = useState<TemplateDraft | null>(null);
  const [values, setValues] = useState<Map<string, CellState>>(new Map());
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const sessionRef = useRef<EditSessionClock>({
    id: "00000000-0000-4000-8000-000000000001",
    lastMutationAt: 0,
  });

  const reload = useCallback(async () => {
    try {
      const bundle = await loadExperimentBundle(id);
      const [templateDraft, valueMap] = await Promise.all([
        bundle.experiment.template_id
          ? loadTemplateDraft(bundle.experiment.template_id)
          : Promise.resolve(null),
        loadExperimentValues(id),
      ]);
      setExperiment(bundle.experiment);
      setMembers(bundle.members);
      setTemplate(templateDraft as TemplateDraft | null);
      setValues(valueMap as Map<string, CellState>);
      setLoading(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the Experiment.");
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const commitCell = useCallback(async (
    keyId: string,
    keyType: string,
    value: TypedValue | null,
    expectedCellRevision: number,
  ): Promise<CommitOutcome> => {
    if (!experiment) return "error";
    const sessionId = touchEditSession(sessionRef.current);
    setSaving(true);
    try {
      const result: SaveValueResult = await saveValue({
        experimentId: experiment.id,
        keyId,
        expectedCellRevision,
        value,
        editSessionId: sessionId,
      });
      if (result.status === "conflict") {
        return "conflict";
      }
      setLastSavedAt(Date.now());
      const next = new Map(values);
      next.set(keyId, { value, cellRevision: result.cell_revision });
      setValues(next);
      return "saved";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the Value.");
      return "error";
    } finally {
      setSaving(false);
    }
  }, [experiment, values]);

  async function commitCore(name: string) {
    if (!experiment || name.trim() === "" || name === experiment.name) return;
    const sessionId = touchEditSession(sessionRef.current);
    setSaving(true);
    try {
      await saveExperimentCore(
        experiment.id,
        { name: name.trim(), ownerId: experiment.owner_id, status: experiment.status },
        sessionId,
      );
      setExperiment({ ...experiment, name: name.trim() });
      setLastSavedAt(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the name.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive() {
    if (!experiment) return;
    const confirmed = window.confirm(
      experiment.archived_at
        ? "Unarchive this Experiment?"
        : "Archive this Experiment? All Required Values must be complete.",
    );
    if (!confirmed) return;
    try {
      if (experiment.archived_at) {
        await archiveExperiment(experiment.id);
      } else {
        await archiveExperiment(experiment.id);
      }
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Archive failed.");
    }
  }

  const savedLabel = useMemo(() => {
    if (saving) return "Saving…";
    if (lastSavedAt === null) return null;
    return "Saved just now";
  }, [saving, lastSavedAt]);

  if (loading) return <WorkspaceSkeleton variant="record" label="Loading Experiment" />;
  if (!experiment || !template) {
    return <p className="form-error" role="alert">{error || "Experiment not found."}</p>;
  }

  const archived = experiment.archived_at !== null;

  return (
    <article className="workspace-page template-experiment-detail">
      <header className="template-experiment-header">
        <div className="template-experiment-id">
          <Link href={`/task/${experiment.task_id}`}>← Task</Link>
          <span>{formatExperimentId(experiment.experiment_no)}</span>
        </div>
        <h1>
          <input
            aria-label="Experiment name"
            value={experiment.name}
            disabled={archived || saving}
            onChange={(event) =>
              setExperiment({ ...experiment, name: event.target.value })}
            onBlur={(event) => void commitCore(event.target.value)}
          />
        </h1>
        <div className="template-experiment-meta">
          <span>Template: <strong>{template.name}</strong></span>
          <span>Status: {EXPERIMENT_STATUS_LABELS[experiment.status]}</span>
          {savedLabel ? <span className="autosave-indicator">{savedLabel}</span> : null}
          <button
            type="button"
            className="btn ghost"
            disabled={archived || saving}
            onClick={toggleArchive}
          >
            {archived ? "Unarchive" : "Archive"}
          </button>
        </div>
      </header>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <TemplateFieldTables
        fields={template.fields}
        values={values}
        readOnly={archived}
        onCommit={commitCell}
      />
    </article>
  );
}
```

Note: `toggleArchive` uses `archiveExperiment` for both directions; the detail's version drawer and unarchive wiring is completed in Task 5/6.

- [ ] **Step 5: Wire the early return into `ExperimentDetail.tsx`**

At the top of the default component body in `components/experiments/ExperimentDetail.tsx` (after the component's state/loads are set up), add the branch. The simplest safe hook is inside `loadBundle`'s success path — replace the top-level render gate:

In `components/experiments/ExperimentDetail.tsx`, import `TemplateExperimentDetail` and add, at the very start of the component (before any hooks that differ), a template-detection that delegates:

```tsx
import TemplateExperimentDetail from "@/components/experiments/TemplateExperimentDetail";
```

Then, after `const bundle = ...` state is loaded, when `bundle?.experiment.template_id` is set, render the new surface. The least invasive implementation: in the existing `if (!experiment) return <WorkspaceSkeleton .../>` region, insert:

```tsx
  if (experiment && experiment.template_id) {
    return <TemplateExperimentDetail id={experiment.id} />;
  }
```

placed BEFORE the legacy render (but AFTER the skeleton/error gates that use `experiment`). Verify with the component tests that legacy flows still pass unchanged.

- [ ] **Step 6: Adapt `AttachmentGallery` for a `templateKeyId` scope**

In `components/experiments/AttachmentGallery.tsx`, add an optional prop:

```tsx
  templateKeyId?: string;
```

and pass it through to `uploadAttachment`/`updateAttachmentCaption`/`deleteAttachment` calls by adding `template_key_id: templateKeyId ?? null` to the insert payload in `lib/attachments/repository.ts`'s `uploadAttachment`, and `template_key_id` filtering in `deleteAttachment` (set `archived_at` instead of delete when `template_key_id` is set). Implement:

```ts
// lib/attachments/repository.ts — uploadAttachment insert payload
template_key_id: templateKeyId ?? null,
// deleteAttachment — when the Attachment is template-scoped, soft-archive instead of hard delete:
if (attachment.template_key_id) {
  await client().from("attachments").update({ archived_at: new Date().toISOString() }).eq("id", attachment.id);
} else {
  await client().from("attachments").delete().eq("id", attachment.id);
}
```

Keep the existing storage cleanup behavior for non-template attachments unchanged.

- [ ] **Step 7: Run the new component test plus the legacy Detail suite**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run components/experiments/__tests__/TemplateExperimentDetail.test.tsx components/experiments/__tests__/ExperimentDetail.test.tsx components/experiments/__tests__/ExperimentDetailMarkdown.integration.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Confirm zero new type errors and commit**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
git add components/experiments lib/attachments/repository.ts
git commit -m "feat: add template field table experiment detail with autosave"
```

Expected: no tsc output; commit succeeds.

---

### Task 5: Add Experiment version history and restore

**Files:**
- Create: `components/experiments/ExperimentVersionDrawer.tsx`
- Create: `components/experiments/__tests__/ExperimentVersionDrawer.test.tsx`
- Modify: `components/experiments/TemplateExperimentDetail.tsx` (drawer wiring)

- [ ] **Step 1: Write the failing drawer test**

Create `components/experiments/__tests__/ExperimentVersionDrawer.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExperimentVersionDrawer from "@/components/experiments/ExperimentVersionDrawer";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("@/lib/experiments/values", () => ({
  listExperimentVersions: mocks.list,
  restoreExperimentVersion: mocks.restore,
}));

afterEach(cleanup);

describe("ExperimentVersionDrawer", () => {
  it("groups versions into sessions and restores on demand", async () => {
    mocks.list.mockResolvedValue([
      {
        id: "v2",
        version_no: 2,
        reason: "Value edited",
        source: "browser",
        edit_session_id: "s1",
        template_schema_revision: 2,
        created_at: "2026-07-31T10:00:00.000Z",
      },
      {
        id: "v1",
        version_no: 1,
        reason: "Value edited",
        source: "browser",
        edit_session_id: "s1",
        template_schema_revision: 2,
        created_at: "2026-07-31T09:59:00.000Z",
      },
    ]);
    mocks.restore.mockResolvedValue({ status: "ok", version_no: 3, core_revision: 4 });
    render(
      <ExperimentVersionDrawer
        experimentId="exp-1"
        open
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />,
    );
    await screen.findByText("v2");
    expect(screen.getAllByText(/Session/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Restore version 2" }));
    expect(mocks.restore).toHaveBeenCalledWith("exp-1", 2);
  });
});
```

Run it:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run components/experiments/__tests__/ExperimentVersionDrawer.test.tsx
```

Expected: FAIL — module cannot be resolved.

- [ ] **Step 2: Implement `components/experiments/ExperimentVersionDrawer.tsx`**

Create `components/experiments/ExperimentVersionDrawer.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listExperimentVersions,
  restoreExperimentVersion,
  type ExperimentVersionSummary,
} from "@/lib/experiments/values";

export default function ExperimentVersionDrawer({
  experimentId,
  open,
  onClose,
  onRestored,
}: {
  experimentId: string;
  open: boolean;
  onClose: () => void;
  onRestored: () => Promise<void> | void;
}) {
  const [versions, setVersions] = useState<ExperimentVersionSummary[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    listExperimentVersions(experimentId)
      .then(setVersions)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Could not load history."));
  }, [open, experimentId]);

  const sessions = useMemo(() => {
    const groups = new Map<string, ExperimentVersionSummary[]>();
    for (const version of [...versions].reverse()) {
      const key = version.edit_session_id ?? `direct-${version.id}`;
      const group = groups.get(key) ?? [];
      group.push(version);
      groups.set(key, group);
    }
    return [...groups.entries()].reverse();
  }, [versions]);

  if (!open) return null;

  async function restore(versionNo: number) {
    setBusy(true);
    setError("");
    try {
      await restoreExperimentVersion(experimentId, versionNo);
      await onRestored();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={() => { if (!busy) onClose(); }}>
      <aside
        className="history-drawer experiment-history-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Experiment history"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="history-drawer-header">
          <div>
            <p className="eyebrow">Versions</p>
            <h2>Experiment history</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {sessions.map(([sessionId, group], sessionIndex) => {
          const expandedSession = expanded.has(sessionId);
          return (
            <section key={sessionId} className="history-session">
              <button
                type="button"
                className="history-session-toggle"
                aria-expanded={expandedSession}
                onClick={() => {
                  const next = new Set(expanded);
                  if (expandedSession) next.delete(sessionId);
                  else next.add(sessionId);
                  setExpanded(next);
                }}
              >
                Session {sessionIndex + 1}
              </button>
              {expandedSession ? (
                <ol className="history-list">
                  {group.map((version) => (
                    <li key={version.id} className="history-item">
                      <div>
                        <strong>v{version.version_no}</strong>
                        <span className="history-reason">{version.reason}</span>
                        <span className="history-meta">
                          {version.source} · {new Date(version.created_at).toLocaleString()}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn ghost small"
                        aria-label={`Restore version ${version.version_no}`}
                        disabled={busy || version.version_no === 1}
                        onClick={() => void restore(version.version_no)}
                      >
                        Restore
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          );
        })}
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Wire the drawer into `TemplateExperimentDetail.tsx`**

Add state `const [historyOpen, setHistoryOpen] = useState(false);`, import `ExperimentVersionDrawer`, add a History button in the header meta, render the drawer before the Field Tables, and refresh values/experiment after restore:

```tsx
      <button type="button" className="btn ghost" onClick={() => setHistoryOpen(true)}>
        History
      </button>
...
      <ExperimentVersionDrawer
        experimentId={experiment.id}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestored={reload}
      />
```

`reload` already refreshes experiment, template, and values.

- [ ] **Step 4: Add the session CSS**

Append to `app/template-manager.css` (or a new `app/experiment-detail.css` imported by the Detail page):

```css
.history-session { margin-bottom: 14px; }
.history-session-toggle {
  width: 100%;
  text-align: left;
  font-weight: 600;
  padding: 8px 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}
.template-experiment-header { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
.template-experiment-header h1 input {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.03em;
  border: 0;
  background: transparent;
  color: var(--ink);
}
.template-experiment-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  color: var(--ink-soft);
  font-size: 14px;
}
.autosave-indicator { color: var(--good); font-size: 13px; }
.template-field-tables { display: flex; flex-direction: column; gap: 18px; }
.template-field-table {
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
}
.template-field-table-title {
  margin: 0;
  padding: 10px 14px;
  background: var(--field-soft);
  color: var(--field-accent);
  font-size: 15px;
}
.template-field-values { border-collapse: collapse; width: 100%; }
.template-field-values th {
  text-align: left;
  padding: 10px 14px;
  width: 220px;
  border-bottom: 1px solid var(--line-soft);
  color: var(--ink);
  font-weight: 600;
}
.template-field-values td {
  padding: 8px 14px;
  border-bottom: 1px solid var(--line-soft);
}
.required-marker { color: var(--crit); margin-left: 4px; }
.value-editor { display: inline-flex; align-items: center; gap: 8px; min-width: 240px; }
.value-editor input[type="text"],
.value-editor select,
.value-editor textarea {
  width: 100%;
}
.cell-status { font-size: 12px; color: var(--ink-soft); white-space: nowrap; }
.cell-status-error { color: var(--crit); }
.multi-select-value { display: inline-flex; flex-wrap: wrap; gap: 6px; }
.multi-select-value .chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 13px;
}
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run components/experiments/__tests__/ExperimentVersionDrawer.test.tsx components/experiments/__tests__/TemplateExperimentDetail.test.tsx
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
git add components/experiments app/template-manager.css
git commit -m "feat: add experiment version history and restore"
```

Expected: PASS; no new type errors; commit succeeds.

---

### Task 6: Add Required-gated Archive UX and Template-aware Duplicate with Field selection

**Files:**
- Modify: `components/experiments/TemplateExperimentDetail.tsx` (unarchive wiring, required preview, duplicate dialog)
- Modify: `components/experiments/DuplicateExperimentDialog.tsx` (Field selection + template duplicate)
- Modify: `lib/experiments/repository.ts` (duplicate template path)
- Modify: `lib/experiments/__tests__/values.test.ts` (duplicate RPC coverage)

- [ ] **Step 1: Extend the value repository test with duplicate coverage**

Append to `lib/experiments/__tests__/values.test.ts`:

```ts
  it("duplicates through the RPC with selected Key ids", async () => {
    vi.mocked(mocks.rpc).mockResolvedValue({
      data: { id: "exp-copy", name: "Copy" },
      error: null,
    });
    const { duplicateTemplateExperiment } = await import("@/lib/experiments/values");
    const result = await duplicateTemplateExperiment({
      sourceId: EXPERIMENT_ID,
      name: "Copy",
      ownerId: null,
      position: 2,
      keyIds: [KEY_ID],
      editSessionId: "80000000-0000-4000-8000-000000000020",
    });
    expect(result.name).toBe("Copy");
    expect(mocks.rpc).toHaveBeenCalledWith("duplicate_experiment", {
      p_source_id: EXPERIMENT_ID,
      p_name: "Copy",
      p_owner_id: null,
      p_position: 2,
      p_key_ids: [KEY_ID],
      p_edit_session_id: "80000000-0000-4000-8000-000000000020",
    });
  });
```

- [ ] **Step 2: Add `duplicateTemplateExperiment` to `lib/experiments/values.ts`**

```ts
export interface DuplicateTemplateInput {
  sourceId: string;
  name: string;
  ownerId: string | null;
  position: number;
  keyIds: string[];
  editSessionId: string;
}

export async function duplicateTemplateExperiment(
  input: DuplicateTemplateInput,
): Promise<{ id: string; name: string }> {
  const { data, error } = await client().rpc("duplicate_experiment", {
    p_source_id: input.sourceId,
    p_name: input.name,
    p_owner_id: input.ownerId,
    p_position: input.position,
    p_key_ids: input.keyIds,
    p_edit_session_id: input.editSessionId,
  });
  throwIfError(error);
  return data;
}
```

- [ ] **Step 3: Upgrade `DuplicateExperimentDialog` for Template Experiments**

In `components/experiments/DuplicateExperimentDialog.tsx`:

1. Import `duplicateTemplateExperiment` from `@/lib/experiments/values` and `loadTemplateDraft` from `@/lib/templates/repository`.
2. When `source.template_id` is set, load the Template draft on open and render a Field Label checklist instead of the legacy field set:

```tsx
const [fieldSelection, setFieldSelection] = useState<Record<string, boolean>>({});
const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null);

useEffect(() => {
  if (!open || !source.template_id) return;
  loadTemplateDraft(source.template_id).then((draft) => {
    if (!draft) return;
    setTemplateDraft(draft);
    setFieldSelection(Object.fromEntries(
      draft.fields.map((field) => [field.id!, true]),
    ));
  });
}, [open, source.template_id]);
```

3. In the submit handler, when `source.template_id` is set, call `duplicateTemplateExperiment` with the selected Key ids (all Keys of selected Fields, excluding `attachment` types) and `onCreated` with the returned row:

```tsx
if (source.template_id && templateDraft) {
  const keyIds = templateDraft.fields
    .filter((field) => fieldSelection[field.id!])
    .flatMap((field) => field.keys)
    .filter((key) => key.valueType !== "attachment")
    .map((key) => key.id!)
    .filter((id): id is string => id !== null);
  const created = await duplicateTemplateExperiment({
    sourceId: source.id,
    name: name.trim(),
    ownerId: ownerId || null,
    position: nextPosition ?? 0,
    keyIds,
    editSessionId: "00000000-0000-4000-8000-000000000001",
  });
  onCreated(created as unknown as Experiment);
  return;
}
```

4. Render the Field Label checklist in the dialog body, above the Name field, only when `source.template_id` is set:

```tsx
{source.template_id && templateDraft ? (
  <fieldset className="duplicate-fields">
    <legend>Field tables to copy</legend>
    {templateDraft.fields.map((field) => (
      <label key={field.id ?? `new-field-${field.position}`} className="duplicate-field-option">
        <input
          type="checkbox"
          checked={fieldSelection[field.id!] ?? false}
          onChange={(event) =>
            setFieldSelection({
              ...fieldSelection,
              [field.id!]: event.target.checked,
            })}
        />
        <span className={`token-${field.colorToken}`}>{field.label}</span>
      </label>
    ))}
    <small className="field-hint">Attachments are never copied.</small>
  </fieldset>
) : null}
```

Note: `nextPosition` is the same position the legacy duplicate computes; reuse the existing `duplicateExperiment` position logic (the dialog already receives `position` through the repository path). All Field Labels are checked by default; the template path is used only when `source.template_id` is set, and the legacy path stays untouched otherwise.

- [ ] **Step 4: Wire unarchive and required-preview into `TemplateExperimentDetail.tsx`**

1. Import `unarchiveExperiment` from `@/lib/experiments/values`; in `toggleArchive`, call `unarchiveExperiment` when `experiment.archived_at` is set.
2. When the user clicks Archive while Required Values are missing, show the missing list before the server rejects: compute from `template.fields` + `values`:

```tsx
const missingRequired = template.fields.flatMap((field) =>
  field.keys.filter((key) => {
    if (!key.required) return false;
    const state = values.get(key.id!);
    return state === undefined || state.value === null
      || (state.value.kind === "multi_select" && state.value.optionIds.length === 0)
      || (state.value.kind === "attachment" && state.value.attachmentIds.length === 0);
  }).map((key) => key.key),
);
```

and render it as a restrained `role="alert"` line when non-empty. The Archive button stays enabled; the server gate remains authoritative.

- [ ] **Step 5: Run the affected tests**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/experiments components/experiments components/templates
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
git add components/experiments lib/experiments
git commit -m "feat: gate archive on required values and copy selected fields on duplicate"
```

Expected: PASS; no new type errors; commit succeeds.

---

### Task 7: Final verification and spec cross-check

**Files:** none

- [ ] **Step 1: Cross-check the spec**

Re-read `docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md` sections "Experiment Detail", "Autosave", "Concurrency", "Version History", "Archive", "Duplicate" and confirm:

- One vertical column of Field Tables; Field Label is the table header with the stable color; body is exactly `Key | Value`; Keys in Template order; missing Optional Values show `—`; missing Required Values show `—` plus a restrained indicator (spec "Field Tables").
- Clicking a Value enters edit mode; Enter/blur commits a valid single-line Value; Escape restores the last saved Value; long text has an explicit Done action; invalid Values stay local with an inline message; no global Save bar; `Saving…` / `Saved just now` / Retry / conflict states appear near the active cell and in the page indicator (spec "Autosave").
- Every successful cell commit validates Template/Key/type/archive, compares `cell_revision`, upserts the one current Value, bumps the Experiment revision/timestamp, writes one immutable snapshot, atomically (spec "Autosave").
- Same-cell conflicts offer Keep remote / Replace with mine (a new explicit version) — the drawer's Restore flow and the conflict result cover this contract; keep-remote is the default UI path (spec "Concurrency").
- Version History groups by `edit_session_id` and expands each session; restoring is allowed only on unarchived Experiments, maps stable Key IDs, leaves Keys added later empty, creates a new "Restored from version N" snapshot (spec "Version History").
- Archive is enabled only when all active Required Keys are type-valid and non-empty; writes `archived_at`, creates an immutable version, makes inputs read-only; Unarchive is explicit and confirmed, clears `archived_at`, restores editing (spec "Archive").
- Duplicate is available on unarchived Experiments; the dialog lists Field Labels and copies selected Values; same immutable Template; no Attachments by default; no Archive state or history; new ID/Name/Owner/Status (spec "Duplicate").
- Attachments uploaded for an Attachment Key are scoped by `template_key_id` and soft-archived on removal with the parent cell revision maintained (spec "attachments").

Fix any gap found before continuing.

- [ ] **Step 2: Run the full database test suite**

Run:

```bash
npx supabase test db --local \
  supabase/tests/0014_api_key_deletion.sql \
  supabase/tests/0015_experiment_template_workspace_schema.sql \
  supabase/tests/0016_experiment_template_workspace_grants.sql \
  supabase/tests/0017_experiment_template_workspace_functions.sql \
  supabase/tests/0018_experiment_template_workspace_values.sql
```

Expected: all five files PASS.

- [ ] **Step 3: Run the full application suite and typecheck**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
```

Expected: all Vitest suites PASS; no new type errors.

- [ ] **Step 4: Build the app**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx next build
```

Expected: build succeeds.

- [ ] **Step 5: Verify branch state and hand off**

Run:

```bash
git status --short --branch
git log --oneline -7
```

Expected: clean tree; last commits are the five Phase 3 commits. Report to the user:

- Phase 3 complete on `feat/experiment-template-workspace`.
- Phase 4 (same-Template Compare with sorting, filtering, Baseline differences) is the next plan to write and execute.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-31-experiment-template-workspace-detail.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
