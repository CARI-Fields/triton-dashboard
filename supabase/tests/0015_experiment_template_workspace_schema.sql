begin;
select plan(45);

-- Tables and keys -----------------------------------------------------------
select has_table('public', 'experiment_templates', 'experiment_templates exists');
select has_table('public', 'experiment_template_fields', 'experiment_template_fields exists');
select has_table('public', 'experiment_template_keys', 'experiment_template_keys exists');
select has_table('public', 'experiment_template_key_options', 'experiment_template_key_options exists');
select has_table('public', 'experiment_values', 'experiment_values exists');
select has_table('public', 'experiment_value_options', 'experiment_value_options exists');
select has_table('public', 'experiment_versions', 'experiment_versions exists');
select has_table('public', 'experiment_template_versions', 'experiment_template_versions exists');

select has_pk('public', 'experiment_templates', 'experiment_templates has a primary key');
select has_pk('public', 'experiment_values', 'experiment_values has (experiment_id, key_id) primary key');
select has_pk('public', 'experiment_value_options', 'experiment_value_options has a primary key');

-- New columns on existing tables -------------------------------------------
select has_column('public', 'experiments', 'template_id', 'experiments.template_id exists');
select has_column('public', 'experiments', 'archived_at', 'experiments.archived_at exists');
select has_column('public', 'experiments', 'core_revision', 'experiments.core_revision exists');
select has_column('public', 'attachments', 'template_key_id', 'attachments.template_key_id exists');
select has_column('public', 'attachments', 'archived_at', 'attachments.archived_at exists');

-- Column types and nullability ---------------------------------------------
select col_type_is('public', 'experiment_templates', 'schema_revision', 'bigint',
  'template schema_revision is bigint');
select col_type_is('public', 'experiment_template_keys', 'value_type', 'text',
  'key value_type is text');
select col_type_is('public', 'experiment_values', 'number_value', 'double precision',
  'value number_value is double precision');
select col_type_is('public', 'experiment_values', 'cell_revision', 'bigint',
  'value cell_revision is bigint');
select col_not_null('public', 'experiment_templates', 'name', 'template name is not null');
select col_not_null('public', 'experiment_values', 'experiment_id', 'value experiment_id is not null');
select col_not_null('public', 'experiments', 'core_revision', 'experiment core_revision is not null');

-- Indexes -------------------------------------------------------------------
select has_index('public', 'experiment_templates', 'experiment_templates_active_name_unique',
  'active template names are case-insensitively unique');
select has_index('public', 'experiment_template_fields', 'experiment_template_fields_template_position_idx',
  'fields are ordered per template');
select has_index('public', 'experiment_template_keys', 'experiment_template_keys_template_field_position_idx',
  'keys are ordered per field');
select has_index('public', 'experiment_template_key_options', 'experiment_template_key_options_template_key_position_idx',
  'options are ordered per key');
select has_index('public', 'experiment_values', 'experiment_values_template_experiment_key_idx',
  'values are loadable per template grid');
select has_index('public', 'experiment_values', 'experiment_values_key_number_idx',
  'numeric sort/filter is indexed');
select has_index('public', 'experiment_value_options', 'experiment_value_options_key_option_experiment_idx',
  'multi-select contains filters are indexed');
select has_index('public', 'experiments', 'experiments_template_id_idx', 'experiment template FK is indexed');
select has_index('public', 'attachments', 'attachments_template_key_id_idx', 'attachment template-key FK is indexed');

-- Checks, guards, and RLS ---------------------------------------------------
select is(
  (select count(*)::int from pg_constraint
   where conrelid = 'public.experiment_values'::regclass
     and conname = 'experiment_values_single_scalar_check'),
  1,
  'at-most-one-scalar check exists'
);
select is(
  (select count(*)::int from pg_constraint
   where conrelid = 'public.experiment_template_keys'::regclass
     and conname = 'experiment_template_keys_value_type_check'),
  1,
  'value-type check exists'
);
select is(
  (select count(*)::int from pg_trigger
   where tgrelid = 'public.experiments'::regclass
     and tgname = 'experiments_template_id_immutable'
     and not tgisinternal),
  1,
  'template_id immutability guard trigger exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.experiment_templates'::regclass),
  'experiment_templates has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.experiment_versions'::regclass),
  'experiment_versions has RLS enabled'
);

-- Behavior: uniqueness, immutability, cross-template safety -----------------
insert into public.modules (id, name, kind)
values ('10000000-0000-4000-8000-000000000001', 'Template test module', 'pipeline');
insert into public.tasks (id, module_id, title)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Template test task');

insert into public.experiment_templates (id, name)
values ('30000000-0000-4000-8000-000000000001', 'Benchmark A');
select throws_ok(
  $$insert into public.experiment_templates (name) values ('Benchmark A')$$,
  '23505',
  'duplicate key value violates unique constraint "experiment_templates_active_name_unique"',
  'duplicate active Template names are rejected case-insensitively'
);

insert into public.experiment_template_fields (
  id, template_id, label, color_token, position
) values (
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Metrics', 'blue', 1
);
insert into public.experiment_template_keys (
  id, template_id, field_id, key, value_type, position
) values (
  '50000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'pass@1', 'number', 1
);
select throws_ok(
  $$insert into public.experiment_template_keys (
     id, template_id, field_id, key, value_type, position
   ) values (
     '50000000-0000-4000-8000-000000000099',
     '30000000-0000-4000-8000-000000000001',
     '40000000-0000-4000-8000-000000000001',
     'PASS@1', 'number', 2
   )$$,
  '23505',
  'duplicate key value violates unique constraint "experiment_template_keys_template_key_unique"',
  'duplicate Key names are rejected case-insensitively'
);
select throws_ok(
  $$insert into public.experiment_template_keys (
     id, template_id, field_id, key, value_type, position
   ) values (
     '50000000-0000-4000-8000-000000000098',
     '30000000-0000-4000-8000-000000000001',
     '40000000-0000-4000-8000-000000000001',
     '', 'number', 2
   )$$,
  '23514',
  'new row for relation "experiment_template_keys" violates check constraint "experiment_template_keys_blank_check"',
  'blank Key strings are rejected'
);

insert into public.experiment_templates (id, name)
values ('30000000-0000-4000-8000-000000000002', 'Benchmark B');
insert into public.experiment_template_fields (
  id, template_id, label, color_token, position
) values (
  '40000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002',
  'Metrics', 'green', 1
);
insert into public.experiment_template_keys (
  id, template_id, field_id, key, value_type, position
) values (
  '50000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000002',
  'loss', 'number', 1
);

insert into public.experiments (id, task_id, template_id)
values (
  '60000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001'
);
select throws_ok(
  $$update public.experiments
     set template_id = '30000000-0000-4000-8000-000000000002'
   where id = '60000000-0000-4000-8000-000000000001'$$,
  'P0001',
  'experiments.template_id cannot change after assignment',
  'Template ID is immutable after assignment'
);

select throws_ok(
  $$insert into public.experiment_values (
     experiment_id, template_id, key_id, number_value
   ) values (
     '60000000-0000-4000-8000-000000000001',
     '30000000-0000-4000-8000-000000000002',
     '50000000-0000-4000-8000-000000000002',
     0.5
   )$$,
  '23503',
  'insert or update on table "experiment_values" violates foreign key constraint "experiment_values_experiment_template_fkey"',
  'a Value cannot pair an Experiment with another Template Key'
);

select throws_ok(
  $$insert into public.experiment_values (
     experiment_id, template_id, key_id, text_value, number_value
   ) values (
     '60000000-0000-4000-8000-000000000001',
     '30000000-0000-4000-8000-000000000001',
     '50000000-0000-4000-8000-000000000001',
     'not a number', 0.5
   )$$,
  '23514',
  'new row for relation "experiment_values" violates check constraint "experiment_values_single_scalar_check"',
  'a Value row stores at most one scalar column'
);

select throws_ok(
  $$insert into public.experiment_values (
     experiment_id, template_id, key_id, number_value
   ) values (
     '60000000-0000-4000-8000-000000000001',
     '30000000-0000-4000-8000-000000000001',
     '50000000-0000-4000-8000-000000000001',
     'NaN'::double precision
   )$$,
  '23514',
  'new row for relation "experiment_values" violates check constraint "experiment_values_number_finite_check"',
  'NaN Number Values are rejected'
);

insert into public.experiment_values (
  experiment_id, template_id, key_id, number_value
) values (
  '60000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  0.73
);
select is(
  (select number_value
   from public.experiment_values
   where experiment_id = '60000000-0000-4000-8000-000000000001'
     and key_id = '50000000-0000-4000-8000-000000000001'),
  0.73::double precision,
  'a typed scalar Value round-trips'
);

select * from finish();
rollback;
