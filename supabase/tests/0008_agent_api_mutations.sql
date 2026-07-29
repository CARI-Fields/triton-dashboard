begin;
select plan(16);

select has_function(
  'public',
  'agent_api_patch_task',
  array['uuid', 'uuid', 'uuid', 'timestamp with time zone', 'jsonb', 'text']
);
select has_function(
  'public',
  'agent_api_create_experiment',
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'text']
);
select has_function(
  'public',
  'agent_api_patch_experiment',
  array['uuid', 'uuid', 'uuid', 'timestamp with time zone', 'jsonb', 'text']
);
select has_function(
  'public',
  'agent_api_create_activity',
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'text']
);
select has_function(
  'public',
  'agent_api_create_attachment',
  array[
    'uuid',
    'uuid',
    'uuid',
    'text',
    'text',
    'text',
    'text',
    'text',
    'text'
  ]
);
select has_function(
  'public',
  'agent_api_patch_attachment',
  array['uuid', 'uuid', 'uuid', 'timestamp with time zone', 'text', 'text']
);

insert into public.modules (id, name)
values ('10000000-0000-4000-8000-000000000001', 'Agent API Test');
insert into public.members (id, name)
values
  ('20000000-0000-4000-8000-000000000001', 'Bruce'),
  ('20000000-0000-4000-8000-000000000002', 'Alice');
insert into public.tasks (id, module_id, title)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Shared task'
);
insert into public.task_assignees (task_id, member_id)
values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001'
);
insert into public.api_keys (
  id, name, key_prefix, key_digest, member_id, scopes, created_by
) values (
  '40000000-0000-4000-8000-000000000001',
  'Bruce key',
  'tb_live_test',
  repeat('a', 64),
  '20000000-0000-4000-8000-000000000001',
  array['board:read','tasks:write','experiments:write'],
  '50000000-0000-4000-8000-000000000001'
);

select public.agent_api_patch_task(
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  (
    select updated_at from public.tasks
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  '{"title":"Retitled by Bruce"}',
  'req_task_ok'
);
select is(
  (
    select title from public.tasks
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  'Retitled by Bruce',
  'Bruce can patch an assigned Task'
);

select throws_ok(
  $$select public.agent_api_patch_task(
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    (select updated_at from public.tasks where id =
      '30000000-0000-4000-8000-000000000001'),
    '{"title":"Alice attempt"}',
    'req_wrong_member'
  )$$,
  'P0001',
  'TASK_SCOPE_FORBIDDEN',
  'a Key cannot claim another Member'
);
select throws_ok(
  $$select public.agent_api_patch_task(
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '2000-01-01T00:00:00Z',
    '{"title":"Stale attempt"}',
    'req_stale'
  )$$,
  'P0001',
  'VERSION_CONFLICT',
  'stale Task ETag fails'
);

create temporary table agent_api_test_results (
  label text primary key,
  result jsonb not null
);
insert into agent_api_test_results (label, result)
select 'first', public.agent_api_create_experiment(
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Agent experiment',
  '60000000-0000-4000-8000-000000000001',
  repeat('1', 64),
  'req_exp_first'
);
insert into agent_api_test_results (label, result)
select 'replay', public.agent_api_create_experiment(
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Agent experiment',
  '60000000-0000-4000-8000-000000000001',
  repeat('1', 64),
  'req_exp_replay'
);

select is(
  (
    select e.owner_id
    from public.experiments e
    where e.id::text = (
      select result #>> '{data,id}'
      from agent_api_test_results where label = 'first'
    )
  ),
  '20000000-0000-4000-8000-000000000001'::uuid,
  'Experiment Owner is forced to the Key Member'
);
select is(
  (
    select e.status
    from public.experiments e
    where e.id::text = (
      select result #>> '{data,id}'
      from agent_api_test_results where label = 'first'
    )
  ),
  'planned',
  'Agent-created Experiment starts planned'
);
select is(
  (
    select result #>> '{data,id}'
    from agent_api_test_results where label = 'replay'
  ),
  (
    select result #>> '{data,id}'
    from agent_api_test_results where label = 'first'
  ),
  'idempotent replay returns the original Experiment'
);
select throws_ok(
  $$select public.agent_api_create_experiment(
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Different body',
    '60000000-0000-4000-8000-000000000001',
    repeat('2', 64),
    'req_exp_mismatch'
  )$$,
  'P0001',
  'IDEMPOTENCY_KEY_REUSED',
  'an Idempotency-Key cannot be reused for another request'
);
select ok(
  (
    select count(*) = 2
      and bool_and(after_state is not null)
      and bool_or(before_state is not null)
    from public.agent_api_audit_log
    where api_key_id = '40000000-0000-4000-8000-000000000001'
  ),
  'successful writes create snapshots and replay creates no duplicate audit'
);

insert into public.agent_api_audit_log (
  api_key_id,
  member_id,
  request_id,
  resource_type,
  resource_id,
  task_id,
  action,
  before_state,
  after_state,
  response_status
)
select
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'req_rate_' || sequence_no,
  'task',
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'patch',
  '{}'::jsonb,
  '{}'::jsonb,
  200
from generate_series(1, 28) as generated(sequence_no);

select lives_ok(
  $$select public.agent_api_create_experiment(
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Agent experiment',
    '60000000-0000-4000-8000-000000000001',
    repeat('1', 64),
    'req_exp_replay_at_quota'
  )$$,
  'idempotent replay still works at the write limit'
);
select throws_ok(
  $$select public.agent_api_patch_task(
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    (select updated_at from public.tasks where id =
      '30000000-0000-4000-8000-000000000001'),
    '{"title":"Over quota"}',
    'req_over_quota'
  )$$,
  'P0001',
  'WRITE_RATE_LIMITED',
  'a new write fails after 30 successful writes in 60 seconds'
);

select * from finish();
rollback;
