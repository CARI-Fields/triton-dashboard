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
    $$[{
      "id": "40000000-0000-4000-8000-000000000011",
      "label": "Metrics",
      "color_token": "blue",
      "position": 1,
      "keys": [{
        "id": "50000000-0000-4000-8000-000000000011",
        "key": "pass@1",
        "value_type": "number",
        "required": false,
        "position": 1,
        "options": []
      }, {
        "id": "50000000-0000-4000-8000-000000000012",
        "key": "device",
        "value_type": "single_select",
        "required": false,
        "position": 2,
        "options": [
          {"id": "70000000-0000-4000-8000-000000000011", "label": "npu:1", "position": 1, "archived": false},
          {"id": "70000000-0000-4000-8000-000000000012", "label": "gpu:0", "position": 2, "archived": false}
        ]
      }]
    }]$$::jsonb
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
  (select version_no::int from public.experiment_template_versions
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
  (select snapshot @> '[{"label": "Metrics"}]'::jsonb
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
    $$[{
      "id": "40000000-0000-4000-8000-000000000011",
      "label": "Metrics",
      "color_token": "blue",
      "position": 1,
      "keys": [
        {
          "id": "50000000-0000-4000-8000-000000000011",
          "key": "pass@1_new",
          "value_type": "number",
          "required": true,
          "position": 1,
          "archived": false,
          "options": []
        },
        {
          "id": "50000000-0000-4000-8000-000000000012",
          "key": "device",
          "value_type": "single_select",
          "required": false,
          "position": 2,
          "archived": false,
          "options": [
            {"id": "70000000-0000-4000-8000-000000000011", "label": "npu:1", "position": 1, "archived": false},
            {"id": "70000000-0000-4000-8000-000000000012", "label": "gpu:0", "position": 2, "archived": false}
          ]
        }
      ]
    }]$$::jsonb
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
  '50000000-0000-4000-8000-000000000011',
  0.73
);
select throws_ok(
  $q$select public.save_experiment_template(
    '30000000-0000-4000-8000-000000000010',
    'Function Benchmark', '', 3,
    $$[{
      "id": "40000000-0000-4000-8000-000000000011",
      "label": "Metrics",
      "color_token": "blue",
      "position": 1,
      "keys": [
        {
          "id": "50000000-0000-4000-8000-000000000011",
          "key": "pass@1_new",
          "value_type": "text",
          "required": true,
          "position": 1,
          "archived": false,
          "options": []
        }
      ]
    }]$$::jsonb
  )$q$,
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
    $$[{
      "id": "40000000-0000-4000-8000-000000000011",
      "label": "Metrics",
      "color_token": "blue",
      "position": 1,
      "keys": [
        {
          "id": "50000000-0000-4000-8000-000000000011",
          "key": "pass@1_new",
          "value_type": "number",
          "required": true,
          "position": 1,
          "archived": true,
          "options": []
        },
        {
          "id": "50000000-0000-4000-8000-000000000012",
          "key": "device",
          "value_type": "single_select",
          "required": false,
          "position": 2,
          "archived": false,
          "options": [
            {"id": "70000000-0000-4000-8000-000000000011", "label": "npu:1", "position": 1, "archived": false},
            {"id": "70000000-0000-4000-8000-000000000012", "label": "gpu:0", "position": 2, "archived": false}
          ]
        }
      ]
    }]$$::jsonb
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
   where key_id = '50000000-0000-4000-8000-000000000011'),
  1,
  'archived Key preserves its Values'
);

-- Unreferenced option removal hard-deletes ----------------------------------------------
select is(
  (select public.save_experiment_template(
    '30000000-0000-4000-8000-000000000010',
    'Function Benchmark', '', 4,
    $$[{
      "id": "40000000-0000-4000-8000-000000000011",
      "label": "Metrics",
      "color_token": "blue",
      "position": 1,
      "keys": [
        {
          "id": "50000000-0000-4000-8000-000000000012",
          "key": "device",
          "value_type": "single_select",
          "required": false,
          "position": 2,
          "archived": false,
          "options": [
            {"id": "70000000-0000-4000-8000-000000000011", "label": "npu:1", "position": 1, "archived": false}
          ]
        }
      ]
    }]$$::jsonb
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
  $q$select public.save_experiment_template(
    '30000000-0000-4000-8000-000000000010', 'Function Benchmark', '', 6, '[]'::jsonb
  )$q$,
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
