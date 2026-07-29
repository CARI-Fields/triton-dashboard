begin;
select plan(3);

select ok(
  (
    select bool_and(
      has_table_privilege(
        'service_role',
        format('public.%I', relation_name),
        privilege_name
      )
    )
    from unnest(array[
      'tasks',
      'experiments',
      'activity',
      'attachments'
    ]) as relation(relation_name)
    cross join unnest(array[
      'select',
      'insert',
      'update'
    ]) as privilege(privilege_name)
  )
    and not has_table_privilege(
      'service_role',
      'public.tasks',
      'delete'
    )
    and not has_table_privilege(
      'service_role',
      'public.experiments',
      'delete'
    )
    and not has_table_privilege(
      'service_role',
      'public.activity',
      'delete'
    )
    and not has_table_privilege(
      'service_role',
      'public.attachments',
      'delete'
    ),
  'historical fixture has table-wide SELECT, INSERT, and UPDATE only'
);

select ok(
  has_sequence_privilege(
    'service_role',
    'public.experiments_experiment_no_seq',
    'usage'
  )
    and has_sequence_privilege(
      'service_role',
      'public.experiments_experiment_no_seq',
      'select'
    )
    and not has_sequence_privilege(
      'service_role',
      'public.experiments_experiment_no_seq',
      'update'
    ),
  'historical fixture has sequence USAGE and SELECT only'
);

select ok(
  not exists (
    select 1
    from pg_attribute as attribute
    join pg_class as relation
      on relation.oid = attribute.attrelid
    join pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'tasks',
        'experiments',
        'activity',
        'attachments'
      )
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.attacl is not null
  ),
  'historical fixture contains no explicit column ACLs'
);

select * from finish();
rollback;
