begin;
select plan(8);

select ok(
  has_table_privilege('service_role', 'public.api_keys', 'delete'),
  'service_role can delete API Key records'
);
select ok(
  not has_table_privilege('anon', 'public.api_keys', 'delete'),
  'anon cannot delete API Key records'
);
select ok(
  not has_table_privilege('authenticated', 'public.api_keys', 'delete'),
  'authenticated cannot delete API Key records'
);

insert into public.api_keys (
  id,
  name,
  key_prefix,
  key_digest,
  scopes,
  revoked_at,
  created_by
) values
  (
    '40000000-0000-4000-8000-000000000014',
    'Audited revoked key',
    'tb_live_AUDITED1',
    repeat('a', 64),
    '{}',
    '2026-07-29T15:00:00Z',
    '50000000-0000-4000-8000-000000000014'
  ),
  (
    '40000000-0000-4000-8000-000000000015',
    'Unused revoked key',
    'tb_live_UNUSED01',
    repeat('b', 64),
    '{}',
    '2026-07-29T15:00:00Z',
    '50000000-0000-4000-8000-000000000014'
  );

insert into public.agent_api_audit_log (
  api_key_id,
  member_id,
  request_id,
  resource_type,
  resource_id,
  action,
  response_status
) values (
  '40000000-0000-4000-8000-000000000014',
  '20000000-0000-4000-8000-000000000014',
  'api_key_delete_audit_fixture',
  'task',
  '30000000-0000-4000-8000-000000000014',
  'patch',
  200
);

set local role service_role;

select throws_ok(
  $$delete from public.api_keys
    where id = '40000000-0000-4000-8000-000000000014'$$,
  '23503',
  'update or delete on table "api_keys" violates foreign key constraint "agent_api_audit_log_api_key_id_fkey" on table "agent_api_audit_log"',
  'the audit foreign key blocks deletion of a referenced Key'
);
select ok(
  exists (
    select 1
    from public.api_keys
    where id = '40000000-0000-4000-8000-000000000014'
  ),
  'the referenced Key remains after the rejected delete'
);
select ok(
  exists (
    select 1
    from public.agent_api_audit_log
    where api_key_id = '40000000-0000-4000-8000-000000000014'
  ),
  'the audit row remains after the rejected delete'
);
select lives_ok(
  $$delete from public.api_keys
    where id = '40000000-0000-4000-8000-000000000015'
      and revoked_at is not null
      and last_used_at is null$$,
  'service_role can delete an unreferenced revoked, never-used Key'
);
select ok(
  not exists (
    select 1
    from public.api_keys
    where id = '40000000-0000-4000-8000-000000000015'
  ),
  'the eligible unreferenced Key is removed'
);

select * from finish();
rollback;
