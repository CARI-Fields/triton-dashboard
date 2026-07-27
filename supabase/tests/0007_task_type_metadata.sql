do $verify$
declare
  v_type uuid;
  v_typed_task uuid;
  v_untyped_task uuid;
  v_default_tags text[];
  v_default_priority text;
  v_default_due_date date;
  v_priority_constraint text;
begin
  begin
    insert into public.modules (name, kind, objective, position)
    values ('migration-type', 'pipeline', 'compatibility row', 999998)
    returning id into v_type;

    insert into public.tasks (
      module_id, title, status, assignees, tags, priority, due_date, position
    )
    values (
      v_type, 'typed task', 'todo', array['Maya'],
      array['NPU', 'Verifier'], 'high', date '2026-08-01', 999998
    )
    returning id into v_typed_task;

    insert into public.tasks (
      module_id, title, status, assignees, position
    )
    values (
      null, 'untyped task', 'todo', '{}', 999999
    )
    returning id into v_untyped_task;

    select tags, priority, due_date
    into v_default_tags, v_default_priority, v_default_due_date
    from public.tasks
    where id = v_untyped_task;

    if v_default_tags is distinct from '{}'::text[] then
      raise exception 'tags default is %, expected {}', v_default_tags;
    end if;

    if v_default_priority is distinct from 'medium' then
      raise exception 'priority default is %, expected medium', v_default_priority;
    end if;

    if v_default_due_date is not null then
      raise exception 'due_date default is %, expected NULL', v_default_due_date;
    end if;

    begin
      update public.tasks set tags = null where id = v_untyped_task;
      raise exception 'NULL tags were accepted';
    exception
      when not_null_violation then null;
    end;

    begin
      update public.tasks set priority = null where id = v_untyped_task;
      raise exception 'NULL priority was accepted';
    exception
      when not_null_violation then null;
    end;

    update public.tasks set priority = 'low' where id = v_untyped_task;
    if (select priority from public.tasks where id = v_untyped_task) is distinct from 'low' then
      raise exception 'low priority was not preserved';
    end if;

    update public.tasks set priority = 'medium' where id = v_untyped_task;
    if (select priority from public.tasks where id = v_untyped_task) is distinct from 'medium' then
      raise exception 'medium priority was not preserved';
    end if;

    update public.tasks set priority = 'high' where id = v_untyped_task;
    if (select priority from public.tasks where id = v_untyped_task) is distinct from 'high' then
      raise exception 'high priority was not preserved';
    end if;

    update public.tasks set priority = 'urgent' where id = v_untyped_task;
    if (select priority from public.tasks where id = v_untyped_task) is distinct from 'urgent' then
      raise exception 'urgent priority was not preserved';
    end if;

    begin
      update public.tasks set priority = 'critical' where id = v_untyped_task;
      raise exception 'invalid priority was accepted';
    exception
      when check_violation then null;
    end;

    delete from public.modules where id = v_type;

    if not exists (
      select 1 from public.tasks
      where id = v_typed_task and module_id is null
    ) then
      raise exception 'deleting a Type did not preserve and untype its Task';
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = 'tags'
        and data_type = 'ARRAY'
        and udt_schema = 'pg_catalog'
        and udt_name = '_text'
        and is_nullable = 'NO'
        and column_default = '''{}''::text[]'
    ) then
      raise exception 'tasks.tags schema does not match text[] NOT NULL DEFAULT {}';
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = 'priority'
        and data_type = 'text'
        and udt_schema = 'pg_catalog'
        and udt_name = 'text'
        and is_nullable = 'NO'
        and column_default = '''medium''::text'
    ) then
      raise exception 'tasks.priority schema does not match text NOT NULL DEFAULT medium';
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = 'due_date'
        and data_type = 'date'
        and udt_schema = 'pg_catalog'
        and udt_name = 'date'
        and is_nullable = 'YES'
        and column_default is null
    ) then
      raise exception 'tasks.due_date schema does not match nullable date';
    end if;

    select pg_get_constraintdef(oid)
    into v_priority_constraint
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_priority_check'
      and contype = 'c'
      and convalidated;

    if v_priority_constraint is distinct from
      'CHECK ((priority = ANY (ARRAY[''low''::text, ''medium''::text, ''high''::text, ''urgent''::text])))'
    then
      raise exception 'tasks_priority_check has unexpected semantics: %', v_priority_constraint;
    end if;

    if not exists (
      select 1
      from pg_class index_class
      join pg_namespace index_namespace
        on index_namespace.oid = index_class.relnamespace
      join pg_index task_index
        on task_index.indexrelid = index_class.oid
      join pg_attribute indexed_attribute
        on indexed_attribute.attrelid = task_index.indrelid
       and indexed_attribute.attnum = task_index.indkey[0]
      where index_namespace.nspname = 'public'
        and index_class.relname = 'tasks_module_id_idx'
        and task_index.indrelid = 'public.tasks'::regclass
        and task_index.indisvalid
        and task_index.indisready
        and task_index.indnkeyatts = 1
        and task_index.indnatts = 1
        and task_index.indpred is null
        and task_index.indexprs is null
        and indexed_attribute.attname = 'module_id'
    ) then
      raise exception 'tasks_module_id_idx is missing or does not index only module_id';
    end if;

    if not has_table_privilege('authenticated', 'public.tasks', 'select') then
      raise exception 'authenticated SELECT privilege is missing';
    end if;

    if not has_table_privilege('authenticated', 'public.tasks', 'insert') then
      raise exception 'authenticated INSERT privilege is missing';
    end if;

    if not has_table_privilege('authenticated', 'public.tasks', 'update') then
      raise exception 'authenticated UPDATE privilege is missing';
    end if;

    if not has_table_privilege('authenticated', 'public.tasks', 'delete') then
      raise exception 'authenticated DELETE privilege is missing';
    end if;

    if has_table_privilege('anon', 'public.tasks', 'select') then
      raise exception 'anon unexpectedly has SELECT privilege';
    end if;

    if has_table_privilege('anon', 'public.tasks', 'insert') then
      raise exception 'anon unexpectedly has INSERT privilege';
    end if;

    if has_table_privilege('anon', 'public.tasks', 'update') then
      raise exception 'anon unexpectedly has UPDATE privilege';
    end if;

    if has_table_privilege('anon', 'public.tasks', 'delete') then
      raise exception 'anon unexpectedly has DELETE privilege';
    end if;

    raise exception using
      errcode = 'ZX007',
      message = 'task_type_metadata_test_rollback_sentinel';
  exception
    when sqlstate 'ZX007' then
      if sqlerrm <> 'task_type_metadata_test_rollback_sentinel' then
        raise;
      end if;
  end;

  if exists (
    select 1
    from public.tasks
    where id in (v_typed_task, v_untyped_task)
  ) or exists (
    select 1
    from public.modules
    where id = v_type
  ) then
    raise exception 'transactional task metadata fixtures were not rolled back';
  end if;
end
$verify$;
