begin;
select plan(11);

insert into public.modules (id, name)
values ('10000000-0000-4000-8000-000000000013', 'Attachment PATCH');
insert into public.members (id, name)
values (
  '20000000-0000-4000-8000-000000000013',
  'Attachment Agent'
);
insert into public.tasks (id, module_id, title)
values
  (
    '30000000-0000-4000-8000-000000000013',
    '10000000-0000-4000-8000-000000000013',
    'Assigned task'
  ),
  (
    '30000000-0000-4000-8000-000000000014',
    '10000000-0000-4000-8000-000000000013',
    'Conflicting unassigned task'
  );
insert into public.task_assignees (task_id, member_id)
values (
  '30000000-0000-4000-8000-000000000013',
  '20000000-0000-4000-8000-000000000013'
);
insert into public.api_keys (
  id, name, key_prefix, key_digest, member_id, scopes, created_by
) values (
  '40000000-0000-4000-8000-000000000013',
  'Attachment key',
  'tb_live_attachment',
  repeat('d', 64),
  '20000000-0000-4000-8000-000000000013',
  array['attachments:write'],
  '50000000-0000-4000-8000-000000000013'
);
insert into public.experiments (
  id, task_id, owner_id, name
) values (
  '60000000-0000-4000-8000-000000000013',
  '30000000-0000-4000-8000-000000000013',
  '20000000-0000-4000-8000-000000000013',
  'Linked parent'
);
insert into public.attachments (
  id, task_id, experiment_id, url, path, caption, updated_at
) values
  (
    '80000000-0000-4000-8000-000000000013',
    '30000000-0000-4000-8000-000000000013',
    null,
    'https://example.test/direct.png',
    'direct.png',
    'Direct before',
    '2026-07-29T10:00:00Z'
  ),
  (
    '80000000-0000-4000-8000-000000000014',
    '30000000-0000-4000-8000-000000000014',
    '60000000-0000-4000-8000-000000000013',
    'https://example.test/linked.png',
    'linked.png',
    'Linked before',
    '2026-07-29T10:00:00Z'
  );

set local role service_role;

select lives_ok(
  $$select public.agent_api_patch_attachment(
    '40000000-0000-4000-8000-000000000013',
    '20000000-0000-4000-8000-000000000013',
    '80000000-0000-4000-8000-000000000013',
    '2026-07-29T10:00:00Z',
    'Direct after',
    'attachment_direct_patch'
  )$$,
  'a direct Task Attachment can be patched'
);
select is(
  (
    select caption
    from public.attachments
    where id = '80000000-0000-4000-8000-000000000013'
  ),
  'Direct after',
  'direct Attachment caption is updated'
);
select lives_ok(
  $$select public.agent_api_patch_attachment(
    '40000000-0000-4000-8000-000000000013',
    '20000000-0000-4000-8000-000000000013',
    '80000000-0000-4000-8000-000000000014',
    '2026-07-29T10:00:00Z',
    'Linked after',
    'attachment_linked_patch'
  )$$,
  'a linked Attachment trusts its Experiment Task over a conflicting row Task'
);
select is(
  (
    select task_id
    from public.agent_api_audit_log
    where request_id = 'attachment_linked_patch'
  ),
  '30000000-0000-4000-8000-000000000013'::uuid,
  'linked Attachment audit uses the authoritative Experiment Task'
);
select throws_ok(
  $$select public.agent_api_patch_attachment(
    '40000000-0000-4000-8000-000000000013',
    '20000000-0000-4000-8000-000000000013',
    '80000000-0000-4000-8000-000000000013',
    '2026-07-29T10:00:00Z',
    'Stale attempt',
    'attachment_stale_patch'
  )$$,
  'P0001',
  'VERSION_CONFLICT',
  'a stale direct Attachment ETag is rejected'
);

reset role;
delete from public.task_assignees
where task_id = '30000000-0000-4000-8000-000000000013'
  and member_id = '20000000-0000-4000-8000-000000000013';
set local role service_role;
select throws_ok(
  $$select public.agent_api_patch_attachment(
    '40000000-0000-4000-8000-000000000013',
    '20000000-0000-4000-8000-000000000013',
    '80000000-0000-4000-8000-000000000013',
    (select updated_at from public.attachments where id =
      '80000000-0000-4000-8000-000000000013'),
    'Unassigned attempt',
    'attachment_unassigned_patch'
  )$$,
  'P0001',
  'TASK_SCOPE_FORBIDDEN',
  'the authoritative RPC rechecks current direct Task assignment'
);

reset role;
insert into public.task_assignees (task_id, member_id)
values (
  '30000000-0000-4000-8000-000000000013',
  '20000000-0000-4000-8000-000000000013'
);
update public.api_keys
set scopes = '{}'
where id = '40000000-0000-4000-8000-000000000013';
set local role service_role;
select throws_ok(
  $$select public.agent_api_patch_attachment(
    '40000000-0000-4000-8000-000000000013',
    '20000000-0000-4000-8000-000000000013',
    '80000000-0000-4000-8000-000000000014',
    (select updated_at from public.attachments where id =
      '80000000-0000-4000-8000-000000000014'),
    'Scope attempt',
    'attachment_scope_patch'
  )$$,
  'P0001',
  'TASK_SCOPE_FORBIDDEN',
  'the authoritative RPC rechecks the current Attachment scope'
);

reset role;
update public.api_keys
set scopes = array['attachments:write'],
    revoked_at = now()
where id = '40000000-0000-4000-8000-000000000013';
set local role service_role;
select throws_ok(
  $$select public.agent_api_patch_attachment(
    '40000000-0000-4000-8000-000000000013',
    '20000000-0000-4000-8000-000000000013',
    '80000000-0000-4000-8000-000000000013',
    (select updated_at from public.attachments where id =
      '80000000-0000-4000-8000-000000000013'),
    'Revoked attempt',
    'attachment_revoked_patch'
  )$$,
  'P0001',
  'TASK_SCOPE_FORBIDDEN',
  'the authoritative RPC rechecks current Key revocation'
);
select is(
  (
    select caption
    from public.attachments
    where id = '80000000-0000-4000-8000-000000000013'
  ),
  'Direct after',
  'failed direct Attachment races do not change the caption'
);
select is(
  (
    select caption
    from public.attachments
    where id = '80000000-0000-4000-8000-000000000014'
  ),
  'Linked after',
  'failed linked Attachment races do not change the caption'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.agent_api_patch_attachment(uuid,uuid,uuid,timestamptz,text,text)',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'public.agent_api_patch_attachment(uuid,uuid,uuid,timestamptz,text,text)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.agent_api_patch_attachment(uuid,uuid,uuid,timestamptz,text,text)',
      'execute'
    )
    and not has_table_privilege(
      'service_role',
      'public.attachments',
      'delete'
    ),
  'Attachment PATCH remains service-role-only without Attachment DELETE'
);

select * from finish();
rollback;
