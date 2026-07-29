begin;
select plan(20);

select has_function(
  'public',
  'agent_api_list_audit',
  array['uuid']
);
select has_function(
  'public',
  'agent_api_board_summary',
  array[]::text[]
);

select ok(
  not has_function_privilege(
    'public',
    'public.agent_api_list_audit(uuid)',
    'execute'
  ),
  'PUBLIC cannot execute the audit read RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.agent_api_list_audit(uuid)',
    'execute'
  ),
  'authenticated cannot execute the audit read RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.agent_api_list_audit(uuid)',
    'execute'
  ),
  'service_role can execute the audit read RPC'
);
select ok(
  not has_function_privilege(
    'public',
    'public.agent_api_board_summary()',
    'execute'
  ),
  'PUBLIC cannot execute the Board summary RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.agent_api_board_summary()',
    'execute'
  ),
  'authenticated cannot execute the Board summary RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.agent_api_board_summary()',
    'execute'
  ),
  'service_role can execute the Board summary RPC'
);

select ok(
  not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.agent_api_audit_log'::regclass
      and contype = 'f'
      and confrelid = 'public.tasks'::regclass
  ),
  'audit history has no Task foreign key'
);

insert into public.modules (id, name)
values ('10000000-0000-4000-8000-000000000012', 'Read API Test');
insert into public.members (id, name)
values
  ('20000000-0000-4000-8000-000000000012', 'Current Collaborator'),
  ('20000000-0000-4000-8000-000000000013', 'Historical Writer');
insert into public.tasks (id, module_id, title)
values (
  '30000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000012',
  'Current collaboration'
);
insert into public.api_keys (
  id,
  name,
  key_prefix,
  key_digest,
  member_id,
  scopes,
  created_by
) values (
  '40000000-0000-4000-8000-000000000012',
  'Historical key',
  'tb_live_history',
  repeat('c', 64),
  '20000000-0000-4000-8000-000000000013',
  array['audit:read'],
  '50000000-0000-4000-8000-000000000012'
);
insert into public.agent_api_audit_log (
  id,
  api_key_id,
  member_id,
  request_id,
  idempotency_key,
  request_hash,
  resource_type,
  resource_id,
  task_id,
  action,
  before_state,
  after_state,
  response_status
) values (
  '90000000-0000-4000-8000-000000000012',
  '40000000-0000-4000-8000-000000000012',
  '20000000-0000-4000-8000-000000000013',
  'req_read_scope',
  '60000000-0000-4000-8000-000000000012',
  repeat('d', 64),
  'task',
  '30000000-0000-4000-8000-000000000012',
  '30000000-0000-4000-8000-000000000012',
  'patch',
  '{"title":"before"}',
  '{"title":"after"}',
  200
);

select is(
  (
    select count(*)::bigint
    from public.agent_api_list_audit(
      '20000000-0000-4000-8000-000000000012'
    )
  ),
  0::bigint,
  'a Member with no current assignment sees no audit rows'
);

insert into public.task_assignees (task_id, member_id)
values (
  '30000000-0000-4000-8000-000000000012',
  '20000000-0000-4000-8000-000000000012'
);

select is(
  (
    select count(*)::bigint
    from public.agent_api_list_audit(
      '20000000-0000-4000-8000-000000000012'
    )
  ),
  1::bigint,
  'a current collaborator sees the Task audit row'
);
select is(
  (
    select count(*)::bigint
    from public.agent_api_list_audit(
      '20000000-0000-4000-8000-000000000013'
    )
  ),
  0::bigint,
  'historical audit Member and Key ownership do not widen visibility'
);
select ok(
  (
    select to_jsonb(audit_row)
      ?& array[
        'id',
        'api_key_id',
        'key_prefix',
        'member_id',
        'request_id',
        'resource_type',
        'resource_id',
        'task_id',
        'action',
        'before_state',
        'after_state',
        'response_status',
        'created_at'
      ]
      and not (
        to_jsonb(audit_row)
        ?| array['key_digest', 'request_hash', 'idempotency_key']
      )
    from public.agent_api_list_audit(
      '20000000-0000-4000-8000-000000000012'
    ) audit_row
  ),
  'audit RPC returns its exact public response projection'
);

delete from public.task_assignees
where task_id = '30000000-0000-4000-8000-000000000012'
  and member_id = '20000000-0000-4000-8000-000000000012';
select is(
  (
    select count(*)::bigint
    from public.agent_api_list_audit(
      '20000000-0000-4000-8000-000000000012'
    )
  ),
  0::bigint,
  'removing the current assignment immediately hides audit history'
);

delete from public.tasks
where id = '30000000-0000-4000-8000-000000000012';
select ok(
  exists (
    select 1
    from public.agent_api_audit_log
    where id = '90000000-0000-4000-8000-000000000012'
  ),
  'deleting a Task preserves its audit history'
);
select is(
  (
    select count(*)::bigint
    from public.agent_api_list_audit(
      '20000000-0000-4000-8000-000000000012'
    )
  ),
  0::bigint,
  'deleted Task audit is outside every live collaboration scope'
);

create temporary table agent_api_read_baseline as
select
  (
    public.agent_api_board_summary()
    #>> '{task_statuses,todo}'
  )::bigint as todo,
  (
    public.agent_api_board_summary()
    #>> '{experiment_statuses,planned}'
  )::bigint as planned;

insert into public.tasks (
  id,
  module_id,
  title,
  status
)
select
  (
    '31000000-0000-4000-8000-'
    || lpad(sequence_no::text, 12, '0')
  )::uuid,
  '10000000-0000-4000-8000-000000000012',
  'Summary task ' || sequence_no,
  case
    when sequence_no <= 1001 then 'todo'
    else 'done'
  end
from generate_series(1, 1101) as generated(sequence_no);

insert into public.experiments (
  task_id,
  name,
  status
)
select
  task.id,
  'Summary experiment ' || row_number() over (),
  case
    when row_number() over () <= 1001 then 'planned'
    else 'cancelled'
  end
from public.tasks task
where task.module_id = '10000000-0000-4000-8000-000000000012';

select ok(
  (public.agent_api_board_summary()->>'tasks')::bigint > 1000,
  'Board summary Task total exceeds the PostgREST max_rows ceiling'
);
select is(
  (
    public.agent_api_board_summary()
    #>> '{task_statuses,todo}'
  )::bigint,
  (
    select todo + 1001
    from agent_api_read_baseline
  ),
  'Board summary uses the exact Task status count'
);
select ok(
  (public.agent_api_board_summary()->>'experiments')::bigint > 1000,
  'Board summary Experiment total exceeds the PostgREST max_rows ceiling'
);
select is(
  (
    public.agent_api_board_summary()
    #>> '{experiment_statuses,planned}'
  )::bigint,
  (
    select planned + 1001
    from agent_api_read_baseline
  ),
  'Board summary uses the exact Experiment status count'
);

select * from finish();
rollback;
