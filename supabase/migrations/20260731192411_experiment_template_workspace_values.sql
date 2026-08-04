-- Experiment Template Workspace (Phase 3): atomic Experiment Value mutation functions.
-- Design: docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md

-- Private: full current state snapshot for one Experiment.
create or replace function public._experiment_snapshot(p_experiment_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'name', e.name,
    'owner_id', e.owner_id,
    'status', e.status,
    'archived_at', e.archived_at,
    'template_id', e.template_id,
    'task_id', e.task_id,
    'values', coalesce((
      select jsonb_object_agg(v.key_id, jsonb_build_object(
        'cell_revision', v.cell_revision,
        'type', k.value_type,
        'value', case k.value_type
          when 'short_text' then to_jsonb(v.text_value)
          when 'long_text' then to_jsonb(v.text_value)
          when 'url' then to_jsonb(v.text_value)
          when 'number' then to_jsonb(v.number_value)
          when 'boolean' then to_jsonb(v.boolean_value)
          when 'date_time' then to_jsonb(v.datetime_value)
          when 'single_select' then to_jsonb(v.option_id)
          when 'multi_select' then (
            select jsonb_agg(o.option_id order by o.position)
            from public.experiment_value_options o
            where o.experiment_id = v.experiment_id and o.key_id = v.key_id
          )
          when 'attachment' then (
            select jsonb_agg(a.id order by a.position)
            from public.attachments a
            where a.experiment_id = v.experiment_id
              and a.template_key_id = v.key_id
              and a.archived_at is null
          )
          else null
        end
      ))
      from public.experiment_values v
      join public.experiment_template_keys k on k.id = v.key_id
      where v.experiment_id = p_experiment_id
    ), '{}'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'caption', a.caption) order by a.position)
      from public.attachments a
      where a.experiment_id = p_experiment_id
        and a.template_key_id is not null
        and a.archived_at is null
    ), '[]'::jsonb)
  )
  from public.experiments e
  where e.id = p_experiment_id;
$function$;

-- Private: typed payload from an experiment_values row (for conflict responses).
create or replace function public._value_payload(
  p_row public.experiment_values,
  p_type text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select case p_type
    when 'short_text' then to_jsonb(p_row.text_value)
    when 'long_text' then to_jsonb(p_row.text_value)
    when 'url' then to_jsonb(p_row.text_value)
    when 'number' then to_jsonb(p_row.number_value)
    when 'boolean' then to_jsonb(p_row.boolean_value)
    when 'date_time' then to_jsonb(p_row.datetime_value)
    when 'single_select' then to_jsonb(p_row.option_id)
    when 'multi_select' then (
      select jsonb_agg(o.option_id order by o.position)
      from public.experiment_value_options o
      where o.experiment_id = p_row.experiment_id and o.key_id = p_row.key_id
    )
    else null
  end;
$function$;

create or replace function public.save_experiment_value(
  p_experiment_id uuid,
  p_key_id uuid,
  p_expected_cell_revision bigint,
  p_value jsonb,
  p_edit_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_experiment public.experiments%rowtype;
  v_key public.experiment_template_keys%rowtype;
  v_current public.experiment_values%rowtype;
  v_cell_revision bigint;
  v_version_no bigint;
  v_schema_revision bigint;
  v_number double precision;
  v_datetime timestamptz;
  v_option_id uuid;
  v_option_ids uuid[] := '{}'::uuid[];
  v_value_text text;
begin
  select * into v_experiment from public.experiments where id = p_experiment_id for update;
  if v_experiment.id is null then
    raise exception 'EXPERIMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_experiment.archived_at is not null then
    raise exception 'EXPERIMENT_ARCHIVED' using errcode = 'P0001';
  end if;

  select * into v_key
  from public.experiment_template_keys
  where id = p_key_id and template_id = v_experiment.template_id;
  if v_key.id is null then
    raise exception 'KEY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_key.archived_at is not null then
    raise exception 'KEY_ARCHIVED' using errcode = 'P0001';
  end if;
  if v_key.value_type = 'attachment' then
    raise exception 'ATTACHMENT_VALUE_UNSUPPORTED' using errcode = 'P0001';
  end if;

  select * into v_current
  from public.experiment_values
  where experiment_id = p_experiment_id and key_id = p_key_id
  for update;

  -- Validate and normalize p_value by Value Type.
  if p_value is not null then
    if v_key.value_type in ('short_text', 'long_text', 'url') then
      if jsonb_typeof(p_value) <> 'string' then
        raise exception 'VALUE_TYPE_MISMATCH' using errcode = 'P0001';
      end if;
      v_value_text := p_value #>> '{}';
      if v_key.value_type = 'url'
         and v_value_text !~ '^https?://' then
        raise exception 'URL_REQUIRED' using errcode = 'P0001';
      end if;
    elsif v_key.value_type = 'number' then
      if jsonb_typeof(p_value) <> 'number' then
        raise exception 'VALUE_TYPE_MISMATCH' using errcode = 'P0001';
      end if;
      v_number := (p_value #>> '{}')::double precision;
      if v_number = 'NaN'::double precision
         or v_number = 'Infinity'::double precision
         or v_number = '-Infinity'::double precision then
        raise exception 'NUMBER_NOT_FINITE' using errcode = 'P0001';
      end if;
    elsif v_key.value_type = 'boolean' then
      if jsonb_typeof(p_value) <> 'boolean' then
        raise exception 'VALUE_TYPE_MISMATCH' using errcode = 'P0001';
      end if;
    elsif v_key.value_type = 'date_time' then
      if jsonb_typeof(p_value) <> 'string' then
        raise exception 'VALUE_TYPE_MISMATCH' using errcode = 'P0001';
      end if;
      begin
        v_datetime := (p_value #>> '{}')::timestamptz;
      exception when others then
        raise exception 'DATETIME_REQUIRED' using errcode = 'P0001';
      end;
    elsif v_key.value_type = 'single_select' then
      if jsonb_typeof(p_value) <> 'string' then
        raise exception 'VALUE_TYPE_MISMATCH' using errcode = 'P0001';
      end if;
      v_option_id := nullif(p_value #>> '{}', '')::uuid;
      if v_option_id is null or not exists (
        select 1 from public.experiment_template_key_options
        where id = v_option_id and key_id = p_key_id and archived_at is null
      ) then
        raise exception 'OPTION_INVALID' using errcode = 'P0001';
      end if;
    elsif v_key.value_type = 'multi_select' then
      if jsonb_typeof(p_value) <> 'array' then
        raise exception 'VALUE_TYPE_MISMATCH' using errcode = 'P0001';
      end if;
      select coalesce(array_agg(x::uuid), '{}'::uuid[])
      into v_option_ids
      from jsonb_array_elements_text(p_value) x;
      if exists (
        select 1 from unnest(v_option_ids) x(id)
        where not exists (
          select 1 from public.experiment_template_key_options o
          where o.id = x.id and o.key_id = p_key_id and o.archived_at is null
        )
      ) then
        raise exception 'OPTION_INVALID' using errcode = 'P0001';
      end if;
    else
      raise exception 'VALUE_TYPE_UNSUPPORTED' using errcode = 'P0001';
    end if;
  end if;

  -- Optimistic concurrency on the cell revision.
  if v_current.experiment_id is not null then
    if p_expected_cell_revision <> v_current.cell_revision then
      return jsonb_build_object(
        'status', 'conflict',
        'remote', public._value_payload(v_current, v_key.value_type),
        'remote_cell_revision', v_current.cell_revision
      );
    end if;
    v_cell_revision := v_current.cell_revision + 1;
  else
    if p_expected_cell_revision <> 0 then
      return jsonb_build_object(
        'status', 'conflict',
        'remote', null,
        'remote_cell_revision', 0
      );
    end if;
    v_cell_revision := 1;
  end if;

  -- Apply.
  if p_value is null then
    delete from public.experiment_value_options
    where experiment_id = p_experiment_id and key_id = p_key_id;
    delete from public.experiment_values
    where experiment_id = p_experiment_id and key_id = p_key_id;
  elsif v_key.value_type = 'multi_select' then
    delete from public.experiment_value_options
    where experiment_id = p_experiment_id and key_id = p_key_id;
    if coalesce(array_length(v_option_ids, 1), 0) = 0 then
      delete from public.experiment_values
      where experiment_id = p_experiment_id and key_id = p_key_id;
    elsif v_current.experiment_id is null then
      insert into public.experiment_values (
        experiment_id, template_id, key_id, cell_revision
      ) values (
        p_experiment_id, v_experiment.template_id, p_key_id, 1
      );
      insert into public.experiment_value_options (
        experiment_id, template_id, key_id, option_id, position
      )
      select p_experiment_id, v_experiment.template_id, p_key_id, x.id, x.ordinality - 1
      from unnest(v_option_ids) with ordinality x(id, ordinality);
    else
      update public.experiment_values
      set cell_revision = v_cell_revision, updated_at = now()
      where experiment_id = p_experiment_id and key_id = p_key_id;
      insert into public.experiment_value_options (
        experiment_id, template_id, key_id, option_id, position
      )
      select p_experiment_id, v_experiment.template_id, p_key_id, x.id, x.ordinality - 1
      from unnest(v_option_ids) with ordinality x(id, ordinality);
    end if;
  elsif v_key.value_type = 'single_select' then
    if v_current.experiment_id is null then
      insert into public.experiment_values (
        experiment_id, template_id, key_id, option_id, cell_revision
      ) values (
        p_experiment_id, v_experiment.template_id, p_key_id, v_option_id, 1
      );
    else
      update public.experiment_values
      set option_id = v_option_id,
          text_value = null,
          number_value = null,
          boolean_value = null,
          datetime_value = null,
          cell_revision = v_cell_revision,
          updated_at = now()
      where experiment_id = p_experiment_id and key_id = p_key_id;
    end if;
  elsif v_key.value_type = 'number' then
    if v_current.experiment_id is null then
      insert into public.experiment_values (
        experiment_id, template_id, key_id, number_value, cell_revision
      ) values (
        p_experiment_id, v_experiment.template_id, p_key_id, v_number, 1
      );
    else
      update public.experiment_values
      set number_value = v_number,
          text_value = null,
          boolean_value = null,
          datetime_value = null,
          option_id = null,
          cell_revision = v_cell_revision,
          updated_at = now()
      where experiment_id = p_experiment_id and key_id = p_key_id;
    end if;
  elsif v_key.value_type = 'boolean' then
    if v_current.experiment_id is null then
      insert into public.experiment_values (
        experiment_id, template_id, key_id, boolean_value, cell_revision
      ) values (
        p_experiment_id, v_experiment.template_id, p_key_id,
        (p_value #>> '{}')::boolean, 1
      );
    else
      update public.experiment_values
      set boolean_value = (p_value #>> '{}')::boolean,
          text_value = null,
          number_value = null,
          datetime_value = null,
          option_id = null,
          cell_revision = v_cell_revision,
          updated_at = now()
      where experiment_id = p_experiment_id and key_id = p_key_id;
    end if;
  elsif v_key.value_type = 'date_time' then
    if v_current.experiment_id is null then
      insert into public.experiment_values (
        experiment_id, template_id, key_id, datetime_value, cell_revision
      ) values (
        p_experiment_id, v_experiment.template_id, p_key_id, v_datetime, 1
      );
    else
      update public.experiment_values
      set datetime_value = v_datetime,
          text_value = null,
          number_value = null,
          boolean_value = null,
          option_id = null,
          cell_revision = v_cell_revision,
          updated_at = now()
      where experiment_id = p_experiment_id and key_id = p_key_id;
    end if;
  else -- short_text, long_text, url
    if v_current.experiment_id is null then
      insert into public.experiment_values (
        experiment_id, template_id, key_id, text_value, cell_revision
      ) values (
        p_experiment_id, v_experiment.template_id, p_key_id, v_value_text, 1
      );
    else
      update public.experiment_values
      set text_value = v_value_text,
          number_value = null,
          boolean_value = null,
          datetime_value = null,
          option_id = null,
          cell_revision = v_cell_revision,
          updated_at = now()
      where experiment_id = p_experiment_id and key_id = p_key_id;
    end if;
  end if;

  update public.experiments
  set core_revision = core_revision + 1, updated_at = now()
  where id = p_experiment_id;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_versions
  where experiment_id = p_experiment_id;
  select schema_revision into v_schema_revision
  from public.experiment_templates
  where id = v_experiment.template_id;

  insert into public.experiment_versions (
    experiment_id, version_no, reason, source, edit_session_id,
    template_schema_revision, snapshot, actor_member_id
  ) values (
    p_experiment_id, v_version_no, 'Value edited', 'browser', p_edit_session_id,
    v_schema_revision, public._experiment_snapshot(p_experiment_id), null
  );

  return jsonb_build_object(
    'status', 'ok',
    'cell_revision', v_cell_revision,
    'version_no', v_version_no
  );
end
$function$;

create or replace function public.sync_experiment_attachment_value(
  p_experiment_id uuid,
  p_key_id uuid,
  p_active_attachment_ids uuid[],
  p_edit_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_experiment public.experiments%rowtype;
  v_key public.experiment_template_keys%rowtype;
  v_current public.experiment_values%rowtype;
  v_cell_revision bigint;
  v_version_no bigint;
  v_schema_revision bigint;
begin
  select * into v_experiment from public.experiments where id = p_experiment_id for update;
  if v_experiment.id is null then
    raise exception 'EXPERIMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_experiment.archived_at is not null then
    raise exception 'EXPERIMENT_ARCHIVED' using errcode = 'P0001';
  end if;
  select * into v_key
  from public.experiment_template_keys
  where id = p_key_id and template_id = v_experiment.template_id;
  if v_key.id is null or v_key.value_type <> 'attachment' or v_key.archived_at is not null then
    raise exception 'ATTACHMENT_KEY_INVALID' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_active_attachment_ids, '{}'::uuid[])) x(id)
    where not exists (
      select 1 from public.attachments a
      where a.id = x.id
        and a.experiment_id = p_experiment_id
        and a.template_key_id = p_key_id
        and a.archived_at is null
    )
  ) then
    raise exception 'ATTACHMENT_TEMPLATE_MISMATCH' using errcode = 'P0001';
  end if;

  update public.attachments
  set archived_at = now()
  where experiment_id = p_experiment_id
    and template_key_id = p_key_id
    and archived_at is null
    and not (id = any(coalesce(p_active_attachment_ids, '{}'::uuid[])));

  select * into v_current
  from public.experiment_values
  where experiment_id = p_experiment_id and key_id = p_key_id
  for update;

  if coalesce(array_length(p_active_attachment_ids, 1), 0) = 0 then
    delete from public.experiment_values
    where experiment_id = p_experiment_id and key_id = p_key_id;
    v_cell_revision := 0;
  elsif v_current.experiment_id is null then
    insert into public.experiment_values (
      experiment_id, template_id, key_id, cell_revision
    ) values (
      p_experiment_id, v_experiment.template_id, p_key_id, 1
    );
    v_cell_revision := 1;
  else
    v_cell_revision := v_current.cell_revision + 1;
    update public.experiment_values
    set cell_revision = v_cell_revision, updated_at = now()
    where experiment_id = p_experiment_id and key_id = p_key_id;
  end if;

  update public.experiments
  set core_revision = core_revision + 1, updated_at = now()
  where id = p_experiment_id;
  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_versions
  where experiment_id = p_experiment_id;
  select schema_revision into v_schema_revision
  from public.experiment_templates
  where id = v_experiment.template_id;
  insert into public.experiment_versions (
    experiment_id, version_no, reason, source, edit_session_id,
    template_schema_revision, snapshot, actor_member_id
  ) values (
    p_experiment_id, v_version_no, 'Attachments updated', 'browser', p_edit_session_id,
    v_schema_revision, public._experiment_snapshot(p_experiment_id), null
  );

  return jsonb_build_object(
    'status', 'ok',
    'cell_revision', v_cell_revision,
    'version_no', v_version_no
  );
end
$function$;

create or replace function public.save_experiment_core(
  p_experiment_id uuid,
  p_name text,
  p_owner_id uuid,
  p_status text,
  p_edit_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_experiment public.experiments%rowtype;
  v_version_no bigint;
  v_schema_revision bigint;
begin
  select * into v_experiment from public.experiments where id = p_experiment_id for update;
  if v_experiment.id is null then
    raise exception 'EXPERIMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_experiment.archived_at is not null then
    raise exception 'EXPERIMENT_ARCHIVED' using errcode = 'P0001';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'EXPERIMENT_NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if p_status is null or p_status not in (
    'planned', 'running', 'analyzing', 'completed', 'blocked', 'cancelled'
  ) then
    raise exception 'STATUS_INVALID' using errcode = 'P0001';
  end if;

  update public.experiments
  set name = trim(p_name),
      owner_id = p_owner_id,
      status = p_status,
      core_revision = core_revision + 1,
      updated_at = now()
  where id = p_experiment_id;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_versions
  where experiment_id = p_experiment_id;
  select schema_revision into v_schema_revision
  from public.experiment_templates
  where id = v_experiment.template_id;
  insert into public.experiment_versions (
    experiment_id, version_no, reason, source, edit_session_id,
    template_schema_revision, snapshot, actor_member_id
  ) values (
    p_experiment_id, v_version_no, 'Details updated', 'browser', p_edit_session_id,
    v_schema_revision, public._experiment_snapshot(p_experiment_id), null
  );

  return jsonb_build_object(
    'status', 'ok',
    'version_no', v_version_no,
    'core_revision', v_experiment.core_revision + 1
  );
end
$function$;

create or replace function public._experiment_required_missing(p_experiment_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_experiment public.experiments%rowtype;
  v_key public.experiment_template_keys%rowtype;
begin
  select * into v_experiment from public.experiments where id = p_experiment_id;
  if v_experiment.id is null or v_experiment.template_id is null then
    return true;
  end if;
  for v_key in
    select k.* from public.experiment_template_keys k
    where k.template_id = v_experiment.template_id
      and k.required
      and k.archived_at is null
  loop
    if v_key.value_type = 'attachment' then
      if not exists (
        select 1 from public.attachments a
        where a.experiment_id = p_experiment_id
          and a.template_key_id = v_key.id
          and a.archived_at is null
      ) then return true; end if;
    elsif v_key.value_type = 'multi_select' then
      if not exists (
        select 1 from public.experiment_value_options o
        where o.experiment_id = p_experiment_id and o.key_id = v_key.id
      ) then return true; end if;
    elsif v_key.value_type = 'single_select' then
      if not exists (
        select 1 from public.experiment_values v
        where v.experiment_id = p_experiment_id and v.key_id = v_key.id
          and v.option_id is not null
      ) then return true; end if;
    elsif v_key.value_type = 'number' then
      if not exists (
        select 1 from public.experiment_values v
        where v.experiment_id = p_experiment_id and v.key_id = v_key.id
          and v.number_value is not null
      ) then return true; end if;
    elsif v_key.value_type = 'boolean' then
      if not exists (
        select 1 from public.experiment_values v
        where v.experiment_id = p_experiment_id and v.key_id = v_key.id
          and v.boolean_value is not null
      ) then return true; end if;
    elsif v_key.value_type = 'date_time' then
      if not exists (
        select 1 from public.experiment_values v
        where v.experiment_id = p_experiment_id and v.key_id = v_key.id
          and v.datetime_value is not null
      ) then return true; end if;
    else
      if not exists (
        select 1 from public.experiment_values v
        where v.experiment_id = p_experiment_id and v.key_id = v_key.id
          and v.text_value is not null
      ) then return true; end if;
    end if;
  end loop;
  return false;
end
$function$;

create or replace function public.archive_experiment(p_experiment_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_experiment public.experiments%rowtype;
  v_version_no bigint;
  v_schema_revision bigint;
begin
  select * into v_experiment from public.experiments where id = p_experiment_id for update;
  if v_experiment.id is null then
    raise exception 'EXPERIMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_experiment.archived_at is not null then
    raise exception 'EXPERIMENT_ALREADY_ARCHIVED' using errcode = 'P0001';
  end if;
  if public._experiment_required_missing(p_experiment_id) then
    raise exception 'REQUIRED_VALUES_MISSING' using errcode = 'P0001';
  end if;

  update public.experiments
  set archived_at = now(), core_revision = core_revision + 1, updated_at = now()
  where id = p_experiment_id;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_versions
  where experiment_id = p_experiment_id;
  select schema_revision into v_schema_revision
  from public.experiment_templates
  where id = v_experiment.template_id;
  insert into public.experiment_versions (
    experiment_id, version_no, reason, source, template_schema_revision,
    snapshot, actor_member_id
  ) values (
    p_experiment_id, v_version_no, 'Archived', 'browser', v_schema_revision,
    public._experiment_snapshot(p_experiment_id), null
  );

  return jsonb_build_object('status', 'ok', 'version_no', v_version_no);
end
$function$;

create or replace function public.unarchive_experiment(p_experiment_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_experiment public.experiments%rowtype;
  v_version_no bigint;
  v_schema_revision bigint;
begin
  select * into v_experiment from public.experiments where id = p_experiment_id for update;
  if v_experiment.id is null then
    raise exception 'EXPERIMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_experiment.archived_at is null then
    raise exception 'EXPERIMENT_NOT_ARCHIVED' using errcode = 'P0001';
  end if;

  update public.experiments
  set archived_at = null, core_revision = core_revision + 1, updated_at = now()
  where id = p_experiment_id;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_versions
  where experiment_id = p_experiment_id;
  select schema_revision into v_schema_revision
  from public.experiment_templates
  where id = v_experiment.template_id;
  insert into public.experiment_versions (
    experiment_id, version_no, reason, source, template_schema_revision,
    snapshot, actor_member_id
  ) values (
    p_experiment_id, v_version_no, 'Unarchived', 'browser', v_schema_revision,
    public._experiment_snapshot(p_experiment_id), null
  );

  return jsonb_build_object('status', 'ok', 'version_no', v_version_no);
end
$function$;

create or replace function public.restore_experiment_version(
  p_experiment_id uuid,
  p_version_no bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_experiment public.experiments%rowtype;
  v_version public.experiment_versions%rowtype;
  v_entry record;
  v_key_id uuid;
  v_value jsonb;
  v_type text;
  v_new_version_no bigint;
  v_schema_revision bigint;
  v_new_core_revision bigint;
begin
  select * into v_experiment from public.experiments where id = p_experiment_id for update;
  if v_experiment.id is null then
    raise exception 'EXPERIMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_experiment.archived_at is not null then
    raise exception 'EXPERIMENT_ARCHIVED' using errcode = 'P0001';
  end if;
  select * into v_version
  from public.experiment_versions
  where experiment_id = p_experiment_id and version_no = p_version_no;
  if v_version.id is null then
    raise exception 'VERSION_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Restore core fields.
  update public.experiments
  set name = v_version.snapshot->>'name',
      owner_id = nullif(v_version.snapshot->>'owner_id', '')::uuid,
      status = v_version.snapshot->>'status',
      updated_at = now()
  where id = p_experiment_id;

  -- Restore Values for Keys still active in the current Template.
  for v_entry in
    select key, value from jsonb_each(coalesce(v_version.snapshot->'values', '{}'::jsonb))
  loop
    v_key_id := v_entry.key::uuid;
    v_type := v_entry.value->>'type';
    v_value := v_entry.value->'value';
    if v_type = 'attachment' then
      update public.attachments
      set archived_at = null
      where experiment_id = p_experiment_id
        and id in (select x::uuid from jsonb_array_elements_text(coalesce(v_value, '[]'::jsonb)) x);
      continue;
    end if;
    if not exists (
      select 1 from public.experiment_template_keys k
      where k.id = v_key_id
        and k.template_id = v_experiment.template_id
        and k.archived_at is null
    ) then
      continue;
    end if;
    if v_value is null then
      delete from public.experiment_value_options
      where experiment_id = p_experiment_id and key_id = v_key_id;
      delete from public.experiment_values
      where experiment_id = p_experiment_id and key_id = v_key_id;
    elsif v_type = 'multi_select' then
      delete from public.experiment_value_options
      where experiment_id = p_experiment_id and key_id = v_key_id;
      insert into public.experiment_value_options (
        experiment_id, template_id, key_id, option_id, position
      )
      select p_experiment_id, v_experiment.template_id, v_key_id,
             x::uuid, ordinality - 1
      from jsonb_array_elements_text(v_value) with ordinality x(value, ordinality);
      if not exists (
        select 1 from public.experiment_values
        where experiment_id = p_experiment_id and key_id = v_key_id
      ) then
        insert into public.experiment_values (
          experiment_id, template_id, key_id, cell_revision
        ) values (p_experiment_id, v_experiment.template_id, v_key_id, 1);
      end if;
    else
      if not exists (
        select 1 from public.experiment_values
        where experiment_id = p_experiment_id and key_id = v_key_id
      ) then
        insert into public.experiment_values (
          experiment_id, template_id, key_id, cell_revision
        ) values (p_experiment_id, v_experiment.template_id, v_key_id, 1);
      end if;
      update public.experiment_values
      set text_value = case when v_type in ('short_text','long_text','url') then v_value #>> '{}' end,
          number_value = case when v_type = 'number' then (v_value #>> '{}')::double precision end,
          boolean_value = case when v_type = 'boolean' then (v_value #>> '{}')::boolean end,
          datetime_value = case when v_type = 'date_time' then (v_value #>> '{}')::timestamptz end,
          option_id = case when v_type = 'single_select' then nullif(v_value #>> '{}', '')::uuid end,
          cell_revision = cell_revision + 1,
          updated_at = now()
      where experiment_id = p_experiment_id and key_id = v_key_id;
    end if;
  end loop;

  update public.experiments
  set core_revision = core_revision + 1, updated_at = now()
  where id = p_experiment_id
  returning core_revision into v_new_core_revision;

  select coalesce(max(version_no), 0) + 1 into v_new_version_no
  from public.experiment_versions
  where experiment_id = p_experiment_id;
  select schema_revision into v_schema_revision
  from public.experiment_templates
  where id = v_experiment.template_id;
  insert into public.experiment_versions (
    experiment_id, version_no, reason, source, template_schema_revision,
    snapshot, actor_member_id
  ) values (
    p_experiment_id, v_new_version_no,
    format('Restored from version %s', p_version_no),
    'browser', v_schema_revision,
    public._experiment_snapshot(p_experiment_id), null
  );

  return jsonb_build_object(
    'status', 'ok',
    'version_no', v_new_version_no,
    'core_revision', v_new_core_revision
  );
end
$function$;

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
    task_id, template_id, owner_id, name, status, position,
    baseline_experiment_id, data_spec, object_spec, environment_spec,
    config, notes, metrics, featured_metric_keys, result_summary,
    decision_outcome, decision_notes
  ) values (
    v_source.task_id, v_source.template_id, p_owner_id, trim(p_name), 'planned',
    p_position, v_source.id, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
    '{}'::jsonb, '', '{}'::jsonb, '{}', '', null, ''
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

-- Grants ----------------------------------------------------------------------
grant execute on function
  public.save_experiment_value(uuid, uuid, bigint, jsonb, uuid),
  public.sync_experiment_attachment_value(uuid, uuid, uuid[], uuid),
  public.save_experiment_core(uuid, text, uuid, text, uuid),
  public.archive_experiment(uuid),
  public.unarchive_experiment(uuid),
  public.restore_experiment_version(uuid, bigint),
  public.duplicate_experiment(uuid, text, uuid, double precision, uuid[], uuid)
to authenticated;

revoke execute on function
  public.save_experiment_value(uuid, uuid, bigint, jsonb, uuid),
  public.sync_experiment_attachment_value(uuid, uuid, uuid[], uuid),
  public.save_experiment_core(uuid, text, uuid, text, uuid),
  public.archive_experiment(uuid),
  public.unarchive_experiment(uuid),
  public.restore_experiment_version(uuid, bigint),
  public.duplicate_experiment(uuid, text, uuid, double precision, uuid[], uuid)
from public, anon;

revoke execute on function
  public._experiment_snapshot(uuid),
  public._value_payload(public.experiment_values, text),
  public._experiment_required_missing(uuid)
from public, anon, authenticated;
