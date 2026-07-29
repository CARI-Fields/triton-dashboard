begin;
select plan(20);

select has_table('public', 'task_assignees', 'task_assignees exists');
select has_pk('public', 'task_assignees', 'task_assignees has a primary key');
select has_index(
  'public',
  'task_assignees',
  'task_assignees_member_task_idx',
  'task_assignees member-task index exists'
);
select has_table('public', 'api_keys', 'api_keys exists');
select has_column('public', 'api_keys', 'key_digest', 'api_keys has key_digest');
select col_is_unique('public', 'api_keys', 'key_digest', 'key_digest is unique');
select has_table('public', 'agent_api_audit_log', 'agent_api_audit_log exists');
select has_index(
  'public',
  'agent_api_audit_log',
  'agent_api_audit_key_created_idx',
  'audit key-created index exists'
);
select has_index(
  'public',
  'agent_api_audit_log',
  'agent_api_audit_task_created_idx',
  'audit task-created index exists'
);
select has_column('public', 'attachments', 'updated_at', 'attachments has updated_at');

select ok(
  not has_table_privilege('authenticated', 'public.api_keys', 'select'),
  'authenticated cannot read API Key digests'
);
select ok(
  not has_table_privilege('authenticated', 'public.agent_api_audit_log', 'insert'),
  'authenticated cannot forge audit rows'
);
select ok(
  has_table_privilege('authenticated', 'public.task_assignees', 'select'),
  'dashboard can read UUID assignees'
);
select ok(
  has_table_privilege('authenticated', 'public.task_assignees', 'insert'),
  'dashboard can assign members'
);
select ok(
  has_table_privilege('authenticated', 'public.task_assignees', 'delete'),
  'dashboard can unassign members'
);

select col_type_is('public', 'api_keys', 'scopes', 'text[]', 'api_keys scopes are text[]');
select col_type_is(
  'public',
  'agent_api_audit_log',
  'before_state',
  'jsonb',
  'audit before_state is jsonb'
);
select col_type_is(
  'public',
  'agent_api_audit_log',
  'after_state',
  'jsonb',
  'audit after_state is jsonb'
);

insert into public.members (id, name)
values ('20000000-0000-4000-8000-000000000099', 'Delete Test');
insert into public.api_keys (
  id, name, key_prefix, key_digest, member_id, created_by
) values (
  '40000000-0000-4000-8000-000000000099',
  'Delete test key',
  'tb_live_delete_test',
  repeat('f', 64),
  '20000000-0000-4000-8000-000000000099',
  '50000000-0000-4000-8000-000000000099'
);
delete from public.members
where id = '20000000-0000-4000-8000-000000000099';

select ok(
  exists (
    select 1 from public.api_keys
    where id = '40000000-0000-4000-8000-000000000099'
      and member_id is null
  ),
  'deleting a Member retains its historical Key'
);
select ok(
  exists (
    select 1 from public.api_keys
    where id = '40000000-0000-4000-8000-000000000099'
      and revoked_at is not null
  ),
  'deleting a Member revokes its Key before the FK is cleared'
);

select * from finish();
rollback;
