create or replace function public.agent_api_list_audit(
  p_member_id uuid
)
returns table (
  id uuid,
  api_key_id uuid,
  key_prefix text,
  member_id uuid,
  request_id text,
  resource_type text,
  resource_id uuid,
  task_id uuid,
  action text,
  before_state jsonb,
  after_state jsonb,
  response_status integer,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    audit.id,
    audit.api_key_id,
    api_key.key_prefix,
    audit.member_id,
    audit.request_id,
    audit.resource_type,
    audit.resource_id,
    audit.task_id,
    audit.action,
    audit.before_state,
    audit.after_state,
    audit.response_status,
    audit.created_at
  from public.agent_api_audit_log audit
  join public.task_assignees assignment
    on assignment.task_id = audit.task_id
   and assignment.member_id = p_member_id
  join public.api_keys api_key
    on api_key.id = audit.api_key_id
  order by audit.created_at desc, audit.id desc;
$function$;

create or replace function public.agent_api_board_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'modules', (select count(*) from public.modules),
    'members', (select count(*) from public.members),
    'tasks', task_counts.total,
    'experiments', experiment_counts.total,
    'task_statuses', jsonb_build_object(
      'todo', task_counts.todo,
      'in_progress', task_counts.in_progress,
      'done', task_counts.done,
      'blocked', task_counts.blocked
    ),
    'experiment_statuses', jsonb_build_object(
      'planned', experiment_counts.planned,
      'running', experiment_counts.running,
      'analyzing', experiment_counts.analyzing,
      'completed', experiment_counts.completed,
      'blocked', experiment_counts.blocked,
      'cancelled', experiment_counts.cancelled
    )
  )
  from (
    select
      count(*) as total,
      count(*) filter (where status = 'todo') as todo,
      count(*) filter (where status = 'in_progress') as in_progress,
      count(*) filter (where status = 'done') as done,
      count(*) filter (where status = 'blocked') as blocked
    from public.tasks
  ) task_counts
  cross join (
    select
      count(*) as total,
      count(*) filter (where status = 'planned') as planned,
      count(*) filter (where status = 'running') as running,
      count(*) filter (where status = 'analyzing') as analyzing,
      count(*) filter (where status = 'completed') as completed,
      count(*) filter (where status = 'blocked') as blocked,
      count(*) filter (where status = 'cancelled') as cancelled
    from public.experiments
  ) experiment_counts;
$function$;

revoke execute
  on function public.agent_api_list_audit(uuid)
  from public, anon, authenticated;
revoke execute
  on function public.agent_api_board_summary()
  from public, anon, authenticated;

grant execute
  on function public.agent_api_list_audit(uuid)
  to service_role;
grant execute
  on function public.agent_api_board_summary()
  to service_role;

grant select on public.modules, public.members to service_role;
