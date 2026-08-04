begin;
select plan(10);

-- Legacy columns are gone -------------------------------------------------------
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'experiments'
      and column_name in (
        'baseline_experiment_id', 'data_spec', 'object_spec', 'environment_spec',
        'config', 'notes', 'metrics', 'featured_metric_keys', 'result_summary',
        'decision_outcome', 'decision_notes'
      )
  ),
  'all legacy content columns are dropped'
);

-- Fixed columns stay ---------------------------------------------------------------
select ok(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name = 'experiments'
     and column_name in (
       'id', 'experiment_no', 'task_id', 'owner_id', 'name', 'status', 'position',
       'template_id', 'archived_at', 'core_revision', 'started_at', 'completed_at',
       'created_at', 'updated_at'
     )) = 14,
  'the fixed Experiment columns remain'
);

-- No dangling references ---------------------------------------------------------------
select is(
  (select count(*)::int from pg_constraint
   where conrelid = 'public.experiments'::regclass
     and conname like 'experiments_baseline%'),
  0,
  'Baseline constraint and FK are dropped with the column'
);

-- Template behavior still works ----------------------------------------------------------
insert into public.modules (id, name, kind)
values ('10000000-0000-4000-8000-000000000001', 'Cleanup module', 'pipeline');
insert into public.tasks (id, module_id, title)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Cleanup task');
insert into public.experiments (id, task_id, template_id, name)
values (
  '60000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Cleanup run'
);
select is(
  (select status from public.experiments where id = '60000000-0000-4000-8000-000000000001'),
  'planned',
  'a minimal Template Experiment still inserts with defaults'
);

-- Value mutations still work -------------------------------------------------------------
select is(
  (select public.save_experiment_value(
    '60000000-0000-4000-8000-000000000001',
    (select id from public.experiment_template_keys
     where template_id = '11111111-1111-4111-8111-111111111111'
       and key = 'notes'),
    0,
    '"still works"'::jsonb,
    '80000000-0000-4000-8000-000000000001'
  )->>'status'),
  'ok',
  'typed Value saves still work after the column drop'
);
select is(
  (select version_no::int from public.experiment_versions
   where experiment_id = '60000000-0000-4000-8000-000000000001'),
  1,
  'Value saves still write version snapshots'
);
select is(
  (select core_revision::int from public.experiments
   where id = '60000000-0000-4000-8000-000000000001'),
  2,
  'Value saves still bump core_revision'
);

-- Archive behavior still works --------------------------------------------------------------
select is(
  (select public.archive_experiment('60000000-0000-4000-8000-000000000001')->>'status'),
  'ok',
  'Archive still works after the column drop'
);
select throws_ok(
  $$select public.save_experiment_value(
    '60000000-0000-4000-8000-000000000001',
    (select id from public.experiment_template_keys
     where template_id = '11111111-1111-4111-8111-111111111111'
       and key = 'notes'),
    1,
    '"rejected"'::jsonb,
    '80000000-0000-4000-8000-000000000001'
  )$$,
  'P0001',
  'EXPERIMENT_ARCHIVED',
  'archived Experiments reject Value writes'
);

-- Snapshot integrity ----------------------------------------------------------------------
select is(
  (select count(*)::int from public.experiment_versions
   where source = 'migration' and version_no = 1
     and coalesce(snapshot->>'template_id', '') <> '11111111-1111-4111-8111-111111111111'),
  0,
  'historical migration snapshots still reference the Imported Template'
);

select * from finish();
rollback;
