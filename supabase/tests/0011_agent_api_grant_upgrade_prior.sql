begin;
select plan(1);

select ok(
  has_table_privilege('service_role', 'public.tasks', 'update')
    and has_table_privilege(
      'service_role',
      'public.experiments',
      'insert'
    )
    and has_table_privilege(
      'service_role',
      'public.activity',
      'insert'
    )
    and has_table_privilege(
      'service_role',
      'public.attachments',
      'update'
    )
    and has_table_privilege(
      'service_role',
      'public.attachments',
      'delete'
    )
    and has_sequence_privilege(
      'service_role',
      'public.experiments_experiment_no_seq',
      'select'
    ),
  'fixture recreates the historical broad service_role ACLs'
);

select * from finish();
rollback;
