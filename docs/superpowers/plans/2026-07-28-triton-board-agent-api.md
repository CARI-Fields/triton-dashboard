# Triton Board Agent API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a permission-scoped Agent HTTP API, shared-admin API Key management, UUID Task assignees, immutable API audit history, and a repository-scoped `triton-board-api` Skill.

**Architecture:** Next.js 16 Route Handlers expose `/api/agent/v1` and `/api/admin/v1` on the existing deployment. A server-only Supabase client authenticates hashed API Keys, checks Member UUID Task collaboration, validates strict DTOs, and calls small Postgres RPCs that atomically mutate data and append audit snapshots. The existing browser application continues to use Supabase directly, but switches Task assignees from name arrays to the UUID join table.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript 5, Supabase JS/CLI 2.110.0, Postgres 17, Vitest 4.1.10, Python 3 standard library.

## Global Constraints

- Read the installed Next.js guides at `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`, `node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md`, and the authorization/Route Handler sections of `node_modules/next/dist/docs/01-app/02-guides/authentication.md` before changing Route Handlers.
- Treat every Route Handler as a public endpoint; authenticate and authorize inside the DAL used by the handler.
- Dynamic Route Handler params are `Promise` values in this Next.js version and must be awaited.
- Add no OAuth provider, per-Agent identity, approval queue, soft-delete system, batch mutation API, separate backend service, or dedicated database login role.
- An API Key is a permission credential associated with one Member UUID; it is not an Agent identity.
- `board:read` reads the whole Board. Write access is the intersection of the Key scope and current `task_assignees` membership.
- A Member assigned to a Task may modify all Experiments under that Task, regardless of Experiment Owner.
- Agent API code must never expose or implement Task or Experiment deletion.
- Task PATCH cannot change Module or assignees. Experiment PATCH cannot change Owner or Task.
- Experiment creation accepts only `name`, sets `owner_id` to the API Key Member and `task_id`
  from the URL, and starts in `planned`.
- Use existing `updated_at` values as ETags; do not add a numeric version column.
- Require Idempotency-Key on every POST that creates data; PATCH retries re-read the resource.
- Preserve unrelated user changes in the dirty worktree. Stage only files named by the active task.
- Use the imperative Supabase migration workflow. Run `npx supabase migration new NAME`; never hand-invent a migration timestamp.
- Use the local Supabase instance for destructive database reset/testing commands. Do not run reset commands against the linked production project.
- Add no npm runtime dependency for validation; reuse focused TypeScript type guards and the Python standard library.
- Keep every Task/Experiment mutation and its `agent_api_audit_log` row in one database transaction.
- Do not add CORS headers in phase one; the Agent API is server-to-server.
- Design specification: `docs/superpowers/specs/2026-07-28-triton-board-agent-api-design.md`.

---

## Planned File Structure

### Database

- Create via Supabase CLI: schema migration printed by `npx supabase migration new triton_board_agent_api_schema`.
- Create via Supabase CLI: mutation migration printed by `npx supabase migration new triton_board_agent_api_mutations`.
- Create: `supabase/tests/0007_agent_api_schema.sql` — pgTAP coverage for UUID assignees, Key storage, grants, audit schema, and Member deletion behavior.
- Create: `supabase/tests/0008_agent_api_mutations.sql` — pgTAP coverage for collaboration checks, ETag conflicts, idempotency, rate limiting, and audit snapshots.

### Existing Dashboard

- Create: `lib/tasks/assignees.ts` — shared Task select/normalization and UUID assignment helpers.
- Create: `lib/tasks/__tests__/assignees.test.ts` — pure normalization tests.
- Modify: `components/Board.tsx` — load and mutate UUID assignee rows.
- Modify: `components/TaskDetail.tsx` — load and mutate UUID assignee rows without changing existing queue semantics.
- Modify: `components/Analytics.tsx` — load normalized Tasks.
- Modify: `lib/experiments/repository.ts` — load normalized Task reference data.
- Modify: `components/__tests__/TaskDetail.test.tsx`.
- Modify: `lib/experiments/__tests__/repository.test.ts`.

### Agent API Core

- Create: `lib/experiments/schema.ts` — reusable Experiment JSON type guards.
- Modify: `lib/experiments/draft.ts` — import shared guards instead of owning duplicates.
- Modify: `lib/types.ts` — add the Attachment ETag timestamp.
- Create: `lib/agent-api/types.ts` — scopes, contexts, envelopes, filters, and mutation types.
- Create: `lib/agent-api/errors.ts` — stable HTTP/domain error representation.
- Create: `lib/agent-api/responses.ts` — JSON envelopes, request IDs, ETags, and error mapping.
- Create: `lib/agent-api/server.ts` — server-only Supabase client and environment checks.
- Create: `lib/agent-api/schemas.ts` — strict request parsing and writable-field allowlists.
- Create: `lib/agent-api/auth.ts` — API Key hashing/authentication and Admin session verification.
- Create: `lib/agent-api/permissions.ts` — scope and current Task collaboration checks.
- Create: `lib/agent-api/handler.ts` — authenticated Route Handler wrappers.
- Create: `lib/agent-api/read-repository.ts` — read DTOs, filters, and cursors.
- Create: `lib/agent-api/mutation-repository.ts` — typed RPC calls and error translation.
- Create tests under `lib/agent-api/__tests__/`.

### Agent Routes

- Create: `app/api/agent/v1/capabilities/route.ts`.
- Create: `app/api/agent/v1/board/route.ts`.
- Create: `app/api/agent/v1/modules/route.ts`.
- Create: `app/api/agent/v1/members/route.ts`.
- Create: `app/api/agent/v1/tasks/route.ts`.
- Create: `app/api/agent/v1/tasks/[id]/route.ts`.
- Create: `app/api/agent/v1/tasks/[id]/activity/route.ts`.
- Create: `app/api/agent/v1/tasks/[id]/experiments/route.ts`.
- Create: `app/api/agent/v1/experiments/route.ts`.
- Create: `app/api/agent/v1/experiments/[id]/route.ts`.
- Create: `app/api/agent/v1/experiments/[id]/attachments/route.ts`.
- Create: `app/api/agent/v1/attachments/[id]/route.ts`.
- Create: `app/api/agent/v1/audit/route.ts`.
- Create route tests under `app/api/agent/v1/__tests__/`.

### Admin Key Management

- Create: `lib/agent-api/admin-keys.ts`.
- Create: `app/api/admin/v1/api-keys/route.ts`.
- Create: `app/api/admin/v1/api-keys/[id]/route.ts`.
- Create: `app/api/admin/v1/api-keys/[id]/rotate/route.ts`.
- Create: `app/api/admin/v1/api-keys/[id]/revoke/route.ts`.
- Create: `app/admin/api-keys/page.tsx`.
- Create: `components/admin/ApiKeyAdmin.tsx`.
- Create: `components/admin/__tests__/ApiKeyAdmin.test.tsx`.
- Modify: `components/Navbar.tsx`.
- Modify: `components/__tests__/Navbar.test.tsx`.
- Modify: `app/globals.css`.

### Skill and Documentation

- Create via `skill-creator`: `.agents/skills/triton-board-api/SKILL.md`.
- Create via `skill-creator`: `.agents/skills/triton-board-api/agents/openai.yaml`.
- Create: `.agents/skills/triton-board-api/references/openapi.yaml`.
- Create: `.agents/skills/triton-board-api/scripts/triton_board_api.py`.
- Create: `scripts/__tests__/triton-board-api-skill.test.ts`.
- Modify: `.env.local.example`.
- Modify: `README.md`.

---

### Task 1: Add UUID Assignees, API Keys, Audit Schema, and Grants

**Files:**
- Create via CLI: the concrete migration file printed by `npx supabase migration new triton_board_agent_api_schema`
- Create: `supabase/tests/0007_agent_api_schema.sql`

**Interfaces:**
- Produces: `public.task_assignees`, `public.api_keys`, `public.agent_api_audit_log`.
- Produces: `attachments.updated_at`.
- Produces: realtime publication and authenticated browser grants for `task_assignees`.
- Produces: service-role-only access to Key/audit tables.

- [ ] **Step 1: Start the local Supabase stack and confirm the CLI surface**

Run:

```bash
npx supabase --version
npx supabase start
npx supabase test db --help
npx supabase migration new --help
```

Expected: CLI `2.110.0`; local API on `54321` and local Postgres on `54322`.

- [ ] **Step 2: Write the failing pgTAP schema test**

Create `supabase/tests/0007_agent_api_schema.sql` with concrete checks:

```sql
begin;
select plan(20);

select has_table('public', 'task_assignees');
select has_pk('public', 'task_assignees');
select has_index('public', 'task_assignees', 'task_assignees_member_task_idx');
select has_table('public', 'api_keys');
select has_column('public', 'api_keys', 'key_digest');
select col_is_unique('public', 'api_keys', 'key_digest');
select has_table('public', 'agent_api_audit_log');
select has_index('public', 'agent_api_audit_log', 'agent_api_audit_key_created_idx');
select has_index('public', 'agent_api_audit_log', 'agent_api_audit_task_created_idx');
select has_column('public', 'attachments', 'updated_at');

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

select col_type_is('public', 'api_keys', 'scopes', 'text[]');
select col_type_is('public', 'agent_api_audit_log', 'before_state', 'jsonb');
select col_type_is('public', 'agent_api_audit_log', 'after_state', 'jsonb');

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
```

- [ ] **Step 3: Run the schema test to verify it fails**

Run:

```bash
npx supabase test db --local supabase/tests/0007_agent_api_schema.sql
```

Expected: FAIL because `public.task_assignees` and `public.api_keys` do not exist.

- [ ] **Step 4: Generate the schema migration using the CLI**

Run:

```bash
npx supabase migration new triton_board_agent_api_schema
```

Expected: the CLI prints one concrete file under `supabase/migrations/`. Use that exact file for the remaining steps in this Task.

- [ ] **Step 5: Implement UUID assignees and fail-fast legacy backfill**

Add the following shape to the generated migration:

```sql
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
```

Enable RLS, add the shared authenticated-team policy, grant only `select`, `insert`, and `delete`,
and add the table to `supabase_realtime`:

```sql
alter table public.task_assignees enable row level security;
create policy "auth access" on public.task_assignees
  for all to authenticated using (true) with check (true);
grant select, insert, delete on public.task_assignees to authenticated;
revoke all on public.task_assignees from anon;

do $realtime$
begin
  alter publication supabase_realtime add table public.task_assignees;
exception when duplicate_object then null;
end
$realtime$;
```

- [ ] **Step 6: Implement Key and audit storage**

Use these columns and constraints:

```sql
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
```

Add `updated_at` to `attachments`, attach the existing `set_updated_at()` trigger, and attach the same trigger to `api_keys`.

- [ ] **Step 7: Implement Member deletion revocation and least-privilege grants**

Add:

```sql
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
```

Enable RLS on `api_keys` and `agent_api_audit_log` without authenticated policies. Use these
table privileges:

```sql
revoke all on public.api_keys from anon, authenticated;
revoke all on public.agent_api_audit_log from anon, authenticated;
grant select, insert, update on public.api_keys to service_role;
grant select, insert on public.agent_api_audit_log to service_role;
grant select on public.task_assignees to service_role;
```

Revoke `EXECUTE` on the trigger function from `public`, `anon`, and `authenticated`.

This trigger function is the one intentional `SECURITY DEFINER`: a normal authenticated Dashboard
user may delete a Member but has no direct privilege on `api_keys`. Its body has no caller input,
uses a blank `search_path`, and can only update Keys matching the deleted `OLD.id`.

- [ ] **Step 8: Reset local Supabase and run the schema test**

Run:

```bash
npx supabase db reset --local
npx supabase test db --local supabase/tests/0007_agent_api_schema.sql
```

Expected: migration applies and all 20 pgTAP assertions pass.

- [ ] **Step 9: Commit the schema**

Stage only the CLI-generated migration and schema test:

```bash
readarray -t AGENT_API_SCHEMA_MIGRATIONS < <(
  find supabase/migrations -maxdepth 1 -type f \
    -name '*_triton_board_agent_api_schema.sql' -print
)
test "${#AGENT_API_SCHEMA_MIGRATIONS[@]}" -eq 1
git add -- "${AGENT_API_SCHEMA_MIGRATIONS[0]}" \
  supabase/tests/0007_agent_api_schema.sql
git commit -m "feat: add Agent API database schema"
```

---

### Task 2: Add Atomic Mutation and Audit RPCs

**Files:**
- Create via CLI: the concrete migration file printed by `npx supabase migration new triton_board_agent_api_mutations`
- Create: `supabase/tests/0008_agent_api_mutations.sql`

**Interfaces:**
- Produces: `agent_api_patch_task(...) returns jsonb`.
- Produces: `agent_api_create_experiment(...) returns jsonb`.
- Produces: `agent_api_patch_experiment(...) returns jsonb`.
- Produces: `agent_api_create_activity(...) returns jsonb`.
- Produces: `agent_api_create_attachment(...) returns jsonb`.
- Produces: `agent_api_patch_attachment(...) returns jsonb`.
- All functions return `{ "data": object, "idempotency_replayed": boolean }`.

- [ ] **Step 1: Write failing pgTAP function tests**

Create `supabase/tests/0008_agent_api_mutations.sql`. Begin with fixtures and function-existence checks:

```sql
begin;
select plan(16);

select has_function('public', 'agent_api_patch_task');
select has_function('public', 'agent_api_create_experiment');
select has_function('public', 'agent_api_patch_experiment');
select has_function('public', 'agent_api_create_activity');
select has_function('public', 'agent_api_create_attachment');
select has_function('public', 'agent_api_patch_attachment');

insert into public.modules (id, name)
values ('10000000-0000-4000-8000-000000000001', 'Agent API Test');
insert into public.members (id, name)
values
  ('20000000-0000-4000-8000-000000000001', 'Bruce'),
  ('20000000-0000-4000-8000-000000000002', 'Alice');
insert into public.tasks (id, module_id, title)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Shared task'
);
insert into public.task_assignees (task_id, member_id)
values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001'
);
insert into public.api_keys (
  id, name, key_prefix, key_digest, member_id, scopes, created_by
) values (
  '40000000-0000-4000-8000-000000000001',
  'Bruce key',
  'tb_live_test',
  repeat('a', 64),
  '20000000-0000-4000-8000-000000000001',
  array['board:read','tasks:write','experiments:write'],
  '50000000-0000-4000-8000-000000000001'
);

select public.agent_api_patch_task(
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  (
    select updated_at from public.tasks
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  '{"title":"Retitled by Bruce"}',
  'req_task_ok'
);
select is(
  (
    select title from public.tasks
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  'Retitled by Bruce',
  'Bruce can patch an assigned Task'
);

select throws_ok(
  $$select public.agent_api_patch_task(
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    (select updated_at from public.tasks where id =
      '30000000-0000-4000-8000-000000000001'),
    '{"title":"Alice attempt"}',
    'req_wrong_member'
  )$$,
  'P0001',
  'TASK_SCOPE_FORBIDDEN',
  'a Key cannot claim another Member'
);
select throws_ok(
  $$select public.agent_api_patch_task(
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '2000-01-01T00:00:00Z',
    '{"title":"Stale attempt"}',
    'req_stale'
  )$$,
  'P0001',
  'VERSION_CONFLICT',
  'stale Task ETag fails'
);

create temporary table agent_api_test_results (
  label text primary key,
  result jsonb not null
);
insert into agent_api_test_results (label, result)
select 'first', public.agent_api_create_experiment(
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Agent experiment',
  '60000000-0000-4000-8000-000000000001',
  repeat('1', 64),
  'req_exp_first'
);
insert into agent_api_test_results (label, result)
select 'replay', public.agent_api_create_experiment(
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Agent experiment',
  '60000000-0000-4000-8000-000000000001',
  repeat('1', 64),
  'req_exp_replay'
);

select is(
  (
    select e.owner_id
    from public.experiments e
    where e.id::text = (
      select result #>> '{data,id}'
      from agent_api_test_results where label = 'first'
    )
  ),
  '20000000-0000-4000-8000-000000000001'::uuid,
  'Experiment Owner is forced to the Key Member'
);
select is(
  (
    select e.status
    from public.experiments e
    where e.id::text = (
      select result #>> '{data,id}'
      from agent_api_test_results where label = 'first'
    )
  ),
  'planned',
  'Agent-created Experiment starts planned'
);
select is(
  (
    select result #>> '{data,id}'
    from agent_api_test_results where label = 'replay'
  ),
  (
    select result #>> '{data,id}'
    from agent_api_test_results where label = 'first'
  ),
  'idempotent replay returns the original Experiment'
);
select throws_ok(
  $$select public.agent_api_create_experiment(
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Different body',
    '60000000-0000-4000-8000-000000000001',
    repeat('2', 64),
    'req_exp_mismatch'
  )$$,
  'P0001',
  'IDEMPOTENCY_KEY_REUSED',
  'an Idempotency-Key cannot be reused for another request'
);
select ok(
  (
    select count(*) = 2
      and bool_and(after_state is not null)
      and bool_or(before_state is not null)
    from public.agent_api_audit_log
    where api_key_id = '40000000-0000-4000-8000-000000000001'
  ),
  'successful writes create snapshots and replay creates no duplicate audit'
);

insert into public.agent_api_audit_log (
  api_key_id,
  member_id,
  request_id,
  resource_type,
  resource_id,
  task_id,
  action,
  before_state,
  after_state,
  response_status
)
select
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'req_rate_' || sequence_no,
  'task',
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'patch',
  '{}'::jsonb,
  '{}'::jsonb,
  200
from generate_series(1, 28) as generated(sequence_no);

select lives_ok(
  $$select public.agent_api_create_experiment(
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Agent experiment',
    '60000000-0000-4000-8000-000000000001',
    repeat('1', 64),
    'req_exp_replay_at_quota'
  )$$,
  'idempotent replay still works at the write limit'
);
select throws_ok(
  $$select public.agent_api_patch_task(
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    (select updated_at from public.tasks where id =
      '30000000-0000-4000-8000-000000000001'),
    '{"title":"Over quota"}',
    'req_over_quota'
  )$$,
  'P0001',
  'WRITE_RATE_LIMITED',
  'a new write fails after 30 successful writes in 60 seconds'
);

select * from finish();
rollback;
```

The six function checks plus ten behavioral checks are the complete 16-test plan. Activity and
Attachment request-shape and adapter behavior are covered in Task 9; keep this pgTAP plan at 16.

- [ ] **Step 2: Run the mutation test to verify it fails**

Run:

```bash
npx supabase test db --local supabase/tests/0008_agent_api_mutations.sql
```

Expected: FAIL because the RPC functions do not exist.

- [ ] **Step 3: Generate the mutation migration**

Run:

```bash
npx supabase migration new triton_board_agent_api_mutations
```

Expected: the CLI prints one new migration path. Use exactly that path.

- [ ] **Step 4: Add shared SQL guards**

Define private-by-grant helpers in `public` because it is the configured Data API schema, then revoke public execution:

```sql
create or replace function public.agent_api_require_task_access(
  p_api_key_id uuid,
  p_member_id uuid,
  p_task_id uuid,
  p_required_scope text
) returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.api_keys k
    join public.task_assignees ta on ta.member_id = k.member_id
    where k.id = p_api_key_id
      and k.member_id = p_member_id
      and k.revoked_at is null
      and (k.expires_at is null or k.expires_at > now())
      and p_required_scope = any(k.scopes)
      and ta.task_id = p_task_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'TASK_SCOPE_FORBIDDEN';
  end if;
end
$function$;

create or replace function public.agent_api_require_write_quota(
  p_api_key_id uuid
) returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('agent-api-quota:' || p_api_key_id::text, 0)
  );

  if (
    select count(*)
    from public.agent_api_audit_log
    where api_key_id = p_api_key_id
      and response_status between 200 and 299
      and created_at > now() - interval '60 seconds'
  ) >= 30 then
    raise exception using
      errcode = 'P0001',
      message = 'WRITE_RATE_LIMITED';
  end if;
end
$function$;
```

Add this exact idempotency helper:

```sql
public.agent_api_existing_idempotency(
  p_api_key_id uuid,
  p_idempotency_key text,
  p_request_hash text
) returns jsonb
```

It returns null when the pair is unused. When the stored hash differs, it raises
`IDEMPOTENCY_KEY_REUSED`. When it matches, it returns:

```sql
jsonb_build_object(
  'data', after_state,
  'idempotency_replayed', true
)
```

Every mutation RPC passes its own constant required scope into the Task guard
(`tasks:write`, `experiments:write`, `activity:append`, or `attachments:write`). Every create RPC
must then execute in this order:

1. Check current Task access.
2. Take this transaction-scoped advisory lock:

   ```sql
   perform pg_advisory_xact_lock(
     hashtextextended(
       'agent-api-idempotency:' ||
       p_api_key_id::text || ':' || p_idempotency_key,
       0
     )
   );
   ```

3. Call `agent_api_existing_idempotency` and immediately return a match.
4. Call `agent_api_require_write_quota` only for a new write.
5. Insert the resource and its audit row.

Every PATCH calls Task access and then write quota before updating. This makes retries free while
still rechecking current collaboration and serializes simultaneous retries of one POST.

- [ ] **Step 5: Implement Task PATCH atomically**

Use this exact signature:

```sql
public.agent_api_patch_task(
  p_api_key_id uuid,
  p_member_id uuid,
  p_task_id uuid,
  p_expected_updated_at timestamptz,
  p_changes jsonb,
  p_request_id text
) returns jsonb
```

Inside one function:

1. Call `agent_api_require_task_access` with `tasks:write`.
2. Call `agent_api_require_write_quota`.
3. Select `to_jsonb(tasks.*)` into `v_before`.
4. Update only `title`, `status`, `notes`, `tags`, `priority`, `due_date`, and `position`, using `CASE WHEN p_changes ? 'field'`.
5. Filter by both `id` and `updated_at`.
6. Raise `VERSION_CONFLICT` when no row is returned.
7. Insert the before/after audit row with `response_status = 200`.
8. Return `jsonb_build_object('data', v_after, 'idempotency_replayed', false)`.

The core update must be explicit:

```sql
update public.tasks
set
  title = case when p_changes ? 'title'
    then p_changes->>'title' else title end,
  status = case when p_changes ? 'status'
    then p_changes->>'status' else status end,
  notes = case when p_changes ? 'notes'
    then p_changes->>'notes' else notes end,
  position = case when p_changes ? 'position'
    then (p_changes->>'position')::double precision else position end
where id = p_task_id
  and updated_at = p_expected_updated_at
returning to_jsonb(public.tasks.*) into v_after;
```

- [ ] **Step 6: Implement Experiment create and PATCH**

Use exact signatures:

```sql
public.agent_api_create_experiment(
  p_api_key_id uuid,
  p_member_id uuid,
  p_task_id uuid,
  p_name text,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text
) returns jsonb

public.agent_api_patch_experiment(
  p_api_key_id uuid,
  p_member_id uuid,
  p_experiment_id uuid,
  p_expected_updated_at timestamptz,
  p_changes jsonb,
  p_request_id text
) returns jsonb
```

Creation checks `experiments:write` in the Task guard, checks
`length(trim(p_name)) between 1 and 200`, derives `task_id` from `p_task_id`,
derives `owner_id` from `p_member_id`, and always inserts `status = 'planned'`. It accepts no
other business field. PATCH first resolves the Experiment Task, calls both guards, and explicitly
maps only:

```text
name, status, baseline_experiment_id, data_spec, object_spec,
environment_spec, config, notes, metrics, featured_metric_keys,
result_summary, decision_outcome, decision_notes, position
```

Use the same ETag and audit sequence as Task PATCH.

- [ ] **Step 7: Implement Activity and Attachment functions**

Use exact signatures:

```sql
public.agent_api_create_activity(
  p_api_key_id uuid,
  p_member_id uuid,
  p_task_id uuid,
  p_text text,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text
) returns jsonb

public.agent_api_create_attachment(
  p_api_key_id uuid,
  p_member_id uuid,
  p_experiment_id uuid,
  p_path text,
  p_url text,
  p_caption text,
  p_idempotency_key text,
  p_request_hash text,
  p_request_id text
) returns jsonb

public.agent_api_patch_attachment(
  p_api_key_id uuid,
  p_member_id uuid,
  p_attachment_id uuid,
  p_expected_updated_at timestamptz,
  p_caption text,
  p_request_id text
) returns jsonb
```

Activity rows always use `kind = 'comment'` and pass `activity:append` to the guard. Attachment
functions resolve Task through the Experiment and pass `attachments:write`. All three create
functions use the access → idempotency lock/check → quota → write sequence; Attachment PATCH uses
access → quota → ETag update.

- [ ] **Step 8: Revoke function execution and grant service role only**

For every helper and mutation function:

```sql
revoke execute on function public.agent_api_patch_task(
  uuid, uuid, uuid, timestamptz, jsonb, text
) from public, anon, authenticated;
grant execute on function public.agent_api_patch_task(
  uuid, uuid, uuid, timestamptz, jsonb, text
) to service_role;
```

Repeat with each exact signature, including both guard helpers and the idempotency helper. These
RPC/helper functions use `SECURITY INVOKER`; only Task 1's trigger-only Member cleanup function is
`SECURITY DEFINER`.

- [ ] **Step 9: Reset and run both database tests**

Run:

```bash
npx supabase db reset --local
npx supabase test db --local \
  supabase/tests/0007_agent_api_schema.sql \
  supabase/tests/0008_agent_api_mutations.sql
```

Expected: both files pass; stale ETags and unauthorized Members leave data unchanged.

- [ ] **Step 10: Commit the RPCs**

```bash
readarray -t AGENT_API_MUTATION_MIGRATIONS < <(
  find supabase/migrations -maxdepth 1 -type f \
    -name '*_triton_board_agent_api_mutations.sql' -print
)
test "${#AGENT_API_MUTATION_MIGRATIONS[@]}" -eq 1
git add -- "${AGENT_API_MUTATION_MIGRATIONS[0]}" \
  supabase/tests/0008_agent_api_mutations.sql
git commit -m "feat: add atomic Agent API mutations"
```

---

### Task 3: Switch the Dashboard to UUID Task Assignees

**Files:**
- Create: `lib/tasks/assignees.ts`
- Create: `lib/tasks/__tests__/assignees.test.ts`
- Modify: `components/Board.tsx`
- Modify: `components/TaskDetail.tsx`
- Modify: `components/Analytics.tsx`
- Modify: `lib/experiments/repository.ts`
- Modify: `components/__tests__/TaskDetail.test.tsx`
- Modify: `lib/experiments/__tests__/repository.test.ts`

**Interfaces:**
- Produces: `TASK_WITH_ASSIGNEES_SELECT`.
- Produces: `normalizeTaskRow(row): Task`.
- Produces: `assignTaskMember(client, taskId, memberId)` and `unassignTaskMember(...)`.
- Preserves: existing `Task.assignees: string[]` as a normalized display DTO; it no longer comes from `tasks.assignees`.

- [ ] **Step 1: Write failing normalization tests**

Create the pure normalization test:

```ts
import { describe, expect, it } from "vitest";
import {
  normalizeTaskRow,
  TASK_WITH_ASSIGNEES_SELECT,
} from "@/lib/tasks/assignees";

describe("normalizeTaskRow", () => {
  it("derives display names from UUID relationships", () => {
    const task = normalizeTaskRow({
      id: "task-1",
      module_id: "module-1",
      title: "Kernel",
      status: "todo",
      assignees: ["stale name"],
      notes: "",
      position: 0,
      created_at: "2026-07-28T00:00:00Z",
      updated_at: "2026-07-28T00:00:00Z",
      task_assignees: [
        { member_id: "member-2", member: { name: "Alice" } },
        { member_id: "member-1", member: { name: "Bruce" } },
      ],
    });

    expect(task.assignees).toEqual(["Alice", "Bruce"]);
    expect("task_assignees" in task).toBe(false);
    expect(TASK_WITH_ASSIGNEES_SELECT).toContain("task_assignees");
  });
});
```

Before production edits, update `TaskDetail.test.tsx` so rapid assignment cases expect
`task_assignees` insert/delete calls using Member UUIDs and explicitly reject a
`tasks.update({ assignees: ... })` call. Update `repository.test.ts` fixtures to return the nested
`task_assignees(member_id, member:members(name))` relation and expect normalized display names.

- [ ] **Step 2: Run the unit test to verify it fails**

Run:

```bash
npm test -- \
  lib/tasks/__tests__/assignees.test.ts \
  components/__tests__/TaskDetail.test.tsx \
  lib/experiments/__tests__/repository.test.ts
```

Expected: FAIL because the adapter does not exist and current mutations still write the legacy
array.

- [ ] **Step 3: Implement the shared assignee adapter**

Create a focused module:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task } from "@/lib/types";

export const TASK_WITH_ASSIGNEES_SELECT = [
  "*",
  "task_assignees(member_id,member:members(name))",
].join(",");

type TaskRelationRow = Task & {
  task_assignees: Array<{
    member_id: string;
    member: { name: string } | null;
  }>;
};

export function normalizeTaskRow(row: TaskRelationRow): Task {
  const { task_assignees, ...task } = row;
  return {
    ...task,
    assignees: task_assignees
      .flatMap((relation) => relation.member?.name ?? [])
      .sort((left, right) => left.localeCompare(right)),
  };
}

export async function assignTaskMember(
  client: SupabaseClient,
  taskId: string,
  memberId: string,
): Promise<void> {
  const { error } = await client
    .from("task_assignees")
    .insert({ task_id: taskId, member_id: memberId });
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function unassignTaskMember(
  client: SupabaseClient,
  taskId: string,
  memberId: string,
): Promise<void> {
  const { error } = await client
    .from("task_assignees")
    .delete()
    .eq("task_id", taskId)
    .eq("member_id", memberId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Update Board and Analytics reads**

Replace Task `select("*")` calls with `select(TASK_WITH_ASSIGNEES_SELECT)`, normalize every returned
Task, and subscribe to `task_assignees` realtime changes. Keep component state and render code on
`Task.assignees: string[]`.

For Board mutations:

```ts
const member = members.find((candidate) => candidate.name === name);
if (!member) throw new Error(`Unknown member: ${name}`);
if (had) {
  await unassignTaskMember(supabase, taskId, member.id);
} else {
  await assignTaskMember(supabase, taskId, member.id);
}
```

Task creation must omit the legacy `assignees` field. Member deletion must rely on FK cascade and
must stop issuing Task updates. “Add teammate and assign” must select the inserted Member's UUID
and call `assignTaskMember`; it must not append the new display name to `tasks.assignees`.

- [ ] **Step 5: Update Task Detail without losing mutation queue behavior**

Load the Task with `TASK_WITH_ASSIGNEES_SELECT` and `normalizeTaskRow`. Keep the existing assignee
coordinator, but send each queued assignment through:

```ts
const member = membersRef.current.find(
  (candidate) => candidate.name === activityEvent.change.name,
);
if (!member) throw new Error("Assignee no longer exists.");

if (activityEvent.change.assigned) {
  await assignTaskMember(client, requestedVisit.id, member.id);
} else {
  await unassignTaskMember(client, requestedVisit.id, member.id);
}
```

Do not send an `assignees` property to `tasks.update()`.

- [ ] **Step 6: Update Experiment reference loads**

In `loadExperimentReferenceData`, select Task relations using
`TASK_WITH_ASSIGNEES_SELECT` and map through `normalizeTaskRow`. Update repository mocks to return
the nested relation.

- [ ] **Step 7: Run focused and full UI tests**

Run:

```bash
npm test -- \
  lib/tasks/__tests__/assignees.test.ts \
  components/__tests__/TaskDetail.test.tsx \
  lib/experiments/__tests__/repository.test.ts
npm test
```

Expected: all tests pass; no Task mutation trace contains an `assignees` property.

- [ ] **Step 8: Commit UUID assignee integration**

```bash
git add \
  lib/tasks/assignees.ts \
  lib/tasks/__tests__/assignees.test.ts \
  components/Board.tsx \
  components/TaskDetail.tsx \
  components/Analytics.tsx \
  lib/experiments/repository.ts \
  components/__tests__/TaskDetail.test.tsx \
  lib/experiments/__tests__/repository.test.ts
git commit -m "feat: use UUID Task assignees"
```

---

### Task 4: Add Strict Agent API Types, Schemas, and Responses

**Files:**
- Create: `lib/experiments/schema.ts`
- Modify: `lib/experiments/draft.ts`
- Modify: `lib/types.ts`
- Create: `lib/agent-api/types.ts`
- Create: `lib/agent-api/errors.ts`
- Create: `lib/agent-api/responses.ts`
- Create: `lib/agent-api/schemas.ts`
- Create: `lib/agent-api/__tests__/schemas.test.ts`
- Create: `lib/agent-api/__tests__/responses.test.ts`

**Interfaces:**
- Produces: `ApiScope`, `AgentContext`, `ApiSuccess`, `ApiFailure`.
- Produces: `AgentApiError`.
- Produces: `readJsonObject(request)`, `parseTaskPatch(body)`, `parseExperimentPatch(body)`, `parseExperimentCreate(body)`.
- Produces: `successResponse(...)`, `errorResponse(...)`, `etagFor(updatedAt)`, `parseIfMatch(request)`.

- [ ] **Step 1: Extract reusable Experiment guards with characterization tests**

Move `isDataSpec`, `isObjectSpec`, `isEnvironmentSpec`, `isConfig`, and `isMetrics` from
`lib/experiments/draft.ts` into exported functions in `lib/experiments/schema.ts`. Keep
`draft.ts` behavior unchanged by importing the functions.

Before moving them, add tests for valid values, non-finite metrics, unknown platform values, and
invalid Dataset items.

- [ ] **Step 2: Write failing Agent patch schema tests**

Use exact expectations:

```ts
it("accepts only Task writable fields", () => {
  expect(parseTaskPatch({
    changes: { title: "Tune matmul", status: "blocked", position: 2 },
  })).toEqual({
    title: "Tune matmul",
    status: "blocked",
    position: 2,
  });
});

it.each(["module_id", "assignees", "id", "created_at", "updated_at"])(
  "rejects Task field %s",
  (field) => {
    expect(() => parseTaskPatch({ changes: { [field]: "x" } }))
      .toThrowError(expect.objectContaining({ code: "FIELD_NOT_WRITABLE" }));
  },
);

it.each(["owner_id", "task_id", "experiment_no", "started_at", "completed_at"])(
  "rejects Experiment field %s",
  (field) => {
    expect(() => parseExperimentPatch({ changes: { [field]: "x" } }))
      .toThrowError(expect.objectContaining({ code: "FIELD_NOT_WRITABLE" }));
  },
);

it("accepts only a name when creating an Experiment", () => {
  expect(parseExperimentCreate({ name: " Agent experiment " })).toEqual({
    name: "Agent experiment",
  });
});

it.each(["status", "config", "owner_id", "task_id", "created_at"])(
  "rejects Experiment create field %s",
  (field) => {
    expect(() => parseExperimentCreate({
      name: "Agent experiment",
      [field]: "x",
    })).toThrowError(expect.objectContaining({ code: "FIELD_NOT_WRITABLE" }));
  },
);
```

- [ ] **Step 3: Implement stable types and errors**

In `types.ts` define:

```ts
export const API_SCOPES = [
  "board:read",
  "tasks:write",
  "experiments:write",
  "attachments:write",
  "activity:append",
  "audit:read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export interface AgentContext {
  apiKeyId: string;
  keyPrefix: string;
  memberId: string;
  memberName: string;
  scopes: ReadonlySet<ApiScope>;
  expiresAt: string | null;
}
```

In `errors.ts`, implement:

```ts
export class AgentApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
```

- [ ] **Step 4: Implement strict body parsing**

`readJsonObject` must read `request.text()` once, reject more than `256 * 1024` UTF-8 bytes,
reject invalid JSON, and require a non-array object.

Patch parsers must:

- Require exactly one top-level `changes` object.
- Reject empty changes.
- Reject unknown fields rather than dropping them.
- Reject non-finite numbers.
- Validate enums and nested Experiment objects with `lib/experiments/schema.ts`.
- Return a new object containing only validated writable fields.

Experiment create requires exactly one top-level `name`, trims it, and requires 1–200 characters.
It rejects every other field, including otherwise PATCH-writable fields. Task, Owner, and initial
`planned` status are server-derived.

- [ ] **Step 5: Implement response helpers**

Use Web `Response` APIs:

```ts
export function etagFor(updatedAt: string): string {
  return `"${updatedAt}"`;
}

export function parseIfMatch(request: Request): string {
  const value = request.headers.get("if-match");
  if (!value?.startsWith('"') || !value.endsWith('"')) {
    throw new AgentApiError(
      400,
      "MISSING_IF_MATCH",
      "PATCH requires a quoted If-Match value.",
    );
  }
  return value.slice(1, -1);
}
```

`errorResponse` must never include stack traces or Supabase secrets. Every envelope contains one
`request_id`. Success and error responses default to `Cache-Control: no-store`. A
`WRITE_RATE_LIMITED` error sets `Retry-After: 60`.

Add `updated_at: string` to `Attachment` in `lib/types.ts`; this is the ETag source for caption
PATCH.

- [ ] **Step 6: Run the focused tests**

Run:

```bash
npm test -- \
  lib/agent-api/__tests__/schemas.test.ts \
  lib/agent-api/__tests__/responses.test.ts \
  lib/experiments/__tests__/draft.test.ts
```

Expected: all strict-field, size, null, array, ETag, and envelope tests pass.

- [ ] **Step 7: Commit API primitives**

```bash
git add \
  lib/agent-api/types.ts \
  lib/agent-api/errors.ts \
  lib/agent-api/responses.ts \
  lib/agent-api/schemas.ts \
  lib/agent-api/__tests__/schemas.test.ts \
  lib/agent-api/__tests__/responses.test.ts \
  lib/experiments/schema.ts \
  lib/experiments/draft.ts \
  lib/experiments/__tests__/draft.test.ts \
  lib/types.ts
git commit -m "feat: add Agent API validation primitives"
```

---

### Task 5: Add Server Credentials, API Key Authentication, and Permissions

**Files:**
- Create: `lib/agent-api/server.ts`
- Create: `lib/agent-api/auth.ts`
- Create: `lib/agent-api/permissions.ts`
- Create: `lib/agent-api/handler.ts`
- Create: `lib/agent-api/__tests__/auth.test.ts`
- Create: `lib/agent-api/__tests__/permissions.test.ts`
- Create: `lib/agent-api/__tests__/handler.test.ts`
- Modify: `.env.local.example`

**Interfaces:**
- Produces: `getServerSupabase()`.
- Produces: `generateApiKey()`, `digestApiKey(raw)`.
- Produces: `authenticateAgent(request): Promise<AgentContext>`.
- Produces: `authenticateAdmin(request): Promise<{ userId: string }>`.
- Produces: `requireScope(context, scope)`, `requireTaskCollaboration(context, taskId)`.
- Produces: `withAuthenticatedAgent(request, handler)` and `withAgent(request, scope, handler)`.

- [ ] **Step 1: Write failing key and auth tests**

Cover:

```ts
it("generates a prefixed 256-bit key and stores only a digest", () => {
  const generated = generateApiKey();
  expect(generated.raw).toMatch(/^tb_live_[A-Za-z0-9_-]+_[A-Za-z0-9_-]+$/);
  expect(generated.secretBytes).toBe(32);
  expect(digestApiKey(generated.raw)).toMatch(/^[a-f0-9]{64}$/);
  expect(generated.raw).not.toContain(digestApiKey(generated.raw));
});
```

Also cover missing/malformed Bearer headers, unknown digest, revoked Key, expired Key, null Member,
valid Key, missing scope, and Admin user UUID mismatch.

- [ ] **Step 2: Implement the server-only Supabase client**

```ts
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error("Server Supabase configuration is missing.");
  }
  client ??= createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
```

Do not export the secret or include it in an error.

- [ ] **Step 3: Implement Key generation and authentication**

Generate 32 random bytes with `node:crypto`, encode base64url, derive an eight-character public
prefix, and SHA-256 the complete raw Key.

`authenticateAgent` must select only:

```text
id, key_prefix, member_id, scopes, expires_at, revoked_at,
member:members(id,name)
```

It returns `401 INVALID_API_KEY` for every invalid credential state, so callers cannot distinguish
unknown, expired, revoked, or deleted-Member Keys.

Update `last_used_at` best-effort only when it is null or more than five minutes old.

- [ ] **Step 4: Implement Admin authentication**

Read the Supabase access token from the Admin request Bearer header, call
`getServerSupabase().auth.getUser(token)`, and require:

```ts
user.id === process.env.TRITON_BOARD_ADMIN_USER_ID
```

Return `401` for invalid sessions and `403` for a valid non-Admin user.

- [ ] **Step 5: Implement scope and collaboration checks**

```ts
export function requireScope(
  context: AgentContext,
  scope: ApiScope,
): void {
  if (!context.scopes.has(scope)) {
    throw new AgentApiError(403, "SCOPE_FORBIDDEN", `Missing scope: ${scope}`);
  }
}
```

`requireTaskCollaboration` queries `task_assignees` by both Task and `context.memberId`.
Experiment and Attachment permission helpers resolve the parent Task from the database rather
than trusting URL/body relationships.

- [ ] **Step 6: Implement the Route Handler wrappers**

```ts
export async function withAuthenticatedAgent(
  request: Request,
  handler: (context: AgentContext, requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = `req_${randomUUID()}`;
  try {
    const context = await authenticateAgent(request);
    return await handler(context, requestId);
  } catch (reason) {
    return errorResponse(reason, requestId);
  }
}

export async function withAgent(
  request: Request,
  scope: ApiScope,
  handler: (context: AgentContext, requestId: string) => Promise<Response>,
): Promise<Response> {
  return withAuthenticatedAgent(request, async (context, requestId) => {
    requireScope(context, scope);
    return handler(context, requestId);
  });
}
```

Do not use Proxy as the only auth check.

- [ ] **Step 7: Add server environment examples**

Append commented server-only entries:

```dotenv
# Server-only: required by Agent/Admin Route Handlers. Never prefix with NEXT_PUBLIC_.
# SUPABASE_SECRET_KEY=sb_secret_your_secret_key
# TRITON_BOARD_ADMIN_USER_ID=00000000-0000-4000-8000-000000000000
```

- [ ] **Step 8: Run auth and permission tests**

Run:

```bash
npm test -- \
  lib/agent-api/__tests__/auth.test.ts \
  lib/agent-api/__tests__/permissions.test.ts \
  lib/agent-api/__tests__/handler.test.ts
```

Expected: invalid credentials converge on `401`; scope and Task mismatches return `403`; no
response contains a raw Key.

- [ ] **Step 9: Commit authentication**

```bash
git add \
  lib/agent-api/server.ts \
  lib/agent-api/auth.ts \
  lib/agent-api/permissions.ts \
  lib/agent-api/handler.ts \
  lib/agent-api/__tests__/auth.test.ts \
  lib/agent-api/__tests__/permissions.test.ts \
  lib/agent-api/__tests__/handler.test.ts \
  .env.local.example
git commit -m "feat: authenticate Agent API keys"
```

---

### Task 6: Add Shared-Admin API Key Management

**Files:**
- Create: `lib/agent-api/admin-keys.ts`
- Create: `lib/agent-api/__tests__/admin-keys.test.ts`
- Create: `app/api/admin/v1/api-keys/route.ts`
- Create: `app/api/admin/v1/api-keys/[id]/route.ts`
- Create: `app/api/admin/v1/api-keys/[id]/rotate/route.ts`
- Create: `app/api/admin/v1/api-keys/[id]/revoke/route.ts`
- Create: `app/admin/api-keys/page.tsx`
- Create: `components/admin/ApiKeyAdmin.tsx`
- Create: `components/admin/__tests__/ApiKeyAdmin.test.tsx`
- Modify: `components/Navbar.tsx`
- Modify: `components/__tests__/Navbar.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: Admin key list/create/update/rotate/revoke functions.
- Produces: Admin Route Handlers authenticated by Supabase session plus Admin UUID.
- Produces: `/admin/api-keys` UI; raw Key is shown once.

- [ ] **Step 1: Write failing key lifecycle tests**

Test:

```ts
it("returns the raw key only from create", async () => {
  const created = await createManagedKey(store, admin, {
    name: "Bruce experiments",
    member_id: BRUCE_ID,
    scopes: ["board:read", "experiments:write"],
    expires_at: null,
  });

  expect(created.secret).toMatch(/^tb_live_/);
  expect(store.inserted.key_digest).toHaveLength(64);
  expect(JSON.stringify(store.inserted)).not.toContain(created.secret);

  const listed = await listManagedKeys(store);
  expect(JSON.stringify(listed)).not.toContain(created.secret);
});
```

Also test rotate invalidates the old digest, revoke is idempotent, revoked Keys cannot rotate,
unknown scopes are rejected, and Member UUID must exist.

- [ ] **Step 2: Implement the Admin key service**

Use exact DTOs:

```ts
export interface ManagedKeyInput {
  name: string;
  member_id: string;
  scopes: ApiScope[];
  expires_at: string | null;
}

export interface ManagedKeyView {
  id: string;
  name: string;
  key_prefix: string;
  member: { id: string; name: string } | null;
  scopes: ApiScope[];
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}
```

Create/rotate call `generateApiKey`, save only digest/prefix, and return `secret` outside the
persistent view. PATCH cannot clear `revoked_at`. Rotate rejects already-revoked Keys.
Every Admin response, especially a response containing `secret`, uses `Cache-Control: no-store`.

- [ ] **Step 3: Implement Admin Route Handlers**

Each handler calls `authenticateAdmin`. Await dynamic params:

```ts
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // authenticate, rotate, return one-time secret
}
```

Export only the methods listed in the design. Never export `DELETE`.

- [ ] **Step 4: Write the failing Admin UI and navigation tests**

Test rendering the list, creating a Bruce Key, showing the one-time secret, copying it, revoking a
Key, and ensuring no secret is re-rendered after dismissing the result.

Update `Navbar.test.tsx` before the component so it expects the `API Keys` destination and marks it
active at `/admin/api-keys`.

- [ ] **Step 5: Implement the Admin page**

`app/admin/api-keys/page.tsx`:

```tsx
import AuthGate from "@/components/AuthGate";
import ApiKeyAdmin from "@/components/admin/ApiKeyAdmin";

export default function ApiKeysPage() {
  return (
    <AuthGate>
      <ApiKeyAdmin />
    </AuthGate>
  );
}
```

The Client Component gets the current Supabase session, sends its access token to Admin API
Bearer auth, and renders:

- Key name.
- Member.
- scopes.
- prefix.
- expiry/revocation/last-used status.
- create, rotate, and revoke controls.
- a one-time secret panel after create/rotate.

Do not persist the secret in localStorage or sessionStorage.

- [ ] **Step 6: Add navigation and minimal existing-style CSS**

Add an `API Keys` Navbar link and use existing design tokens/classes. Keep the page operational,
not a new visual design system.

- [ ] **Step 7: Run Admin service and UI tests**

Run:

```bash
npm test -- \
  lib/agent-api/__tests__/admin-keys.test.ts \
  components/admin/__tests__/ApiKeyAdmin.test.tsx \
  components/__tests__/Navbar.test.tsx
```

Expected: all lifecycle and one-time-secret tests pass.

- [ ] **Step 8: Commit Admin Key management**

```bash
git add \
  lib/agent-api/admin-keys.ts \
  lib/agent-api/__tests__/admin-keys.test.ts \
  app/api/admin/v1/api-keys/route.ts \
  'app/api/admin/v1/api-keys/[id]/route.ts' \
  'app/api/admin/v1/api-keys/[id]/rotate/route.ts' \
  'app/api/admin/v1/api-keys/[id]/revoke/route.ts' \
  app/admin/api-keys/page.tsx \
  components/admin/ApiKeyAdmin.tsx \
  components/admin/__tests__/ApiKeyAdmin.test.tsx \
  components/Navbar.tsx \
  components/__tests__/Navbar.test.tsx \
  app/globals.css
git commit -m "feat: manage Agent API keys"
```

---

### Task 7: Add Agent Read Endpoints

**Files:**
- Create: `lib/agent-api/read-repository.ts`
- Create: `lib/agent-api/__tests__/read-repository.test.ts`
- Create: `app/api/agent/v1/capabilities/route.ts`
- Create: `app/api/agent/v1/board/route.ts`
- Create: `app/api/agent/v1/modules/route.ts`
- Create: `app/api/agent/v1/members/route.ts`
- Create: `app/api/agent/v1/tasks/route.ts`
- Create: `app/api/agent/v1/tasks/[id]/route.ts`
- Create: `app/api/agent/v1/tasks/[id]/activity/route.ts`
- Create: `app/api/agent/v1/experiments/route.ts`
- Create: `app/api/agent/v1/experiments/[id]/route.ts`
- Create: `app/api/agent/v1/audit/route.ts`
- Create: `app/api/agent/v1/__tests__/read-routes.test.ts`

**Interfaces:**
- Produces: read repository DTO functions and opaque cursor helpers.
- Produces: all GET endpoints from the design.
- Single-resource responses include `ETag` from `updated_at`.

- [ ] **Step 1: Write failing cursor and DTO tests**

Define cursor payloads as base64url JSON:

```ts
interface UpdatedCursor {
  updated_at: string;
  id: string;
}
```

Test round-trip, malformed cursor rejection, max `limit=100`, legacy `tasks.assignees` omission,
Key/audit secret omission, and audit filtering by current `task_assignees`.

- [ ] **Step 2: Implement read repository DTOs**

Expose:

```ts
getCapabilities(context)
getBoardSummary()
listModules()
listMembers()
listTasks(filters)
getTask(id)
listExperiments(filters)
getExperiment(id)
listTaskActivity(taskId, filters)
listAudit(context, filters)
```

Use explicit selects rather than returning internal rows. Task DTOs use
`TASK_WITH_ASSIGNEES_SELECT` and `normalizeTaskRow`. Do not return `api_keys.key_digest`,
Supabase auth data, or legacy assignee storage.

`getExperiment(id)` includes its Attachments with `updated_at`, so an Agent can obtain the exact
Attachment ETag before caption PATCH without adding another read endpoint.

Task list order: `updated_at desc, id desc`.
Experiment list order: `updated_at desc, id desc`.
Cursor predicates must include both columns.

- [ ] **Step 3: Write failing Route Handler tests**

Mock `withAgent` and repository calls, then call handlers with Web `Request` objects. Assert:

- `board:read` is required for Board, Module, Member, Task, Experiment, and Activity reads.
- `audit:read` is required for audit.
- Capabilities uses `withAuthenticatedAgent`, so even a Key with an empty scope list can inspect
  its identity and limits.
- Dynamic params are awaited.
- Task and Experiment detail responses include quoted ETags.
- Experiment detail includes Attachments and each Attachment has `updated_at`.
- GET responses do not set permissive CORS headers.

- [ ] **Step 4: Implement thin Route Handlers**

Example Task detail:

```ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAgent(request, "board:read", async (_context, requestId) => {
    const { id } = await params;
    const task = await getTask(id);
    if (!task) {
      throw new AgentApiError(404, "TASK_NOT_FOUND", "Task not found.");
    }
    return successResponse(task, requestId, {
      headers: { ETag: etagFor(task.updated_at) },
    });
  });
}
```

List handlers parse only documented filters and reject invalid UUID/status/cursor values.

- [ ] **Step 5: Run focused read tests**

Run:

```bash
npm test -- \
  lib/agent-api/__tests__/read-repository.test.ts \
  app/api/agent/v1/__tests__/read-routes.test.ts
```

Expected: all DTO, filter, cursor, ETag, scope, and response-shape tests pass.

- [ ] **Step 6: Commit read endpoints**

```bash
git add \
  lib/agent-api/read-repository.ts \
  lib/agent-api/__tests__/read-repository.test.ts \
  app/api/agent/v1/capabilities/route.ts \
  app/api/agent/v1/board/route.ts \
  app/api/agent/v1/modules/route.ts \
  app/api/agent/v1/members/route.ts \
  app/api/agent/v1/tasks/route.ts \
  'app/api/agent/v1/tasks/[id]/route.ts' \
  'app/api/agent/v1/tasks/[id]/activity/route.ts' \
  app/api/agent/v1/experiments/route.ts \
  'app/api/agent/v1/experiments/[id]/route.ts' \
  app/api/agent/v1/audit/route.ts \
  app/api/agent/v1/__tests__/read-routes.test.ts
git commit -m "feat: expose Agent API reads"
```

---

### Task 8: Add Task and Experiment Write Endpoints

**Files:**
- Create: `lib/agent-api/mutation-repository.ts`
- Create: `lib/agent-api/__tests__/mutation-repository.test.ts`
- Modify: `app/api/agent/v1/tasks/[id]/route.ts`
- Create: `app/api/agent/v1/tasks/[id]/experiments/route.ts`
- Modify: `app/api/agent/v1/experiments/[id]/route.ts`
- Create: `app/api/agent/v1/__tests__/write-routes.test.ts`

**Interfaces:**
- Produces: `patchTask`, `createExperiment`, `patchExperiment`.
- PATCH takes the parsed `If-Match` timestamp and strict changes.
- POST takes an Idempotency-Key and normalized request hash.

- [ ] **Step 1: Write failing mutation repository tests**

Test exact RPC names/arguments and error mappings:

```ts
expect(client.rpc).toHaveBeenCalledWith("agent_api_patch_task", {
  p_api_key_id: context.apiKeyId,
  p_member_id: context.memberId,
  p_task_id: TASK_ID,
  p_expected_updated_at: ETAG,
  p_changes: { status: "blocked" },
  p_request_id: REQUEST_ID,
});

expect(client.rpc).toHaveBeenCalledWith("agent_api_create_experiment", {
  p_api_key_id: context.apiKeyId,
  p_member_id: context.memberId,
  p_task_id: TASK_ID,
  p_name: "Agent experiment",
  p_idempotency_key: IDEMPOTENCY_KEY,
  p_request_hash: REQUEST_HASH,
  p_request_id: REQUEST_ID,
});
```

Map RPC message `VERSION_CONFLICT` to `412`, `TASK_SCOPE_FORBIDDEN` to `403`,
`WRITE_RATE_LIMITED` to `429`, and `IDEMPOTENCY_KEY_REUSED` to `409`.

- [ ] **Step 2: Implement request hashing and RPC adapters**

Canonicalize JSON by recursively sorting object keys while preserving array order, then SHA-256:

```ts
export function requestHash(
  method: string,
  path: string,
  body: unknown,
): string {
  return createHash("sha256")
    .update(JSON.stringify([method, path, canonicalize(body)]))
    .digest("hex");
}
```

Return typed rows from the RPC `data` field and forward `idempotency_replayed`.

- [ ] **Step 3: Write failing Task/Experiment handler tests**

Cover:

- Task PATCH accepts title/status/notes/tags/priority/due_date/position.
- Task PATCH rejects module/assignee/system fields with `422`.
- Missing If-Match returns `400 MISSING_IF_MATCH`.
- Stale If-Match returns `412`.
- Experiment create requires Idempotency-Key.
- Experiment create accepts only `name`; status, config, Owner, Task, and system fields return `422`.
- Experiment create passes only the trimmed name plus `context.memberId` and URL Task to the RPC.
- Experiment PATCH rejects Owner/Task/system fields.
- Bruce may PATCH Alice-owned Experiment under their shared Task.
- Baseline must belong to the same Task.
- Workflow validation runs after merging changes onto the current Experiment.
- No Task/Experiment module exports a `DELETE` function.

- [ ] **Step 4: Implement Task PATCH**

Sequence:

```text
withAgent(tasks:write)
→ await params
→ requireTaskCollaboration
→ parse If-Match
→ read and parse JSON once
→ parseTaskPatch
→ patchTask RPC
→ 200 response with new ETag
```

Never pass raw request JSON to the RPC.

- [ ] **Step 5: Implement Experiment creation**

Require a UUID Idempotency-Key header. Read the Task from the URL, require collaboration, parse
the creation body into `input: { name: string }`, and call:

```ts
createExperiment({
  context,
  taskId,
  name: input.name,
  idempotencyKey,
  requestHash: requestHash("POST", requestUrl.pathname, input),
  requestId,
});
```

The API response is `201` on first creation and `200` with
`meta.idempotency_replayed = true` on replay.

- [ ] **Step 6: Implement Experiment PATCH and domain validation**

Load the current Experiment, resolve Task collaboration, parse changes, construct:

```ts
const candidate = { ...current, ...structuredClone(changes) };
```

If status changes, run `validateForStatus(candidate, candidate.status)`. If Baseline changes,
require a different Experiment ID under the same Task. Return `422 WORKFLOW_INVALID` with concrete
field issues.

- [ ] **Step 7: Run focused write tests**

Run:

```bash
npm test -- \
  lib/agent-api/__tests__/mutation-repository.test.ts \
  app/api/agent/v1/__tests__/write-routes.test.ts
```

Expected: all writable-field, collaboration, Owner, ETag, idempotency, workflow, and no-DELETE
tests pass.

- [ ] **Step 8: Commit Task and Experiment writes**

```bash
git add \
  lib/agent-api/mutation-repository.ts \
  lib/agent-api/__tests__/mutation-repository.test.ts \
  'app/api/agent/v1/tasks/[id]/route.ts' \
  'app/api/agent/v1/tasks/[id]/experiments/route.ts' \
  'app/api/agent/v1/experiments/[id]/route.ts' \
  app/api/agent/v1/__tests__/write-routes.test.ts
git commit -m "feat: expose scoped Agent API writes"
```

---

### Task 9: Add Activity and Attachment Writes

**Files:**
- Modify: `app/api/agent/v1/tasks/[id]/activity/route.ts`
- Create: `app/api/agent/v1/experiments/[id]/attachments/route.ts`
- Create: `app/api/agent/v1/attachments/[id]/route.ts`
- Create: `lib/agent-api/__tests__/attachments.test.ts`
- Create: `app/api/agent/v1/__tests__/activity-attachment-routes.test.ts`

**Interfaces:**
- Activity POST accepts `{ "text": string }` and stores `kind = "comment"`.
- Attachment POST accepts multipart `file` plus optional `caption`.
- Attachment PATCH accepts `{ "changes": { "caption": string } }`.

- [ ] **Step 1: Write failing Activity and Attachment tests**

Cover:

- Both POST endpoints require Idempotency-Key.
- Activity text is trimmed, non-empty, and at most 10,000 characters.
- Attachment types are exactly PNG, JPEG, WebP, or GIF.
- Attachment limit is 10 MiB.
- Storage path is generated server-side.
- Attachment insert failure removes the just-uploaded Storage object.
- Attachment idempotency hashes method, path, caption, MIME, and file bytes rather than the random
  Storage path.
- An idempotent replay removes the newly uploaded duplicate object and returns the original row.
- Caption PATCH requires If-Match.
- Neither route accepts Owner, Task, URL, or path from the Agent.

- [ ] **Step 2: Implement Activity POST**

Use `activity:append`, resolve Task collaboration, and call `agent_api_create_activity`.
Do not accept client-provided `kind`, `experiment_id`, `member_id`, or timestamps.

- [ ] **Step 3: Implement Attachment upload**

Use `attachments:write`, resolve the Experiment Task, parse `request.formData()`, and validate:

```ts
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
```

Generate:

```text
<task UUID>/<experiment UUID>/<random UUID>.<validated extension>
```

Read the validated file once into bytes. Hash the method, request path, normalized caption, MIME,
and SHA-256 file digest for the idempotency request hash. Upload to `task-images`, obtain the
public URL, then call the attachment RPC.

If the RPC fails, remove only the newly generated Storage path before returning the mapped API
error. If the RPC reports `idempotency_replayed = true`, best-effort remove that newly uploaded
duplicate path and return the original Attachment. Never remove the original path returned by the
RPC.

- [ ] **Step 4: Implement Attachment caption PATCH**

Resolve parent Task through the Attachment, require `attachments:write`, parse If-Match, accept
only caption, call the RPC, and return the new ETag.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- \
  lib/agent-api/__tests__/attachments.test.ts \
  app/api/agent/v1/__tests__/activity-attachment-routes.test.ts
```

Expected: validation, cleanup, idempotency, ETag, and collaboration tests pass.

- [ ] **Step 6: Commit Activity and Attachment writes**

```bash
git add \
  'app/api/agent/v1/tasks/[id]/activity/route.ts' \
  'app/api/agent/v1/experiments/[id]/attachments/route.ts' \
  'app/api/agent/v1/attachments/[id]/route.ts' \
  lib/agent-api/__tests__/attachments.test.ts \
  app/api/agent/v1/__tests__/activity-attachment-routes.test.ts
git commit -m "feat: add Agent activity and attachment writes"
```

---

### Task 10: Generate OpenAPI and the `triton-board-api` Skill

**Files:**
- Create via generator: `.agents/skills/triton-board-api/SKILL.md`
- Create via generator: `.agents/skills/triton-board-api/agents/openai.yaml`
- Create: `.agents/skills/triton-board-api/references/openapi.yaml`
- Create: `.agents/skills/triton-board-api/scripts/triton_board_api.py`
- Create: `scripts/__tests__/triton-board-api-skill.test.ts`

**Interfaces:**
- Skill reads `TRITON_BOARD_API_URL` and `TRITON_BOARD_API_KEY`.
- Script subcommands: `capabilities`, `get`, `patch`, `post`.
- Script intentionally has no `delete` subcommand.
- OpenAPI 3.1 is the detailed endpoint/schema source of truth.

- [ ] **Step 1: Use the required skill-authoring workflow**

Read completely before editing:

```text
/home/yubaifeng/.codex/skills/.system/skill-creator/SKILL.md
/home/yubaifeng/.codex/skills/.system/skill-creator/references/openai_yaml.md
/home/yubaifeng/.codex/plugins/cache/openai-curated-remote/superpowers/6.2.0/skills/writing-skills/SKILL.md
/home/yubaifeng/.codex/plugins/cache/openai-curated-remote/superpowers/6.2.0/skills/test-driven-development/SKILL.md
```

Run one baseline pressure scenario without the new Skill: ask a fresh agent how it would recover
from a `412` while updating a Task through a bearer-key API. Record whether it blindly retries,
resends a full object, or attempts Owner/delete operations.

- [ ] **Step 2: Initialize the Skill with the official generator**

Run:

```bash
python /home/yubaifeng/.codex/skills/.system/skill-creator/scripts/init_skill.py \
  triton-board-api \
  --path .agents/skills \
  --resources scripts,references \
  --interface display_name="Triton Board API" \
  --interface short_description="Safely inspect and update Triton Board data" \
  --interface default_prompt="Use $triton-board-api to inspect a Task and apply a minimal, concurrency-safe update."
```

Expected: only `SKILL.md`, `agents/openai.yaml`, `scripts/`, and `references/` are created.

- [ ] **Step 3: Write the failing Skill artifact test**

Create a Vitest test that asserts:

```ts
expect(skill).toContain("GET current resource");
expect(skill).toContain("If-Match");
expect(skill).toContain("Idempotency-Key");
expect(skill).toContain("Never attempt DELETE");
expect(skill).toContain("TRITON_BOARD_API_KEY");
expect(openapi).toContain("openapi: 3.1.0");
expect(clientHelp).not.toContain("delete");
expect(clientSource).not.toContain("print(api_key");
```

Run:

```bash
npm test -- scripts/__tests__/triton-board-api-skill.test.ts
```

Expected: FAIL while the generated stub body remains.

- [ ] **Step 4: Write concise SKILL.md**

Use frontmatter:

```yaml
---
name: triton-board-api
description: Use when an AI agent needs to inspect, create, or update Triton Board tasks, experiments, attachments, activity, or audit records through the Triton Board Agent API.
---
```

Body workflow:

```text
1. Require TRITON_BOARD_API_URL and TRITON_BOARD_API_KEY.
2. Call capabilities.
3. GET the target and retain its ETag.
4. Compute the smallest allowed change.
5. PATCH with If-Match, or POST with one stable Idempotency-Key.
6. Verify the response or GET again.
```

Explicitly instruct:

- Never print the raw Key.
- Never attempt DELETE or batch operations.
- Never send Owner, assignee, parent, or system fields.
- On `412`, re-read and stop when the same target fields changed remotely.
- On `401/403/422`, do not repeat the same request.
- On `429`, obey `Retry-After`.
- On POST transport failure, reuse the same Idempotency-Key.
- Read `references/openapi.yaml` only when endpoint/schema details are needed.
- Prefer the bundled script so the raw Key does not enter shell arguments.

- [ ] **Step 5: Write OpenAPI 3.1**

Define the exact base path, bearer scheme, schemas, filters, request envelopes, ETag headers, and
error envelopes for every designed route. Do not define Task/Experiment DELETE or batch paths.

Include reusable components:

```yaml
openapi: 3.1.0
info:
  title: Triton Board Agent API
  version: 1.0.0
components:
  securitySchemes:
    AgentApiKey:
      type: http
      scheme: bearer
  parameters:
    IfMatch:
      name: If-Match
      in: header
      required: true
      schema:
        type: string
    IdempotencyKey:
      name: Idempotency-Key
      in: header
      required: true
      schema:
        type: string
        format: uuid
```

- [ ] **Step 6: Implement the standard-library client**

Use `argparse`, `urllib.request`, and `json`. Core signature:

```py
def request(
    method: str,
    path: str,
    *,
    body: object | None = None,
    etag: str | None = None,
    idempotency_key: str | None = None,
) -> tuple[int, dict[str, object], str | None]:
    ...
```

The script reads URL/Key only from environment, sets Authorization internally, prints status,
request ID, ETag, and JSON response, and never prints request headers. `patch` requires `--etag`
and `--changes-json`; `post` requires or generates `--idempotency-key` and prints the generated
value so the caller can reuse it. Do not register a DELETE method or generic arbitrary method.

- [ ] **Step 7: Validate and test the Skill**

Run:

```bash
python -m py_compile \
  .agents/skills/triton-board-api/scripts/triton_board_api.py
python .agents/skills/triton-board-api/scripts/triton_board_api.py --help
python /home/yubaifeng/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  .agents/skills/triton-board-api
npm test -- scripts/__tests__/triton-board-api-skill.test.ts
```

Expected: validation succeeds, help lists no delete command, and the artifact test passes.

Run one fresh-agent forward test against a mocked `412` scenario. The passing behavior is:

```text
GET latest resource → compare the intended fields → stop on overlap,
or retry one minimal PATCH with the new ETag when there is no overlap.
```

The forward test must not receive a production URL or Key.

- [ ] **Step 8: Commit the Skill**

```bash
git add .agents/skills/triton-board-api \
  scripts/__tests__/triton-board-api-skill.test.ts
git commit -m "feat: add Triton Board Agent API skill"
```

---

### Task 11: Document, Verify, and Hand Off

**Files:**
- Modify: `README.md`
- Modify: `.env.local.example` if Task 5 did not already contain the final comments
- Verify all files from Tasks 1–10

**Interfaces:**
- Produces: Admin setup, Key lifecycle, Agent API usage, and local verification instructions.
- Produces: final evidence that database, API, UI, Skill, tests, and build agree.

- [ ] **Step 1: Write README acceptance text before editing**

Add documentation that must answer:

```text
Where is /admin/api-keys?
Which two server-only environment variables are required?
How is a Key scoped to a Member and Task collaboration?
Which endpoints can never delete Task/Experiment?
How does PATCH use ETag/If-Match?
How does POST reuse Idempotency-Key?
Where is the Skill and which client environment variables does it use?
```

- [ ] **Step 2: Update README**

Add:

- `SUPABASE_SECRET_KEY` and `TRITON_BOARD_ADMIN_USER_ID` to the environment table as server-only,
  high-sensitivity values.
- Admin Key creation/rotation/revocation flow.
- `/api/agent/v1` summary and link to the OpenAPI file.
- Task collaboration semantics.
- Explicit no-delete guarantee for Agent API.
- Skill path and `TRITON_BOARD_API_URL` / `TRITON_BOARD_API_KEY`.
- Local database and test commands.

- [ ] **Step 3: Run complete database verification**

Run only against local Supabase:

```bash
npx supabase db reset --local
npx supabase test db --local \
  supabase/tests/0007_agent_api_schema.sql \
  supabase/tests/0008_agent_api_mutations.sql
```

Expected: reset succeeds and every pgTAP assertion passes.

- [ ] **Step 4: Run complete application verification**

Run:

```bash
npm test
npm run build
```

Expected: all Vitest suites pass and Next.js production build/type-check succeeds.

- [ ] **Step 5: Run complete Skill verification**

Run:

```bash
python -m py_compile \
  .agents/skills/triton-board-api/scripts/triton_board_api.py
python /home/yubaifeng/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  .agents/skills/triton-board-api
rg -n "DELETE|owner_id|task_id|If-Match|Idempotency-Key" \
  .agents/skills/triton-board-api
```

Expected:

- Python compiles.
- Skill validation succeeds.
- DELETE appears only in prohibitions or `405` documentation, never as an operation.
- Owner/Task appear only as immutable/server-derived fields.

- [ ] **Step 6: Inspect the final diff and security invariants**

Run:

```bash
git diff --check
git status --short
rg -n "export async function DELETE|\\.delete\\(\\)" app/api/agent lib/agent-api
rg -n "SUPABASE_SECRET_KEY|Authorization" app lib components
```

Expected:

- No whitespace errors.
- No Agent Task/Experiment DELETE handler.
- Storage cleanup may use `.delete()`/`.remove()` only for a just-uploaded attachment path.
- Secret values are read only in server-only code and are never rendered or logged.
- Unrelated pre-existing worktree files remain unstaged.

- [ ] **Step 7: Commit documentation and final adjustments**

```bash
git add README.md .env.local.example
git commit -m "docs: document Triton Board Agent API"
```

- [ ] **Step 8: Record final evidence**

Capture:

```text
Database test result
Vitest test count/result
Next build result
Skill validation result
Final commit list
Any production environment values still requiring a maintainer
```

Do not deploy or create a production API Key unless the user explicitly requests those external
state changes.
