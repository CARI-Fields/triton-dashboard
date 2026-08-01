-- Experiment Template Workspace (Phase 6): legacy data migration cutover.
-- Design: docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md

do $legacy_cutover$
declare
  v_template_id uuid := '11111111-1111-4111-8111-111111111111';
  v_field_pos int;
  v_key_pos int;
  v_field_id uuid;
  v_key_id uuid;
  v_metric text;
  v_config_key text;
  v_config_type text;
  v_dataset_max int;
  v_idx int;
  v_fixed_key record;
  v_dataset_key record;
  v_experiment record;
  v_datasets jsonb;
  v_object jsonb;
  v_environment jsonb;
  v_config jsonb;
  v_metrics jsonb;
  v_option_id uuid;
  v_attachment_key uuid;
  v_schema_revision bigint := 1;
begin
  -- 1. Create the Imported Legacy Template (idempotent).
  insert into public.experiment_templates (id, name, description)
  values (
    v_template_id,
    'Imported legacy experiments',
    'Imported from the legacy fixed content model.'
  )
  on conflict (id) do nothing;

  -- 2. Field Labels with stable positions.
  for v_idx in 1..9 loop
    select id into v_field_id
    from public.experiment_template_fields
    where template_id = v_template_id
      and label = (array[
        'Data', 'Object', 'Environment', 'Config', 'Result',
        'Decision', 'Note', 'Lifecycle', 'Attachments'
      ])[v_idx];
    if v_field_id is null then
      insert into public.experiment_template_fields (
        template_id, label, color_token, position
      ) values (
        v_template_id,
        (array[
          'Data', 'Object', 'Environment', 'Config', 'Result',
          'Decision', 'Note', 'Lifecycle', 'Attachments'
        ])[v_idx],
        (array['blue', 'green', 'amber', 'purple', 'rose', 'teal', 'blue', 'green', 'amber'])[v_idx],
        v_idx
      )
      returning id into v_field_id;
    end if;
  end loop;

  -- 3. Fixed Keys (idempotent upsert by template + key name).
  v_key_pos := 0;
  for v_fixed_key in
    select field_label, key, value_type
    from (values
      ('Object', 'model', 'short_text'),
      ('Object', 'harness', 'short_text'),
      ('Object', 'parent_harness', 'short_text'),
      ('Object', 'prompt', 'long_text'),
      ('Object', 'prompt_change', 'long_text'),
      ('Object', 'skills', 'long_text'),
      ('Object', 'tools', 'long_text'),
      ('Environment', 'platform', 'short_text'),
      ('Environment', 'server', 'short_text'),
      ('Environment', 'devices', 'long_text'),
      ('Environment', 'hardware', 'short_text'),
      ('Environment', 'evaluator', 'short_text'),
      ('Environment', 'revision', 'short_text'),
      ('Environment', 'precision_policy', 'short_text'),
      ('Result', 'result_summary', 'long_text'),
      ('Decision', 'decision_outcome', 'single_select'),
      ('Decision', 'decision_notes', 'long_text'),
      ('Note', 'notes', 'long_text'),
      ('Lifecycle', 'started_at', 'date_time'),
      ('Lifecycle', 'completed_at', 'date_time'),
      ('Attachments', 'attachment', 'attachment')
    ) as k(field_label, key, value_type)
  loop
    v_key_pos := v_key_pos + 1;
    select id into v_field_id
    from public.experiment_template_fields
    where template_id = v_template_id and label = v_fixed_key.field_label;
    insert into public.experiment_template_keys (
      template_id, field_id, key, value_type, required, position
    ) values (
      v_template_id, v_field_id, v_fixed_key.key, v_fixed_key.value_type, false, v_key_pos
    )
    on conflict do nothing;
  end loop;

  -- decision_outcome options.
  v_key_id := null;
  select id into v_key_id from public.experiment_template_keys
  where template_id = v_template_id and key = 'decision_outcome';
  if v_key_id is not null then
    for v_idx in 1..4 loop
      insert into public.experiment_template_key_options (
        template_id, key_id, label, position
      ) values (
        v_template_id, v_key_id,
        (array['reference', 'accepted', 'rejected', 'inconclusive'])[v_idx],
        v_idx
      )
      on conflict do nothing;
    end loop;
  end if;

  -- 4. Generated Keys from existing data (dataset/config/metrics unions).
  select coalesce(max(jsonb_array_length(coalesce(data_spec->'datasets', '[]'::jsonb))), 0)
  into v_dataset_max
  from public.experiments;
  for v_idx in 1..v_dataset_max loop
    for v_dataset_key in
      select key, value_type
      from (values
        (format('dataset_%s_role', v_idx), 'single_select'),
        (format('dataset_%s_name', v_idx), 'short_text'),
        (format('dataset_%s_split', v_idx), 'short_text'),
        (format('dataset_%s_revision', v_idx), 'short_text'),
        (format('dataset_%s_task_count', v_idx), 'number'),
        (format('dataset_%s_samples_per_task', v_idx), 'number')
      ) as d(key, value_type)
    loop
      v_key_pos := v_key_pos + 1;
      select id into v_field_id
      from public.experiment_template_fields
      where template_id = v_template_id and label = 'Data';
      insert into public.experiment_template_keys (
        template_id, field_id, key, value_type, required, position
      ) values (v_template_id, v_field_id, v_dataset_key.key, v_dataset_key.value_type, false, v_key_pos)
      on conflict do nothing;
    end loop;
  end loop;

  -- dataset_N_role options.
  for v_key_id in
    select id from public.experiment_template_keys
    where template_id = v_template_id and key like 'dataset_%_role'
  loop
    insert into public.experiment_template_key_options (
      template_id, key_id, label, position
    ) values
      (v_template_id, v_key_id, 'training', 1),
      (v_template_id, v_key_id, 'evaluation', 2)
    on conflict do nothing;
  end loop;

  -- Config Keys (union, typed; mixed -> long_text).
  for v_config_key in
    select distinct jsonb_object_keys(config) as key
    from public.experiments
    where config <> '{}'::jsonb
  loop
    select
      case
        when count(distinct jsonb_typeof(value)) > 1 then 'long_text'
        when min(jsonb_typeof(value)) = 'number' then 'number'
        when min(jsonb_typeof(value)) = 'boolean' then 'boolean'
        else 'short_text'
      end
    into v_config_type
    from public.experiments, jsonb_each(config)
    where key = v_config_key;
    insert into public.experiment_template_keys (
      template_id,
      field_id,
      key,
      value_type,
      required,
      position
    )
    select v_template_id, id, v_config_key, v_config_type, false,
           (select coalesce(max(position), 0) + 1
            from public.experiment_template_keys
            where template_id = v_template_id)
    from public.experiment_template_fields
    where template_id = v_template_id and label = 'Config'
    on conflict do nothing;
  end loop;

  -- Metric Keys (numbers only).
  for v_metric in
    select distinct jsonb_object_keys(metrics) as key
    from public.experiments
    where metrics <> '{}'::jsonb
  loop
    insert into public.experiment_template_keys (
      template_id,
      field_id,
      key,
      value_type,
      required,
      position
    )
    select v_template_id, id, v_metric, 'number', false,
           (select coalesce(max(position), 0) + 1
            from public.experiment_template_keys
            where template_id = v_template_id)
    from public.experiment_template_fields
    where template_id = v_template_id and label = 'Result'
    on conflict do nothing;
  end loop;

  -- 5. Backfill Values for every legacy Experiment (template_id is null at this point).
  select id into v_attachment_key
  from public.experiment_template_keys
  where template_id = v_template_id and key = 'attachment';

  for v_experiment in
    select * from public.experiments
    where template_id is null
    order by id
  loop
    update public.experiments
    set template_id = v_template_id
    where id = v_experiment.id;

    v_datasets := coalesce(v_experiment.data_spec->'datasets', '[]'::jsonb);
    v_object := coalesce(v_experiment.object_spec, '{}'::jsonb);
    v_environment := coalesce(v_experiment.environment_spec, '{}'::jsonb);
    v_config := coalesce(v_experiment.config, '{}'::jsonb);
    v_metrics := coalesce(v_experiment.metrics, '{}'::jsonb);

    -- Object + Environment fixed Keys (short/long text; arrays serialized deterministically).
    insert into public.experiment_values (
      experiment_id, template_id, key_id, text_value, cell_revision
    )
    select v_experiment.id, v_template_id, k.id,
           case
             when jsonb_typeof(src.value) = 'array'
               then (select string_agg(x::text, ',' order by x::text)
                     from jsonb_array_elements_text(src.value) x)
             else src.value #>> '{}'
           end,
           1
    from jsonb_each(jsonb_build_object(
      'model', v_object->'model',
      'harness', v_object->'harness',
      'parent_harness', v_object->'parent_harness',
      'prompt', v_object->'prompt',
      'prompt_change', v_object->'prompt_change',
      'skills', v_object->'skills',
      'tools', v_object->'tools',
      'platform', v_environment->'platform',
      'server', v_environment->'server',
      'devices', v_environment->'devices',
      'hardware', v_environment->'hardware',
      'evaluator', v_environment->'evaluator',
      'revision', v_environment->'revision',
      'precision_policy', v_environment->'precision_policy'
    )) as src(key, value)
    join public.experiment_template_keys k
      on k.template_id = v_template_id and k.key = src.key
    where src.value is not null
      and jsonb_typeof(src.value) <> 'null';

    -- Lifecycle.
    insert into public.experiment_values (
      experiment_id, template_id, key_id, datetime_value, cell_revision
    )
    select v_experiment.id, v_template_id, k.id, (src.value #>> '{}')::timestamptz, 1
    from (values
      ('started_at', to_jsonb(v_experiment.started_at)),
      ('completed_at', to_jsonb(v_experiment.completed_at))
    ) as src(key, value)
    join public.experiment_template_keys k
      on k.template_id = v_template_id and k.key = src.key
    where src.value is not null
      and jsonb_typeof(src.value) <> 'null';

    -- Note + Result + Decision text.
    insert into public.experiment_values (
      experiment_id, template_id, key_id, text_value, cell_revision
    )
    select v_experiment.id, v_template_id, k.id, src.value, 1
    from (values
      ('notes', v_experiment.notes),
      ('result_summary', v_experiment.result_summary),
      ('decision_notes', v_experiment.decision_notes)
    ) as src(key, value)
    join public.experiment_template_keys k
      on k.template_id = v_template_id and k.key = src.key
    where src.value <> '';

    -- decision_outcome as single_select.
    if v_experiment.decision_outcome is not null then
      select o.id into v_option_id
      from public.experiment_template_key_options o
      join public.experiment_template_keys k on k.id = o.key_id
      where k.template_id = v_template_id
        and k.key = 'decision_outcome'
        and o.label = v_experiment.decision_outcome;
      if v_option_id is not null then
        insert into public.experiment_values (
          experiment_id, template_id, key_id, option_id, cell_revision
        ) values (
          v_experiment.id, v_template_id,
          (select id from public.experiment_template_keys
           where template_id = v_template_id and key = 'decision_outcome'),
          v_option_id, 1
        );
      end if;
    end if;

    -- Config Keys.
    insert into public.experiment_values (
      experiment_id, template_id, key_id, text_value, number_value,
      boolean_value, cell_revision
    )
    select v_experiment.id, v_template_id, k.id,
           case when k.value_type in ('short_text', 'long_text')
             then case
               when jsonb_typeof(src.value) = 'string' then src.value #>> '{}'
               else (src.value #>> '{}')
             end
           end,
           case when k.value_type = 'number'
             then (src.value #>> '{}')::double precision
           end,
           case when k.value_type = 'boolean'
             then (src.value #>> '{}')::boolean
           end,
           1
    from jsonb_each(v_config) as src(key, value)
    join public.experiment_template_keys k
      on k.template_id = v_template_id and k.key = src.key
    where jsonb_typeof(src.value) <> 'null';

    -- Metric Keys (numeric without string conversion).
    insert into public.experiment_values (
      experiment_id, template_id, key_id, number_value, cell_revision
    )
    select v_experiment.id, v_template_id, k.id,
           (src.value #>> '{}')::double precision, 1
    from jsonb_each(v_metrics) as src(key, value)
    join public.experiment_template_keys k
      on k.template_id = v_template_id and k.key = src.key
    where jsonb_typeof(src.value) = 'number';

    -- Dataset rows: dataset_N_* from the flattened Data spec.
    for v_idx in 1..jsonb_array_length(v_datasets) loop
      insert into public.experiment_values (
        experiment_id, template_id, key_id, text_value, number_value,
        option_id, cell_revision
      )
      select v_experiment.id, v_template_id, k.id,
             case when k.value_type in ('short_text', 'long_text')
               then (src.value #>> '{}')
             end,
             case when k.value_type = 'number'
               then (src.value #>> '{}')::double precision
             end,
             case when k.value_type = 'single_select'
               then (
                 select o.id from public.experiment_template_key_options o
                 join public.experiment_template_keys kk on kk.id = o.key_id
                 where kk.template_id = v_template_id
                   and kk.key = format('dataset_%s_role', v_idx)
                   and o.label = src.value #>> '{}'
               )
             end,
             1
      from jsonb_each(v_datasets->(v_idx - 1)) as src(key, value)
      join public.experiment_template_keys k
        on k.template_id = v_template_id
       and k.key = format('dataset_%s_%s', v_idx, src.key)
      where jsonb_typeof(src.value) <> 'null';
    end loop;

    -- Migration version snapshot.
    insert into public.experiment_versions (
      experiment_id, version_no, reason, source, template_schema_revision,
      snapshot, actor_member_id
    ) values (
      v_experiment.id, 1, 'Migrated from legacy model', 'migration',
      v_schema_revision, public._experiment_snapshot(v_experiment.id), null
    )
    on conflict (experiment_id, version_no) do nothing;
  end loop;

  -- 6. Attachments: associate every Experiment Attachment with the Attachment Key.
  update public.attachments
  set template_key_id = v_attachment_key
  where experiment_id is not null
    and template_key_id is null;
end
$legacy_cutover$;

-- Cutover: retire the legacy constraint -----------------------------------------------
alter table public.experiments
  drop constraint if exists experiments_completed_decision_check;

-- Cutover: lifecycle-only Activity trigger ---------------------------------------------
create or replace function public.log_experiment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_owner_name text;
  v_baseline_no bigint;
begin
  if tg_op = 'INSERT' then
    if new.baseline_experiment_id is null then
      insert into activity (task_id, experiment_id, text, kind)
      values (new.task_id, new.id, 'Experiment created', 'experiment');
    else
      select experiment_no into v_baseline_no
      from experiments
      where id = new.baseline_experiment_id;
      insert into activity (task_id, experiment_id, text, kind)
      values (
        new.task_id,
        new.id,
        format('Experiment duplicated from EXP-%s', to_char(v_baseline_no, 'FM0000')),
        'experiment'
      );
    end if;
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

-- Cutover: lock template_id --------------------------------------------------------------
alter table public.experiments
  alter column template_id set not null;
