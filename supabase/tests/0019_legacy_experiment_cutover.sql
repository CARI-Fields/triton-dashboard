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
