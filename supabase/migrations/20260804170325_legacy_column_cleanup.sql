-- Experiment Template Workspace: legacy column cleanup release.
-- Prerequisite: Phase 6 cutover verified in production and the Agent API legacy
-- fixed payloads retired (Task 4). Historical data stays in experiment_versions.

alter table public.experiments
  drop column if exists baseline_experiment_id,
  drop column if exists data_spec,
  drop column if exists object_spec,
  drop column if exists environment_spec,
  drop column if exists config,
  drop column if exists notes,
  drop column if exists metrics,
  drop column if exists featured_metric_keys,
  drop column if exists result_summary,
  drop column if exists decision_outcome,
  drop column if exists decision_notes;

-- The lifecycle Activity trigger no longer references the dropped Baseline column.
create or replace function public.log_experiment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_owner_name text;
begin
  if tg_op = 'INSERT' then
    insert into activity (task_id, experiment_id, text, kind)
    values (new.task_id, new.id, 'Experiment created', 'experiment');
    return new;
  end if;

  if old.owner_id is distinct from new.owner_id then
    select name into v_owner_name from members where id = new.owner_id;
    insert into activity (task_id, experiment_id, text, kind)
    values (
      new.task_id,
      new.id,
      case
        when new.owner_id is null then 'Owner cleared'
        else format('Owner changed to %s', coalesce(v_owner_name, 'Unknown member'))
      end,
      'assign'
    );
  end if;

  if old.status is distinct from new.status then
    insert into activity (task_id, experiment_id, text, kind)
    values (new.task_id, new.id, format('Status changed to %s', new.status), 'status');
  end if;

  return new;
end
$function$;

-- duplicate_experiment no longer writes the dropped legacy columns.
create or replace function public.duplicate_experiment(
  p_source_id uuid,
  p_name text,
  p_owner_id uuid,
  p_position double precision,
  p_key_ids uuid[],
  p_edit_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_source public.experiments%rowtype;
  v_new public.experiments%rowtype;
  v_key_id uuid;
  v_version_no bigint;
  v_schema_revision bigint;
begin
  select * into v_source from public.experiments where id = p_source_id for update;
  if v_source.id is null or v_source.template_id is null then
    raise exception 'SOURCE_TEMPLATE_REQUIRED' using errcode = 'P0001';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'EXPERIMENT_NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_key_ids, '{}'::uuid[])) x(id)
    where not exists (
      select 1 from public.experiment_template_keys k
      where k.id = x.id
        and k.template_id = v_source.template_id
        and k.archived_at is null
        and k.value_type <> 'attachment'
    )
  ) then
    raise exception 'KEY_NOT_COPYABLE' using errcode = 'P0001';
  end if;

  insert into public.experiments (
    task_id, template_id, owner_id, name, status, position
  ) values (
    v_source.task_id, v_source.template_id, p_owner_id, trim(p_name),
    'planned', p_position
  )
  returning * into v_new;

  for v_key_id in select unnest(coalesce(p_key_ids, '{}'::uuid[])) loop
    insert into public.experiment_values (
      experiment_id, template_id, key_id, text_value, number_value,
      boolean_value, datetime_value, option_id, cell_revision
    )
    select v_new.id, v_new.template_id, v.key_id, v.text_value, v.number_value,
           v.boolean_value, v.datetime_value, v.option_id, v.cell_revision
    from public.experiment_values v
    where v.experiment_id = p_source_id and v.key_id = v_key_id;
    insert into public.experiment_value_options (
      experiment_id, template_id, key_id, option_id, position
    )
    select v_new.id, v_new.template_id, o.key_id, o.option_id, o.position
    from public.experiment_value_options o
    where o.experiment_id = p_source_id and o.key_id = v_key_id;
  end loop;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_versions
  where experiment_id = v_new.id;
  select schema_revision into v_schema_revision
  from public.experiment_templates
  where id = v_new.template_id;
  insert into public.experiment_versions (
    experiment_id, version_no, reason, source, edit_session_id,
    template_schema_revision, snapshot, actor_member_id
  ) values (
    v_new.id, v_version_no, 'Duplicated', 'browser', p_edit_session_id,
    v_schema_revision, public._experiment_snapshot(v_new.id), null
  );

  return to_jsonb(v_new);
end
$function$;
