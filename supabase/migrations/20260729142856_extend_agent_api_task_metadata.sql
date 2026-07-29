create or replace function public.agent_api_patch_task(
  p_api_key_id uuid,
  p_member_id uuid,
  p_task_id uuid,
  p_expected_updated_at timestamptz,
  p_changes jsonb,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  perform public.agent_api_require_task_access(
    p_api_key_id,
    p_member_id,
    p_task_id,
    'tasks:write'
  );
  perform public.agent_api_require_write_quota(p_api_key_id);

  select to_jsonb(tasks.*)
  into v_before
  from public.tasks
  where id = p_task_id;

  update public.tasks
  set
    title = case when p_changes ? 'title'
      then p_changes->>'title' else title end,
    status = case when p_changes ? 'status'
      then p_changes->>'status' else status end,
    notes = case when p_changes ? 'notes'
      then p_changes->>'notes' else notes end,
    tags = case when p_changes ? 'tags'
      then array(
        select jsonb_array_elements_text(p_changes->'tags')
      )
      else tags end,
    priority = case when p_changes ? 'priority'
      then p_changes->>'priority' else priority end,
    due_date = case when p_changes ? 'due_date'
      then (p_changes->>'due_date')::date else due_date end,
    position = case when p_changes ? 'position'
      then (p_changes->>'position')::double precision else position end
  where id = p_task_id
    and updated_at = p_expected_updated_at
  returning to_jsonb(public.tasks.*) into v_after;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'VERSION_CONFLICT';
  end if;

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
  ) values (
    p_api_key_id,
    p_member_id,
    p_request_id,
    'task',
    p_task_id,
    p_task_id,
    'patch',
    v_before,
    v_after,
    200
  );

  return jsonb_build_object(
    'data', v_after,
    'idempotency_replayed', false
  );
end
$function$;

grant update (tags, priority, due_date)
  on public.tasks to service_role;
