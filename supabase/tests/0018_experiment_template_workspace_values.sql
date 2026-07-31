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
