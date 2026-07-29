create or replace function public.agent_api_require_task_access(
  p_api_key_id uuid,
  p_member_id uuid,
  p_task_id uuid,
  p_required_scope text
) returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.api_keys k
    join public.task_assignees ta on ta.member_id = k.member_id
    where k.id = p_api_key_id
      and k.member_id = p_member_id
      and k.revoked_at is null
      and (k.expires_at is null or k.expires_at > now())
      and p_required_scope = any(k.scopes)
      and ta.task_id = p_task_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'TASK_SCOPE_FORBIDDEN';
  end if;
end
$function$;

create or replace function public.agent_api_require_write_quota(
  p_api_key_id uuid
) returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('agent-api-quota:' || p_api_key_id::text, 0)
  );

  if (
    select count(*)
    from public.agent_api_audit_log
    where api_key_id = p_api_key_id
      and response_status between 200 and 299
      and created_at > now() - interval '60 seconds'
  ) >= 30 then
    raise exception using
      errcode = 'P0001',
      message = 'WRITE_RATE_LIMITED';
  end if;
end
$function$;

create or replace function public.agent_api_existing_idempotency(
  p_api_key_id uuid,
  p_idempotency_key text,
  p_request_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_request_hash text;
  v_after_state jsonb;
begin
  select audit.request_hash, audit.after_state
  into v_request_hash, v_after_state
  from public.agent_api_audit_log audit
  where audit.api_key_id = p_api_key_id
    and audit.idempotency_key = p_idempotency_key;

  if not found then
    return null;
  end if;

  if v_request_hash is distinct from p_request_hash then
    raise exception using
      errcode = 'P0001',
      message = 'IDEMPOTENCY_KEY_REUSED';
  end if;

  return jsonb_build_object(
    'data', v_after_state,
    'idempotency_replayed', true
  );
end
$function$;

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

create or replace function public.agent_api_create_experiment(
  p_api_key_id uuid,
  p_member_id uuid,
  p_task_id uuid,
  p_name text,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_existing jsonb;
  v_after jsonb;
  v_resource_id uuid;
begin
  perform public.agent_api_require_task_access(
    p_api_key_id,
    p_member_id,
    p_task_id,
    'experiments:write'
  );

  if p_idempotency_key is null or p_request_hash is null then
    raise exception using
      errcode = 'P0001',
      message = 'IDEMPOTENCY_INPUT_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'agent-api-idempotency:' ||
      p_api_key_id::text || ':' || p_idempotency_key,
      0
    )
  );

  v_existing := public.agent_api_existing_idempotency(
    p_api_key_id,
    p_idempotency_key,
    p_request_hash
  );
  if v_existing is not null then
    return v_existing;
  end if;

  perform public.agent_api_require_write_quota(p_api_key_id);

  if length(trim(p_name)) not between 1 and 200 then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_EXPERIMENT_NAME';
  end if;

  insert into public.experiments (
    task_id,
    owner_id,
    name,
    status
  ) values (
    p_task_id,
    p_member_id,
    p_name,
    'planned'
  )
  returning id, to_jsonb(public.experiments.*)
  into v_resource_id, v_after;

  insert into public.agent_api_audit_log (
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
    p_api_key_id,
    p_member_id,
    p_request_id,
    p_idempotency_key,
    p_request_hash,
    'experiment',
    v_resource_id,
    p_task_id,
    'create',
    null,
    v_after,
    201
  );

  return jsonb_build_object(
    'data', v_after,
    'idempotency_replayed', false
  );
end
$function$;

create or replace function public.agent_api_patch_experiment(
  p_api_key_id uuid,
  p_member_id uuid,
  p_experiment_id uuid,
  p_expected_updated_at timestamptz,
  p_changes jsonb,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_task_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  select task_id
  into v_task_id
  from public.experiments
  where id = p_experiment_id;

  perform public.agent_api_require_task_access(
    p_api_key_id,
    p_member_id,
    v_task_id,
    'experiments:write'
  );
  perform public.agent_api_require_write_quota(p_api_key_id);

  select to_jsonb(experiments.*)
  into v_before
  from public.experiments
  where id = p_experiment_id;

  update public.experiments
  set
    name = case when p_changes ? 'name'
      then p_changes->>'name' else name end,
    status = case when p_changes ? 'status'
      then p_changes->>'status' else status end,
    baseline_experiment_id = case
      when p_changes ? 'baseline_experiment_id'
      then (p_changes->>'baseline_experiment_id')::uuid
      else baseline_experiment_id
    end,
    data_spec = case when p_changes ? 'data_spec'
      then p_changes->'data_spec' else data_spec end,
    object_spec = case when p_changes ? 'object_spec'
      then p_changes->'object_spec' else object_spec end,
    environment_spec = case when p_changes ? 'environment_spec'
      then p_changes->'environment_spec' else environment_spec end,
    config = case when p_changes ? 'config'
      then p_changes->'config' else config end,
    notes = case when p_changes ? 'notes'
      then p_changes->>'notes' else notes end,
    metrics = case when p_changes ? 'metrics'
      then p_changes->'metrics' else metrics end,
    featured_metric_keys = case
      when p_changes ? 'featured_metric_keys'
      then array(
        select jsonb_array_elements_text(
          p_changes->'featured_metric_keys'
        )
      )
      else featured_metric_keys
    end,
    result_summary = case when p_changes ? 'result_summary'
      then p_changes->>'result_summary' else result_summary end,
    decision_outcome = case when p_changes ? 'decision_outcome'
      then p_changes->>'decision_outcome' else decision_outcome end,
    decision_notes = case when p_changes ? 'decision_notes'
      then p_changes->>'decision_notes' else decision_notes end,
    position = case when p_changes ? 'position'
      then (p_changes->>'position')::double precision else position end
  where id = p_experiment_id
    and updated_at = p_expected_updated_at
  returning to_jsonb(public.experiments.*) into v_after;

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
    'experiment',
    p_experiment_id,
    v_task_id,
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

create or replace function public.agent_api_create_activity(
  p_api_key_id uuid,
  p_member_id uuid,
  p_task_id uuid,
  p_text text,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_existing jsonb;
  v_after jsonb;
  v_resource_id uuid;
begin
  perform public.agent_api_require_task_access(
    p_api_key_id,
    p_member_id,
    p_task_id,
    'activity:append'
  );

  if p_idempotency_key is null or p_request_hash is null then
    raise exception using
      errcode = 'P0001',
      message = 'IDEMPOTENCY_INPUT_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'agent-api-idempotency:' ||
      p_api_key_id::text || ':' || p_idempotency_key,
      0
    )
  );

  v_existing := public.agent_api_existing_idempotency(
    p_api_key_id,
    p_idempotency_key,
    p_request_hash
  );
  if v_existing is not null then
    return v_existing;
  end if;

  perform public.agent_api_require_write_quota(p_api_key_id);

  insert into public.activity (
    task_id,
    text,
    kind
  ) values (
    p_task_id,
    p_text,
    'comment'
  )
  returning id, to_jsonb(public.activity.*)
  into v_resource_id, v_after;

  insert into public.agent_api_audit_log (
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
    p_api_key_id,
    p_member_id,
    p_request_id,
    p_idempotency_key,
    p_request_hash,
    'activity',
    v_resource_id,
    p_task_id,
    'create',
    null,
    v_after,
    201
  );

  return jsonb_build_object(
    'data', v_after,
    'idempotency_replayed', false
  );
end
$function$;

create or replace function public.agent_api_create_attachment(
  p_api_key_id uuid,
  p_member_id uuid,
  p_experiment_id uuid,
  p_path text,
  p_url text,
  p_caption text,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_task_id uuid;
  v_existing jsonb;
  v_after jsonb;
  v_resource_id uuid;
begin
  select task_id
  into v_task_id
  from public.experiments
  where id = p_experiment_id;

  perform public.agent_api_require_task_access(
    p_api_key_id,
    p_member_id,
    v_task_id,
    'attachments:write'
  );

  if p_idempotency_key is null or p_request_hash is null then
    raise exception using
      errcode = 'P0001',
      message = 'IDEMPOTENCY_INPUT_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'agent-api-idempotency:' ||
      p_api_key_id::text || ':' || p_idempotency_key,
      0
    )
  );

  v_existing := public.agent_api_existing_idempotency(
    p_api_key_id,
    p_idempotency_key,
    p_request_hash
  );
  if v_existing is not null then
    return v_existing;
  end if;

  perform public.agent_api_require_write_quota(p_api_key_id);

  insert into public.attachments (
    task_id,
    experiment_id,
    path,
    url,
    caption
  ) values (
    v_task_id,
    p_experiment_id,
    p_path,
    p_url,
    p_caption
  )
  returning id, to_jsonb(public.attachments.*)
  into v_resource_id, v_after;

  insert into public.agent_api_audit_log (
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
    p_api_key_id,
    p_member_id,
    p_request_id,
    p_idempotency_key,
    p_request_hash,
    'attachment',
    v_resource_id,
    v_task_id,
    'create',
    null,
    v_after,
    201
  );

  return jsonb_build_object(
    'data', v_after,
    'idempotency_replayed', false
  );
end
$function$;

create or replace function public.agent_api_patch_attachment(
  p_api_key_id uuid,
  p_member_id uuid,
  p_attachment_id uuid,
  p_expected_updated_at timestamptz,
  p_caption text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_task_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  select experiment.task_id
  into v_task_id
  from public.attachments attachment
  join public.experiments experiment
    on experiment.id = attachment.experiment_id
  where attachment.id = p_attachment_id;

  perform public.agent_api_require_task_access(
    p_api_key_id,
    p_member_id,
    v_task_id,
    'attachments:write'
  );
  perform public.agent_api_require_write_quota(p_api_key_id);

  select to_jsonb(attachments.*)
  into v_before
  from public.attachments
  where id = p_attachment_id;

  update public.attachments
  set caption = p_caption
  where id = p_attachment_id
    and updated_at = p_expected_updated_at
  returning to_jsonb(public.attachments.*) into v_after;

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
    'attachment',
    p_attachment_id,
    v_task_id,
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

grant select on public.tasks to service_role;
grant update (title, status, notes, position)
  on public.tasks to service_role;

grant select on public.experiments to service_role;
grant insert (task_id, owner_id, name, status)
  on public.experiments to service_role;
grant update (
  name,
  status,
  baseline_experiment_id,
  data_spec,
  object_spec,
  environment_spec,
  config,
  notes,
  metrics,
  featured_metric_keys,
  result_summary,
  decision_outcome,
  decision_notes,
  position
) on public.experiments to service_role;

grant select on public.activity to service_role;
grant insert (task_id, text, kind)
  on public.activity to service_role;

grant select on public.attachments to service_role;
grant insert (task_id, experiment_id, path, url, caption)
  on public.attachments to service_role;
grant update (caption)
  on public.attachments to service_role;

grant usage on sequence public.experiments_experiment_no_seq
  to service_role;

revoke execute on function public.agent_api_require_task_access(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.agent_api_require_task_access(
  uuid, uuid, uuid, text
) to service_role;

revoke execute on function public.agent_api_require_write_quota(
  uuid
) from public, anon, authenticated;
grant execute on function public.agent_api_require_write_quota(
  uuid
) to service_role;

revoke execute on function public.agent_api_existing_idempotency(
  uuid, text, text
) from public, anon, authenticated;
grant execute on function public.agent_api_existing_idempotency(
  uuid, text, text
) to service_role;

revoke execute on function public.agent_api_patch_task(
  uuid, uuid, uuid, timestamptz, jsonb, text
) from public, anon, authenticated;
grant execute on function public.agent_api_patch_task(
  uuid, uuid, uuid, timestamptz, jsonb, text
) to service_role;

revoke execute on function public.agent_api_create_experiment(
  uuid, uuid, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.agent_api_create_experiment(
  uuid, uuid, uuid, text, text, text, text
) to service_role;

revoke execute on function public.agent_api_patch_experiment(
  uuid, uuid, uuid, timestamptz, jsonb, text
) from public, anon, authenticated;
grant execute on function public.agent_api_patch_experiment(
  uuid, uuid, uuid, timestamptz, jsonb, text
) to service_role;

revoke execute on function public.agent_api_create_activity(
  uuid, uuid, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.agent_api_create_activity(
  uuid, uuid, uuid, text, text, text, text
) to service_role;

revoke execute on function public.agent_api_create_attachment(
  uuid, uuid, uuid, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.agent_api_create_attachment(
  uuid, uuid, uuid, text, text, text, text, text, text
) to service_role;

revoke execute on function public.agent_api_patch_attachment(
  uuid, uuid, uuid, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.agent_api_patch_attachment(
  uuid, uuid, uuid, timestamptz, text, text
) to service_role;
