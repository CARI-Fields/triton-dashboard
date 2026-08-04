begin;
select plan(25);

-- Authenticated Data API access ----------------------------------------------
select ok(
  has_table_privilege('authenticated', 'public.experiment_templates', 'select'),
  'authenticated can read Templates');
select ok(
  has_table_privilege('authenticated', 'public.experiment_templates', 'insert'),
  'authenticated can create Templates');
select ok(
  has_table_privilege('authenticated', 'public.experiment_templates', 'update'),
  'authenticated can edit Templates');
select ok(
  has_table_privilege('authenticated', 'public.experiment_templates', 'delete'),
  'authenticated can delete never-used Templates');
select ok(
  has_table_privilege('authenticated', 'public.experiment_template_fields', 'select'),
  'authenticated can read Field Labels');
select ok(
  has_table_privilege('authenticated', 'public.experiment_template_keys', 'select'),
  'authenticated can read Keys');
select ok(
  has_table_privilege('authenticated', 'public.experiment_template_key_options', 'select'),
  'authenticated can read Key options');
select ok(
  has_table_privilege('authenticated', 'public.experiment_values', 'select'),
  'authenticated can read Values');
select ok(
  has_table_privilege('authenticated', 'public.experiment_value_options', 'select'),
  'authenticated can read multi-select selections');
select ok(
  has_table_privilege('authenticated', 'public.experiment_versions', 'select'),
  'authenticated can open Version History');
select ok(
  has_table_privilege('authenticated', 'public.experiment_template_versions', 'select'),
  'authenticated can open Template History');

-- anon is locked out -----------------------------------------------------------
select ok(
  not has_table_privilege('anon', 'public.experiment_templates', 'select'),
  'anon cannot read Templates'
);
select ok(
  not has_table_privilege('anon', 'public.experiment_values', 'select'),
  'anon cannot read Values'
);
select ok(
  not has_table_privilege('anon', 'public.experiment_versions', 'insert'),
  'anon cannot forge version snapshots'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.guard_experiment_template_immutable()',
    'execute'
  ),
  'authenticated cannot call the Template immutability guard directly'
);

-- Realtime publication ---------------------------------------------------------
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiment_templates'
  ),
  'experiment_templates is published to realtime'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiment_template_fields'
  ),
  'experiment_template_fields is published to realtime'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiment_template_keys'
  ),
  'experiment_template_keys is published to realtime'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiment_template_key_options'
  ),
  'experiment_template_key_options is published to realtime'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiment_values'
  ),
  'experiment_values is published to realtime'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiment_value_options'
  ),
  'experiment_value_options is published to realtime'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiments'
  ),
  'experiments stays published to realtime'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'attachments'
  ),
  'attachments stays published to realtime'
);
select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiment_versions'
  ),
  'experiment_versions is NOT published to realtime'
);
select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiment_template_versions'
  ),
  'experiment_template_versions is NOT published to realtime'
);

select * from finish();
rollback;
