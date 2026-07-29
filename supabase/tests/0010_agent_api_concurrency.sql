begin;
create extension if not exists dblink;
select plan(10);

select dblink_connect(
  'setup',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
select dblink_connect(
  'writer_a',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
select dblink_connect(
  'writer_b',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);

select dblink_exec(
  'setup',
  $setup$
    insert into public.modules (id, name)
    values (
      '10000000-0000-4000-8000-000000000020',
      'Agent API Concurrency'
    );
    insert into public.members (id, name)
    values (
      '20000000-0000-4000-8000-000000000020',
      'Concurrent Agent'
    );
    insert into public.tasks (id, module_id, title)
    values (
      '30000000-0000-4000-8000-000000000020',
      '10000000-0000-4000-8000-000000000020',
      'Concurrent task'
    );
    insert into public.task_assignees (task_id, member_id)
    values (
      '30000000-0000-4000-8000-000000000020',
      '20000000-0000-4000-8000-000000000020'
    );
    insert into public.api_keys (
      id, name, key_prefix, key_digest, member_id, scopes, created_by
    ) values (
      '40000000-0000-4000-8000-000000000020',
      'Concurrent key',
      'tb_live_concurrent',
      repeat('2', 64),
      '20000000-0000-4000-8000-000000000020',
      array['experiments:write', 'activity:append'],
      '50000000-0000-4000-8000-000000000020'
    );
  $setup$
);

create temporary table concurrency_results (
  writer text primary key,
  result jsonb not null
);

select dblink_exec('writer_a', 'begin');
select dblink_exec('writer_a', 'set local role service_role');
insert into concurrency_results (writer, result)
select 'writer_a', result
from dblink(
  'writer_a',
  $sql$
    select public.agent_api_create_experiment(
      '40000000-0000-4000-8000-000000000020',
      '20000000-0000-4000-8000-000000000020',
      '30000000-0000-4000-8000-000000000020',
      'Concurrent experiment',
      '60000000-0000-4000-8000-000000000020',
      repeat('4', 64),
      'concurrent_idempotency_a'
    )
  $sql$
) as remote(result jsonb);

select dblink_exec('writer_b', 'begin');
select dblink_exec('writer_b', 'set local role service_role');
select is(
  dblink_send_query(
    'writer_b',
    $sql$
      select public.agent_api_create_experiment(
        '40000000-0000-4000-8000-000000000020',
        '20000000-0000-4000-8000-000000000020',
        '30000000-0000-4000-8000-000000000020',
        'Concurrent experiment',
        '60000000-0000-4000-8000-000000000020',
        repeat('4', 64),
        'concurrent_idempotency_b'
      )
    $sql$
  ),
  1,
  'the second identical create starts in another database session'
);
select pg_sleep(0.2);
select is(
  dblink_is_busy('writer_b'),
  1,
  'the second identical create waits while the first transaction is open'
);
select dblink_exec('writer_a', 'commit');
insert into concurrency_results (writer, result)
select 'writer_b', result
from dblink_get_result('writer_b') as remote(result jsonb);
select *
from dblink_get_result('writer_b') as remote(result jsonb);
select dblink_exec('writer_b', 'commit');

select is(
  (
    select result #>> '{data,id}'
    from concurrency_results
    where writer = 'writer_b'
  ),
  (
    select result #>> '{data,id}'
    from concurrency_results
    where writer = 'writer_a'
  ),
  'concurrent identical creates return the same resource'
);
select ok(
  (
    select (result->>'idempotency_replayed')::boolean = false
    from concurrency_results
    where writer = 'writer_a'
  )
    and (
      select (result->>'idempotency_replayed')::boolean = true
      from concurrency_results
      where writer = 'writer_b'
    ),
  'the concurrent retry is marked as replayed'
);
select ok(
  (
    select count(*) = 1
    from public.experiments
    where name = 'Concurrent experiment'
  )
    and (
      select count(*) = 1
      from public.agent_api_audit_log
      where idempotency_key =
        '60000000-0000-4000-8000-000000000020'
    ),
  'concurrent identical creates write one resource and one audit'
);

select dblink_exec(
  'setup',
  $quota$
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
      '40000000-0000-4000-8000-000000000020',
      '20000000-0000-4000-8000-000000000020',
      'concurrent_quota_fixture_' || sequence_no,
      'task',
      '30000000-0000-4000-8000-000000000020',
      '30000000-0000-4000-8000-000000000020',
      'patch',
      '{}'::jsonb,
      '{}'::jsonb,
      200
    from generate_series(1, 28) as generated(sequence_no);
  $quota$
);

select dblink_exec('writer_a', 'begin');
select dblink_exec('writer_a', 'set local role service_role');
select *
from dblink(
  'writer_a',
  $sql$
    select public.agent_api_create_activity(
      '40000000-0000-4000-8000-000000000020',
      '20000000-0000-4000-8000-000000000020',
      '30000000-0000-4000-8000-000000000020',
      'Concurrent quota A',
      '60000000-0000-4000-8000-000000000021',
      repeat('5', 64),
      'concurrent_quota_a'
    )
  $sql$
) as remote(result jsonb);

select dblink_exec('writer_b', 'begin');
select dblink_exec('writer_b', 'set local role service_role');
select is(
  dblink_send_query(
    'writer_b',
    $sql$
      select public.agent_api_create_activity(
        '40000000-0000-4000-8000-000000000020',
        '20000000-0000-4000-8000-000000000020',
        '30000000-0000-4000-8000-000000000020',
        'Concurrent quota B',
        '60000000-0000-4000-8000-000000000022',
        repeat('6', 64),
        'concurrent_quota_b'
      )
    $sql$
  ),
  1,
  'the competing quota write starts in another database session'
);
select pg_sleep(0.2);
select is(
  dblink_is_busy('writer_b'),
  1,
  'the competing quota write waits on the per-Key quota lock'
);
select dblink_exec('writer_a', 'commit');
select *
from dblink_get_result('writer_b', false) as remote(result jsonb);
select *
from dblink_get_result('writer_b', false) as remote(result jsonb);
select matches(
  dblink_error_message('writer_b'),
  'WRITE_RATE_LIMITED',
  'the serialized competing write is rejected at the limit'
);
select dblink_exec('writer_b', 'rollback');
select is(
  (
    select count(*)::integer
    from public.agent_api_audit_log
    where api_key_id = '40000000-0000-4000-8000-000000000020'
  ),
  30,
  'parallel quota decisions admit exactly the thirtieth write'
);
select ok(
  (
    select count(*) = 1
    from public.activity
    where text in ('Concurrent quota A', 'Concurrent quota B')
  )
    and not exists (
      select 1
      from public.agent_api_audit_log
      where request_id = 'concurrent_quota_b'
    ),
  'the rejected parallel write creates no business or audit row'
);

select dblink_exec(
  'setup',
  $cleanup$
    delete from public.agent_api_audit_log
    where api_key_id = '40000000-0000-4000-8000-000000000020';
    delete from public.api_keys
    where id = '40000000-0000-4000-8000-000000000020';
    delete from public.modules
    where id = '10000000-0000-4000-8000-000000000020';
    delete from public.members
    where id = '20000000-0000-4000-8000-000000000020';
  $cleanup$
);
select dblink_disconnect('writer_a');
select dblink_disconnect('writer_b');
select dblink_disconnect('setup');

select * from finish();
rollback;
