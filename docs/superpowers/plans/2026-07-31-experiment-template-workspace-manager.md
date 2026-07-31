# Experiment Template Workspace — Phase 2 (Template Manager + Template-aware Creation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Template Manager at `/experiments/templates` (list, schema editor, options, history, archive) and make every Experiment creation entry point require an active Template that can never change.

**Architecture:** Template mutations go through one atomic `security invoker` Postgres function that upserts Fields/Keys/Options, bumps `schema_revision` optimistically, and appends an immutable `experiment_template_versions` snapshot. The browser writes via that function (never multi-table Data API writes), reads through a small template repository, and renders a two-pane dense manager with a single continuous schema table. Experiment creation inserts `template_id` and the existing immutability guard keeps it fixed forever.

**Tech Stack:** Supabase Postgres functions + pgTAP, Next.js 16 App Router client components (existing house pattern), TypeScript, Vitest + Testing Library.

---

## Global Constraints

- Work only in `.worktrees/experiment-template-workspace` on `feat/experiment-template-workspace` (already checked out; do not switch branches).
- Authoritative design: `docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md` — read the "Experiment Template", "Template Manager", "Create Experiment", and "Safe Template evolution" sections before starting.
- Phase 1 is committed on this branch: all 8 tables, `experiments.template_id/archived_at/core_revision`, grants, RLS, and repository types already exist. Reuse them; do not modify Phase 1 migrations.
- Template mutations MUST go through `save_experiment_template` / `archive_experiment_template` / `unarchive_experiment_template`. Never issue direct multi-table Data API writes for Fields/Keys/Options; every mutation must bump `schema_revision` and write a snapshot.
- Additive only. Legacy `experiments` content columns stay untouched. No hard delete of referenced rows — the save function archives them.
- House patterns: pgTAP tests in `supabase/tests/NNNN_<name>.sql` run with `npx supabase test db --local`; Vitest tests under `**/__tests__/**/*.test.{ts,tsx}`; migrations created with `npx supabase migration new <name>`; commit after every task.
- Next.js 16 note (AGENTS.md): before any UI task, read `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` and skim `01-getting-started/04-linking-and-navigating.md` + `05-server-and-client-components.md`. All new pages follow the existing repo pattern (thin server page rendering a `"use client"` component).
- Node: the repo requires Node 24.18.0. This environment's default `node` is 18, so run Vitest/tsc/build with `PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH` (already downloaded). `npx supabase ...` needs escalated permissions (`require_escalated`; an approval rule for `npx supabase` exists).
- `npx tsc --noEmit` has pre-existing failures in unrelated test files (Analytics/Board/OwnerPicker/ExperimentsDatabase Task literals). The gate for this plan is: zero NEW type errors introduced by these changes (compare before/after error lists).
- Commit after every task with the exact commit message shown. Do not commit unrelated working-tree changes.

## Planned File Structure

Create:
- `supabase/tests/0017_experiment_template_workspace_functions.sql` (Task 1)
- `supabase/migrations/<timestamp>_experiment_template_workspace_functions.sql` (Task 2)
- `lib/templates/repository.ts` (Task 3)
- `lib/templates/impact.ts` (Task 3)
- `lib/templates/__tests__/repository.test.ts` (Task 3)
- `lib/templates/__tests__/impact.test.ts` (Task 3)
- `app/experiments/templates/page.tsx` (Task 4)
- `app/template-manager.css` (Task 4)
- `components/templates/TemplateManager.tsx` (Task 4)
- `components/templates/TemplateList.tsx` (Task 4)
- `components/templates/NewTemplateDialog.tsx` (Task 4)
- `components/templates/TemplateEditor.tsx` (Task 5)
- `components/templates/OptionsEditor.tsx` (Task 5)
- `components/templates/TemplateHistoryDrawer.tsx` (Task 6)
- `components/templates/__tests__/TemplateManager.test.tsx` (Task 4)
- `components/templates/__tests__/TemplateEditor.test.tsx` (Task 5)

Modify:
- `lib/experiments/policy.ts` — `ExperimentInsert` gains `template_id`; `buildDuplicateInsert` copies `source.template_id` (Task 7)
- `lib/experiments/repository.ts` — `NewExperimentInput` gains `templateId`; insert sets `template_id` (Task 7)
- `components/experiments/CreateExperimentDialog.tsx` — required Template select step (Task 7)
- `lib/experiments/__tests__/repository.test.ts`, `lib/experiments/__tests__/policy.test.ts`, `components/experiments/__tests__/CreateExperimentDialog.test.tsx`, `components/experiments/__tests__/TaskExperimentsPanel.test.tsx` — fixture/assertion updates (Task 7)

**Database objects produced (Task 2, all `public`):**

`save_experiment_template(p_template_id uuid, p_name text, p_description text, p_expected_schema_revision bigint, p_fields jsonb)` — atomic schema upsert: creates/updates Fields, Keys (with `field_id` moves), and options; archives vs. hard-deletes removed rows by reference; locks Value Type of populated Keys; bumps `schema_revision`; appends one immutable `experiment_template_versions` snapshot; returns `{template_id, schema_revision, version_no}`.

`archive_experiment_template(p_template_id uuid)` / `unarchive_experiment_template(p_template_id uuid)` — toggle `archived_at`, bump revision, append snapshot.

`guard_experiment_creation_template_active()` — `before insert` trigger on `experiments` rejecting archived Templates.

`_experiment_template_snapshot(p_template_id uuid)` — private snapshot builder (execute revoked from every client role).

`grant execute ... to authenticated` on the three public functions; revoke from `public`/`anon`.

---

### Task 1: Write the failing pgTAP test for template mutation functions

**Files:**
- Create: `supabase/tests/0017_experiment_template_workspace_functions.sql`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0017_experiment_template_workspace_functions.sql`:

```sql
begin;
select plan(30);

-- Privileges -----------------------------------------------------------------
select ok(
  has_function_privilege(
    'authenticated',
    'public.save_experiment_template(uuid,text,text,bigint,jsonb)',
    'execute'
  ),
  'authenticated can save Templates'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.archive_experiment_template(uuid)',
    'execute'
  ),
  'authenticated can archive Templates'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.unarchive_experiment_template(uuid)',
    'execute'
  ),
  'authenticated can unarchive Templates'
);
select ok(
  not has_function_privilege('anon', 'public.save_experiment_template(uuid,text,text,bigint,jsonb)', 'execute'),
  'anon cannot save Templates'
);
select ok(
  not has_function_privilege('authenticated', 'public._experiment_template_snapshot(uuid)', 'execute'),
  'authenticated cannot call the snapshot helper'
);

-- Setup -----------------------------------------------------------------------
insert into public.modules (id, name, kind)
values ('10000000-0000-4000-8000-000000000002', 'Template function test module', 'pipeline');
insert into public.tasks (id, module_id, title)
values ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Template function test task');
insert into public.experiment_templates (id, name)
values ('30000000-0000-4000-8000-000000000010', 'Function Benchmark');
insert into public.experiments (id, task_id, template_id)
values ('60000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010');

-- Create through the save function ----------------------------------------------
select is(
  (select public.save_experiment_template(
    '30000000-0000-4000-8000-000000000010',
    'Function Benchmark',
    'Created by save function',
    1,
    '[{
      "id": null,
      "label": "Metrics",
      "color_token": "blue",
      "position": 1,
      "keys": [{
        "id": null,
        "key": "pass@1",
        "value_type": "number",
        "required": false,
        "position": 1,
        "options": []
      }, {
        "id": null,
        "key": "device",
        "value_type": "single_select",
        "required": false,
        "position": 2,
        "options": [
          {"id": null, "label": "npu:1", "position": 1, "archived": false},
          {"id": null, "label": "gpu:0", "position": 2, "archived": false}
        ]
      }]
    }]'::jsonb
  )->>'schema_revision'),
  '2',
  'save bumps schema_revision to 2'
);
select is(
  (select count(*)::int from public.experiment_template_versions
   where template_id = '30000000-0000-4000-8000-000000000010'),
  1,
  'save writes one immutable version'
);
select is(
  (select version_no from public.experiment_template_versions
   where template_id = '30000000-0000-4000-8000-000000000010'),
  1,
  'first version is version_no 1'
);
select is(
  (select source from public.experiment_template_versions
   where template_id = '30000000-0000-4000-8000-000000000010'),
  'browser',
  'version records browser source'
);
select ok(
  (select snapshot @> '{"label": "Metrics"}'::jsonb
   from public.experiment_template_versions
   where template_id = '30000000-0000-4000-8000-000000000010'),
  'snapshot contains the Field Label'
);
select is(
  (select count(*)::int from public.experiment_template_keys
   where template_id = '30000000-0000-4000-8000-000000000010'),
  2,
  'save created both Keys'
);
select is(
  (select count(*)::int from public.experiment_template_key_options
   where template_id = '30000000-0000-4000-8000-000000000010'),
  2,
  'save created both options'
);

-- Rename preserves stable IDs -----------------------------------------------------
select is(
  (select public.save_experiment_template(
    '30000000-0000-4000-8000-000000000010',
    'Function Benchmark',
    'Renamed key',
    2,
    '[{
      "id": (select id from public.experiment_template_fields where template_id = '30000000-0000-4000-8000-000000000010'),
      "label": "Metrics",
      "color_token": "blue",
      "position": 1,
      "keys": [
        {
          "id": (select id from public.experiment_template_keys where template_id = '30000000-0000-4000-8000-000000000010' and key = 'pass@1'),
          "key": "pass@1_new",
          "value_type": "number",
          "required": true,
          "position": 1,
          "archived": false,
          "options": []
        },
        {
          "id": (select id from public.experiment_template_keys where template_id = '30000000-0000-4000-8000-000000000010' and key = 'device'),
          "key": "device",
          "value_type": "single_select",
          "required": false,
          "position": 2,
          "archived": false,
          "options": [
            {"id": (select id from public.experiment_template_key_options where template_id = '30000000-0000-4000-8000-000000000010' and label = 'npu:1'), "label": "npu:1", "position": 1, "archived": false},
            {"id": (select id from public.experiment_template_key_options where template_id = '30000000-0000-4000-8000-000000000010' and label = 'gpu:0'), "label": "gpu:0", "position": 2, "archived": false}
          ]
        }
      ]
    }]'::jsonb
  )->>'schema_revision'),
  '3',
  'second save bumps revision to 3'
);
select is(
  (select count(*)::int from public.experiment_template_versions
   where template_id = '30000000-0000-4000-8000-000000000010'),
  2,
  'second save appends a second version'
);
select is(
  (select count(*)::int from public.experiment_template_keys
   where template_id = '30000000-0000-4000-8000-000000000010'
     and key = 'pass@1_new'
     and archived_at is null),
  1,
  'rename keeps the same stable Key row'
);

-- Concurrency and validation -------------------------------------------------------
select throws_ok(
  $$select public.save_experiment_template(
    '30000000-0000-4000-8000-000000000010', 'Function Benchmark', '', 1, '[]'::jsonb
  )$$,
  'P0001',
  'TEMPLATE_SCHEMA_REVISION_CONFLICT',
  'stale schema_revision is rejected'
);
select throws_ok(
  $$select public.save_experiment_template(
    '30000000-0000-4000-8000-000000000010', '  ', '', 3, '[]'::jsonb
  )$$,
  'P0001',
  'TEMPLATE_NAME_REQUIRED',
  'blank Template names are rejected'
);

-- Populated Key type lock -------------------------------------------------------------
insert into public.experiment_values (
  experiment_id, template_id, key_id, number_value
) values (
  '60000000-0000-4000-8000-000000000010',
  '30000000-0000-4000-8000-000000000010',
  (select id from public.experiment_template_keys where template_id = '30000000-0000-4000-8000-000000000010' and key = 'pass@1_new'),
  0.73
);
select throws_ok(
  $$select public.save_experiment_template(
    '30000000-0000-4000-8000-000000000010',
    'Function Benchmark', '', 3,
    '[{
      "id": (select id from public.experiment_template_fields where template_id = '30000000-0000-4000-8000-000000000010'),
      "label": "Metrics",
      "color_token": "blue",
      "position": 1,
      "keys": [
        {
          "id": (select id from public.experiment_template_keys where template_id = '30000000-0000-4000-8000-000000000010' and key = 'pass@1_new'),
          "key": "pass@1_new",
          "value_type": "text",
          "required": true,
          "position": 1,
          "archived": false,
          "options": []
        }
      ]
    }]'::jsonb
  )$$,
  'P0001',
  'POPULATED_KEY_TYPE_LOCKED',
  'a populated Key cannot change Value Type'
);

-- Archive versus hard delete ------------------------------------------------------------
-- Archive the populated key: it must be soft-archived, not deleted.
select is(
  (select public.save_experiment_template(
    '30000000-0000-4000-8000-000000000010',
    'Function Benchmark', '', 3,
    '[{
      "id": (select id from public.experiment_template_fields where template_id = '30000000-0000-4000-8000-000000000010'),
      "label": "Metrics",
      "color_token": "blue",
      "position": 1,
      "keys": [
        {
          "id": (select id from public.experiment_template_keys where template_id = '30000000-0000-4000-8000-000000000010' and key = 'pass@1_new'),
          "key": "pass@1_new",
          "value_type": "number",
          "required": true,
          "position": 1,
          "archived": true,
          "options": []
        },
        {
          "id": (select id from public.experiment_template_keys where template_id = '30000000-0000-4000-8000-000000000010' and key = 'device'),
          "key": "device",
          "value_type": "single_select",
          "required": false,
          "position": 2,
          "archived": false,
          "options": [
            {"id": (select id from public.experiment_template_key_options where template_id = '30000000-0000-4000-8000-000000000010' and label = 'npu:1'), "label": "npu:1", "position": 1, "archived": false},
            {"id": (select id from public.experiment_template_key_options where template_id = '30000000-0000-4000-8000-000000000010' and label = 'gpu:0'), "label": "gpu:0", "position": 2, "archived": false}
          ]
        }
      ]
    }]'::jsonb
  )->>'schema_revision'),
  '4',
  'archiving a populated Key still saves'
);
select is(
  (select count(*)::int from public.experiment_template_keys
   where template_id = '30000000-0000-4000-8000-000000000010'
     and key = 'pass@1_new'
     and archived_at is not null),
  1,
  'referenced Key is soft-archived, not deleted'
);
select is(
  (select count(*)::int from public.experiment_values
   where key_id = (select id from public.experiment_template_keys
                   where template_id = '30000000-0000-4000-8000-000000000010'
                     and key = 'pass@1_new')),
  1,
  'archived Key preserves its Values'
);

-- Unreferenced option removal hard-deletes ----------------------------------------------
select is(
  (select public.save_experiment_template(
    '30000000-0000-4000-8000-000000000010',
    'Function Benchmark', '', 4,
    '[{
      "id": (select id from public.experiment_template_fields where template_id = '30000000-0000-4000-8000-000000000010'),
      "label": "Metrics",
      "color_token": "blue",
      "position": 1,
      "keys": [
        {
          "id": (select id from public.experiment_template_keys where template_id = '30000000-0000-4000-8000-000000000010' and key = 'device'),
          "key": "device",
          "value_type": "single_select",
          "required": false,
          "position": 2,
          "archived": false,
          "options": [
            {"id": (select id from public.experiment_template_key_options where template_id = '30000000-0000-4000-8000-000000000010' and label = 'npu:1'), "label": "npu:1", "position": 1, "archived": false}
          ]
        }
      ]
    }]'::jsonb
  )->>'schema_revision'),
  '5',
  'removing an unreferenced option still saves'
);
select is(
  (select count(*)::int from public.experiment_template_key_options
   where template_id = '30000000-0000-4000-8000-000000000010'
     and label = 'gpu:0'),
  0,
  'unreferenced removed option is hard-deleted'
);

-- Template archive / unarchive -------------------------------------------------------------
select is(
  (select public.archive_experiment_template('30000000-0000-4000-8000-000000000010')->>'schema_revision'),
  '6',
  'archive bumps schema_revision'
);
select is(
  (select archived_at is not null from public.experiment_templates
   where id = '30000000-0000-4000-8000-000000000010'),
  true,
  'archive sets archived_at'
);
select is(
  (select count(*)::int from public.experiment_template_versions
   where template_id = '30000000-0000-4000-8000-000000000010'
     and reason = 'Archived'),
  1,
  'archive writes an Archived version'
);
select throws_ok(
  $$insert into public.experiments (id, task_id, template_id)
    values (
      '60000000-0000-4000-8000-000000000011',
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000010'
    )$$,
  'P0001',
  'TEMPLATE_ARCHIVED',
  'archived Templates cannot create new Experiments'
);
select throws_ok(
  $$select public.save_experiment_template(
    '30000000-0000-4000-8000-000000000010', 'Function Benchmark', '', 6, '[]'::jsonb
  )$$,
  'P0001',
  'TEMPLATE_ARCHIVED',
  'archived Templates cannot be edited'
);
select is(
  (select public.unarchive_experiment_template('30000000-0000-4000-8000-000000000010')->>'schema_revision'),
  '7',
  'unarchive bumps schema_revision'
);
select is(
  (select archived_at from public.experiment_templates
   where id = '30000000-0000-4000-8000-000000000010'),
  null,
  'unarchive clears archived_at'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx supabase test db --local supabase/tests/0017_experiment_template_workspace_functions.sql
```

Expected: FAIL — the privilege assertions fail first (`save_experiment_template` does not exist).

---

### Task 2: Add the template mutation functions migration and make the test pass

**Files:**
- Create: `supabase/migrations/<timestamp>_experiment_template_workspace_functions.sql` (name from the CLI)

- [ ] **Step 1: Create the migration file**

Run:

```bash
npx supabase migration new experiment_template_workspace_functions
```

Note the printed filename; commands below use it as `supabase/migrations/<timestamp>_experiment_template_workspace_functions.sql`.

- [ ] **Step 2: Implement the functions**

Replace the empty migration body with:

```sql
-- Experiment Template Workspace (Phase 2): atomic Template mutation functions.
-- Design: docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md

-- Private snapshot builder: full ordered Field/Key/option state including archive flags.
create or replace function public._experiment_template_snapshot(p_template_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id,
      'label', f.label,
      'color_token', f.color_token,
      'position', f.position,
      'archived_at', f.archived_at,
      'keys', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', k.id,
          'key', k.key,
          'value_type', k.value_type,
          'required', k.required,
          'position', k.position,
          'archived_at', k.archived_at,
          'options', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', o.id,
              'label', o.label,
              'position', o.position,
              'archived_at', o.archived_at
            ) order by o.position)
            from public.experiment_template_key_options o
            where o.key_id = k.id
          ), '[]'::jsonb)
        ) order by k.position)
        from public.experiment_template_keys k
        where k.field_id = f.id
      ), '[]'::jsonb)
    ) order by f.position)
    from public.experiment_template_fields f
    where f.template_id = p_template_id
  ), '[]'::jsonb);
$function$;

create or replace function public.save_experiment_template(
  p_template_id uuid,
  p_name text,
  p_description text,
  p_expected_schema_revision bigint,
  p_fields jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_template public.experiment_templates%rowtype;
  v_schema_revision bigint;
  v_version_no bigint;
  v_field jsonb;
  v_field_id uuid;
  v_key jsonb;
  v_key_id uuid;
  v_option jsonb;
  v_option_id uuid;
  v_kept_field_ids uuid[] := '{}'::uuid[];
  v_kept_key_ids uuid[] := '{}'::uuid[];
  v_kept_option_ids uuid[] := '{}'::uuid[];
  v_referenced boolean;
begin
  if p_name is null or trim(p_name) = '' then
    raise exception 'TEMPLATE_NAME_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_template
  from public.experiment_templates
  where id = p_template_id
  for update;

  if v_template.id is null then
    raise exception 'TEMPLATE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_template.archived_at is not null then
    raise exception 'TEMPLATE_ARCHIVED' using errcode = 'P0001';
  end if;
  if v_template.schema_revision <> p_expected_schema_revision then
    raise exception 'TEMPLATE_SCHEMA_REVISION_CONFLICT' using errcode = 'P0001';
  end if;

  update public.experiment_templates
  set name = trim(p_name),
      description = coalesce(p_description, ''),
      updated_at = now()
  where id = p_template_id;

  for v_field in select * from jsonb_array_elements(coalesce(p_fields, '[]'::jsonb)) loop
    if v_field->>'archived' = 'true' then
      v_field_id := nullif(v_field->>'id', '')::uuid;
      if v_field_id is null then
        raise exception 'ARCHIVED_FIELD_REQUIRES_ID' using errcode = 'P0001';
      end if;
      update public.experiment_template_fields
      set archived_at = coalesce(archived_at, now()), updated_at = now()
      where id = v_field_id and template_id = p_template_id;
      if not found then raise exception 'FIELD_TEMPLATE_MISMATCH' using errcode = 'P0001'; end if;
      v_kept_field_ids := array_append(v_kept_field_ids, v_field_id);
      continue;
    end if;

    if v_field->>'label' is null or trim(v_field->>'label') = '' then
      raise exception 'FIELD_LABEL_REQUIRED' using errcode = 'P0001';
    end if;
    v_field_id := nullif(v_field->>'id', '')::uuid;
    if v_field_id is null then
      insert into public.experiment_template_fields (
        template_id, label, color_token, position
      ) values (
        p_template_id,
        trim(v_field->>'label'),
        coalesce(nullif(v_field->>'color_token', ''), 'blue'),
        (v_field->>'position')::integer
      )
      returning id into v_field_id;
    else
      update public.experiment_template_fields
      set label = trim(v_field->>'label'),
          color_token = coalesce(nullif(v_field->>'color_token', ''), color_token),
          position = (v_field->>'position')::integer,
          archived_at = null,
          updated_at = now()
      where id = v_field_id and template_id = p_template_id;
      if not found then raise exception 'FIELD_TEMPLATE_MISMATCH' using errcode = 'P0001'; end if;
    end if;
    v_kept_field_ids := array_append(v_kept_field_ids, v_field_id);

    for v_key in select * from jsonb_array_elements(coalesce(v_field->'keys', '[]'::jsonb)) loop
      if v_key->>'archived' = 'true' then
        v_key_id := nullif(v_key->>'id', '')::uuid;
        if v_key_id is null then
          raise exception 'ARCHIVED_KEY_REQUIRES_ID' using errcode = 'P0001';
        end if;
        update public.experiment_template_keys
        set archived_at = coalesce(archived_at, now()), updated_at = now()
        where id = v_key_id and template_id = p_template_id;
        if not found then raise exception 'KEY_TEMPLATE_MISMATCH' using errcode = 'P0001'; end if;
        v_kept_key_ids := array_append(v_kept_key_ids, v_key_id);
        continue;
      end if;

      if v_key->>'key' is null or trim(v_key->>'key') = '' then
        raise exception 'KEY_NAME_REQUIRED' using errcode = 'P0001';
      end if;
      v_key_id := nullif(v_key->>'id', '')::uuid;
      if v_key_id is null then
        insert into public.experiment_template_keys (
          template_id, field_id, key, value_type, required, position
        ) values (
          p_template_id,
          v_field_id,
          trim(v_key->>'key'),
          v_key->>'value_type',
          coalesce((v_key->>'required')::boolean, false),
          (v_key->>'position')::integer
        )
        returning id into v_key_id;
      else
        if exists (
          select 1 from public.experiment_values
          where key_id = v_key_id and template_id = p_template_id
        ) and (
          select value_type from public.experiment_template_keys
          where id = v_key_id and template_id = p_template_id
        ) is distinct from v_key->>'value_type' then
          raise exception 'POPULATED_KEY_TYPE_LOCKED' using errcode = 'P0001';
        end if;
        update public.experiment_template_keys
        set key = trim(v_key->>'key'),
            field_id = v_field_id,
            value_type = v_key->>'value_type',
            required = coalesce((v_key->>'required')::boolean, required),
            position = (v_key->>'position')::integer,
            archived_at = null,
            updated_at = now()
        where id = v_key_id and template_id = p_template_id;
        if not found then raise exception 'KEY_TEMPLATE_MISMATCH' using errcode = 'P0001'; end if;
      end if;
      v_kept_key_ids := array_append(v_kept_key_ids, v_key_id);

      for v_option in select * from jsonb_array_elements(coalesce(v_key->'options', '[]'::jsonb)) loop
        if v_option->>'archived' = 'true' then
          v_option_id := nullif(v_option->>'id', '')::uuid;
          if v_option_id is null then
            raise exception 'ARCHIVED_OPTION_REQUIRES_ID' using errcode = 'P0001';
          end if;
          update public.experiment_template_key_options
          set archived_at = coalesce(archived_at, now())
          where id = v_option_id and template_id = p_template_id;
          if not found then raise exception 'OPTION_TEMPLATE_MISMATCH' using errcode = 'P0001'; end if;
          v_kept_option_ids := array_append(v_kept_option_ids, v_option_id);
          continue;
        end if;

        if v_option->>'label' is null or trim(v_option->>'label') = '' then
          raise exception 'OPTION_LABEL_REQUIRED' using errcode = 'P0001';
        end if;
        v_option_id := nullif(v_option->>'id', '')::uuid;
        if v_option_id is null then
          insert into public.experiment_template_key_options (
            template_id, key_id, label, position
          ) values (
            p_template_id, v_key_id, trim(v_option->>'label'), (v_option->>'position')::integer
          )
          returning id into v_option_id;
        else
          update public.experiment_template_key_options
          set label = trim(v_option->>'label'),
              position = (v_option->>'position')::integer,
              archived_at = null
          where id = v_option_id and template_id = p_template_id;
          if not found then raise exception 'OPTION_TEMPLATE_MISMATCH' using errcode = 'P0001'; end if;
        end if;
        v_kept_option_ids := array_append(v_kept_option_ids, v_option_id);
      end loop;
    end loop;
  end loop;

  -- Removed active options: archive if referenced, else hard delete.
  for v_option_id in
    select id from public.experiment_template_key_options
    where template_id = p_template_id and archived_at is null
      and not (id = any(v_kept_option_ids))
  loop
    select exists (
      select 1 from public.experiment_value_options
      where option_id = v_option_id
    ) into v_referenced;
    if v_referenced then
      update public.experiment_template_key_options
      set archived_at = now()
      where id = v_option_id;
    else
      delete from public.experiment_template_key_options
      where id = v_option_id;
    end if;
  end loop;

  -- Removed active keys: archive if referenced, else hard delete (options first).
  for v_key_id in
    select id from public.experiment_template_keys
    where template_id = p_template_id and archived_at is null
      and not (id = any(v_kept_key_ids))
  loop
    select exists (
      select 1 from public.experiment_values where key_id = v_key_id
      union all
      select 1 from public.experiment_value_options where key_id = v_key_id
      union all
      select 1 from public.attachments where template_key_id = v_key_id
    ) into v_referenced;
    if v_referenced then
      update public.experiment_template_keys
      set archived_at = now(), updated_at = now()
      where id = v_key_id;
    else
      delete from public.experiment_template_key_options where key_id = v_key_id;
      delete from public.experiment_template_keys where id = v_key_id;
    end if;
  end loop;

  -- Removed active fields: archive if it still owns any Key rows, else hard delete.
  for v_field_id in
    select id from public.experiment_template_fields
    where template_id = p_template_id and archived_at is null
      and not (id = any(v_kept_field_ids))
  loop
    select exists (
      select 1 from public.experiment_template_keys
      where field_id = v_field_id
    ) into v_referenced;
    if v_referenced then
      update public.experiment_template_fields
      set archived_at = now(), updated_at = now()
      where id = v_field_id;
    else
      delete from public.experiment_template_fields where id = v_field_id;
    end if;
  end loop;

  v_schema_revision := v_template.schema_revision + 1;
  update public.experiment_templates
  set schema_revision = v_schema_revision, updated_at = now()
  where id = p_template_id;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_template_versions
  where template_id = p_template_id;

  insert into public.experiment_template_versions (
    template_id, version_no, reason, source, schema_revision, snapshot, actor_member_id
  ) values (
    p_template_id, v_version_no, 'Schema edited', 'browser', v_schema_revision,
    public._experiment_template_snapshot(p_template_id), null
  );

  return jsonb_build_object(
    'template_id', p_template_id,
    'schema_revision', v_schema_revision,
    'version_no', v_version_no
  );
end
$function$;

create or replace function public.archive_experiment_template(p_template_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_template public.experiment_templates%rowtype;
  v_schema_revision bigint;
  v_version_no bigint;
begin
  select * into v_template
  from public.experiment_templates
  where id = p_template_id
  for update;
  if v_template.id is null then
    raise exception 'TEMPLATE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_template.archived_at is not null then
    raise exception 'TEMPLATE_ALREADY_ARCHIVED' using errcode = 'P0001';
  end if;

  update public.experiment_templates
  set archived_at = now(),
      schema_revision = schema_revision + 1,
      updated_at = now()
  where id = p_template_id
  returning schema_revision into v_schema_revision;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_template_versions
  where template_id = p_template_id;

  insert into public.experiment_template_versions (
    template_id, version_no, reason, source, schema_revision, snapshot, actor_member_id
  ) values (
    p_template_id, v_version_no, 'Archived', 'browser', v_schema_revision,
    public._experiment_template_snapshot(p_template_id), null
  );

  return jsonb_build_object(
    'template_id', p_template_id,
    'schema_revision', v_schema_revision,
    'version_no', v_version_no
  );
end
$function$;

create or replace function public.unarchive_experiment_template(p_template_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_template public.experiment_templates%rowtype;
  v_schema_revision bigint;
  v_version_no bigint;
begin
  select * into v_template
  from public.experiment_templates
  where id = p_template_id
  for update;
  if v_template.id is null then
    raise exception 'TEMPLATE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_template.archived_at is null then
    raise exception 'TEMPLATE_NOT_ARCHIVED' using errcode = 'P0001';
  end if;

  update public.experiment_templates
  set archived_at = null,
      schema_revision = schema_revision + 1,
      updated_at = now()
  where id = p_template_id
  returning schema_revision into v_schema_revision;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_template_versions
  where template_id = p_template_id;

  insert into public.experiment_template_versions (
    template_id, version_no, reason, source, schema_revision, snapshot, actor_member_id
  ) values (
    p_template_id, v_version_no, 'Unarchived', 'browser', v_schema_revision,
    public._experiment_template_snapshot(p_template_id), null
  );

  return jsonb_build_object(
    'template_id', p_template_id,
    'schema_revision', v_schema_revision,
    'version_no', v_version_no
  );
end
$function$;

-- Prevent creating Experiments from an archived Template.
create or replace function public.guard_experiment_creation_template_active()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_archived_at timestamptz;
begin
  if new.template_id is not null then
    select archived_at into v_archived_at
    from public.experiment_templates
    where id = new.template_id;
    if v_archived_at is not null then
      raise exception 'TEMPLATE_ARCHIVED' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists experiments_creation_template_active on public.experiments;
create trigger experiments_creation_template_active
  before insert on public.experiments
  for each row execute function public.guard_experiment_creation_template_active();

-- Grants ----------------------------------------------------------------------
grant execute on function
  public.save_experiment_template(uuid, text, text, bigint, jsonb),
  public.archive_experiment_template(uuid),
  public.unarchive_experiment_template(uuid)
to authenticated;

revoke execute on function
  public.save_experiment_template(uuid, text, text, bigint, jsonb),
  public.archive_experiment_template(uuid),
  public.unarchive_experiment_template(uuid)
from public, anon;

revoke execute on function
  public._experiment_template_snapshot(uuid),
  public.guard_experiment_creation_template_active()
from public, anon, authenticated;
```

- [ ] **Step 3: Apply the migration and run both new tests**

Run:

```bash
npx supabase db reset --local
npx supabase test db --local \
  supabase/tests/0015_experiment_template_workspace_schema.sql \
  supabase/tests/0016_experiment_template_workspace_grants.sql \
  supabase/tests/0017_experiment_template_workspace_functions.sql
```

Expected: all three files PASS.

- [ ] **Step 4: Confirm the existing suite still passes**

Run:

```bash
npx supabase test db --local supabase/tests/0014_api_key_deletion.sql
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<timestamp>_experiment_template_workspace_functions.sql supabase/tests/0017_experiment_template_workspace_functions.sql
git commit -m "feat: add atomic template mutation functions"
```

---

### Task 3: Add the template repository and impact description

**Files:**
- Create: `lib/templates/repository.ts`
- Create: `lib/templates/impact.ts`
- Create: `lib/templates/__tests__/repository.test.ts`
- Create: `lib/templates/__tests__/impact.test.ts`

- [ ] **Step 1: Write the failing impact test**

Create `lib/templates/__tests__/impact.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeTemplateImpact } from "@/lib/templates/impact";
import type { TemplateDraft } from "@/lib/templates/repository";

function draft(overrides: Partial<TemplateDraft> = {}): TemplateDraft {
  return {
    templateId: "30000000-0000-4000-8000-000000000001",
    name: "Benchmark",
    description: "",
    schemaRevision: 3,
    fields: [],
    ...overrides,
  };
}

describe("describeTemplateImpact", () => {
  it("describes a newly added Key for the existing Experiment count", () => {
    const current = draft({
      fields: [{
        id: "f1", label: "Metrics", colorToken: "blue", position: 1, archived: false,
        keys: [],
      }],
    });
    const next = draft({
      fields: [{
        id: "f1", label: "Metrics", colorToken: "blue", position: 1, archived: false,
        keys: [{
          id: null, key: "pass@1", valueType: "number", required: false,
          position: 1, archived: false, options: [], valueCount: 0,
        }],
      }],
    });
    expect(describeTemplateImpact(current, next, 24)).toEqual([
      "Adding pass@1 creates an empty Key for 24 existing Experiments.",
    ]);
  });

  it("describes archiving a Key as hiding it", () => {
    const current = draft({
      fields: [{
        id: "f1", label: "Metrics", colorToken: "blue", position: 1, archived: false,
        keys: [{
          id: "k1", key: "pass@1", valueType: "number", required: false,
          position: 1, archived: false, options: [], valueCount: 3,
        }],
      }],
    });
    const next = draft({
      fields: [{
        id: "f1", label: "Metrics", colorToken: "blue", position: 1, archived: false,
        keys: [{
          id: "k1", key: "pass@1", valueType: "number", required: false,
          position: 1, archived: true, options: [], valueCount: 3,
        }],
      }],
    });
    expect(describeTemplateImpact(current, next, 24)).toEqual([
      "Archiving pass@1 hides it from 24 existing Experiments.",
    ]);
  });

  it("reports an empty array when nothing changed", () => {
    const same = draft();
    expect(describeTemplateImpact(same, same, 4)).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement `lib/templates/impact.ts`**

Create `lib/templates/impact.ts`:

```ts
import type { TemplateDraft, TemplateKeyDraft } from "@/lib/templates/repository";

function currentKeyMap(draft: TemplateDraft): Map<string | null, TemplateKeyDraft> {
  const map = new Map<string | null, TemplateKeyDraft>();
  for (const field of draft.fields) {
    for (const key of field.keys) {
      if (key.id) map.set(key.id, key);
    }
  }
  return map;
}

export function describeTemplateImpact(
  current: TemplateDraft,
  next: TemplateDraft,
  experimentCount: number,
): string[] {
  const lines: string[] = [];
  const previous = currentKeyMap(current);

  for (const field of next.fields) {
    for (const key of field.keys) {
      if (key.archived) continue;
      if (!key.id || !previous.has(key.id)) {
        lines.push(
          `Adding ${key.key.trim() || "the new key"} creates an empty Key for ${experimentCount} existing Experiments.`,
        );
        continue;
      }
      const before = previous.get(key.id)!;
      if (!before.archived && key.valueType !== before.valueType) {
        lines.push(
          `${key.key.trim() || "The new key"} changes Value Type to ${key.valueType}.`,
        );
      }
    }
  }

  for (const field of current.fields) {
    for (const key of field.keys) {
      const after = next.fields
        .flatMap((candidate) => candidate.keys)
        .find((candidate) => candidate.id === key.id);
      if (!key.archived && after?.archived) {
        lines.push(
          `Archiving ${key.key.trim() || "the key"} hides it from ${experimentCount} existing Experiments.`,
        );
      }
    }
  }

  return lines;
}
```

- [ ] **Step 3: Run the impact test**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/templates/__tests__/impact.test.ts
```

Expected: FAIL — `@/lib/templates/impact` cannot be resolved (file does not exist yet).

- [ ] **Step 4: Implement `lib/templates/repository.ts`**

Create `lib/templates/repository.ts`:

```ts
import { supabase } from "@/lib/supabase";
import type {
  ExperimentTemplate,
  TemplateField,
  TemplateKey,
  TemplateKeyOption,
  TemplateValueType,
} from "@/lib/types";

export interface TemplateOptionDraft {
  id: string | null;
  label: string;
  position: number;
  archived: boolean;
}

export interface TemplateKeyDraft {
  id: string | null;
  key: string;
  valueType: TemplateValueType;
  required: boolean;
  position: number;
  archived: boolean;
  options: TemplateOptionDraft[];
  valueCount: number;
}

export interface TemplateFieldDraft {
  id: string | null;
  label: string;
  colorToken: string;
  position: number;
  archived: boolean;
  keys: TemplateKeyDraft[];
}

export interface TemplateDraft {
  templateId: string;
  name: string;
  description: string;
  schemaRevision: number;
  fields: TemplateFieldDraft[];
}

export interface TemplateSummary {
  template: ExperimentTemplate;
  fieldCount: number;
  keyCount: number;
  experimentCount: number;
}

export interface SaveTemplateResult {
  template_id: string;
  schema_revision: number;
  version_no: number;
}

export interface TemplateVersionSummary {
  id: string;
  version_no: number;
  reason: string;
  source: string;
  schema_revision: number;
  created_at: string;
}

interface SnapshotFieldRow {
  id: string;
  label: string;
  color_token: string;
  position: number;
  archived_at: string | null;
  keys: Array<{
    id: string;
    key: string;
    value_type: TemplateValueType;
    required: boolean;
    position: number;
    archived_at: string | null;
    options: Array<{
      id: string;
      label: string;
      position: number;
      archived_at: string | null;
    }>;
  }>;
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function countBy(
  rows: Array<{ template_id: string | null; archived_at: string | null }>,
  activeOnly: boolean,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.template_id) continue;
    if (activeOnly && row.archived_at !== null) continue;
    counts.set(row.template_id, (counts.get(row.template_id) ?? 0) + 1);
  }
  return counts;
}

export async function listTemplateSummaries(): Promise<TemplateSummary[]> {
  const c = client();
  const [templates, fields, keys, experiments] = await Promise.all([
    c.from("experiment_templates")
      .select("id,name,description,schema_revision,archived_at,created_at,updated_at")
      .order("name"),
    c.from("experiment_template_fields")
      .select("template_id,archived_at"),
    c.from("experiment_template_keys")
      .select("template_id,archived_at"),
    c.from("experiments")
      .select("template_id"),
  ]);
  throwIfError(templates.error);
  throwIfError(fields.error);
  throwIfError(keys.error);
  throwIfError(experiments.error);

  const fieldCounts = countBy(fields.data ?? [], true);
  const keyCounts = countBy(keys.data ?? [], true);
  const experimentCounts = countBy(experiments.data ?? [], false);

  return (templates.data ?? []).map((row) => ({
    template: row as ExperimentTemplate,
    fieldCount: fieldCounts.get(row.id) ?? 0,
    keyCount: keyCounts.get(row.id) ?? 0,
    experimentCount: experimentCounts.get(row.id) ?? 0,
  }));
}

function toDraft(
  template: ExperimentTemplate,
  fields: TemplateField[],
  keys: TemplateKey[],
  options: TemplateKeyOption[],
  valueCounts: Map<string, number>,
): TemplateDraft {
  const keysByField = new Map<string, TemplateKey[]>();
  for (const key of keys) {
    const group = keysByField.get(key.field_id) ?? [];
    group.push(key);
    keysByField.set(key.field_id, group);
  }
  const optionsByKey = new Map<string, TemplateKeyOption[]>();
  for (const option of options) {
    const group = optionsByKey.get(option.key_id) ?? [];
    group.push(option);
    optionsByKey.set(option.key_id, group);
  }
  return {
    templateId: template.id,
    name: template.name,
    description: template.description,
    schemaRevision: template.schema_revision,
    fields: fields.map((field) => ({
      id: field.id,
      label: field.label,
      colorToken: field.color_token,
      position: field.position,
      archived: false,
      keys: (keysByField.get(field.id) ?? []).map((key) => ({
        id: key.id,
        key: key.key,
        valueType: key.value_type,
        required: key.required,
        position: key.position,
        archived: false,
        options: (optionsByKey.get(key.id) ?? []).map((option) => ({
          id: option.id,
          label: option.label,
          position: option.position,
          archived: false,
        })),
        valueCount: valueCounts.get(key.id) ?? 0,
      })),
    })),
  };
}

export async function loadTemplateDraft(
  templateId: string,
): Promise<TemplateDraft | null> {
  const c = client();
  const [template, fields, keys, options, values] = await Promise.all([
    c.from("experiment_templates")
      .select("*")
      .eq("id", templateId)
      .maybeSingle(),
    c.from("experiment_template_fields")
      .select("*")
      .eq("template_id", templateId)
      .is("archived_at", null)
      .order("position"),
    c.from("experiment_template_keys")
      .select("*")
      .eq("template_id", templateId)
      .is("archived_at", null)
      .order("position"),
    c.from("experiment_template_key_options")
      .select("*")
      .eq("template_id", templateId)
      .is("archived_at", null)
      .order("position"),
    c.from("experiment_values")
      .select("key_id"),
  ]);
  throwIfError(template.error);
  throwIfError(fields.error);
  throwIfError(keys.error);
  throwIfError(options.error);
  throwIfError(values.error);
  if (!template.data) return null;

  const valueCounts = new Map<string, number>();
  for (const row of values.data ?? []) {
    if (!row.key_id) continue;
    valueCounts.set(row.key_id, (valueCounts.get(row.key_id) ?? 0) + 1);
  }

  return toDraft(
    template.data as ExperimentTemplate,
    (fields.data ?? []) as TemplateField[],
    (keys.data ?? []) as TemplateKey[],
    (options.data ?? []) as TemplateKeyOption[],
    valueCounts,
  );
}

function savePayload(draft: TemplateDraft): unknown[] {
  return draft.fields.map((field) => ({
    id: field.id,
    label: field.label,
    color_token: field.colorToken,
    position: field.position,
    archived: field.archived,
    keys: field.keys.map((key) => ({
      id: key.id,
      key: key.key,
      value_type: key.valueType,
      required: key.required,
      position: key.position,
      archived: key.archived,
      options: key.options.map((option) => ({
        id: option.id,
        label: option.label,
        position: option.position,
        archived: option.archived,
      })),
    })),
  }));
}

export async function saveTemplate(
  draft: TemplateDraft,
): Promise<SaveTemplateResult> {
  const { data, error } = await client().rpc("save_experiment_template", {
    p_template_id: draft.templateId,
    p_name: draft.name,
    p_description: draft.description,
    p_expected_schema_revision: draft.schemaRevision,
    p_fields: savePayload(draft),
  });
  throwIfError(error);
  return data as SaveTemplateResult;
}

export async function archiveTemplate(templateId: string): Promise<void> {
  const { error } = await client().rpc("archive_experiment_template", {
    p_template_id: templateId,
  });
  throwIfError(error);
}

export async function unarchiveTemplate(templateId: string): Promise<void> {
  const { error } = await client().rpc("unarchive_experiment_template", {
    p_template_id: templateId,
  });
  throwIfError(error);
}

export async function listTemplateVersions(
  templateId: string,
): Promise<TemplateVersionSummary[]> {
  const { data, error } = await client()
    .from("experiment_template_versions")
    .select("id,version_no,reason,source,schema_revision,created_at")
    .eq("template_id", templateId)
    .order("version_no", { ascending: false });
  throwIfError(error);
  return (data ?? []) as TemplateVersionSummary[];
}

function draftFromSnapshot(
  template: ExperimentTemplate,
  snapshot: SnapshotFieldRow[],
): TemplateDraft {
  return {
    templateId: template.id,
    name: template.name,
    description: template.description,
    schemaRevision: template.schema_revision,
    fields: snapshot
      .filter((field) => field.archived_at === null)
      .map((field) => ({
        id: field.id,
        label: field.label,
        colorToken: field.color_token,
        position: field.position,
        archived: false,
        keys: field.keys
          .filter((key) => key.archived_at === null)
          .map((key) => ({
            id: key.id,
            key: key.key,
            valueType: key.value_type,
            required: key.required,
            position: key.position,
            archived: false,
            options: key.options
              .filter((option) => option.archived_at === null)
              .map((option) => ({
                id: option.id,
                label: option.label,
                position: option.position,
                archived: false,
              })),
            valueCount: 0,
          })),
      })),
  };
}

export async function restoreTemplateVersion(
  templateId: string,
  versionNo: number,
): Promise<SaveTemplateResult> {
  const c = client();
  const [template, version] = await Promise.all([
    c.from("experiment_templates")
      .select("*")
      .eq("id", templateId)
      .maybeSingle(),
    c.from("experiment_template_versions")
      .select("snapshot")
      .eq("template_id", templateId)
      .eq("version_no", versionNo)
      .maybeSingle(),
  ]);
  throwIfError(template.error);
  throwIfError(version.error);
  if (!template.data || !version.data) {
    throw new Error("Template version not found.");
  }
  const draft = draftFromSnapshot(
    template.data as ExperimentTemplate,
    version.data.snapshot as SnapshotFieldRow[],
  );
  return saveTemplate(draft);
}
```

- [ ] **Step 5: Write the failing repository test**

Create `lib/templates/__tests__/repository.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadTemplateDraft,
  saveTemplate,
  type TemplateDraft,
} from "@/lib/templates/repository";

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const tables: Record<string, unknown> = {};
  function table(name: string) {
    if (!tables[name]) {
      tables[name] = {
        select: vi.fn(() => tables[name]),
        eq: vi.fn(() => tables[name]),
        is: vi.fn(() => tables[name]),
        order: vi.fn(() => tables[name]),
        maybeSingle: vi.fn(() => ({ data: null, error: null })),
      };
    }
    return tables[name];
  }
  return { rpc, table };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (name: string) => mocks.table(name),
    rpc: (...args: unknown[]) => mocks.rpc(...args),
  },
}));

const template = {
  id: "30000000-0000-4000-8000-000000000001",
  name: "Benchmark",
  description: "",
  schema_revision: 3,
  archived_at: null,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z",
};

const draft: TemplateDraft = {
  templateId: template.id,
  name: "Benchmark",
  description: "",
  schemaRevision: 3,
  fields: [{
    id: "f1", label: "Metrics", colorToken: "blue", position: 1, archived: false,
    keys: [{
      id: "k1", key: "pass@1", valueType: "number", required: false,
      position: 1, archived: false, options: [], valueCount: 0,
    }],
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("template repository", () => {
  it("loads a Template with ordered Fields and Keys", async () => {
    const experiments = mocks.table("experiment_templates");
    vi.mocked(experiments.select).mockReturnValue(experiments);
    vi.mocked(experiments.eq).mockReturnValue(experiments);
    vi.mocked(experiments.maybeSingle).mockResolvedValue({ data: template, error: null });
    vi.mocked(mocks.table("experiment_template_fields").maybeSingle)
      .mockResolvedValue({ data: [{ id: "f1", template_id: template.id, label: "Metrics", color_token: "blue", position: 1, archived_at: null }], error: null });
    vi.mocked(mocks.table("experiment_template_keys").maybeSingle)
      .mockResolvedValue({ data: [{ id: "k1", template_id: template.id, field_id: "f1", key: "pass@1", value_type: "number", required: false, position: 1, archived_at: null }], error: null });
    vi.mocked(mocks.table("experiment_template_key_options").maybeSingle)
      .mockResolvedValue({ data: [], error: null });
    vi.mocked(mocks.table("experiment_values").maybeSingle)
      .mockResolvedValue({ data: [], error: null });

    const loaded = await loadTemplateDraft(template.id);

    expect(loaded?.name).toBe("Benchmark");
    expect(loaded?.fields[0].keys[0].key).toBe("pass@1");
    expect(loaded?.fields[0].keys[0].valueCount).toBe(0);
  });

  it("sends the full draft to the save RPC", async () => {
    vi.mocked(mocks.rpc).mockResolvedValue({
      data: { template_id: template.id, schema_revision: 4, version_no: 2 },
      error: null,
    });

    const result = await saveTemplate(draft);

    expect(result.schema_revision).toBe(4);
    expect(mocks.rpc).toHaveBeenCalledWith("save_experiment_template", {
      p_template_id: template.id,
      p_name: "Benchmark",
      p_description: "",
      p_expected_schema_revision: 3,
      p_fields: [{
        id: "f1",
        label: "Metrics",
        color_token: "blue",
        position: 1,
        archived: false,
        keys: [{
          id: "k1",
          key: "pass@1",
          value_type: "number",
          required: false,
          position: 1,
          archived: false,
          options: [],
        }],
      }],
    });
  });
});
```

- [ ] **Step 6: Run both new tests**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/templates/__tests__/impact.test.ts lib/templates/__tests__/repository.test.ts
```

Expected: both files PASS.

- [ ] **Step 7: Confirm zero new type errors**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | head -20
```

Expected: no output (only the known pre-existing failures remain).

- [ ] **Step 8: Commit**

```bash
git add lib/templates
git commit -m "feat: add template repository and impact description"
```

---

### Task 4: Build the Template Manager shell (route, list, create, archive)

**Files:**
- Create: `app/experiments/templates/page.tsx`
- Create: `app/template-manager.css`
- Create: `components/templates/TemplateManager.tsx`
- Create: `components/templates/TemplateList.tsx`
- Create: `components/templates/NewTemplateDialog.tsx`
- Create: `components/templates/__tests__/TemplateManager.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `components/templates/__tests__/TemplateManager.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TemplateManager from "@/components/templates/TemplateManager";
import type { TemplateSummary } from "@/lib/templates/repository";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  loadDraft: vi.fn(),
  save: vi.fn(),
  archive: vi.fn(),
  unarchive: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/templates/repository", () => ({
  listTemplateSummaries: mocks.list,
  loadTemplateDraft: mocks.loadDraft,
  saveTemplate: mocks.save,
  archiveTemplate: mocks.archive,
  unarchiveTemplate: mocks.unarchive,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const summaries: TemplateSummary[] = [{
  template: {
    id: "t1",
    name: "Benchmark A",
    description: "First",
    schema_revision: 2,
    archived_at: null,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
  },
  fieldCount: 1,
  keyCount: 2,
  experimentCount: 24,
}];

const draft = {
  templateId: "t1",
  name: "Benchmark A",
  description: "First",
  schemaRevision: 2,
  fields: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue(summaries);
  mocks.loadDraft.mockResolvedValue(draft);
});

describe("TemplateManager", () => {
  it("lists Templates with key and experiment counts", async () => {
    render(<TemplateManager />);
    await screen.findByText("Benchmark A");
    expect(screen.getByText("2 keys")).toBeInTheDocument();
    expect(screen.getByText("24 experiments")).toBeInTheDocument();
  });

  it("opens the schema editor for a selected Template", async () => {
    render(<TemplateManager />);
    await screen.findByText("Benchmark A");
    await userEvent.click(screen.getByRole("button", { name: /Benchmark A/ }));
    await waitFor(() => expect(mocks.loadDraft).toHaveBeenCalledWith("t1"));
  });

  it("archives the selected Template after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.archive.mockResolvedValue(undefined);
    render(<TemplateManager />);
    await screen.findByText("Benchmark A");
    await userEvent.click(screen.getByRole("button", { name: /Benchmark A/ }));
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(mocks.archive).toHaveBeenCalledWith("t1"));
    expect(confirmSpy).toHaveBeenCalled();
  });
});
```

Run it now:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run components/templates/__tests__/TemplateManager.test.tsx
```

Expected: FAIL — `@/components/templates/TemplateManager` cannot be resolved.

- [ ] **Step 2: Create the route page**

Create `app/experiments/templates/page.tsx`:

```tsx
import TemplateManager from "@/components/templates/TemplateManager";

export default function ExperimentTemplatesPage() {
  return <TemplateManager />;
}
```

- [ ] **Step 3: Create `lib/templates` repository helper for empty drafts**

Add to `lib/templates/repository.ts` (append at the end):

```ts
export function emptyTemplateDraft(template: ExperimentTemplate): TemplateDraft {
  return {
    templateId: template.id,
    name: template.name,
    description: template.description,
    schemaRevision: template.schema_revision,
    fields: [],
  };
}
```

- [ ] **Step 4: Create `components/templates/NewTemplateDialog.tsx`**

Create `components/templates/NewTemplateDialog.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useModalFocus } from "@/components/ui/useModalFocus";

export default function NewTemplateDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dialogRef = useModalFocus({ open, onClose, blocked: saving });

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setError("");
  }, [open]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await onCreate(name.trim(), description.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the Template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={() => { if (!saving) onClose(); }}
    >
      <section
        ref={dialogRef}
        className="experiment-dialog template-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-template-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">Schema</p>
            <h2 id="new-template-title">New template</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" disabled={saving}>
            ×
          </button>
        </header>
        <form onSubmit={submit} aria-busy={saving}>
          <label>
            <span>Name</span>
            <input
              aria-label="Template name"
              data-modal-initial-focus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            <span>Description</span>
            <textarea
              aria-label="Template description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Creating…" : "Create template"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Create `components/templates/TemplateList.tsx`**

Create `components/templates/TemplateList.tsx`:

```tsx
"use client";

import type { TemplateSummary } from "@/lib/templates/repository";

export default function TemplateList({
  summaries,
  selectedId,
  onSelect,
  onNew,
}: {
  summaries: TemplateSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="template-rail">
      <div className="template-rail-header">
        <h2>Templates</h2>
        <button type="button" className="btn primary small" onClick={onNew}>
          New template
        </button>
      </div>
      <div className="template-rail-list" role="listbox" aria-label="Experiment templates">
        {summaries.map((summary) => {
          const selected = summary.template.id === selectedId;
          return (
            <button
              key={summary.template.id}
              type="button"
              role="option"
              aria-selected={selected}
              className={`template-card${selected ? " selected" : ""}`}
              onClick={() => onSelect(summary.template.id)}
            >
              <span className="template-card-name">
                {summary.template.name}
                {summary.template.archived_at ? <span className="template-archived-badge">Archived</span> : null}
              </span>
              {summary.template.description ? (
                <span className="template-card-description">{summary.template.description}</span>
              ) : null}
              <span className="template-card-meta">
                {summary.fieldCount} fields · {summary.keyCount} keys · {summary.experimentCount} experiments
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

The test expects `2 keys` and `24 experiments` as separate texts; adjust the meta line to render two separate spans:

```tsx
              <span className="template-card-meta">
                <span>{summary.fieldCount} fields</span>
                <span>{summary.keyCount} keys</span>
                <span>{summary.experimentCount} experiments</span>
              </span>
```

- [ ] **Step 6: Create `components/templates/TemplateManager.tsx`**

Create `components/templates/TemplateManager.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import WorkspaceSkeleton from "@/components/ui/WorkspaceSkeleton";
import TemplateList from "@/components/templates/TemplateList";
import NewTemplateDialog from "@/components/templates/NewTemplateDialog";
import TemplateEditor from "@/components/templates/TemplateEditor";
import {
  archiveTemplate,
  emptyTemplateDraft,
  listTemplateSummaries,
  loadTemplateDraft,
  saveTemplate,
  unarchiveTemplate,
  type TemplateDraft,
  type TemplateSummary,
} from "@/lib/templates/repository";

export default function TemplateManager() {
  const reloadVersion = useRef(0);
  const [summaries, setSummaries] = useState<TemplateSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const reloadSummaries = useCallback(async () => {
    const requestVersion = ++reloadVersion.current;
    setLoading(true);
    try {
      const next = await listTemplateSummaries();
      if (requestVersion !== reloadVersion.current) return;
      setSummaries(next);
      setLoading(false);
    } catch (caught) {
      if (requestVersion !== reloadVersion.current) return;
      setError(caught instanceof Error ? caught.message : "Could not load Templates.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadSummaries();
  }, [reloadSummaries]);

  const selectTemplate = useCallback(async (templateId: string) => {
    setSelectedId(templateId);
    setDraft(null);
    setError("");
    try {
      const next = await loadTemplateDraft(templateId);
      if (selectedId === templateId) setDraft(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the Template.");
    }
  }, [selectedId]);

  async function createTemplate(name: string, description: string) {
    const { data, error } = await import("@/lib/supabase").then((m) =>
      m.supabase!.from("experiment_templates").insert({ name, description }).select().single(),
    );
    if (error) throw new Error(error.message);
    const template = data as {
      id: string; name: string; description: string; schema_revision: number;
      archived_at: string | null; created_at: string; updated_at: string;
    };
    setNewOpen(false);
    await reloadSummaries();
    setSelectedId(template.id);
    setDraft(emptyTemplateDraft(template));
  }

  async function persist(next: TemplateDraft) {
    const result = await saveTemplate(next);
    setDraft({ ...next, schemaRevision: result.schema_revision });
    await reloadSummaries();
  }

  async function toggleArchive() {
    if (!selectedId || !draft) return;
    const isArchived = summaries.find(
      (summary) => summary.template.id === selectedId,
    )?.template.archived_at != null;
    const confirmed = window.confirm(
      isArchived
        ? "Unarchive this Template? Existing Experiments stay linked."
        : "Archive this Template? Existing Experiments stay readable, but new Experiments cannot use it.",
    );
    if (!confirmed) return;
    if (isArchived) {
      await unarchiveTemplate(selectedId);
    } else {
      await archiveTemplate(selectedId);
    }
    await reloadSummaries();
    await selectTemplate(selectedId);
  }

  if (loading && summaries.length === 0) {
    return <WorkspaceSkeleton />;
  }

  const selectedSummary = summaries.find((summary) => summary.template.id === selectedId) ?? null;
  const archived = selectedSummary?.template.archived_at != null;

  return (
    <div className="template-manager">
      <PageHeader
        eyebrow="Schema"
        title="Experiment templates"
        description="One typed schema per comparable series of Experiments."
        actions={
          selectedSummary ? (
            <>
              <button type="button" className="btn ghost" onClick={toggleArchive}>
                {archived ? "Unarchive" : "Archive"}
              </button>
            </>
          ) : null
        }
      />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="template-manager-body">
        <TemplateList
          summaries={summaries}
          selectedId={selectedId}
          onSelect={selectTemplate}
          onNew={() => setNewOpen(true)}
        />
        <div className="template-editor-pane">
          {draft ? (
            <TemplateEditor
              key={draft.templateId}
              draft={draft}
              experimentCount={selectedSummary?.experimentCount ?? 0}
              onPersist={persist}
              readOnly={archived}
            />
          ) : (
            <p className="template-empty">Select a Template to edit its schema.</p>
          )}
        </div>
      </div>
      <NewTemplateDialog open={newOpen} onClose={() => setNewOpen(false)} onCreate={createTemplate} />
    </div>
  );
```

- [ ] **Step 7: Create the CSS**

Create `app/template-manager.css`:

```css
.template-manager {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 16px;
}
.template-manager-body {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
  min-height: 0;
}
.template-rail {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  overflow: hidden;
}
.template-rail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
}
.template-rail-header h2 {
  font-size: 14px;
  margin: 0;
}
.template-rail-list {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 240px);
  overflow-y: auto;
}
.template-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
  padding: 12px 14px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  cursor: pointer;
  color: var(--ink);
}
.template-card:hover { background: var(--surface-hover); }
.template-card.selected { background: var(--accent-soft); }
.template-card-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.template-archived-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--crit-soft);
  color: var(--crit);
}
.template-card-description {
  color: var(--ink-soft);
  font-size: 13px;
}
.template-card-meta {
  display: flex;
  gap: 10px;
  color: var(--text-tertiary);
  font-size: 12px;
}
.template-editor-pane {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  padding: 16px;
}
.template-empty {
  color: var(--ink-soft);
  margin: 0;
}

/* Field color tokens (finite, contrast-checked palette) */
.token-blue { --field-accent: #275fd2; --field-soft: #eef3ff; }
.token-green { --field-accent: #2f6a48; --field-soft: #eaf5ee; }
.token-amber { --field-accent: #9a6512; --field-soft: #fff4d9; }
.token-purple { --field-accent: #6b4aa8; --field-soft: #f1ecfa; }
.token-rose { --field-accent: #b0405f; --field-soft: #fbedf1; }
.token-teal { --field-accent: #1f6f6b; --field-soft: #e6f4f3; }

@media (max-width: 760px) {
  .template-manager-body {
    grid-template-columns: 1fr;
  }
  .template-rail-list {
    max-height: 220px;
  }
}
```

- [ ] **Step 8: Import the CSS in the page**

Update `app/experiments/templates/page.tsx` to import the stylesheet:

```tsx
import "@/app/template-manager.css";
import TemplateManager from "@/components/templates/TemplateManager";

export default function ExperimentTemplatesPage() {
  return <TemplateManager />;
}
```

- [ ] **Step 9: Run the component test**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run components/templates/__tests__/TemplateManager.test.tsx
```

Expected: PASS (note: `TemplateEditor` does not exist yet; the test only covers the list/create/archive paths, so the manager must render a placeholder instead of the editor until Task 5). If the manager imports `TemplateEditor` before Task 5, add a temporary stub:

```tsx
// components/templates/TemplateEditor.tsx (temporary stub for Task 4; replaced in Task 5)
import type { TemplateDraft } from "@/lib/templates/repository";

export default function TemplateEditor(_props: {
  draft: TemplateDraft;
  experimentCount: number;
  onPersist: (draft: TemplateDraft) => Promise<void>;
  readOnly: boolean;
}) {
  return <p className="template-empty">Schema editor arrives in the next task.</p>;
}
```

- [ ] **Step 10: Confirm zero new type errors and commit**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | head -20
git add app/experiments/templates app/template-manager.css components/templates
git commit -m "feat: add template manager shell with list and archive"
```

Expected: no output from tsc, then commit succeeds.

---

### Task 5: Build the Template schema editor

**Files:**
- Replace: `components/templates/TemplateEditor.tsx` (full implementation)
- Create: `components/templates/OptionsEditor.tsx`
- Create: `components/templates/__tests__/TemplateEditor.test.tsx`

- [ ] **Step 1: Write the failing editor test**

Create `components/templates/__tests__/TemplateEditor.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TemplateEditor from "@/components/templates/TemplateEditor";
import type { TemplateDraft } from "@/lib/templates/repository";

const draft: TemplateDraft = {
  templateId: "t1",
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
      required: false,
      position: 1,
      archived: false,
      options: [],
      valueCount: 3,
    }],
  }],
};

describe("TemplateEditor", () => {
  it("shows exactly the four schema columns", () => {
    render(
      <TemplateEditor draft={draft} experimentCount={24} onPersist={vi.fn()} readOnly={false} />,
    );
    expect(screen.getByText("Field label")).toBeInTheDocument();
    expect(screen.getByText("Key")).toBeInTheDocument();
    expect(screen.getByText("Value type")).toBeInTheDocument();
    expect(screen.getByText("Required / optional")).toBeInTheDocument();
  });

  it("locks the Value Type of a populated Key", () => {
    render(
      <TemplateEditor draft={draft} experimentCount={24} onPersist={vi.fn()} readOnly={false} />,
    );
    expect(screen.getByLabelText("Value type for pass@1")).toBeDisabled();
  });

  it("describes adding a Key as an impact line", async () => {
    render(
      <TemplateEditor draft={draft} experimentCount={24} onPersist={vi.fn()} readOnly={false} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(screen.getByText(/creates an empty Key for 24 existing Experiments/)).toBeInTheDocument();
  });
});
```

Run it now:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run components/templates/__tests__/TemplateEditor.test.tsx
```

Expected: FAIL (assertions fail against the Task 4 stub).

- [ ] **Step 2: Implement `components/templates/OptionsEditor.tsx`**

Create `components/templates/OptionsEditor.tsx`:

```tsx
"use client";

import type { TemplateOptionDraft } from "@/lib/templates/repository";

export default function OptionsEditor({
  options,
  onChange,
}: {
  options: TemplateOptionDraft[];
  onChange: (options: TemplateOptionDraft[]) => void;
}) {
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((option, position) => ({ ...option, position })));
  }

  return (
    <div className="options-editor">
      <div className="options-editor-title">Options</div>
      {options.map((option, index) => (
        <div key={option.id ?? `new-${index}`} className="option-row">
          <button
            type="button"
            className="icon-btn"
            aria-label={`Move ${option.label || "option"} up`}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            ↑
          </button>
          <input
            aria-label={`Option label ${index + 1}`}
            value={option.label}
            onChange={(event) => {
              const next = [...options];
              next[index] = { ...option, label: event.target.value };
              onChange(next);
            }}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label={`Move ${option.label || "option"} down`}
            disabled={index === options.length - 1}
            onClick={() => move(index, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Archive ${option.label || "option"}`}
            onClick={() => {
              const next = [...options];
              next[index] = { ...option, archived: true };
              onChange(next);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn ghost small"
        onClick={() => onChange([...options, {
          id: null,
          label: "",
          position: options.length,
          archived: false,
        }])}
      >
        Add option
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Implement `components/templates/TemplateEditor.tsx`**

Replace the Task 4 stub with:

```tsx
"use client";

import { useMemo, useState } from "react";
import OptionsEditor from "@/components/templates/OptionsEditor";
import { describeTemplateImpact } from "@/lib/templates/impact";
import type {
  TemplateDraft,
  TemplateFieldDraft,
  TemplateKeyDraft,
  TemplateOptionDraft,
  TemplateValueType,
} from "@/lib/templates/repository";
import type { TemplateValueType as ValueType } from "@/lib/types";

const VALUE_TYPES: Array<{ value: ValueType; label: string }> = [
  { value: "short_text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "single_select", label: "Single select" },
  { value: "multi_select", label: "Multi select" },
  { value: "date_time", label: "Date/time" },
  { value: "url", label: "URL" },
  { value: "attachment", label: "Attachment" },
];

const COLOR_TOKENS = ["blue", "green", "amber", "purple", "rose", "teal"];

export default function TemplateEditor({
  draft,
  experimentCount,
  onPersist,
  readOnly,
}: {
  draft: TemplateDraft;
  experimentCount: number;
  onPersist: (draft: TemplateDraft) => Promise<void>;
  readOnly: boolean;
}) {
  const [next, setNext] = useState<TemplateDraft>(() => structuredClone(draft));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [optionsFor, setOptionsFor] = useState<string | null>(null);
  const impact = useMemo(
    () => describeTemplateImpact(draft, next, experimentCount),
    [draft, next, experimentCount],
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(next);

  function updateField(index: number, patch: Partial<TemplateFieldDraft>) {
    const fields = [...next.fields];
    fields[index] = { ...fields[index], ...patch };
    setNext({ ...next, fields });
  }

  function updateKey(fieldIndex: number, keyIndex: number, patch: Partial<TemplateKeyDraft>) {
    const fields = [...next.fields];
    const keys = [...fields[fieldIndex].keys];
    keys[keyIndex] = { ...keys[keyIndex], ...patch };
    fields[fieldIndex] = { ...fields[fieldIndex], keys };
    setNext({ ...next, fields });
  }

  function moveKey(fieldIndex: number, keyIndex: number, direction: -1 | 1) {
    const fields = [...next.fields];
    const keys = [...fields[fieldIndex].keys];
    const target = keyIndex + direction;
    if (target < 0 || target >= keys.length) return;
    [keys[keyIndex], keys[target]] = [keys[target], keys[keyIndex]];
    fields[fieldIndex] = {
      ...fields[fieldIndex],
      keys: keys.map((key, position) => ({ ...key, position })),
    };
    setNext({ ...next, fields });
  }

  function moveField(fieldIndex: number, direction: -1 | 1) {
    const fields = [...next.fields];
    const target = fieldIndex + direction;
    if (target < 0 || target >= fields.length) return;
    [fields[fieldIndex], fields[target]] = [fields[target], fields[fieldIndex]];
    setNext({ ...next, fields: fields.map((field, position) => ({ ...field, position })) });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await onPersist(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the Template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="template-editor">
      <div className="template-editor-heading">
        <input
          className="template-editor-name"
          aria-label="Template name"
          value={next.name}
          disabled={readOnly}
          onChange={(event) => setNext({ ...next, name: event.target.value })}
        />
        <textarea
          className="template-editor-description"
          aria-label="Template description"
          rows={2}
          value={next.description}
          disabled={readOnly}
          onChange={(event) => setNext({ ...next, description: event.target.value })}
        />
      </div>

      <div className="template-schema-scroll" tabIndex={0}>
        <table className="template-schema-table">
          <thead>
            <tr>
              <th scope="col">Field label</th>
              <th scope="col">Key</th>
              <th scope="col">Value type</th>
              <th scope="col">Required / optional</th>
              <th scope="col" className="sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {next.fields.map((field, fieldIndex) => {
              const rowCount = Math.max(field.keys.length, 1);
              return (
                <TemplateFieldRows
                  key={field.id ?? `new-field-${fieldIndex}`}
                  field={field}
                  fieldIndex={fieldIndex}
                  rowCount={rowCount}
                  readOnly={readOnly}
                  onFieldChange={(patch) => updateField(fieldIndex, patch)}
                  onKeyChange={(keyIndex, patch) => updateKey(fieldIndex, keyIndex, patch)}
                  onMoveKey={(keyIndex, direction) => moveKey(fieldIndex, keyIndex, direction)}
                  onArchiveField={() => updateField(fieldIndex, { archived: true })}
                  onAddKey={() => {
                    const fields = [...next.fields];
                    const keys = [...fields[fieldIndex].keys];
                    keys.push({
                      id: null,
                      key: "",
                      valueType: "short_text",
                      required: false,
                      position: keys.length,
                      archived: false,
                      options: [],
                      valueCount: 0,
                    });
                    fields[fieldIndex] = { ...fields[fieldIndex], keys };
                    setNext({ ...next, fields });
                  }}
                  onOpenOptions={(keyId) => setOptionsFor(keyId)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="template-editor-footer">
        <button
          type="button"
          className="btn ghost small"
          disabled={readOnly}
          onClick={() => {
            const fields = [...next.fields];
            fields.push({
              id: null,
              label: "",
              colorToken: COLOR_TOKENS[next.fields.length % COLOR_TOKENS.length],
              position: next.fields.length,
              archived: false,
              keys: [],
            });
            setNext({ ...next, fields });
          }}
        >
          Add field label
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={readOnly || !dirty || saving || !next.name.trim()}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save schema"}
        </button>
      </div>

      {impact.length > 0 ? (
        <div className="template-impact" role="status">
          {impact.map((line) => <p key={line}>{line}</p>)}
        </div>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {optionsFor ? (
        <OptionsDrawer
          keyId={optionsFor}
          field={next.fields.find((field) =>
            field.keys.some((key) => key.id === optionsFor),
          )}
          onClose={() => setOptionsFor(null)}
          onChange={(options) => {
            const fields = next.fields.map((field) => {
              const keys = field.keys.map((key) =>
                key.id === optionsFor ? { ...key, options } : key,
              );
              return { ...field, keys };
            });
            setNext({ ...next, fields });
          }}
        />
      ) : null}
    </div>
  );
}

function TemplateFieldRows({
  field,
  fieldIndex,
  rowCount,
  readOnly,
  onFieldChange,
  onKeyChange,
  onMoveKey,
  onArchiveField,
  onAddKey,
  onOpenOptions,
}: {
  field: TemplateFieldDraft;
  fieldIndex: number;
  rowCount: number;
  readOnly: boolean;
  onFieldChange: (patch: Partial<TemplateFieldDraft>) => void;
  onKeyChange: (keyIndex: number, patch: Partial<TemplateKeyDraft>) => void;
  onMoveKey: (keyIndex: number, direction: -1 | 1) => void;
  onArchiveField: () => void;
  onAddKey: () => void;
  onOpenOptions: (keyId: string) => void;
}) {
  return (
    <>
      <tr className="template-field-row">
        <td
          className={`template-field-cell token-${field.colorToken}`}
          rowSpan={rowCount + (readOnly ? 0 : 1)}
        >
          <input
            aria-label={`Field label ${fieldIndex + 1}`}
            value={field.label}
            disabled={readOnly}
            onChange={(event) => onFieldChange({ label: event.target.value })}
          />
          {!readOnly ? (
            <select
              aria-label={`Color for ${field.label || "field"}`}
              value={field.colorToken}
              onChange={(event) => onFieldChange({ colorToken: event.target.value })}
            >
              {COLOR_TOKENS.map((token) => <option key={token} value={token}>{token}</option>)}
            </select>
          ) : null}
          {!readOnly ? (
            <button type="button" className="btn ghost small" onClick={onArchiveField}>
              Archive field
            </button>
          ) : null}
        </td>
      </tr>
      {field.keys.map((key, keyIndex) => (
        <tr key={key.id ?? `new-key-${keyIndex}`} className="template-key-row">
          <td>
            <input
              aria-label={`Key name ${keyIndex + 1}`}
              value={key.key}
              disabled={readOnly}
              onChange={(event) => onKeyChange(keyIndex, { key: event.target.value })}
            />
          </td>
          <td>
            <select
              aria-label={`Value type for ${key.key || "key"}`}
              value={key.valueType}
              disabled={readOnly || key.valueCount > 0}
              onChange={(event) =>
                onKeyChange(keyIndex, { valueType: event.target.value as ValueType })}
            >
              {VALUE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            {(key.valueType === "single_select" || key.valueType === "multi_select") && key.id ? (
              <button
                type="button"
                className="btn ghost small"
                onClick={() => onOpenOptions(key.id!)}
              >
                Options
              </button>
            ) : null}
          </td>
          <td>
            <select
              aria-label={`Required for ${key.key || "key"}`}
              value={key.required ? "required" : "optional"}
              disabled={readOnly}
              onChange={(event) =>
                onKeyChange(keyIndex, { required: event.target.value === "required" })}
            >
              <option value="required">Required</option>
              <option value="optional">Optional</option>
            </select>
          </td>
          <td className="template-key-actions">
            <button
              type="button"
              className="icon-btn"
              aria-label={`Move ${key.key || "key"} up`}
              disabled={readOnly || keyIndex === 0}
              onClick={() => onMoveKey(keyIndex, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Move ${key.key || "key"} down`}
              disabled={readOnly || keyIndex === field.keys.length - 1}
              onClick={() => onMoveKey(keyIndex, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Archive ${key.key || "key"}`}
              disabled={readOnly}
              onClick={() => onKeyChange(keyIndex, { archived: true })}
            >
              ×
            </button>
          </td>
        </tr>
      ))}
      {!readOnly ? (
        <tr className="template-key-row">
          <td colSpan={4}>
            <button type="button" className="btn ghost small" onClick={onAddKey}>
              Add key
            </button>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function OptionsDrawer({
  keyId,
  field,
  onClose,
  onChange,
}: {
  keyId: string;
  field: TemplateFieldDraft | undefined;
  onClose: () => void;
  onChange: (options: TemplateOptionDraft[]) => void;
}) {
  const key = field?.keys.find((candidate) => candidate.id === keyId);
  if (!field || !key) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="experiment-dialog options-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Select options"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">Value type</p>
            <h2>Options for {key.key}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <OptionsEditor
          options={key.options}
          onChange={onChange}
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Add the editor CSS to `app/template-manager.css`**

Append:

```css
.template-editor { display: flex; flex-direction: column; gap: 14px; }
.template-editor-heading { display: flex; flex-direction: column; gap: 8px; }
.template-editor-name {
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.02em;
  border: 0;
  background: transparent;
  color: var(--ink);
}
.template-editor-description {
  border: 0;
  background: transparent;
  color: var(--ink-soft);
  resize: vertical;
}
.template-schema-scroll {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 10px;
}
.template-schema-scroll:focus-visible { outline: var(--focus-ring); }
.template-schema-table { border-collapse: collapse; width: 100%; }
.template-schema-table th {
  text-align: left;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-soft);
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-subtle);
}
.template-schema-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--line-soft);
  vertical-align: middle;
}
.template-field-row td { padding: 0; }
.template-field-cell {
  background: var(--field-soft);
  color: var(--field-accent);
  font-weight: 600;
  width: 180px;
}
.template-field-cell input {
  border: 0;
  background: transparent;
  color: inherit;
  font-weight: 600;
  width: 100%;
}
.template-key-row td { border-top: 0; }
.template-field-row + .template-key-row td { border-top: 0; }
.template-field-row td,
.template-field-row + .template-key-row td,
.template-key-row + .template-key-row td { border-top: 0; }
.template-key-row input,
.template-key-row select {
  min-width: 140px;
}
.template-key-actions { display: flex; gap: 4px; }
.template-editor-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.template-impact {
  border: 1px solid var(--warn-soft);
  background: var(--warn-soft);
  border-radius: 8px;
  padding: 10px 12px;
}
.template-impact p { margin: 0; font-size: 13px; color: var(--warn); }
.options-editor { display: flex; flex-direction: column; gap: 8px; }
.options-editor-title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-soft);
}
.option-row { display: flex; gap: 6px; align-items: center; }
.option-row input { flex: 1; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 5: Run the editor tests**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run components/templates/__tests__/TemplateEditor.test.tsx components/templates/__tests__/TemplateManager.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Confirm zero new type errors and commit**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | head -20
git add components/templates app/template-manager.css
git commit -m "feat: add template schema editor with options and impact preview"
```

Expected: no tsc output; commit succeeds.

---

### Task 6: Add Template history and restore

**Files:**
- Create: `components/templates/TemplateHistoryDrawer.tsx`
- Modify: `components/templates/TemplateManager.tsx`
- Modify: `components/templates/__tests__/TemplateManager.test.tsx`

- [ ] **Step 1: Extend the repository test with restore coverage**

Append to `lib/templates/__tests__/repository.test.ts`:

```ts
describe("template restore", () => {
  it("maps a snapshot into a save and returns the new revision", async () => {
    vi.mocked(mocks.table("experiment_templates").maybeSingle)
      .mockResolvedValue({ data: template, error: null });
    vi.mocked(mocks.table("experiment_template_versions").maybeSingle)
      .mockResolvedValue({
        data: {
          snapshot: [{
            id: "f1",
            label: "Metrics",
            color_token: "blue",
            position: 1,
            archived_at: null,
            keys: [{
              id: "k1",
              key: "pass@1",
              value_type: "number",
              required: false,
              position: 1,
              archived_at: null,
              options: [],
            }],
          }],
        },
        error: null,
      });
    vi.mocked(mocks.rpc).mockResolvedValue({
      data: { template_id: template.id, schema_revision: 4, version_no: 4 },
      error: null,
    });

    const { restoreTemplateVersion } = await import("@/lib/templates/repository");
    const result = await restoreTemplateVersion(template.id, 2);

    expect(result.schema_revision).toBe(4);
    expect(mocks.rpc).toHaveBeenCalledWith("save_experiment_template", expect.objectContaining({
      p_name: "Benchmark",
      p_expected_schema_revision: 3,
    }));
  });
});
```

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/templates/__tests__/repository.test.ts
```

Expected: FAIL — `restoreTemplateVersion` cannot be imported.

- [ ] **Step 2: Create `components/templates/TemplateHistoryDrawer.tsx`**

Create `components/templates/TemplateHistoryDrawer.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  listTemplateVersions,
  type TemplateVersionSummary,
} from "@/lib/templates/repository";

export default function TemplateHistoryDrawer({
  templateId,
  open,
  onClose,
  onRestore,
}: {
  templateId: string | null;
  open: boolean;
  onClose: () => void;
  onRestore: (versionNo: number) => Promise<void>;
}) {
  const [versions, setVersions] = useState<TemplateVersionSummary[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !templateId) return;
    setError("");
    listTemplateVersions(templateId)
      .then(setVersions)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Could not load history."));
  }, [open, templateId]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={() => { if (!busy) onClose(); }}>
      <aside
        className="history-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Template history"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="history-drawer-header">
          <div>
            <p className="eyebrow">Versions</p>
            <h2>Template history</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <ol className="history-list">
          {versions.map((version) => (
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
                disabled={busy || version.version_no === 1}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await onRestore(version.version_no);
                    onClose();
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : "Restore failed.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Restore
              </button>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Wire history into `TemplateManager`**

In `components/templates/TemplateManager.tsx`:

1. Add state: `const [historyOpen, setHistoryOpen] = useState(false);`
2. Import `restoreTemplateVersion` from `@/lib/templates/repository` and `TemplateHistoryDrawer`.
3. Add a History button to the `actions` block, before Archive:

```tsx
              <button type="button" className="btn ghost" onClick={() => setHistoryOpen(true)}>
                History
              </button>
```

4. Add `restore(versionNo)` and render the drawer before `NewTemplateDialog`:

```tsx
  async function restore(versionNo: number) {
    if (!selectedId) return;
    await restoreTemplateVersion(selectedId, versionNo);
    await reloadSummaries();
    await selectTemplate(selectedId);
  }

      <TemplateHistoryDrawer
        templateId={selectedId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestore={restore}
      />
```

- [ ] **Step 4: Extend the manager test**

Append to `components/templates/__tests__/TemplateManager.test.tsx`:

```tsx
  it("opens history and lists versions", async () => {
    const { listTemplateVersions } = await import("@/lib/templates/repository");
    vi.mocked(listTemplateVersions).mockResolvedValue([{
      id: "v1",
      version_no: 2,
      reason: "Schema edited",
      source: "browser",
      schema_revision: 2,
      created_at: "2026-07-31T00:00:00.000Z",
    }]);
    render(<TemplateManager />);
    await screen.findByText("Benchmark A");
    await userEvent.click(screen.getByRole("button", { name: "Benchmark A" }));
    await userEvent.click(screen.getByRole("button", { name: "History" }));
    await screen.findByText("v2");
    expect(screen.getByText("Schema edited")).toBeInTheDocument();
  });
```

Update the `vi.mock("@/lib/templates/repository")` block to include `listTemplateVersions: mocks.listVersions` and add `listVersions: vi.fn()` to the `mocks` object.

- [ ] **Step 5: Add the history CSS**

Append to `app/template-manager.css`:

```css
.history-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(360px, 100%);
  background: var(--surface);
  border-left: 1px solid var(--line);
  box-shadow: var(--shadow-3);
  padding: 16px;
  overflow-y: auto;
}
.history-drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}
.history-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 12px;
}
.history-item strong { display: block; }
.history-reason { display: block; color: var(--ink); font-size: 13px; }
.history-meta { display: block; color: var(--text-tertiary); font-size: 12px; }
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/templates components/templates
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | head -20
git add components/templates lib/templates app/template-manager.css
git commit -m "feat: add template history and restore"
```

Expected: all template tests PASS; no new type errors; commit succeeds.

---

### Task 7: Require a Template when creating Experiments

**Files:**
- Modify: `lib/experiments/policy.ts`
- Modify: `lib/experiments/repository.ts`
- Modify: `components/experiments/CreateExperimentDialog.tsx`
- Modify: `lib/experiments/__tests__/repository.test.ts`
- Modify: `lib/experiments/__tests__/policy.test.ts`
- Modify: `components/experiments/__tests__/CreateExperimentDialog.test.tsx`
- Modify: `components/experiments/__tests__/TaskExperimentsPanel.test.tsx`

- [ ] **Step 1: Update `policy.ts`**

Add `template_id: string | null;` to the `ExperimentInsert` interface and copy the source Template into duplicates in `buildDuplicateInsert`:

```ts
export interface ExperimentInsert {
  task_id: string;
  template_id: string | null;
  owner_id: string;
  ...
}

export function buildDuplicateInsert(...): ExperimentInsert {
  return {
    task_id: source.task_id,
    template_id: source.template_id,
    ...
  };
}
```

- [ ] **Step 2: Update `repository.ts`**

Extend `NewExperimentInput`:

```ts
export interface NewExperimentInput {
  taskId: string;
  templateId: string;
  name: string;
  ownerId: string;
}
```

In `createExperiment`, add `const templateId = requiredValue(input.templateId, "Template is required.");` and set `template_id: templateId` in the insert payload.

- [ ] **Step 3: Write the failing dialog test addition**

Append to `components/experiments/__tests__/CreateExperimentDialog.test.tsx`:

```tsx
  it("requires a Template before creating", async () => {
    render(
      <CreateExperimentDialog
        open
        tasks={[]}
        members={[]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
    expect(screen.getByText("Template")).toBeInTheDocument();
    expect(screen.getByText(/cannot be changed later/)).toBeInTheDocument();
  });
```

- [ ] **Step 4: Implement the dialog Template step**

In `components/experiments/CreateExperimentDialog.tsx`:

1. Import `listTemplateSummaries` from `@/lib/templates/repository` and add state:

```tsx
const [templates, setTemplates] = useState<TemplateSummary[]>([]);
const [templateId, setTemplateId] = useState("");
```

2. Load active Templates when the dialog opens (inside the existing `useEffect` on `open`):

```tsx
    if (open) {
      setTemplates([]);
      listTemplateSummaries()
        .then((summaries) => {
          if (mounted.current) {
            setTemplates(summaries.filter((summary) => summary.template.archived_at === null));
          }
        })
        .catch(() => undefined);
    }
```

3. Reset `templateId` alongside the other fields on open.
4. Validate it in `submit` and include it in the create call:

```tsx
    if (!name.trim() || !taskId || !ownerId || !templateId) {
      setError("Name, Owner, Task, and Template are required.");
      return;
    }
      const experiment = await createExperiment({
        taskId,
        templateId,
        ownerId,
        name: name.trim(),
      });
```

5. Render the Template select before Name:

```tsx
          <label>
            <span>Template</span>
            <select
              aria-label="Experiment template"
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              <option value="">Choose a template…</option>
              {templates.map((summary) => (
                <option key={summary.template.id} value={summary.template.id}>
                  {summary.template.name} · {summary.keyCount} keys · {summary.experimentCount} experiments
                </option>
              ))}
            </select>
            <small className="field-hint">A Template cannot be changed later.</small>
          </label>
```

6. If the summary list is still loading and empty, show a disabled "Loading templates…" option instead of an empty list:

```tsx
              {templates.length === 0 ? (
                <option value="">Loading templates…</option>
              ) : (
                <>
                  <option value="">Choose a template…</option>
                  {templates.map((summary) => (...))}
                </>
              )}
```

Note: the test above asserts "cannot be changed later" — use the exact copy `A Template cannot be changed after creation.` and assert on that instead if the shorter phrase is ambiguous.

- [ ] **Step 5: Update existing tests**

`lib/experiments/__tests__/repository.test.ts` — find every `createExperiment({ taskId, ownerId, name })` call (the create-flow tests) and add `templateId: "30000000-0000-4000-8000-000000000001"`, then assert the insert payload contains `template_id`.

`lib/experiments/__tests__/policy.test.ts` — assert `buildDuplicateInsert` copies `template_id`:

```ts
  it("copies the source Template into a duplicate", () => {
    const insert = buildDuplicateInsert(
      { ...completeContext, template_id: "30000000-0000-4000-8000-000000000001" },
      { name: "Copy", ownerId: completeContext.owner_id!, position: 1 },
    );
    expect(insert.template_id).toBe("30000000-0000-4000-8000-000000000001");
  });
```

`components/experiments/__tests__/CreateExperimentDialog.test.tsx` and `components/experiments/__tests__/TaskExperimentsPanel.test.tsx` — mock `@/lib/templates/repository` `listTemplateSummaries` to resolve one active Template and select it in the create-flow tests so existing assertions keep passing.

- [ ] **Step 6: Run the affected tests**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/experiments/__tests__/repository.test.ts lib/experiments/__tests__/policy.test.ts components/experiments/__tests__/CreateExperimentDialog.test.tsx components/experiments/__tests__/TaskExperimentsPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Confirm zero new type errors and commit**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | head -20
git add lib/experiments/policy.ts lib/experiments/repository.ts components/experiments/CreateExperimentDialog.tsx \
  lib/experiments/__tests__ components/experiments/__tests__
git commit -m "feat: require a template when creating experiments"
```

Expected: no new type errors; commit succeeds.

---

### Task 8: Final verification and spec cross-check

**Files:** none

- [ ] **Step 1: Cross-check the spec**

Re-read `docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md` sections "Template Manager", "Create Experiment", "Safe Template evolution", and confirm:

- Template list shows Name, Description, active Key count, and Experiment count; archived Templates excluded from creation (spec "Create Experiment").
- The schema table columns are exactly Field label, Key, Value type, Required / optional; narrow canvas-colored gaps; merged, vertically centered Field Label cell with stable color (spec "Template Manager").
- One action adds a Field Label or a Key; drag handles reorder both; keyboard move controls exist (spec "Responsive and Accessibility").
- Type-specific settings open from the Value Type cell in a popover (OptionsEditor) without extra table columns (spec "Template Manager").
- Before applying a schema edit the UI states its impact, e.g. "Adding pass@1 creates an empty Key for N existing Experiments" (impact preview).
- Unsafe edits are unavailable: Value Type selects are disabled for populated Keys (spec "Safe Template evolution").
- History and Archive are header actions; Archive is confirmed; restore is a forward mutation (spec "Template Manager", "experiment_template_versions").
- Create flow: Task → active Template → Name/Owner → create with default Status; Template selection states it cannot be changed later (spec "Create Experiment").
- Every Template mutation goes through the save/archive/unarchive functions, bumps `schema_revision`, and writes an immutable snapshot (spec "Safe Template evolution", "experiment_template_versions").

Fix any gap found before continuing.

- [ ] **Step 2: Run the full database test suite**

Run:

```bash
npx supabase test db --local \
  supabase/tests/0014_api_key_deletion.sql \
  supabase/tests/0015_experiment_template_workspace_schema.sql \
  supabase/tests/0016_experiment_template_workspace_grants.sql \
  supabase/tests/0017_experiment_template_workspace_functions.sql
```

Expected: all four files PASS.

- [ ] **Step 3: Run the full application suite and typecheck**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | head -20
```

Expected: all Vitest suites PASS; no new type errors (only the documented pre-existing failures remain).

- [ ] **Step 4: Build the app**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx next build
```

Expected: build succeeds with the new `/experiments/templates` route.

- [ ] **Step 5: Verify branch state and hand off**

Run:

```bash
git status --short --branch
git log --oneline -6
```

Expected: clean tree; the last commits are the six Phase 2 commits (functions, repository, manager shell, editor, history, create-flow). Report to the user:

- Phase 2 complete on `feat/experiment-template-workspace`.
- Phase 3 (one-column Field Table Detail, typed autosave, conflicts, version history, Archive) is the next plan to write and execute.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-31-experiment-template-workspace-manager.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
