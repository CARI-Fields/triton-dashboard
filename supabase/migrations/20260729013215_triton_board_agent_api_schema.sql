create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, member_id)
);

create index task_assignees_member_task_idx
  on public.task_assignees (member_id, task_id);

do $validate_legacy_assignees$
declare
  v_problem text;
begin
  select format('%s: %s', t.id, assignee_name)
  into v_problem
  from public.tasks t
  cross join lateral unnest(t.assignees) as assignee_name
  left join public.members m on m.name = assignee_name
  group by t.id, assignee_name
  having count(m.id) <> 1
  limit 1;

  if v_problem is not null then
    raise exception
      'Cannot migrate task assignee to a unique Member UUID: %',
      v_problem;
  end if;
end
$validate_legacy_assignees$;

insert into public.task_assignees (task_id, member_id)
select distinct t.id, m.id
from public.tasks t
cross join lateral unnest(t.assignees) as assignee_name
join public.members m on m.name = assignee_name
on conflict do nothing;

alter table public.task_assignees enable row level security;
create policy "auth access" on public.task_assignees
  for all to authenticated using (true) with check (true);
revoke all on public.task_assignees from authenticated;
grant select, insert, delete on public.task_assignees to authenticated;
revoke all on public.task_assignees from anon;

do $realtime$
begin
  alter publication supabase_realtime add table public.task_assignees;
exception when duplicate_object then null;
end
$realtime$;

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  key_prefix text not null,
  key_digest text not null unique,
  member_id uuid references public.members(id) on delete set null,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    scopes <@ array[
      'board:read',
      'tasks:write',
      'experiments:write',
      'attachments:write',
      'activity:append',
      'audit:read'
    ]::text[]
  )
);

create table public.agent_api_audit_log (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references public.api_keys(id),
  member_id uuid not null,
  request_id text not null unique,
  idempotency_key text,
  request_hash text,
  resource_type text not null,
  resource_id uuid not null,
  task_id uuid,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  response_status integer not null,
  created_at timestamptz not null default now(),
  check (resource_type in ('task', 'experiment', 'attachment', 'activity')),
  check (action in ('create', 'patch'))
);

create unique index agent_api_audit_idempotency_key
  on public.agent_api_audit_log (api_key_id, idempotency_key)
  where idempotency_key is not null;
create index agent_api_audit_key_created_idx
  on public.agent_api_audit_log (api_key_id, created_at desc);
create index agent_api_audit_task_created_idx
  on public.agent_api_audit_log (task_id, created_at desc);
create index agent_api_audit_resource_created_idx
  on public.agent_api_audit_log
  (resource_type, resource_id, created_at desc);

alter table public.attachments
  add column updated_at timestamptz not null default now();

create trigger attachments_set_updated_at
  before update on public.attachments
  for each row execute function public.set_updated_at();

create trigger api_keys_set_updated_at
  before update on public.api_keys
  for each row execute function public.set_updated_at();

create or replace function public.revoke_member_api_keys()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.api_keys
  set revoked_at = coalesce(revoked_at, now())
  where member_id = old.id;
  return old;
end
$function$;

create trigger members_revoke_api_keys
  before delete on public.members
  for each row execute function public.revoke_member_api_keys();

alter table public.api_keys enable row level security;
alter table public.agent_api_audit_log enable row level security;

revoke all on public.api_keys from anon, authenticated;
revoke all on public.agent_api_audit_log from anon, authenticated;
grant select, insert, update on public.api_keys to service_role;
grant select, insert on public.agent_api_audit_log to service_role;
grant select on public.task_assignees to service_role;

revoke execute on function public.revoke_member_api_keys() from public, anon, authenticated;
