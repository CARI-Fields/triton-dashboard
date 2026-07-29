begin;
select plan(41);

insert into public.modules (id, name)
values ('10000000-0000-4000-8000-000000000009', 'Agent API Security');
insert into public.members (id, name)
values
  ('20000000-0000-4000-8000-000000000009', 'Agent Member'),
  ('20000000-0000-4000-8000-000000000010', 'Other Member');
insert into public.tasks (id, module_id, title)
values
  (
    '30000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000009',
    'Guarded task'
  ),
  (
    '30000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000009',
    'Unassigned task'
  );
insert into public.task_assignees (task_id, member_id)
values (
  '30000000-0000-4000-8000-000000000009',
  '20000000-0000-4000-8000-000000000009'
);
insert into public.api_keys (
  id,
  name,
  key_prefix,
  key_digest,
  member_id,
  scopes,
  expires_at,
  revoked_at,
  created_by
) values
  (
    '40000000-0000-4000-8000-000000000009',
    'Valid key',
    'tb_live_valid',
    repeat('9', 64),
    '20000000-0000-4000-8000-000000000009',
    array[
      'tasks:write',
      'experiments:write',
      'activity:append',
      'attachments:write'
    ],
    null,
    null,
    '50000000-0000-4000-8000-000000000009'
  ),
  (
    '40000000-0000-4000-8000-000000000010',
    'Revoked key',
    'tb_live_revoked',
    repeat('a', 64),
    '20000000-0000-4000-8000-000000000009',
    array['tasks:write'],
    null,
    now(),
    '50000000-0000-4000-8000-000000000009'
  ),
  (
    '40000000-0000-4000-8000-000000000011',
    'Expired key',
    'tb_live_expired',
    repeat('b', 64),
    '20000000-0000-4000-8000-000000000009',
    array['tasks:write'],
    now() - interval '1 minute',
    null,
    '50000000-0000-4000-8000-000000000009'
  ),
  (
    '40000000-0000-4000-8000-000000000012',
    'Missing Task scope key',
    'tb_live_scope_task',
    repeat('c', 64),
    '20000000-0000-4000-8000-000000000009',
    array[
      'experiments:write',
      'activity:append',
      'attachments:write'
    ],
    null,
    null,
    '50000000-0000-4000-8000-000000000009'
  ),
  (
    '40000000-0000-4000-8000-000000000013',
    'Missing Experiment scope key',
    'tb_live_scope_experiment',
    repeat('d', 64),
    '20000000-0000-4000-8000-000000000009',
    array['tasks:write', 'activity:append', 'attachments:write'],
    null,
    null,
    '50000000-0000-4000-8000-000000000009'
  ),
  (
    '40000000-0000-4000-8000-000000000014',
    'Missing Activity scope key',
    'tb_live_scope_activity',
    repeat('e', 64),
    '20000000-0000-4000-8000-000000000009',
    array['tasks:write', 'experiments:write', 'attachments:write'],
    null,
    null,
    '50000000-0000-4000-8000-000000000009'
  ),
  (
    '40000000-0000-4000-8000-000000000015',
    'Missing Attachment scope key',
    'tb_live_scope_attachment',
    repeat('f', 64),
    '20000000-0000-4000-8000-000000000009',
    array['tasks:write', 'experiments:write', 'activity:append'],
    null,
    null,
    '50000000-0000-4000-8000-000000000009'
  );

set local role service_role;

select ok(
  not has_table_privilege('service_role', 'public.tasks', 'update')
    and not has_table_privilege(
      'service_role',
      'public.experiments',
      'insert'
    )
    and not has_table_privilege(
      'service_role',
      'public.experiments',
      'update'
    )
    and not has_table_privilege(
      'service_role',
      'public.activity',
      'insert'
    )
    and not has_table_privilege(
      'service_role',
      'public.attachments',
      'insert'
    )
    and not has_table_privilege(
      'service_role',
      'public.attachments',
      'update'
    ),
  'service_role has no table-wide write grants'
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
    ),
  'service_role has the RPC writable-column grants'
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
      'public.tasks',
      'updated_at',
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
      'public.experiments',
      'started_at',
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
    )
    and not has_column_privilege(
      'service_role',
      'public.attachments',
      'updated_at',
      'update'
    ),
  'service_role cannot write protected parent and system columns'
);
select ok(
  not has_table_privilege('service_role', 'public.tasks', 'delete')
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
  'service_role cannot directly delete Agent API resources'
);
select ok(
  has_sequence_privilege(
    'service_role',
    'public.experiments_experiment_no_seq',
    'usage'
  )
    and not has_sequence_privilege(
      'service_role',
      'public.experiments_experiment_no_seq',
      'select'
    ),
  'service_role has only the identity sequence privilege it needs'
);

select throws_ok(
  attempted.sql,
  'P0001',
  'TASK_SCOPE_FORBIDDEN',
  attempted.label
)
from (
  values
    (
      $$select public.agent_api_patch_task(
        '40000000-0000-4000-8000-000000000010',
        '20000000-0000-4000-8000-000000000009',
        '30000000-0000-4000-8000-000000000009',
        (select updated_at from public.tasks where id =
          '30000000-0000-4000-8000-000000000009'),
        '{"title":"revoked"}',
        'auth_revoked'
      )$$,
      'a revoked Key is forbidden'
    ),
    (
      $$select public.agent_api_patch_task(
        '40000000-0000-4000-8000-000000000011',
        '20000000-0000-4000-8000-000000000009',
        '30000000-0000-4000-8000-000000000009',
        (select updated_at from public.tasks where id =
          '30000000-0000-4000-8000-000000000009'),
        '{"title":"expired"}',
        'auth_expired'
      )$$,
      'an expired Key is forbidden'
    ),
    (
      $$select public.agent_api_patch_task(
        '40000000-0000-4000-8000-000000000012',
        '20000000-0000-4000-8000-000000000009',
        '30000000-0000-4000-8000-000000000009',
        (select updated_at from public.tasks where id =
          '30000000-0000-4000-8000-000000000009'),
        '{"title":"missing scope"}',
        'auth_scope'
      )$$,
      'a Key without the fixed scope is forbidden'
    ),
    (
      $$select public.agent_api_patch_task(
        '40000000-0000-4000-8000-000000000009',
        '20000000-0000-4000-8000-000000000010',
        '30000000-0000-4000-8000-000000000009',
        (select updated_at from public.tasks where id =
          '30000000-0000-4000-8000-000000000009'),
        '{"title":"wrong member"}',
        'auth_member'
      )$$,
      'a Key cannot claim another Member'
    ),
    (
      $$select public.agent_api_patch_task(
        '40000000-0000-4000-8000-000000000009',
        '20000000-0000-4000-8000-000000000009',
        '30000000-0000-4000-8000-000000000010',
        (select updated_at from public.tasks where id =
          '30000000-0000-4000-8000-000000000010'),
        '{"title":"unassigned"}',
        'auth_task'
      )$$,
      'an unassigned Task is forbidden'
    )
) as attempted(sql, label);

select is(
  (
    select title
    from public.tasks
    where id = '30000000-0000-4000-8000-000000000009'
  ),
  'Guarded task',
  'authorization failures leave the Task unchanged'
);
select is(
  (
    select count(*)::integer
    from public.agent_api_audit_log
    where request_id like 'auth_%'
  ),
  0,
  'authorization failures create no audit rows'
);

select lives_ok(
  $$select public.agent_api_patch_task(
    '40000000-0000-4000-8000-000000000009',
    '20000000-0000-4000-8000-000000000009',
    '30000000-0000-4000-8000-000000000009',
    (select updated_at from public.tasks where id =
      '30000000-0000-4000-8000-000000000009'),
    jsonb_build_object(
      'title', 'Patched task',
      'notes', 'Task notes',
      'tags', '["NPU","Verifier"]'::jsonb,
      'priority', 'urgent',
      'due_date', '2026-08-15',
      'module_id', '10000000-0000-4000-8000-000000000099'
    ),
    'success_task_patch'
  )$$,
  'service_role can patch a Task through the RPC'
);
select lives_ok(
  $$select public.agent_api_create_experiment(
    '40000000-0000-4000-8000-000000000009',
    '20000000-0000-4000-8000-000000000009',
    '30000000-0000-4000-8000-000000000009',
    'Security experiment',
    '60000000-0000-4000-8000-000000000009',
    repeat('d', 64),
    'success_experiment_create'
  )$$,
  'service_role can create an Experiment through the RPC'
);
select lives_ok(
  $$select public.agent_api_patch_experiment(
    '40000000-0000-4000-8000-000000000009',
    '20000000-0000-4000-8000-000000000009',
    (select id from public.experiments where name = 'Security experiment'),
    (select updated_at from public.experiments
      where name = 'Security experiment'),
    jsonb_build_object(
      'notes', 'Experiment notes',
      'featured_metric_keys', '["latency"]'::jsonb,
      'owner_id', '20000000-0000-4000-8000-000000000010',
      'task_id', '30000000-0000-4000-8000-000000000010'
    ),
    'success_experiment_patch'
  )$$,
  'service_role can patch an Experiment through the RPC'
);
select lives_ok(
  $$select public.agent_api_create_activity(
    '40000000-0000-4000-8000-000000000009',
    '20000000-0000-4000-8000-000000000009',
    '30000000-0000-4000-8000-000000000009',
    'Agent comment',
    '60000000-0000-4000-8000-000000000010',
    repeat('e', 64),
    'success_activity_create'
  )$$,
  'service_role can create Activity through the RPC'
);
select lives_ok(
  $$select public.agent_api_create_attachment(
    '40000000-0000-4000-8000-000000000009',
    '20000000-0000-4000-8000-000000000009',
    (select id from public.experiments where name = 'Security experiment'),
    'security/path',
    'https://example.test/security',
    'Before caption',
    '60000000-0000-4000-8000-000000000011',
    repeat('f', 64),
    'success_attachment_create'
  )$$,
  'service_role can create an Attachment through the RPC'
);
select lives_ok(
  $$select public.agent_api_patch_attachment(
    '40000000-0000-4000-8000-000000000009',
    '20000000-0000-4000-8000-000000000009',
    (select id from public.attachments where path = 'security/path'),
    (select updated_at from public.attachments
      where path = 'security/path'),
    'After caption',
    'success_attachment_patch'
  )$$,
  'service_role can patch an Attachment through the RPC'
);

select ok(
  (
    select title = 'Patched task'
      and notes = 'Task notes'
      and tags = array['NPU', 'Verifier']
      and priority = 'urgent'
      and due_date = '2026-08-15'::date
      and module_id = '10000000-0000-4000-8000-000000000009'
    from public.tasks
    where id = '30000000-0000-4000-8000-000000000009'
  ),
  'Task PATCH changes allowed fields and ignores parent fields'
);
select ok(
  (
    select owner_id = '20000000-0000-4000-8000-000000000009'
      and task_id = '30000000-0000-4000-8000-000000000009'
      and status = 'planned'
      and notes = 'Experiment notes'
      and featured_metric_keys = array['latency']
    from public.experiments
    where name = 'Security experiment'
  ),
  'Experiment RPCs force ownership and ignore protected PATCH fields'
);
select ok(
  (
    select text = 'Agent comment'
      and kind = 'comment'
      and experiment_id is null
    from public.activity
    where text = 'Agent comment'
  ),
  'Activity create forces comment kind and no Experiment parent'
);
select ok(
  (
    select attachment.task_id = experiment.task_id
      and attachment.experiment_id = experiment.id
      and attachment.url = 'https://example.test/security'
      and attachment.caption = 'After caption'
    from public.attachments attachment
    join public.experiments experiment
      on experiment.id = attachment.experiment_id
    where attachment.path = 'security/path'
  ),
  'Attachment RPCs derive Task and patch only caption'
);
select is(
  (
    select count(*)::integer
    from public.agent_api_audit_log
    where api_key_id = '40000000-0000-4000-8000-000000000009'
  ),
  6,
  'all six successful RPC calls write one audit row'
);
select ok(
  (
    select before_state->>'title' = 'Guarded task'
      and before_state->>'notes' = ''
      and after_state = (
        select to_jsonb(task_row.*)
        from public.tasks task_row
        where task_row.id = '30000000-0000-4000-8000-000000000009'
      )
      and action = 'patch'
      and response_status = 200
    from public.agent_api_audit_log
    where request_id = 'success_task_patch'
  ),
  'Task audit stores the exact before and after snapshots'
);
select ok(
  (
    select created.before_state is null
      and created.after_state = patched.before_state
      and patched.after_state = (
        select to_jsonb(experiment_row.*)
        from public.experiments experiment_row
        where experiment_row.name = 'Security experiment'
      )
      and created.action = 'create'
      and created.response_status = 201
      and patched.action = 'patch'
      and patched.response_status = 200
    from public.agent_api_audit_log created
    cross join public.agent_api_audit_log patched
    where created.request_id = 'success_experiment_create'
      and patched.request_id = 'success_experiment_patch'
  ),
  'Experiment audits form an exact create-to-patch snapshot chain'
);
select ok(
  (
    select activity_audit.before_state is null
      and activity_audit.after_state = (
        select to_jsonb(activity_row.*)
        from public.activity activity_row
        where activity_row.text = 'Agent comment'
      )
      and attachment_create.before_state is null
      and attachment_create.after_state = attachment_patch.before_state
      and attachment_patch.after_state = (
        select to_jsonb(attachment_row.*)
        from public.attachments attachment_row
        where attachment_row.path = 'security/path'
      )
    from public.agent_api_audit_log activity_audit
    cross join public.agent_api_audit_log attachment_create
    cross join public.agent_api_audit_log attachment_patch
    where activity_audit.request_id = 'success_activity_create'
      and attachment_create.request_id = 'success_attachment_create'
      and attachment_patch.request_id = 'success_attachment_patch'
  ),
  'Activity and Attachment audits store exact snapshot content'
);

select throws_ok(
  attempted.sql,
  'P0001',
  'TASK_SCOPE_FORBIDDEN',
  attempted.label
)
from (
  values
    (
      $$select public.agent_api_create_experiment(
        '40000000-0000-4000-8000-000000000013',
        '20000000-0000-4000-8000-000000000009',
        '30000000-0000-4000-8000-000000000009',
        'Scope denied experiment',
        '60000000-0000-4000-8000-000000000015',
        repeat('7', 64),
        'scope_experiment_create'
      )$$,
      'Experiment create requires experiments:write'
    ),
    (
      $$select public.agent_api_patch_experiment(
        '40000000-0000-4000-8000-000000000013',
        '20000000-0000-4000-8000-000000000009',
        (select id from public.experiments
          where name = 'Security experiment'),
        (select updated_at from public.experiments
          where name = 'Security experiment'),
        '{"notes":"scope denied"}',
        'scope_experiment_patch'
      )$$,
      'Experiment PATCH requires experiments:write'
    ),
    (
      $$select public.agent_api_create_activity(
        '40000000-0000-4000-8000-000000000014',
        '20000000-0000-4000-8000-000000000009',
        '30000000-0000-4000-8000-000000000009',
        'Scope denied activity',
        '60000000-0000-4000-8000-000000000016',
        repeat('8', 64),
        'scope_activity_create'
      )$$,
      'Activity create requires activity:append'
    ),
    (
      $$select public.agent_api_create_attachment(
        '40000000-0000-4000-8000-000000000015',
        '20000000-0000-4000-8000-000000000009',
        (select id from public.experiments
          where name = 'Security experiment'),
        'scope/denied/attachment',
        'https://example.test/scope-denied',
        '',
        '60000000-0000-4000-8000-000000000017',
        repeat('0', 64),
        'scope_attachment_create'
      )$$,
      'Attachment create requires attachments:write'
    ),
    (
      $$select public.agent_api_patch_attachment(
        '40000000-0000-4000-8000-000000000015',
        '20000000-0000-4000-8000-000000000009',
        (select id from public.attachments where path = 'security/path'),
        (select updated_at from public.attachments
          where path = 'security/path'),
        'Scope denied caption',
        'scope_attachment_patch'
      )$$,
      'Attachment PATCH requires attachments:write'
    )
) as attempted(sql, label);

select ok(
  not exists (
    select 1
    from public.agent_api_audit_log
    where request_id like 'scope_%'
  )
    and not exists (
      select 1
      from public.experiments
      where name = 'Scope denied experiment'
    )
    and not exists (
      select 1
      from public.activity
      where text = 'Scope denied activity'
    )
    and not exists (
      select 1
      from public.attachments
      where path = 'scope/denied/attachment'
    )
    and (
      select notes = 'Experiment notes'
      from public.experiments
      where name = 'Security experiment'
    )
    and (
      select caption = 'After caption'
      from public.attachments
      where path = 'security/path'
    ),
  'missing fixed scopes create no business or audit side effects'
);

select throws_ok(
  attempted.sql,
  'P0001',
  'IDEMPOTENCY_INPUT_REQUIRED',
  attempted.label
)
from (
  values
    (
      $$select public.agent_api_create_experiment(
        '40000000-0000-4000-8000-000000000009',
        '20000000-0000-4000-8000-000000000009',
        '30000000-0000-4000-8000-000000000009',
        'Null experiment key',
        null,
        repeat('1', 64),
        'null_experiment_key'
      )$$,
      'Experiment create rejects a null idempotency key'
    ),
    (
      $$select public.agent_api_create_experiment(
        '40000000-0000-4000-8000-000000000009',
        '20000000-0000-4000-8000-000000000009',
        '30000000-0000-4000-8000-000000000009',
        'Null experiment hash',
        '60000000-0000-4000-8000-000000000012',
        null,
        'null_experiment_hash'
      )$$,
      'Experiment create rejects a null request hash'
    ),
    (
      $$select public.agent_api_create_activity(
        '40000000-0000-4000-8000-000000000009',
        '20000000-0000-4000-8000-000000000009',
        '30000000-0000-4000-8000-000000000009',
        'Null activity key',
        null,
        repeat('2', 64),
        'null_activity_key'
      )$$,
      'Activity create rejects a null idempotency key'
    ),
    (
      $$select public.agent_api_create_activity(
        '40000000-0000-4000-8000-000000000009',
        '20000000-0000-4000-8000-000000000009',
        '30000000-0000-4000-8000-000000000009',
        'Null activity hash',
        '60000000-0000-4000-8000-000000000013',
        null,
        'null_activity_hash'
      )$$,
      'Activity create rejects a null request hash'
    ),
    (
      $$select public.agent_api_create_attachment(
        '40000000-0000-4000-8000-000000000009',
        '20000000-0000-4000-8000-000000000009',
        (select id from public.experiments
          where name = 'Security experiment'),
        'null/attachment/key',
        'https://example.test/null-key',
        '',
        null,
        repeat('3', 64),
        'null_attachment_key'
      )$$,
      'Attachment create rejects a null idempotency key'
    ),
    (
      $$select public.agent_api_create_attachment(
        '40000000-0000-4000-8000-000000000009',
        '20000000-0000-4000-8000-000000000009',
        (select id from public.experiments
          where name = 'Security experiment'),
        'null/attachment/hash',
        'https://example.test/null-hash',
        '',
        '60000000-0000-4000-8000-000000000014',
        null,
        'null_attachment_hash'
      )$$,
      'Attachment create rejects a null request hash'
    )
) as attempted(sql, label);

select ok(
  not exists (
    select 1
    from public.agent_api_audit_log
    where request_id like 'null_%'
  )
    and not exists (
      select 1
      from public.experiments
      where name like 'Null experiment%'
    )
    and not exists (
      select 1
      from public.activity
      where text like 'Null activity%'
    )
    and not exists (
      select 1
      from public.attachments
      where path like 'null/attachment/%'
    ),
  'invalid idempotency inputs create no business or audit rows'
);

select throws_ok(
  $$select public.agent_api_patch_task(
    '40000000-0000-4000-8000-000000000009',
    '20000000-0000-4000-8000-000000000009',
    '30000000-0000-4000-8000-000000000009',
    '2000-01-01T00:00:00Z',
    '{"title":"stale"}',
    'failure_stale'
  )$$,
  'P0001',
  'VERSION_CONFLICT',
  'a stale service_role PATCH is rejected'
);
select ok(
  (
    select title = 'Patched task'
    from public.tasks
    where id = '30000000-0000-4000-8000-000000000009'
  )
    and not exists (
      select 1
      from public.agent_api_audit_log
      where request_id = 'failure_stale'
    ),
  'a stale PATCH leaves business state and audit unchanged'
);

select * from finish();
rollback;
