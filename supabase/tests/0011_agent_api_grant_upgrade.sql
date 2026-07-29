begin;
select plan(10);

insert into public.modules (id, name)
values ('10000000-0000-4000-8000-000000000011', 'Agent API Upgrade');
insert into public.members (id, name)
values ('20000000-0000-4000-8000-000000000011', 'Upgrade Agent');
insert into public.tasks (id, module_id, title)
values (
  '30000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011',
  'Upgrade task'
);
insert into public.task_assignees (task_id, member_id)
values (
  '30000000-0000-4000-8000-000000000011',
  '20000000-0000-4000-8000-000000000011'
);
insert into public.api_keys (
  id, name, key_prefix, key_digest, member_id, scopes, created_by
) values (
  '40000000-0000-4000-8000-000000000011',
  'Upgrade key',
  'tb_live_upgrade',
  repeat('1', 64),
  '20000000-0000-4000-8000-000000000011',
  array[
    'tasks:write',
    'experiments:write',
    'activity:append',
    'attachments:write'
  ],
  '50000000-0000-4000-8000-000000000011'
);

select ok(
  not has_table_privilege('service_role', 'public.tasks', 'update')
    and not has_table_privilege(
      'service_role',
      'public.experiments',
      'insert'
    )
    and not has_table_privilege(
      'service_role',
      'public.activity',
      'insert'
    )
    and not has_table_privilege(
      'service_role',
      'public.attachments',
      'update'
    )
    and not has_table_privilege(
      'service_role',
      'public.attachments',
      'delete'
    )
    and not has_sequence_privilege(
      'service_role',
      'public.experiments_experiment_no_seq',
      'select'
    ),
  'the corrective migration revokes historical table-wide writes and SELECT'
);
select ok(
  has_column_privilege(
    'service_role',
    'public.tasks',
    'title',
    'update'
  )
    and has_column_privilege(
      'service_role',
      'public.tasks',
      'tags',
      'update'
    )
    and has_column_privilege(
      'service_role',
      'public.tasks',
      'priority',
      'update'
    )
    and has_column_privilege(
      'service_role',
      'public.tasks',
      'due_date',
      'update'
    )
    and has_column_privilege(
      'service_role',
      'public.experiments',
      'task_id',
      'insert'
    )
    and has_column_privilege(
      'service_role',
      'public.experiments',
      'notes',
      'update'
    )
    and has_column_privilege(
      'service_role',
      'public.activity',
      'kind',
      'insert'
    )
    and has_column_privilege(
      'service_role',
      'public.attachments',
      'experiment_id',
      'insert'
    )
    and has_column_privilege(
      'service_role',
      'public.attachments',
      'caption',
      'update'
    )
    and has_sequence_privilege(
      'service_role',
      'public.experiments_experiment_no_seq',
      'usage'
    ),
  'the corrective migration restores only RPC-required writes and sequence usage'
);
select ok(
  not has_column_privilege(
    'service_role',
    'public.tasks',
    'module_id',
    'update'
  )
    and not has_column_privilege(
      'service_role',
      'public.experiments',
      'owner_id',
      'update'
    )
    and not has_column_privilege(
      'service_role',
      'public.experiments',
      'experiment_no',
      'insert'
    )
    and not has_column_privilege(
      'service_role',
      'public.activity',
      'experiment_id',
      'insert'
    )
    and not has_column_privilege(
      'service_role',
      'public.attachments',
      'position',
      'insert'
    ),
  'the corrective migration removes protected parent and system writes'
);

set local role service_role;

select lives_ok(
  $$select public.agent_api_patch_task(
    '40000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000011',
    (select updated_at from public.tasks where id =
      '30000000-0000-4000-8000-000000000011'),
    '{
      "notes":"upgrade patch",
      "tags":["NPU"],
      "priority":"high",
      "due_date":"2026-08-15"
    }',
    'upgrade_task_patch'
  )$$,
  'Task PATCH executes after corrective ACL migration'
);
select lives_ok(
  $$select public.agent_api_create_experiment(
    '40000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000011',
    'Upgrade experiment',
    '60000000-0000-4000-8000-000000000011',
    repeat('2', 64),
    'upgrade_experiment_create'
  )$$,
  'Experiment create executes after corrective ACL migration'
);
select lives_ok(
  $$select public.agent_api_patch_experiment(
    '40000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    (select id from public.experiments where name = 'Upgrade experiment'),
    (select updated_at from public.experiments
      where name = 'Upgrade experiment'),
    '{"notes":"upgrade experiment patch"}',
    'upgrade_experiment_patch'
  )$$,
  'Experiment PATCH executes after corrective ACL migration'
);
select lives_ok(
  $$select public.agent_api_create_activity(
    '40000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000011',
    'Upgrade activity',
    '60000000-0000-4000-8000-000000000012',
    repeat('3', 64),
    'upgrade_activity_create'
  )$$,
  'Activity create executes after corrective ACL migration'
);
select lives_ok(
  $$select public.agent_api_create_attachment(
    '40000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    (select id from public.experiments where name = 'Upgrade experiment'),
    'upgrade/path',
    'https://example.test/upgrade',
    'Before upgrade',
    '60000000-0000-4000-8000-000000000013',
    repeat('4', 64),
    'upgrade_attachment_create'
  )$$,
  'Attachment create executes after corrective ACL migration'
);
select lives_ok(
  $$select public.agent_api_patch_attachment(
    '40000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    (select id from public.attachments where path = 'upgrade/path'),
    (select updated_at from public.attachments where path = 'upgrade/path'),
    'After upgrade',
    'upgrade_attachment_patch'
  )$$,
  'Attachment PATCH executes after corrective ACL migration'
);
reset role;
insert into public.attachments (
  task_id, experiment_id, path, url, caption, updated_at
) values (
  '30000000-0000-4000-8000-000000000011',
  null,
  'upgrade/direct-path',
  'https://example.test/upgrade-direct',
  'Direct before',
  '2026-07-29T10:00:00Z'
);
set local role service_role;
select lives_ok(
  $$select public.agent_api_patch_attachment(
    '40000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    (select id from public.attachments where path = 'upgrade/direct-path'),
    (select updated_at from public.attachments
      where path = 'upgrade/direct-path'),
    'Direct after',
    'upgrade_direct_attachment_patch'
  )$$,
  'direct Attachment PATCH executes after the upgrade migration'
);

select * from finish();
rollback;
