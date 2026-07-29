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
  select
    case
      when attachment.experiment_id is null then attachment.task_id
      else experiment.task_id
    end,
    to_jsonb(attachment.*)
  into v_task_id, v_before
  from public.attachments attachment
  left join public.experiments experiment
    on experiment.id = attachment.experiment_id
  where attachment.id = p_attachment_id;

  perform public.agent_api_require_task_access(
    p_api_key_id,
    p_member_id,
    v_task_id,
    'attachments:write'
  );
  perform public.agent_api_require_write_quota(p_api_key_id);

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

revoke insert, update, delete on table
  public.tasks,
  public.experiments,
  public.activity,
  public.attachments
from service_role;

revoke select on sequence public.experiments_experiment_no_seq
  from service_role;

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

revoke execute on function public.agent_api_patch_attachment(
  uuid, uuid, uuid, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.agent_api_patch_attachment(
  uuid, uuid, uuid, timestamptz, text, text
) to service_role;
