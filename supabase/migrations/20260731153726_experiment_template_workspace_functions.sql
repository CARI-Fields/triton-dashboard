-- Experiment Template Workspace (Phase 2): atomic Template mutation functions.
-- Design: docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md

-- Private snapshot builder: full ordered Field/Key/option state including archive flags.
create or replace function public._experiment_template_snapshot(p_template_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id,
      'label', f.label,
      'color_token', f.color_token,
      'position', f.position,
      'archived_at', f.archived_at,
      'keys', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', k.id,
          'key', k.key,
          'value_type', k.value_type,
          'required', k.required,
          'position', k.position,
          'archived_at', k.archived_at,
          'options', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', o.id,
              'label', o.label,
              'position', o.position,
              'archived_at', o.archived_at
            ) order by o.position)
            from public.experiment_template_key_options o
            where o.key_id = k.id
          ), '[]'::jsonb)
        ) order by k.position)
        from public.experiment_template_keys k
        where k.field_id = f.id
      ), '[]'::jsonb)
    ) order by f.position)
    from public.experiment_template_fields f
    where f.template_id = p_template_id
  ), '[]'::jsonb);
$function$;

create or replace function public.save_experiment_template(
  p_template_id uuid,
  p_name text,
  p_description text,
  p_expected_schema_revision bigint,
  p_fields jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_template public.experiment_templates%rowtype;
  v_schema_revision bigint;
  v_version_no bigint;
  v_field jsonb;
  v_field_id uuid;
  v_key jsonb;
  v_key_id uuid;
  v_option jsonb;
  v_option_id uuid;
  v_kept_field_ids uuid[] := '{}'::uuid[];
  v_kept_key_ids uuid[] := '{}'::uuid[];
  v_kept_option_ids uuid[] := '{}'::uuid[];
  v_referenced boolean;
begin
  if p_name is null or trim(p_name) = '' then
    raise exception 'TEMPLATE_NAME_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_template
  from public.experiment_templates
  where id = p_template_id
  for update;

  if v_template.id is null then
    raise exception 'TEMPLATE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_template.archived_at is not null then
    raise exception 'TEMPLATE_ARCHIVED' using errcode = 'P0001';
  end if;
  if v_template.schema_revision <> p_expected_schema_revision then
    raise exception 'TEMPLATE_SCHEMA_REVISION_CONFLICT' using errcode = 'P0001';
  end if;

  update public.experiment_templates
  set name = trim(p_name),
      description = coalesce(p_description, ''),
      updated_at = now()
  where id = p_template_id;

  for v_field in select * from jsonb_array_elements(coalesce(p_fields, '[]'::jsonb)) loop
    if v_field->>'archived' = 'true' then
      v_field_id := nullif(v_field->>'id', '')::uuid;
      if v_field_id is null then
        raise exception 'ARCHIVED_FIELD_REQUIRES_ID' using errcode = 'P0001';
      end if;
      update public.experiment_template_fields
      set archived_at = coalesce(archived_at, now()), updated_at = now()
      where id = v_field_id and template_id = p_template_id;
      if not found then raise exception 'FIELD_TEMPLATE_MISMATCH' using errcode = 'P0001'; end if;
      v_kept_field_ids := array_append(v_kept_field_ids, v_field_id);
      continue;
    end if;

    if v_field->>'label' is null or trim(v_field->>'label') = '' then
      raise exception 'FIELD_LABEL_REQUIRED' using errcode = 'P0001';
    end if;
    v_field_id := nullif(v_field->>'id', '')::uuid;
    if v_field_id is null then
      insert into public.experiment_template_fields (
        template_id, label, color_token, position
      ) values (
        p_template_id,
        trim(v_field->>'label'),
        coalesce(nullif(v_field->>'color_token', ''), 'blue'),
        (v_field->>'position')::integer
      )
      returning id into v_field_id;
    else
      update public.experiment_template_fields
      set label = trim(v_field->>'label'),
          color_token = coalesce(nullif(v_field->>'color_token', ''), color_token),
          position = (v_field->>'position')::integer,
          archived_at = null,
          updated_at = now()
      where id = v_field_id and template_id = p_template_id;
      if not found then
        if exists (select 1 from public.experiment_template_fields where id = v_field_id) then
          raise exception 'FIELD_TEMPLATE_MISMATCH' using errcode = 'P0001';
        end if;
        insert into public.experiment_template_fields (id, template_id, label, color_token, position)
        values (
          v_field_id, p_template_id,
          trim(v_field->>'label'),
          coalesce(nullif(v_field->>'color_token', ''), 'blue'),
          (v_field->>'position')::integer
        );
      end if;
    end if;
    v_kept_field_ids := array_append(v_kept_field_ids, v_field_id);

    for v_key in select * from jsonb_array_elements(coalesce(v_field->'keys', '[]'::jsonb)) loop
      if v_key->>'archived' = 'true' then
        v_key_id := nullif(v_key->>'id', '')::uuid;
        if v_key_id is null then
          raise exception 'ARCHIVED_KEY_REQUIRES_ID' using errcode = 'P0001';
        end if;
        update public.experiment_template_keys
        set archived_at = coalesce(archived_at, now()), updated_at = now()
        where id = v_key_id and template_id = p_template_id;
        if not found then raise exception 'KEY_TEMPLATE_MISMATCH' using errcode = 'P0001'; end if;
        v_kept_key_ids := array_append(v_kept_key_ids, v_key_id);
        continue;
      end if;

      if v_key->>'key' is null or trim(v_key->>'key') = '' then
        raise exception 'KEY_NAME_REQUIRED' using errcode = 'P0001';
      end if;
      v_key_id := nullif(v_key->>'id', '')::uuid;
      if v_key_id is null then
        insert into public.experiment_template_keys (
          template_id, field_id, key, value_type, required, position
        ) values (
          p_template_id,
          v_field_id,
          trim(v_key->>'key'),
          v_key->>'value_type',
          coalesce((v_key->>'required')::boolean, false),
          (v_key->>'position')::integer
        )
        returning id into v_key_id;
      else
        if exists (
          select 1 from public.experiment_template_keys
          where id = v_key_id and template_id = p_template_id
        ) then
          if exists (
            select 1 from public.experiment_values
            where key_id = v_key_id and template_id = p_template_id
          ) and (
            select value_type from public.experiment_template_keys
            where id = v_key_id and template_id = p_template_id
          ) is distinct from v_key->>'value_type' then
            raise exception 'POPULATED_KEY_TYPE_LOCKED' using errcode = 'P0001';
          end if;
          update public.experiment_template_keys
          set key = trim(v_key->>'key'),
              field_id = v_field_id,
              value_type = v_key->>'value_type',
              required = coalesce((v_key->>'required')::boolean, required),
              position = (v_key->>'position')::integer,
              archived_at = null,
              updated_at = now()
          where id = v_key_id and template_id = p_template_id;
        else
          if exists (select 1 from public.experiment_template_keys where id = v_key_id) then
            raise exception 'KEY_TEMPLATE_MISMATCH' using errcode = 'P0001';
          end if;
          insert into public.experiment_template_keys (id, template_id, field_id, key, value_type, required, position)
          values (
            v_key_id, p_template_id, v_field_id,
            trim(v_key->>'key'), v_key->>'value_type',
            coalesce((v_key->>'required')::boolean, false),
            (v_key->>'position')::integer
          );
        end if;
      end if;
      v_kept_key_ids := array_append(v_kept_key_ids, v_key_id);

      for v_option in select * from jsonb_array_elements(coalesce(v_key->'options', '[]'::jsonb)) loop
        if v_option->>'archived' = 'true' then
          v_option_id := nullif(v_option->>'id', '')::uuid;
          if v_option_id is null then
            raise exception 'ARCHIVED_OPTION_REQUIRES_ID' using errcode = 'P0001';
          end if;
          update public.experiment_template_key_options
          set archived_at = coalesce(archived_at, now())
          where id = v_option_id and template_id = p_template_id;
          if not found then raise exception 'OPTION_TEMPLATE_MISMATCH' using errcode = 'P0001'; end if;
          v_kept_option_ids := array_append(v_kept_option_ids, v_option_id);
          continue;
        end if;

        if v_option->>'label' is null or trim(v_option->>'label') = '' then
          raise exception 'OPTION_LABEL_REQUIRED' using errcode = 'P0001';
        end if;
        v_option_id := nullif(v_option->>'id', '')::uuid;
        if v_option_id is null then
          insert into public.experiment_template_key_options (
            template_id, key_id, label, position
          ) values (
            p_template_id, v_key_id, trim(v_option->>'label'), (v_option->>'position')::integer
          )
          returning id into v_option_id;
        else
          update public.experiment_template_key_options
          set label = trim(v_option->>'label'),
              position = (v_option->>'position')::integer,
              archived_at = null
          where id = v_option_id and template_id = p_template_id;
          if not found then
            if exists (select 1 from public.experiment_template_key_options where id = v_option_id) then
              raise exception 'OPTION_TEMPLATE_MISMATCH' using errcode = 'P0001';
            end if;
            insert into public.experiment_template_key_options (id, template_id, key_id, label, position)
            values (v_option_id, p_template_id, v_key_id, trim(v_option->>'label'), (v_option->>'position')::integer);
          end if;
        end if;
        v_kept_option_ids := array_append(v_kept_option_ids, v_option_id);
      end loop;
    end loop;
  end loop;

  -- Removed active options: archive if referenced, else hard delete.
  for v_option_id in
    select id from public.experiment_template_key_options
    where template_id = p_template_id and archived_at is null
      and not (id = any(v_kept_option_ids))
  loop
    select exists (
      select 1 from public.experiment_value_options
      where option_id = v_option_id
    ) into v_referenced;
    if v_referenced then
      update public.experiment_template_key_options
      set archived_at = now()
      where id = v_option_id;
    else
      delete from public.experiment_template_key_options
      where id = v_option_id;
    end if;
  end loop;

  -- Removed active keys: archive if referenced, else hard delete (options first).
  for v_key_id in
    select id from public.experiment_template_keys
    where template_id = p_template_id and archived_at is null
      and not (id = any(v_kept_key_ids))
  loop
    select exists (
      select 1 from public.experiment_values where key_id = v_key_id
      union all
      select 1 from public.experiment_value_options where key_id = v_key_id
      union all
      select 1 from public.attachments where template_key_id = v_key_id
    ) into v_referenced;
    if v_referenced then
      update public.experiment_template_keys
      set archived_at = now(), updated_at = now()
      where id = v_key_id;
    else
      delete from public.experiment_template_key_options where key_id = v_key_id;
      delete from public.experiment_template_keys where id = v_key_id;
    end if;
  end loop;

  -- Removed active fields: archive if it still owns any Key rows, else hard delete.
  for v_field_id in
    select id from public.experiment_template_fields
    where template_id = p_template_id and archived_at is null
      and not (id = any(v_kept_field_ids))
  loop
    select exists (
      select 1 from public.experiment_template_keys
      where field_id = v_field_id
    ) into v_referenced;
    if v_referenced then
      update public.experiment_template_fields
      set archived_at = now(), updated_at = now()
      where id = v_field_id;
    else
      delete from public.experiment_template_fields where id = v_field_id;
    end if;
  end loop;

  v_schema_revision := v_template.schema_revision + 1;
  update public.experiment_templates
  set schema_revision = v_schema_revision, updated_at = now()
  where id = p_template_id;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_template_versions
  where template_id = p_template_id;

  insert into public.experiment_template_versions (
    template_id, version_no, reason, source, schema_revision, snapshot, actor_member_id
  ) values (
    p_template_id, v_version_no, 'Schema edited', 'browser', v_schema_revision,
    public._experiment_template_snapshot(p_template_id), null
  );

  return jsonb_build_object(
    'template_id', p_template_id,
    'schema_revision', v_schema_revision,
    'version_no', v_version_no
  );
end
$function$;

create or replace function public.archive_experiment_template(p_template_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_template public.experiment_templates%rowtype;
  v_schema_revision bigint;
  v_version_no bigint;
begin
  select * into v_template
  from public.experiment_templates
  where id = p_template_id
  for update;
  if v_template.id is null then
    raise exception 'TEMPLATE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_template.archived_at is not null then
    raise exception 'TEMPLATE_ALREADY_ARCHIVED' using errcode = 'P0001';
  end if;

  update public.experiment_templates
  set archived_at = now(),
      schema_revision = schema_revision + 1,
      updated_at = now()
  where id = p_template_id
  returning schema_revision into v_schema_revision;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_template_versions
  where template_id = p_template_id;

  insert into public.experiment_template_versions (
    template_id, version_no, reason, source, schema_revision, snapshot, actor_member_id
  ) values (
    p_template_id, v_version_no, 'Archived', 'browser', v_schema_revision,
    public._experiment_template_snapshot(p_template_id), null
  );

  return jsonb_build_object(
    'template_id', p_template_id,
    'schema_revision', v_schema_revision,
    'version_no', v_version_no
  );
end
$function$;

create or replace function public.unarchive_experiment_template(p_template_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_template public.experiment_templates%rowtype;
  v_schema_revision bigint;
  v_version_no bigint;
begin
  select * into v_template
  from public.experiment_templates
  where id = p_template_id
  for update;
  if v_template.id is null then
    raise exception 'TEMPLATE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_template.archived_at is null then
    raise exception 'TEMPLATE_NOT_ARCHIVED' using errcode = 'P0001';
  end if;

  update public.experiment_templates
  set archived_at = null,
      schema_revision = schema_revision + 1,
      updated_at = now()
  where id = p_template_id
  returning schema_revision into v_schema_revision;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.experiment_template_versions
  where template_id = p_template_id;

  insert into public.experiment_template_versions (
    template_id, version_no, reason, source, schema_revision, snapshot, actor_member_id
  ) values (
    p_template_id, v_version_no, 'Unarchived', 'browser', v_schema_revision,
    public._experiment_template_snapshot(p_template_id), null
  );

  return jsonb_build_object(
    'template_id', p_template_id,
    'schema_revision', v_schema_revision,
    'version_no', v_version_no
  );
end
$function$;

-- Prevent creating Experiments from an archived Template.
create or replace function public.guard_experiment_creation_template_active()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_archived_at timestamptz;
begin
  if new.template_id is not null then
    select archived_at into v_archived_at
    from public.experiment_templates
    where id = new.template_id;
    if v_archived_at is not null then
      raise exception 'TEMPLATE_ARCHIVED' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists experiments_creation_template_active on public.experiments;
create trigger experiments_creation_template_active
  before insert on public.experiments
  for each row execute function public.guard_experiment_creation_template_active();

-- Grants ----------------------------------------------------------------------
grant execute on function
  public.save_experiment_template(uuid, text, text, bigint, jsonb),
  public.archive_experiment_template(uuid),
  public.unarchive_experiment_template(uuid)
to authenticated;

revoke execute on function
  public.save_experiment_template(uuid, text, text, bigint, jsonb),
  public.archive_experiment_template(uuid),
  public.unarchive_experiment_template(uuid)
from public, anon;

revoke execute on function
  public._experiment_template_snapshot(uuid),
  public.guard_experiment_creation_template_active()
from public, anon, authenticated;
