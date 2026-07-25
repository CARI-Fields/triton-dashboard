\set ON_ERROR_STOP on

begin;

do $verify$
declare
  v_module uuid;
  v_task uuid;
  v_owner uuid;
  v_baseline uuid;
  v_candidate uuid;
  v_started_at timestamptz;
  v_activity_count integer;
  v_baseline_after_delete uuid;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'experiments'
      and column_name = 'experiment_no'
  ) then
    raise exception 'experiment_no is missing';
  end if;

  insert into modules (name, kind, objective, position)
  values ('migration-test-module', 'pipeline', '', 999999)
  returning id into v_module;

  insert into tasks (module_id, title, status, assignees, position)
  values (v_module, 'migration-test-task', 'in_progress', '{}', 999999)
  returning id into v_task;

  insert into members (name, initials, position)
  values ('Migration Test Owner', 'MT', 999999)
  returning id into v_owner;

  insert into experiments (
    task_id,
    owner_id,
    name,
    status,
    data_spec,
    object_spec,
    environment_spec,
    config,
    metrics,
    decision_outcome,
    position
  )
  values (
    v_task,
    v_owner,
    'baseline',
    'completed',
    '{"datasets":[{"role":"evaluation","name":"fixture"}]}'::jsonb,
    '{"model":"fixture-model","harness":"","parent_harness":"","prompt":"","prompt_change":"","skills":[],"tools":[]}'::jsonb,
    '{"platform":"npu","server":"fixture-server","devices":["npu:0"],"hardware":"","evaluator":"","revision":"","precision_policy":""}'::jsonb,
    '{"profile":"defaults"}'::jsonb,
    '{"pass@1":0.1}'::jsonb,
    'reference',
    0
  )
  returning id into v_baseline;

  if (select completed_at from experiments where id = v_baseline) is null then
    raise exception 'completed insert did not set completed_at';
  end if;

  insert into experiments (
    task_id,
    owner_id,
    name,
    status,
    baseline_experiment_id,
    data_spec,
    object_spec,
    environment_spec,
    config,
    position
  )
  values (
    v_task,
    v_owner,
    'candidate',
    'planned',
    v_baseline,
    '{"datasets":[{"role":"evaluation","name":"fixture"}]}'::jsonb,
    '{"model":"fixture-model","harness":"","parent_harness":"","prompt":"","prompt_change":"","skills":[],"tools":[]}'::jsonb,
    '{"platform":"npu","server":"fixture-server","devices":["npu:1"],"hardware":"","evaluator":"","revision":"","precision_policy":""}'::jsonb,
    '{"temperature":0.1}'::jsonb,
    1
  )
  returning id into v_candidate;

  update experiments set status = 'running' where id = v_candidate;
  select started_at into v_started_at from experiments where id = v_candidate;
  if v_started_at is null then
    raise exception 'running did not set started_at';
  end if;

  begin
    update experiments set status = 'completed' where id = v_candidate;
    raise exception 'completed without decision was accepted';
  exception
    when check_violation then null;
  end;

  update experiments
  set
    status = 'analyzing',
    metrics = '{"pass@1":0.2}'::jsonb,
    result_summary = 'candidate result',
    decision_outcome = 'accepted',
    decision_notes = 'keep this configuration'
  where id = v_candidate;

  update experiments set status = 'completed' where id = v_candidate;
  if (select completed_at from experiments where id = v_candidate) is null then
    raise exception 'completed did not set completed_at';
  end if;

  update experiments set status = 'analyzing' where id = v_candidate;
  if (select completed_at from experiments where id = v_candidate) is not null then
    raise exception 'reopen did not clear completed_at';
  end if;
  if (select started_at from experiments where id = v_candidate) is distinct from v_started_at then
    raise exception 'reopen changed first started_at';
  end if;

  select count(*) into v_activity_count
  from activity
  where experiment_id = v_candidate;
  if v_activity_count < 5 then
    raise exception 'expected trigger activity, got %', v_activity_count;
  end if;

  delete from experiments where id = v_baseline;
  select baseline_experiment_id into v_baseline_after_delete
  from experiments
  where id = v_candidate;
  if v_baseline_after_delete is not null then
    raise exception 'baseline delete did not set reference to null';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'experiments'::regclass
      and conname = 'experiments_baseline_experiment_id_fkey'
  ) then
    raise exception 'baseline experiment foreign key is missing';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'experiments'::regclass
      and relrowsecurity
  ) then
    raise exception 'experiment RLS is not enabled';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'experiments'
      and policyname = 'auth access'
      and 'authenticated' = any(roles)
  ) then
    raise exception 'authenticated experiment RLS policy is missing';
  end if;
end
$verify$;

rollback;
