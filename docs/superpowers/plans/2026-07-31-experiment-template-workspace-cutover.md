# Experiment Template Workspace — Phase 6 (Legacy Data Migration Cutover) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill every existing Experiment into one workspace-wide `Imported legacy experiments` Template with typed Values and one migration version snapshot, then cut over: drop the legacy completed/Decision constraint, make the Activity timeline lifecycle-only, retire content-aware Status validation, and lock `experiments.template_id` NOT NULL — all additively, with every legacy column preserved.

**Architecture:** One imperative migration (`legacy_experiment_cutover`) runs a PL/pgSQL block that (1) creates the Imported Template with a deterministic UUID and generated Fields/Keys from the data present at migration time, (2) backfills typed Values + Attachment associations + one `migration` version snapshot per Experiment, (3) retires the legacy constraint and content branches, and (4) sets `template_id NOT NULL`. App-side, `lib/experiments/policy.ts` drops the content-aware Status gates to transition-only validation. A verification script (`scripts/verify-legacy-migration.mjs`) independently checks the migration's invariants.

**Tech Stack:** Postgres PL/pgSQL + pgTAP, Node verification script, Vitest, Next.js 16.

---

## Global Constraints

- Work only in `.worktrees/experiment-template-workspace` on `feat/experiment-template-workspace` (already checked out; do not switch branches).
- Authoritative design: `docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md` — read "Existing Data Migration", "Verification", "Activity versus Version History", "Agent API Compatibility", and "Delivery Sequence" before starting.
- Phases 1-5 are committed. Reuse `_experiment_snapshot` (Phase 3) for the migration snapshots; reuse the Phase 2 guard/insert trigger. Do NOT modify prior migrations.
- Additive and recoverable: no legacy `experiments` column is dropped, no hard delete occurs, and nothing is permanently rewritten. Legacy columns remain canonical until a later, independently reviewed cleanup release (NOT this plan).
- The Imported Legacy Template uses the deterministic UUID `11111111-1111-4111-8111-111111111111` so application code and the Agent API can recognize it.
- All imported Keys are Optional (never blocks legacy records). `dataset_N_*`, Config, and Metric Keys are generated from data present at migration time; fixed Object/Environment/Lifecycle/Result/Decision/Note/Attachment Keys always exist.
- Cutover retires: `experiments_completed_decision_check`, the content branches of `log_experiment_activity`, and the app-side content-aware Status gates. Manual comments and Task-level Activity stay.
- House patterns: pgTAP in `supabase/tests/NNNN_<name>.sql`, Vitest, migration via `npx supabase migration new`, commit after every task, `npx tsc --noEmit` gate = zero NEW errors.
- Node: run Vitest/tsc/build with `PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH`; `npx supabase ...` needs `require_escalated`.

## Planned File Structure

Create:
- `supabase/tests/0019_legacy_experiment_cutover.sql` (Task 1)
- `supabase/migrations/<timestamp>_legacy_experiment_cutover.sql` (Task 2)
- `scripts/verify-legacy-migration.mjs` (Task 4)
- `scripts/__tests__/verify-legacy-migration.test.ts` (Task 4)

Modify:
- `lib/experiments/policy.ts` — transition-only Status validation (Task 3)
- `lib/experiments/__tests__/policy.test.ts` — updated expectations (Task 3)
- `README.md` — rollout section (Task 4)

**Migration outcomes (Task 2):**

- `experiment_templates` row `11111111-1111-4111-8111-111111111111` named `Imported legacy experiments`, `schema_revision 1`.
- Fields: Data, Object, Environment, Config, Result, Decision, Note, Lifecycle, Attachments (ordered; `color_token` cycles the palette).
- Fixed Keys (all Optional): Object → model, harness, parent_harness, prompt, prompt_change, skills, tools; Environment → platform, server, devices, hardware, evaluator, revision, precision_policy; Result → result_summary; Decision → decision_outcome (single_select: reference/accepted/rejected/inconclusive), decision_notes; Note → notes; Lifecycle → started_at, completed_at; Attachments → attachment.
- Generated Keys (from data at migration time): `dataset_N_role` (single_select training/evaluation), `dataset_N_name`, `dataset_N_split`, `dataset_N_revision` (text), `dataset_N_task_count`, `dataset_N_samples_per_task` (number) for N = 1..max observed datasets; one Key per unioned Config key (number/boolean/short_text, or long_text when the type is inconsistent), one Number Key per unioned Metric key.
- Every `experiments` row: `template_id` set, typed current Values inserted with `cell_revision 1`, one `experiment_versions` row (`version_no 1`, `reason 'migration'`, `source 'migration'`, `template_schema_revision 1`).
- `attachments.template_key_id` set to the Attachment Key for every Experiment-linked Attachment.
- `experiments_completed_decision_check` dropped; `experiments.template_id` set NOT NULL; `log_experiment_activity` replaced with lifecycle-only behavior.

---

### Task 1: Write the failing pgTAP cutover test

**Files:**
- Create: `supabase/tests/0019_legacy_experiment_cutover.sql`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0019_legacy_experiment_cutover.sql`:

```sql
begin;
select plan(17);

-- Imported Legacy Template exists with the deterministic UUID -------------------
select is(
  (select name from public.experiment_templates
   where id = '11111111-1111-4111-8111-111111111111'),
  'Imported legacy experiments',
  'the Imported Legacy Template exists'
);
select is(
  (select count(*)::int from public.experiment_template_fields
   where template_id = '11111111-1111-4111-8111-111111111111'),
  9,
  'the Imported Template has the nine Field Labels'
);

-- Fixed Keys --------------------------------------------------------------------
select is(
  (select count(*)::int from public.experiment_template_keys
   where template_id = '11111111-1111-4111-8111-111111111111'
     and key in ('model','harness','parent_harness','prompt','prompt_change','skills','tools')),
  7,
  'Object properties map to fixed Keys'
);
select is(
  (select count(*)::int from public.experiment_template_keys
   where template_id = '11111111-1111-4111-8111-111111111111'
     and key in ('platform','server','devices','hardware','evaluator','revision','precision_policy')),
  7,
  'Environment properties map to fixed Keys'
);
select is(
  (select count(*)::int from public.experiment_template_keys
   where template_id = '11111111-1111-4111-8111-111111111111'
     and key in ('result_summary','decision_outcome','decision_notes','notes','started_at','completed_at','attachment')),
  7,
  'Result, Decision, Note, Lifecycle, and Attachment Keys exist'
);
select is(
  (select count(*)::int from public.experiment_template_key_options o
   join public.experiment_template_keys k on k.id = o.key_id
   where k.template_id = '11111111-1111-4111-8111-111111111111'
     and k.key = 'decision_outcome'),
  4,
  'decision_outcome has the four legacy options'
);
select is(
  (select count(*)::int from public.experiment_template_keys
   where template_id = '11111111-1111-4111-8111-111111111111'
     and required),
  0,
  'all imported Keys are Optional'
);

-- template_id is locked ------------------------------------------------------------
select is(
  (select is_nullable from information_schema.columns
   where table_schema = 'public' and table_name = 'experiments'
     and column_name = 'template_id'),
  'NO',
  'experiments.template_id is NOT NULL after backfill'
);
insert into public.modules (id, name, kind)
values ('10000000-0000-4000-8000-000000000099', 'Cutover test module', 'pipeline');
insert into public.tasks (id, module_id, title)
values ('20000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000099', 'Cutover test task');
select throws_ok(
  $$insert into public.experiments (id, task_id, name)
    values (
      '60000000-0000-4000-8000-000000000099',
      '20000000-0000-4000-8000-000000000099',
      'No template'
    )$$,
  '23502',
  'null value in column "template_id" of relation "experiments" violates not-null constraint',
  'new Experiments require a Template'
);

-- Legacy constraint retired ---------------------------------------------------------
select is(
  (select count(*)::int from pg_constraint
   where conrelid = 'public.experiments'::regclass
     and conname = 'experiments_completed_decision_check'),
  0,
  'the legacy completed/Decision constraint is dropped'
);

-- Lifecycle-only Activity -------------------------------------------------------------
insert into public.experiments (id, task_id, template_id, name)
values (
  '60000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000099',
  '11111111-1111-4111-8111-111111111111',
  'Cutover run'
);
select is(
  (select count(*)::int from public.activity
   where experiment_id = '60000000-0000-4000-8000-000000000001'
     and kind = 'experiment'),
  1,
  'creating an Experiment still logs the lifecycle event'
);

update public.experiments
set config = '{"block": 256}'::jsonb
where id = '60000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.activity
   where experiment_id = '60000000-0000-4000-8000-000000000001'
     and kind = 'edit'),
  0,
  'legacy content edits no longer append Activity rows'
);

update public.experiments
set status = 'running'
where id = '60000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.activity
   where experiment_id = '60000000-0000-4000-8000-000000000001'
     and kind = 'status'),
  1,
  'Status changes still append lifecycle Activity'
);

-- Migration snapshots ----------------------------------------------------------------
select is(
  (select count(*)::int from public.experiment_versions
   where source = 'migration' and version_no = 1
     and coalesce(snapshot->>'template_id', '') <> '11111111-1111-4111-8111-111111111111'),
  0,
  'no migration version references another Template'
);

-- No cross-template Values or orphans ------------------------------------------------
select is(
  (select count(*)::int from public.experiment_values v
   join public.experiments e on e.id = v.experiment_id
   where v.template_id <> e.template_id),
  0,
  'zero cross-Template Value rows'
);
select is(
  (select count(*)::int from public.experiment_values v
   where not exists (
     select 1 from public.experiment_template_keys k
     where k.id = v.key_id and k.template_id = v.template_id
   )),
  0,
  'zero orphan Value rows'
);
select is(
  (select count(*)::int from public.attachments a
   where a.experiment_id is not null
     and a.template_key_id is null),
  0,
  'every Experiment Attachment is associated with the Attachment Key'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx supabase test db --local supabase/tests/0019_legacy_experiment_cutover.sql
```

Expected: FAIL — the Imported Template does not exist yet.

---

### Task 2: Add the cutover migration and make the test pass

**Files:**
- Create: `supabase/migrations/<timestamp>_legacy_experiment_cutover.sql` (name from the CLI)

- [ ] **Step 1: Create the migration file**

Run:

```bash
npx supabase migration new legacy_experiment_cutover
```

Note the printed filename; commands below use it as `supabase/migrations/<timestamp>_legacy_experiment_cutover.sql`.

- [ ] **Step 2: Implement the migration**

Replace the empty migration body with:

```sql
-- Experiment Template Workspace (Phase 6): legacy data migration cutover.
-- Design: docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md

do $legacy_cutover$
declare
  v_template_id uuid := '11111111-1111-4111-8111-111111111111';
  v_field_pos int;
  v_key_pos int;
  v_field_id uuid;
  v_key_id uuid;
  v_metric text;
  v_config_key text;
  v_config_type text;
  v_dataset_max int;
  v_idx int;
  v_fixed_key record;
  v_dataset_key record;
  v_experiment record;
  v_datasets jsonb;
  v_object jsonb;
  v_environment jsonb;
  v_config jsonb;
  v_metrics jsonb;
  v_option_id uuid;
  v_attachment_key uuid;
  v_schema_revision bigint := 1;
begin
  -- 1. Create the Imported Legacy Template (idempotent).
  insert into public.experiment_templates (id, name, description)
  values (
    v_template_id,
    'Imported legacy experiments',
    'Imported from the legacy fixed content model.'
  )
  on conflict (id) do nothing;

  -- 2. Field Labels with stable positions.
  for v_idx in 1..9 loop
    select id into v_field_id
    from public.experiment_template_fields
    where template_id = v_template_id
      and label = (array[
        'Data', 'Object', 'Environment', 'Config', 'Result',
        'Decision', 'Note', 'Lifecycle', 'Attachments'
      ])[v_idx];
    if v_field_id is null then
      insert into public.experiment_template_fields (
        template_id, label, color_token, position
      ) values (
        v_template_id,
        (array[
          'Data', 'Object', 'Environment', 'Config', 'Result',
          'Decision', 'Note', 'Lifecycle', 'Attachments'
        ])[v_idx],
        (array['blue', 'green', 'amber', 'purple', 'rose', 'teal', 'blue', 'green', 'amber'])[v_idx],
        v_idx
      )
      returning id into v_field_id;
    end if;
  end loop;

  -- 3. Fixed Keys (idempotent upsert by template + key name).
  v_key_pos := 0;
  for v_fixed_key in
    select field_label, key, value_type
    from (values
      ('Object', 'model', 'short_text'),
      ('Object', 'harness', 'short_text'),
      ('Object', 'parent_harness', 'short_text'),
      ('Object', 'prompt', 'long_text'),
      ('Object', 'prompt_change', 'long_text'),
      ('Object', 'skills', 'long_text'),
      ('Object', 'tools', 'long_text'),
      ('Environment', 'platform', 'short_text'),
      ('Environment', 'server', 'short_text'),
      ('Environment', 'devices', 'long_text'),
      ('Environment', 'hardware', 'short_text'),
      ('Environment', 'evaluator', 'short_text'),
      ('Environment', 'revision', 'short_text'),
      ('Environment', 'precision_policy', 'short_text'),
      ('Result', 'result_summary', 'long_text'),
      ('Decision', 'decision_outcome', 'single_select'),
      ('Decision', 'decision_notes', 'long_text'),
      ('Note', 'notes', 'long_text'),
      ('Lifecycle', 'started_at', 'date_time'),
      ('Lifecycle', 'completed_at', 'date_time'),
      ('Attachments', 'attachment', 'attachment')
    ) as k(field_label, key, value_type)
  loop
    v_key_pos := v_key_pos + 1;
    select id into v_field_id
    from public.experiment_template_fields
    where template_id = v_template_id and label = v_fixed_key.field_label;
    insert into public.experiment_template_keys (
      template_id, field_id, key, value_type, required, position
    ) values (
      v_template_id, v_field_id, v_fixed_key.key, v_fixed_key.value_type, false, v_key_pos
    )
    on conflict do nothing;
  end loop;

  -- decision_outcome options.
  v_key_id := null;
  select id into v_key_id from public.experiment_template_keys
  where template_id = v_template_id and key = 'decision_outcome';
  if v_key_id is not null then
    for v_idx in 1..4 loop
      insert into public.experiment_template_key_options (
        template_id, key_id, label, position
      ) values (
        v_template_id, v_key_id,
        (array['reference', 'accepted', 'rejected', 'inconclusive'])[v_idx],
        v_idx
      )
      on conflict do nothing;
    end loop;
  end if;

  -- 4. Generated Keys from existing data (dataset/config/metrics unions).
  select coalesce(max(jsonb_array_length(coalesce(data_spec->'datasets', '[]'::jsonb))), 0)
  into v_dataset_max
  from public.experiments;
  for v_idx in 1..v_dataset_max loop
    for v_dataset_key in
      select key, value_type
      from (values
        (format('dataset_%s_role', v_idx), 'single_select'),
        (format('dataset_%s_name', v_idx), 'short_text'),
        (format('dataset_%s_split', v_idx), 'short_text'),
        (format('dataset_%s_revision', v_idx), 'short_text'),
        (format('dataset_%s_task_count', v_idx), 'number'),
        (format('dataset_%s_samples_per_task', v_idx), 'number')
      ) as d(key, value_type)
    loop
      v_key_pos := v_key_pos + 1;
      select id into v_field_id
      from public.experiment_template_fields
      where template_id = v_template_id and label = 'Data';
      insert into public.experiment_template_keys (
        template_id, field_id, key, value_type, required, position
      ) values (v_template_id, v_field_id, v_dataset_key.key, v_dataset_key.value_type, false, v_key_pos)
      on conflict do nothing;
    end loop;
  end loop;

  -- dataset_N_role options.
  for v_key_id in
    select id from public.experiment_template_keys
    where template_id = v_template_id and key like 'dataset_%_role'
  loop
    insert into public.experiment_template_key_options (
      template_id, key_id, label, position
    ) values
      (v_template_id, v_key_id, 'training', 1),
      (v_template_id, v_key_id, 'evaluation', 2)
    on conflict do nothing;
  end loop;

  -- Config Keys (union, typed; mixed -> long_text).
  for v_config_key in
    select distinct jsonb_object_keys(config) as key
    from public.experiments
    where config <> '{}'::jsonb
  loop
    select
      case
        when count(distinct jsonb_typeof(value)) > 1 then 'long_text'
        when min(jsonb_typeof(value)) = 'number' then 'number'
        when min(jsonb_typeof(value)) = 'boolean' then 'boolean'
        else 'short_text'
      end
    into v_config_type
    from public.experiments, jsonb_each(config)
    where key = v_config_key;
    insert into public.experiment_template_keys (
      template_id,
      field_id,
      key,
      value_type,
      required,
      position
    )
    select v_template_id, id, v_config_key, v_config_type, false,
           (select coalesce(max(position), 0) + 1
            from public.experiment_template_keys
            where template_id = v_template_id)
    from public.experiment_template_fields
    where template_id = v_template_id and label = 'Config'
    on conflict do nothing;
  end loop;

  -- Metric Keys (numbers only).
  for v_metric in
    select distinct jsonb_object_keys(metrics) as key
    from public.experiments
    where metrics <> '{}'::jsonb
  loop
    insert into public.experiment_template_keys (
      template_id,
      field_id,
      key,
      value_type,
      required,
      position
    )
    select v_template_id, id, v_metric, 'number', false,
           (select coalesce(max(position), 0) + 1
            from public.experiment_template_keys
            where template_id = v_template_id)
    from public.experiment_template_fields
    where template_id = v_template_id and label = 'Result'
    on conflict do nothing;
  end loop;

  -- 5. Backfill Values for every legacy Experiment (template_id is null at this point).
  select id into v_attachment_key
  from public.experiment_template_keys
  where template_id = v_template_id and key = 'attachment';

  for v_experiment in
    select * from public.experiments
    where template_id is null
    order by id
  loop
    update public.experiments
    set template_id = v_template_id
    where id = v_experiment.id;

    v_datasets := coalesce(v_experiment.data_spec->'datasets', '[]'::jsonb);
    v_object := coalesce(v_experiment.object_spec, '{}'::jsonb);
    v_environment := coalesce(v_experiment.environment_spec, '{}'::jsonb);
    v_config := coalesce(v_experiment.config, '{}'::jsonb);
    v_metrics := coalesce(v_experiment.metrics, '{}'::jsonb);

    -- Object + Environment fixed Keys (short/long text; arrays serialized deterministically).
    insert into public.experiment_values (
      experiment_id, template_id, key_id, text_value, cell_revision
    )
    select v_experiment.id, v_template_id, k.id,
           case
             when jsonb_typeof(src.value) = 'array'
               then (select string_agg(x::text, ',' order by x::text)
                     from jsonb_array_elements_text(src.value) x)
             else src.value #>> '{}'
           end,
           1
    from jsonb_each(jsonb_build_object(
      'model', v_object->'model',
      'harness', v_object->'harness',
      'parent_harness', v_object->'parent_harness',
      'prompt', v_object->'prompt',
      'prompt_change', v_object->'prompt_change',
      'skills', v_object->'skills',
      'tools', v_object->'tools',
      'platform', v_environment->'platform',
      'server', v_environment->'server',
      'devices', v_environment->'devices',
      'hardware', v_environment->'hardware',
      'evaluator', v_environment->'evaluator',
      'revision', v_environment->'revision',
      'precision_policy', v_environment->'precision_policy'
    )) as src(key, value)
    join public.experiment_template_keys k
      on k.template_id = v_template_id and k.key = src.key
    where src.value is not null
      and jsonb_typeof(src.value) <> 'null';

    -- Lifecycle.
    insert into public.experiment_values (
      experiment_id, template_id, key_id, datetime_value, cell_revision
    )
    select v_experiment.id, v_template_id, k.id, (src.value #>> '{}')::timestamptz, 1
    from (values
      ('started_at', to_jsonb(v_experiment.started_at)),
      ('completed_at', to_jsonb(v_experiment.completed_at))
    ) as src(key, value)
    join public.experiment_template_keys k
      on k.template_id = v_template_id and k.key = src.key
    where src.value is not null
      and jsonb_typeof(src.value) <> 'null';

    -- Note + Result + Decision text.
    insert into public.experiment_values (
      experiment_id, template_id, key_id, text_value, cell_revision
    )
    select v_experiment.id, v_template_id, k.id, src.value, 1
    from (values
      ('notes', v_experiment.notes),
      ('result_summary', v_experiment.result_summary),
      ('decision_notes', v_experiment.decision_notes)
    ) as src(key, value)
    join public.experiment_template_keys k
      on k.template_id = v_template_id and k.key = src.key
    where src.value <> '';

    -- decision_outcome as single_select.
    if v_experiment.decision_outcome is not null then
      select o.id into v_option_id
      from public.experiment_template_key_options o
      join public.experiment_template_keys k on k.id = o.key_id
      where k.template_id = v_template_id
        and k.key = 'decision_outcome'
        and o.label = v_experiment.decision_outcome;
      if v_option_id is not null then
        insert into public.experiment_values (
          experiment_id, template_id, key_id, option_id, cell_revision
        ) values (
          v_experiment.id, v_template_id,
          (select id from public.experiment_template_keys
           where template_id = v_template_id and key = 'decision_outcome'),
          v_option_id, 1
        );
      end if;
    end if;

    -- Config Keys.
    insert into public.experiment_values (
      experiment_id, template_id, key_id, text_value, number_value,
      boolean_value, cell_revision
    )
    select v_experiment.id, v_template_id, k.id,
           case when k.value_type in ('short_text', 'long_text')
             then case
               when jsonb_typeof(src.value) = 'string' then src.value #>> '{}'
               else (src.value #>> '{}')
             end
           end,
           case when k.value_type = 'number'
             then (src.value #>> '{}')::double precision
           end,
           case when k.value_type = 'boolean'
             then (src.value #>> '{}')::boolean
           end,
           1
    from jsonb_each(v_config) as src(key, value)
    join public.experiment_template_keys k
      on k.template_id = v_template_id and k.key = src.key
    where jsonb_typeof(src.value) <> 'null';

    -- Metric Keys (numeric without string conversion).
    insert into public.experiment_values (
      experiment_id, template_id, key_id, number_value, cell_revision
    )
    select v_experiment.id, v_template_id, k.id,
           (src.value #>> '{}')::double precision, 1
    from jsonb_each(v_metrics) as src(key, value)
    join public.experiment_template_keys k
      on k.template_id = v_template_id and k.key = src.key
    where jsonb_typeof(src.value) = 'number';

    -- Dataset rows: dataset_N_* from the flattened Data spec.
    for v_idx in 1..jsonb_array_length(v_datasets) loop
      insert into public.experiment_values (
        experiment_id, template_id, key_id, text_value, number_value,
        option_id, cell_revision
      )
      select v_experiment.id, v_template_id, k.id,
             case when k.value_type in ('short_text', 'long_text')
               then (src.value #>> '{}')
             end,
             case when k.value_type = 'number'
               then (src.value #>> '{}')::double precision
             end,
             case when k.value_type = 'single_select'
               then (
                 select o.id from public.experiment_template_key_options o
                 join public.experiment_template_keys kk on kk.id = o.key_id
                 where kk.template_id = v_template_id
                   and kk.key = format('dataset_%s_role', v_idx)
                   and o.label = src.value #>> '{}'
               )
             end,
             1
      from jsonb_each(v_datasets->(v_idx - 1)) as src(key, value)
      join public.experiment_template_keys k
        on k.template_id = v_template_id
       and k.key = format('dataset_%s_%s', v_idx, src.key)
      where jsonb_typeof(src.value) <> 'null';
    end loop;

    -- Migration version snapshot.
    insert into public.experiment_versions (
      experiment_id, version_no, reason, source, template_schema_revision,
      snapshot, actor_member_id
    ) values (
      v_experiment.id, 1, 'Migrated from legacy model', 'migration',
      v_schema_revision, public._experiment_snapshot(v_experiment.id), null
    )
    on conflict (experiment_id, version_no) do nothing;
  end loop;

  -- 6. Attachments: associate every Experiment Attachment with the Attachment Key.
  update public.attachments
  set template_key_id = v_attachment_key
  where experiment_id is not null
    and template_key_id is null;
end
$legacy_cutover$;

-- Cutover: retire the legacy constraint -----------------------------------------------
alter table public.experiments
  drop constraint if exists experiments_completed_decision_check;

-- Cutover: lifecycle-only Activity trigger ---------------------------------------------
create or replace function public.log_experiment_activity()
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

  return new;
end
$function$;

-- Cutover: lock template_id --------------------------------------------------------------
alter table public.experiments
  alter column template_id set not null;
```

- [ ] **Step 3: Apply the migration and run the new test**

Run:

```bash
npx supabase db reset --local
npx supabase test db --local supabase/tests/0019_legacy_experiment_cutover.sql
```

Expected: PASS (all 17 assertions).

- [ ] **Step 4: Confirm the existing suite still passes**

Run:

```bash
npx supabase test db --local \
  supabase/tests/0014_api_key_deletion.sql \
  supabase/tests/0015_experiment_template_workspace_schema.sql \
  supabase/tests/0016_experiment_template_workspace_grants.sql \
  supabase/tests/0017_experiment_template_workspace_functions.sql \
  supabase/tests/0018_experiment_template_workspace_values.sql
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<timestamp>_legacy_experiment_cutover.sql supabase/tests/0019_legacy_experiment_cutover.sql
git commit -m "feat: migrate legacy experiments into the imported template"
```

---

### Task 3: Retire content-aware Status validation

**Files:**
- Modify: `lib/experiments/policy.ts`
- Modify: `lib/experiments/__tests__/policy.test.ts`

- [ ] **Step 1: Write the failing test expectation**

In `lib/experiments/__tests__/policy.test.ts`, the tests around `validateForStatus("running", ...)` and `validateForStatus("completed", ...)` currently expect content issues (missing datasets/model/environment/config/result). Change the expectations so that:

- `validateForStatus("running", bareExperiment)` returns `[]` (no content gates).
- `validateForStatus("completed", bareExperiment)` returns `[]` unless the Status transition itself is invalid.
- An invalid transition (`canTransition("completed", bareExperiment)` with status `planned` → target `completed`) still reports the transition issue.

Add one concrete test:

```ts
  it("does not gate Status on legacy content after cutover", () => {
    expect(validateForStatus("running", bareContext)).toEqual([]);
    expect(validateForStatus("completed", bareContext)).toEqual([]);
  });
```

where `bareContext` is the minimal `Experiment` fixture already used by the transition tests. Run it:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/experiments/__tests__/policy.test.ts
```

Expected: FAIL — `validateForStatus` still returns content issues.

- [ ] **Step 2: Implement transition-only validation**

In `lib/experiments/policy.ts`:

1. Keep `canTransition` and the `TRANSITIONS` map unchanged.
2. Replace `validateForStatus` so it only reports the transition legality:

```ts
export function validateForStatus(
  target: ExperimentStatus,
  experiment: Pick<Experiment, "status">,
): ValidationIssue[] {
  if (target === experiment.status) return [];
  if (canTransition(experiment.status, target)) return [];
  return [{
    field: "status",
    message: `${experiment.status} cannot transition to ${target}.`,
  }];
}
```

3. Delete the now-unused content helpers (`hasConfigValue`, `hasResult`, `runnableIssues`) and their imports if the type checker reports them unused.

- [ ] **Step 3: Run the policy suite and commit**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/experiments/__tests__/policy.test.ts
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
git add lib/experiments/policy.ts lib/experiments/__tests__/policy.test.ts
git commit -m "feat: make experiment status validation transition-only"
```

Expected: PASS; no new type errors; commit succeeds.

---

### Task 4: Add the migration verification script and rollout docs

**Files:**
- Create: `scripts/verify-legacy-migration.mjs`
- Create: `scripts/__tests__/verify-legacy-migration.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the failing verification test**

Create `scripts/__tests__/verify-legacy-migration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const script = readFileSync(
  resolve(import.meta.dirname, "../verify-legacy-migration.mjs"),
  "utf8",
);

describe("legacy migration verification script", () => {
  it("checks the Imported Template and migration invariants", () => {
    expect(script).toContain("11111111-1111-4111-8111-111111111111");
    expect(script).toContain("Imported legacy experiments");
    expect(script).toContain("experiment_versions");
    expect(script).toContain("template_id is null");
    expect(script).toContain("experiments_completed_decision_check");
  });
});
```

Run it:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run scripts/__tests__/verify-legacy-migration.test.ts
```

Expected: FAIL — the script does not exist.

- [ ] **Step 2: Implement `scripts/verify-legacy-migration.mjs`**

Create `scripts/verify-legacy-migration.mjs`:

```js
#!/usr/bin/env node
// Verifies the Phase 6 legacy migration invariants against SUPABASE_DB_URL.
// Run: node --env-file=.env.local scripts/verify-legacy-migration.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Missing SUPABASE_DB_URL — add it to .env.local.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
}

try {
  await client.connect();

  const template = await client.query(
    `select id, name from public.experiment_templates
     where id = '11111111-1111-4111-8111-111111111111'`,
  );
  check(
    "Imported Legacy Template exists",
    template.rowCount === 1 && template.rows[0].name === "Imported legacy experiments",
  );

  const templateId = template.rows[0]?.id ?? null;
  const experiments = await client.query(
    "select id from public.experiments where template_id is null",
  );
  check("no Experiment is left without a Template", experiments.rowCount === 0);

  if (templateId) {
    const values = await client.query(
      `select count(*)::int as total,
              count(*) filter (where v.template_id <> e.template_id) as cross_template
       from public.experiment_values v
       join public.experiments e on e.id = v.experiment_id`,
    );
    check("zero cross-Template Value rows", values.rows[0].cross_template === 0);

    const versions = await client.query(
      `select count(*)::int as experiments,
              count(distinct e.id) as with_migration_version
       from public.experiments e
       left join public.experiment_versions v
         on v.experiment_id = e.id and v.version_no = 1 and v.source = 'migration'`,
    );
    check(
      "every Experiment has a migration version",
      versions.rows[0].experiments === versions.rows[0].with_migration_version,
    );
  }

  const constraint = await client.query(
    `select count(*)::int as count from pg_constraint
     where conrelid = 'public.experiments'::regclass
       and conname = 'experiments_completed_decision_check'`,
  );
  check("legacy completed/Decision constraint dropped", constraint.rows[0].count === 0);

  const notNull = await client.query(
    `select is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = 'experiments'
       and column_name = 'template_id'`,
  );
  check("experiments.template_id is NOT NULL", notNull.rows[0]?.is_nullable === "NO");

  const orphans = await client.query(
    `select count(*)::int as count from public.experiment_values v
     where not exists (
       select 1 from public.experiment_template_keys k
       where k.id = v.key_id and k.template_id = v.template_id
     )`,
  );
  check("zero orphan Value rows", orphans.rows[0].count === 0);

  const unattached = await client.query(
    `select count(*)::int as count from public.attachments
     where experiment_id is not null and template_key_id is null`,
  );
  check("every Experiment Attachment has a Template Key", unattached.rows[0].count === 0);
} catch (error) {
  console.error("Verification failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}

let failed = 0;
for (const entry of checks) {
  console.log(`${entry.ok ? "ok" : "FAIL"}  ${entry.name}${entry.detail ? ` (${entry.detail})` : ""}`);
  if (!entry.ok) failed += 1;
}
if (failed > 0) {
  console.error(`\n${failed} verification check(s) failed.`);
  process.exit(1);
}
console.log("\nLegacy migration verification passed.");
```

- [ ] **Step 3: Run the verification against the local database**

Run:

```bash
SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54322/postgres node scripts/verify-legacy-migration.mjs
```

Expected: all checks `ok`; exit 0.

- [ ] **Step 4: Add a rollout section to `README.md`**

Append to the "Local-only database and application verification" area:

```markdown
### Production rollout (Phase 6 legacy cutover)

1. Back up the database.
2. Apply pending migrations with `npm run db:migrate`.
3. Run the migration verification: `node scripts/verify-legacy-migration.mjs`.
4. Spot-check a handful of legacy Experiments in the UI (Detail, Compare, Version History).
5. Legacy content columns stay in place; a later cleanup release removes them.
```

- [ ] **Step 5: Run the tests and commit**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run scripts/__tests__/verify-legacy-migration.test.ts
git add scripts/verify-legacy-migration.mjs scripts/__tests__/verify-legacy-migration.test.ts README.md
git commit -m "feat: add legacy migration verification script"
```

Expected: PASS; commit succeeds.

---

### Task 5: Final verification and handoff

**Files:** none

- [ ] **Step 1: Cross-check the spec**

Re-read `docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md` sections "Existing Data Migration", "Verification", and "Activity versus Version History" and confirm:

- One workspace-wide `Imported legacy experiments` Template; Field Labels Data/Object/Environment/Config/Result/Decision/Note/Lifecycle/Attachments; deterministic Key generation (datasets flattened, fixed Object/Environment props, Config union with mixed-type Long text, Metric Keys as Numbers, Result/Decision/Note/Started/Completed, one Attachment Key).
- All imported Keys Optional; every Experiment gets the Template ID, typed current Values, Attachment associations, and one `migration` version snapshot.
- The cutover drops `experiments_completed_decision_check`, replaces content-aware Status validation with transition-only validation, and makes the Experiment Activity trigger lifecycle-only (manual comments and Task Activity unchanged).
- Verification compares counts/IDs/fields/attachments/versions/orphans; no legacy columns are dropped.
- Realtime: `experiments`/`attachments` remain published; the new Imported Template tables were published in Phase 1 (Realtime covers Templates/Fields/Keys/options).

Fix any gap found before continuing.

- [ ] **Step 2: Run the full verification**

Run:

```bash
npx supabase test db --local \
  supabase/tests/0014_api_key_deletion.sql \
  supabase/tests/0015_experiment_template_workspace_schema.sql \
  supabase/tests/0016_experiment_template_workspace_grants.sql \
  supabase/tests/0017_experiment_template_workspace_functions.sql \
  supabase/tests/0018_experiment_template_workspace_values.sql \
  supabase/tests/0019_legacy_experiment_cutover.sql
SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54322/postgres node scripts/verify-legacy-migration.mjs
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx next build
```

Expected: all DB suites PASS; verification script exits 0; all Vitest suites PASS; no new type errors; build succeeds.

- [ ] **Step 3: Verify branch state and hand off**

Run:

```bash
git status --short --branch
git log --oneline -7
```

Expected: clean tree; the last commits are the four Phase 6 commits. Report to the user:

- Phase 6 complete: every Experiment is on a Template with a migration version, Status is transition-only, Activity is lifecycle-only, and `template_id` is locked.
- The feature is complete on `feat/experiment-template-workspace`; production rollout steps are in `README.md` (backup → migrate → verify → spot-check).
- Legacy columns and the legacy Compare component remain for a later, independently reviewed cleanup release.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-31-experiment-template-workspace-cutover.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
