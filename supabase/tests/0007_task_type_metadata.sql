do $verify$
declare
  v_type uuid;
  v_typed_task uuid;
  v_untyped_task uuid;
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
      module_id, title, status, assignees, tags, priority, position
    )
    values (
      null, 'untyped task', 'todo', '{}', '{}', 'medium', 999999
    )
    returning id into v_untyped_task;

    delete from public.modules where id = v_type;

    if not exists (
      select 1 from public.tasks
      where id = v_typed_task and module_id is null
    ) then
      raise exception 'deleting a Type did not preserve and untype its Task';
    end if;

    begin
      update public.tasks set priority = 'critical' where id = v_untyped_task;
      raise exception 'invalid priority was accepted';
    exception
      when check_violation then null;
    end;

    if not has_table_privilege('authenticated', 'public.tasks', 'select,insert,update,delete') then
      raise exception 'authenticated task privileges are incomplete';
    end if;

    if has_table_privilege('anon', 'public.tasks', 'select') then
      raise exception 'anon unexpectedly has task access';
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
