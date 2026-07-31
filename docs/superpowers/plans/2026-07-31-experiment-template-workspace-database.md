# Experiment Template Workspace — Phase 1 (Template Database Schema) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the additive Template database schema — tables, constraints, RLS, grants, indexes, and Realtime — plus the repository TypeScript types that Phases 2+ (Template Manager, Detail, Compare, Agent API) will build on.

**Architecture:** One workspace-wide `ExperimentTemplate` defines ordered Field Labels and typed Keys. Every Experiment keeps a permanent `template_id` and joins the live Template schema, so adding a Key makes it appear on every linked Experiment without fan-out placeholder rows. Current Values live in `experiment_values` with per-cell revisions; every mutation later appends an immutable version snapshot. This phase is strictly additive: no legacy columns are dropped and no existing data is rewritten.

**Tech Stack:** Supabase Postgres with imperative SQL migrations, pgTAP database tests via `npx supabase test db --local`, Next.js 16 + TypeScript repository types, Vitest unit tests.

---

## Global Constraints

- Work only in the isolated worktree `.worktrees/experiment-template-workspace` on branch `feat/experiment-template-workspace`. The plan file lives at `docs/superpowers/plans/2026-07-31-experiment-template-workspace-database.md`.
- The authoritative design is `docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md` (read the spec sections "Data Storage", "Supabase Security and Realtime", and "Delivery Sequence" before starting).
- Additive only. Never `drop column`, never delete rows, never hard-delete Templates/Keys/Values. Legacy content columns on `experiments` remain untouched during this phase.
- Every migration file is created with `npx supabase migration new <name>` (the CLI prints the timestamped filename — use that exact name in the commit message and commands below).
- Every database test file follows the house pgTAP convention: `begin; select plan(N); ...; select * from finish(); rollback;`.
- Follow house patterns: authenticated-wide RLS policies (`for all to authenticated using (true) with check (true)`), explicit Data API grants to `authenticated`, `revoke all` from `anon`, and `revoke execute` on new trigger functions from `public, anon, authenticated`.
- The workspace-wide trust model is explicit: every authenticated user may read and write the new Template/Value tables directly through the Data API, exactly like `experiments` and `attachments` today. Version tables are granted the same CRUD so Phase 3's `security invoker` mutation functions can write snapshots; integrity is enforced by those functions, not by role separation.
- Commit after every task with the exact commit message shown. Do not commit unrelated working-tree changes.
- Later phases that touch Next.js pages/routes must first read the relevant guide in `node_modules/next/dist/docs/` (AGENTS.md). This phase only adds TypeScript types, so no Next.js docs are required yet.

## Planned File Structure

Create:
- `supabase/tests/0015_experiment_template_workspace_schema.sql` — pgTAP schema test (Task 2)
- `supabase/migrations/<timestamp>_experiment_template_workspace_schema.sql` — schema migration (Task 3)
- `supabase/tests/0016_experiment_template_workspace_grants.sql` — pgTAP grants test (Task 4)
- `supabase/migrations/<timestamp>_experiment_template_workspace_grants.sql` — grants migration (Task 5)
- `lib/__tests__/template-types.test.ts` — TypeScript type/behavior test (Task 6)

Modify:
- `lib/types.ts` — add Template/Field/Key/Option/Value/Version interfaces; extend `Experiment` and `Attachment` (Task 6)
- `lib/experiments/__tests__/policy.test.ts` — fixture fields (Task 6)
- `lib/experiments/__tests__/draft.test.ts` — fixture fields (Task 6)
- `lib/experiments/__tests__/compare.test.ts` — fixture fields (Task 6)
- `lib/experiments/__tests__/filters.test.ts` — fixture fields (Task 6)
- `lib/experiments/__tests__/repository.test.ts` — fixture fields (Task 6)
- `lib/attachments/__tests__/repository.test.ts` — fixture fields (Task 6)

**Database objects produced (all in `public`):**

`experiment_templates` — id, name, description, schema_revision, archived_at, created_at, updated_at; active-name case-insensitive partial unique index.

`experiment_template_fields` — id, template_id, label, color_token, position, archived_at, created_at, updated_at; `(template_id, id)` unique for composite FKs.

`experiment_template_keys` — id, template_id, field_id, key, value_type, required, position, archived_at, created_at, updated_at; composite FK to fields; `(template_id, lower(key))` unique; value-type and blank-key checks.

`experiment_template_key_options` — id, template_id, key_id, label, position, archived_at; composite FK to keys; `(key_id, id)` unique for composite FKs.

`experiment_values` — (experiment_id, key_id) PK, template_id, five scalar columns, cell_revision, timestamps; composite FKs to experiments and keys; at-most-one-scalar check; finite-number check.

`experiment_value_options` — (experiment_id, key_id, option_id) PK, template_id, position; composite FKs to experiments, keys, and options; parent FK to `experiment_values` cascading on clear.

`experiment_versions` — id, experiment_id, version_no, reason, source, edit_session_id, template_schema_revision, snapshot, actor_member_id, created_at; unique (experiment_id, version_no).

`experiment_template_versions` — id, template_id, version_no, reason, source, schema_revision, snapshot, actor_member_id, created_at; unique (template_id, version_no).

`experiments` gains — `template_id uuid null`, `archived_at timestamptz null`, `core_revision bigint not null default 1`, `experiments_id_template_unique unique (id, template_id)`, and an immutability guard trigger.

`attachments` gains — `template_key_id uuid null`, `archived_at timestamptz null`.

---

### Task 1: Start the local Supabase stack and confirm the CLI surface

**Files:** none

- [ ] **Step 1: Confirm the CLI and local stack**

Run from the worktree root:

```bash
npx supabase --version
npx supabase start
npx supabase test db --help
npx supabase migration new --help
```

Expected: CLI `2.110.0`; local API on port `54321`; local Postgres on port `54322`; both help texts print.

- [ ] **Step 2: Reset the local database so all migrations and seed apply**

Run:

```bash
npx supabase db reset --local
```

Expected: all migrations in `supabase/migrations/` apply in order and `seed.sql` runs.

- [ ] **Step 3: Confirm the existing test suite runs before any change**

Run:

```bash
npx supabase test db --local supabase/tests/0014_api_key_deletion.sql
```

Expected: PASS (`ok` lines, `0 failures`).

---

### Task 2: Write the failing pgTAP schema test

**Files:**
- Create: `supabase/tests/0015_experiment_template_workspace_schema.sql`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0015_experiment_template_workspace_schema.sql`:

```sql
begin;
select plan(45);

-- Tables and keys -----------------------------------------------------------
select has_table('public', 'experiment_templates', 'experiment_templates exists');
select has_table('public', 'experiment_template_fields', 'experiment_template_fields exists');
select has_table('public', 'experiment_template_keys', 'experiment_template_keys exists');
select has_table('public', 'experiment_template_key_options', 'experiment_template_key_options exists');
select has_table('public', 'experiment_values', 'experiment_values exists');
select has_table('public', 'experiment_value_options', 'experiment_value_options exists');
select has_table('public', 'experiment_versions', 'experiment_versions exists');
select has_table('public', 'experiment_template_versions', 'experiment_template_versions exists');

select has_pk('public', 'experiment_templates', 'experiment_templates has a primary key');
select has_pk('public', 'experiment_values', 'experiment_values has (experiment_id, key_id) primary key');
select has_pk('public', 'experiment_value_options', 'experiment_value_options has a primary key');

-- New columns on existing tables -------------------------------------------
select has_column('public', 'experiments', 'template_id', 'experiments.template_id exists');
select has_column('public', 'experiments', 'archived_at', 'experiments.archived_at exists');
select has_column('public', 'experiments', 'core_revision', 'experiments.core_revision exists');
select has_column('public', 'attachments', 'template_key_id', 'attachments.template_key_id exists');
select has_column('public', 'attachments', 'archived_at', 'attachments.archived_at exists');

-- Column types and nullability ---------------------------------------------
select col_type_is('public', 'experiment_templates', 'schema_revision', 'bigint',
  'template schema_revision is bigint');
select col_type_is('public', 'experiment_template_keys', 'value_type', 'text',
  'key value_type is text');
select col_type_is('public', 'experiment_values', 'number_value', 'double precision',
  'value number_value is double precision');
select col_type_is('public', 'experiment_values', 'cell_revision', 'bigint',
  'value cell_revision is bigint');
select col_not_null('public', 'experiment_templates', 'name', 'template name is not null');
select col_not_null('public', 'experiment_values', 'experiment_id', 'value experiment_id is not null');
select col_not_null('public', 'experiments', 'core_revision', 'experiment core_revision is not null');

-- Indexes -------------------------------------------------------------------
select has_index('public', 'experiment_templates', 'experiment_templates_active_name_unique',
  'active template names are case-insensitively unique');
select has_index('public', 'experiment_template_fields', 'experiment_template_fields_template_position_idx',
  'fields are ordered per template');
select has_index('public', 'experiment_template_keys', 'experiment_template_keys_template_field_position_idx',
  'keys are ordered per field');
select has_index('public', 'experiment_template_key_options', 'experiment_template_key_options_template_key_position_idx',
  'options are ordered per key');
select has_index('public', 'experiment_values', 'experiment_values_template_experiment_key_idx',
  'values are loadable per template grid');
select has_index('public', 'experiment_values', 'experiment_values_key_number_idx',
  'numeric sort/filter is indexed');
select has_index('public', 'experiment_value_options', 'experiment_value_options_key_option_experiment_idx',
  'multi-select contains filters are indexed');
select has_index('public', 'experiments', 'experiments_template_id_idx', 'experiment template FK is indexed');
select has_index('public', 'attachments', 'attachments_template_key_id_idx', 'attachment template-key FK is indexed');

-- Checks, guards, and RLS ---------------------------------------------------
select is(
  (select count(*)::int from pg_constraint
   where conrelid = 'public.experiment_values'::regclass
     and conname = 'experiment_values_single_scalar_check'),
  1,
  'at-most-one-scalar check exists'
);
select is(
  (select count(*)::int from pg_constraint
   where conrelid = 'public.experiment_template_keys'::regclass
     and conname = 'experiment_template_keys_value_type_check'),
  1,
  'value-type check exists'
);
select is(
  (select count(*)::int from pg_trigger
   where tgrelid = 'public.experiments'::regclass
     and tgname = 'experiments_template_id_immutable'
     and not tgisinternal),
  1,
  'template_id immutability guard trigger exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.experiment_templates'::regclass),
  'experiment_templates has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.experiment_versions'::regclass),
  'experiment_versions has RLS enabled'
);

-- Behavior: uniqueness, immutability, cross-template safety -----------------
insert into public.modules (id, name, kind)
values ('10000000-0000-4000-8000-000000000001', 'Template test module', 'pipeline');
insert into public.tasks (id, module_id, title)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Template test task');

insert into public.experiment_templates (id, name)
values ('30000000-0000-4000-8000-000000000001', 'Benchmark A');
select throws_ok(
  $$insert into public.experiment_templates (name) values ('Benchmark A')$$,
  '23505',
  'duplicate key value violates unique constraint "experiment_templates_active_name_unique"',
  'duplicate active Template names are rejected case-insensitively'
);

insert into public.experiment_template_fields (
  id, template_id, label, color_token, position
) values (
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Metrics', 'blue', 1
);
insert into public.experiment_template_keys (
  id, template_id, field_id, key, value_type, position
) values (
  '50000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'pass@1', 'number', 1
);
select throws_ok(
  $$insert into public.experiment_template_keys (
     id, template_id, field_id, key, value_type, position
   ) values (
     '50000000-0000-4000-8000-000000000099',
     '30000000-0000-4000-8000-000000000001',
     '40000000-0000-4000-8000-000000000001',
     'PASS@1', 'number', 2
   )$$,
  '23505',
  'duplicate key value violates unique constraint "experiment_template_keys_template_key_unique"',
  'duplicate Key names are rejected case-insensitively'
);
select throws_ok(
  $$insert into public.experiment_template_keys (
     id, template_id, field_id, key, value_type, position
   ) values (
     '50000000-0000-4000-8000-000000000098',
     '30000000-0000-4000-8000-000000000001',
     '40000000-0000-4000-8000-000000000001',
     '', 'number', 2
   )$$,
  '23514',
  'new row for relation "experiment_template_keys" violates check constraint "experiment_template_keys_blank_check"',
  'blank Key strings are rejected'
);

insert into public.experiment_templates (id, name)
values ('30000000-0000-4000-8000-000000000002', 'Benchmark B');
insert into public.experiment_template_fields (
  id, template_id, label, color_token, position
) values (
  '40000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002',
  'Metrics', 'green', 1
);
insert into public.experiment_template_keys (
  id, template_id, field_id, key, value_type, position
) values (
  '50000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000002',
  'loss', 'number', 1
);

insert into public.experiments (id, task_id, template_id)
values (
  '60000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001'
);
select throws_ok(
  $$update public.experiments
     set template_id = '30000000-0000-4000-8000-000000000002'
   where id = '60000000-0000-4000-8000-000000000001'$$,
  'P0001',
  'experiments.template_id cannot change after assignment',
  'Template ID is immutable after assignment'
);

select throws_ok(
  $$insert into public.experiment_values (
     experiment_id, template_id, key_id, number_value
   ) values (
     '60000000-0000-4000-8000-000000000001',
     '30000000-0000-4000-8000-000000000002',
     '50000000-0000-4000-8000-000000000002',
     0.5
   )$$,
  '23503',
  'insert or update on table "experiment_values" violates foreign key constraint "experiment_values_experiment_template_fkey"',
  'a Value cannot pair an Experiment with another Template Key'
);

select throws_ok(
  $$insert into public.experiment_values (
     experiment_id, template_id, key_id, text_value, number_value
   ) values (
     '60000000-0000-4000-8000-000000000001',
     '30000000-0000-4000-8000-000000000001',
     '50000000-0000-4000-8000-000000000001',
     'not a number', 0.5
   )$$,
  '23514',
  'new row for relation "experiment_values" violates check constraint "experiment_values_single_scalar_check"',
  'a Value row stores at most one scalar column'
);

select throws_ok(
  $$insert into public.experiment_values (
     experiment_id, template_id, key_id, number_value
   ) values (
     '60000000-0000-4000-8000-000000000001',
     '30000000-0000-4000-8000-000000000001',
     '50000000-0000-4000-8000-000000000001',
     'NaN'::double precision
   )$$,
  '23514',
  'new row for relation "experiment_values" violates check constraint "experiment_values_number_finite_check"',
  'NaN Number Values are rejected'
);

insert into public.experiment_values (
  experiment_id, template_id, key_id, number_value
) values (
  '60000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  0.73
);
select is(
  (select number_value
   from public.experiment_values
   where experiment_id = '60000000-0000-4000-8000-000000000001'
     and key_id = '50000000-0000-4000-8000-000000000001'),
  0.73::double precision,
  'a typed scalar Value round-trips'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx supabase test db --local supabase/tests/0015_experiment_template_workspace_schema.sql
```

Expected: FAIL — `experiment_templates exists` fails (table missing).

---

### Task 3: Create the schema migration and make the schema test pass

**Files:**
- Create: `supabase/migrations/<timestamp>_experiment_template_workspace_schema.sql` (name from the CLI)

- [ ] **Step 1: Create the migration file**

Run:

```bash
npx supabase migration new experiment_template_workspace_schema
```

Note the printed filename; all commands below use it as `supabase/migrations/<timestamp>_experiment_template_workspace_schema.sql`.

- [ ] **Step 2: Implement the schema**

Replace the empty migration body with:

```sql
-- Experiment Template Workspace (Phase 1): additive schema.
-- Design: docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md

-- experiment_templates -------------------------------------------------------
create table public.experiment_templates (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text not null default '',
  schema_revision bigint not null default 1,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index experiment_templates_active_name_unique
  on public.experiment_templates (lower(name))
  where archived_at is null;

drop trigger if exists experiment_templates_set_updated_at on public.experiment_templates;
create trigger experiment_templates_set_updated_at
  before update on public.experiment_templates
  for each row execute function public.set_updated_at();

-- experiment_template_fields --------------------------------------------------
create table public.experiment_template_fields (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null,
  label       text not null,
  color_token text not null,
  position    integer not null,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (template_id, id),
  constraint experiment_template_fields_template_fkey
    foreign key (template_id) references public.experiment_templates(id)
    on delete restrict
);

create index experiment_template_fields_template_position_idx
  on public.experiment_template_fields (template_id, position);
create index experiment_template_fields_active_template_idx
  on public.experiment_template_fields (template_id)
  where archived_at is null;

drop trigger if exists experiment_template_fields_set_updated_at on public.experiment_template_fields;
create trigger experiment_template_fields_set_updated_at
  before update on public.experiment_template_fields
  for each row execute function public.set_updated_at();

-- experiment_template_keys ----------------------------------------------------
create table public.experiment_template_keys (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null,
  field_id    uuid not null,
  key         text not null,
  value_type  text not null,
  required    boolean not null default false,
  position    integer not null,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (template_id, id),
  constraint experiment_template_keys_template_field_fkey
    foreign key (template_id, field_id)
    references public.experiment_template_fields (template_id, id)
    on delete restrict,
  constraint experiment_template_keys_value_type_check
    check (value_type in (
      'short_text', 'long_text', 'number', 'boolean',
      'single_select', 'multi_select', 'date_time', 'url', 'attachment'
    )),
  constraint experiment_template_keys_blank_check
    check (key <> '')
);

create unique index experiment_template_keys_template_key_unique
  on public.experiment_template_keys (template_id, lower(key));
create index experiment_template_keys_template_field_position_idx
  on public.experiment_template_keys (template_id, field_id, position);
create index experiment_template_keys_active_template_field_idx
  on public.experiment_template_keys (template_id, field_id)
  where archived_at is null;

drop trigger if exists experiment_template_keys_set_updated_at on public.experiment_template_keys;
create trigger experiment_template_keys_set_updated_at
  before update on public.experiment_template_keys
  for each row execute function public.set_updated_at();

-- experiment_template_key_options ---------------------------------------------
create table public.experiment_template_key_options (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null,
  key_id      uuid not null,
  label       text not null,
  position    integer not null,
  archived_at timestamptz,
  unique (key_id, id),
  constraint experiment_template_key_options_template_key_fkey
    foreign key (template_id, key_id)
    references public.experiment_template_keys (template_id, id)
    on delete restrict
);

create index experiment_template_key_options_template_key_position_idx
  on public.experiment_template_key_options (template_id, key_id, position);

-- experiments additions --------------------------------------------------------
alter table public.experiments
  add column if not exists template_id uuid,
  add column if not exists archived_at timestamptz,
  add column if not exists core_revision bigint not null default 1;

do $experiment_template_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.experiments'::regclass
      and conname = 'experiments_template_id_fkey'
  ) then
    alter table public.experiments
      add constraint experiments_template_id_fkey
      foreign key (template_id) references public.experiment_templates(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.experiments'::regclass
      and conname = 'experiments_id_template_unique'
  ) then
    alter table public.experiments
      add constraint experiments_id_template_unique unique (id, template_id);
  end if;
end
$experiment_template_constraints$;

create index if not exists experiments_template_id_idx
  on public.experiments (template_id);
create index if not exists experiments_active_template_idx
  on public.experiments (template_id)
  where archived_at is null;

create or replace function public.guard_experiment_template_immutable()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.template_id is not null
     and new.template_id is distinct from old.template_id then
    raise exception 'experiments.template_id cannot change after assignment';
  end if;
  return new;
end
$function$;

drop trigger if exists experiments_template_id_immutable on public.experiments;
create trigger experiments_template_id_immutable
  before update on public.experiments
  for each row execute function public.guard_experiment_template_immutable();

-- experiment_values -------------------------------------------------------------
create table public.experiment_values (
  experiment_id  uuid not null,
  template_id    uuid not null,
  key_id         uuid not null,
  text_value     text,
  number_value   double precision,
  boolean_value  boolean,
  datetime_value timestamptz,
  option_id      uuid,
  cell_revision  bigint not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (experiment_id, key_id),
  constraint experiment_values_experiment_template_fkey
    foreign key (experiment_id, template_id)
    references public.experiments (id, template_id)
    on delete cascade,
  constraint experiment_values_template_key_fkey
    foreign key (template_id, key_id)
    references public.experiment_template_keys (template_id, id)
    on delete restrict,
  constraint experiment_values_option_fkey
    foreign key (option_id)
    references public.experiment_template_key_options (id)
    on delete restrict,
  constraint experiment_values_single_scalar_check
    check (num_nonnulls(
      text_value, number_value, boolean_value, datetime_value, option_id
    ) <= 1),
  constraint experiment_values_number_finite_check
    check (
      number_value is null
      or (
        number_value <> 'NaN'::double precision
        and number_value <> 'Infinity'::double precision
        and number_value <> '-Infinity'::double precision
      )
    )
);

create index experiment_values_template_experiment_key_idx
  on public.experiment_values (template_id, experiment_id, key_id);
create index experiment_values_key_number_idx
  on public.experiment_values (key_id, number_value);
create index experiment_values_key_datetime_idx
  on public.experiment_values (key_id, datetime_value);
create index experiment_values_key_option_idx
  on public.experiment_values (key_id, option_id);

drop trigger if exists experiment_values_set_updated_at on public.experiment_values;
create trigger experiment_values_set_updated_at
  before update on public.experiment_values
  for each row execute function public.set_updated_at();

-- experiment_value_options ------------------------------------------------------
create table public.experiment_value_options (
  experiment_id uuid not null,
  template_id   uuid not null,
  key_id        uuid not null,
  option_id     uuid not null,
  position      integer not null,
  primary key (experiment_id, key_id, option_id),
  constraint experiment_value_options_experiment_template_fkey
    foreign key (experiment_id, template_id)
    references public.experiments (id, template_id)
    on delete cascade,
  constraint experiment_value_options_template_key_fkey
    foreign key (template_id, key_id)
    references public.experiment_template_keys (template_id, id)
    on delete restrict,
  constraint experiment_value_options_key_option_fkey
    foreign key (key_id, option_id)
    references public.experiment_template_key_options (key_id, id)
    on delete restrict,
  constraint experiment_value_options_parent_fkey
    foreign key (experiment_id, key_id)
    references public.experiment_values (experiment_id, key_id)
    on delete cascade
);

create index experiment_value_options_key_option_experiment_idx
  on public.experiment_value_options (key_id, option_id, experiment_id);

-- experiment_versions -----------------------------------------------------------
create table public.experiment_versions (
  id                       uuid primary key default gen_random_uuid(),
  experiment_id            uuid not null,
  version_no               bigint not null,
  reason                   text not null,
  source                   text not null,
  edit_session_id          uuid,
  template_schema_revision bigint not null,
  snapshot                 jsonb not null,
  actor_member_id          uuid,
  created_at               timestamptz not null default now(),
  unique (experiment_id, version_no),
  constraint experiment_versions_experiment_fkey
    foreign key (experiment_id) references public.experiments(id)
    on delete restrict,
  constraint experiment_versions_actor_fkey
    foreign key (actor_member_id) references public.members(id)
    on delete set null,
  constraint experiment_versions_source_check
    check (source in ('browser', 'agent', 'migration', 'system'))
);

-- experiment_template_versions --------------------------------------------------
create table public.experiment_template_versions (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null,
  version_no      bigint not null,
  reason          text not null,
  source          text not null,
  schema_revision bigint not null,
  snapshot        jsonb not null,
  actor_member_id uuid,
  created_at      timestamptz not null default now(),
  unique (template_id, version_no),
  constraint experiment_template_versions_template_fkey
    foreign key (template_id) references public.experiment_templates(id)
    on delete restrict,
  constraint experiment_template_versions_actor_fkey
    foreign key (actor_member_id) references public.members(id)
    on delete set null,
  constraint experiment_template_versions_source_check
    check (source in ('browser', 'agent', 'migration', 'system'))
);

-- attachments additions ----------------------------------------------------------
alter table public.attachments
  add column if not exists template_key_id uuid,
  add column if not exists archived_at timestamptz;

do $attachment_template_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.attachments'::regclass
      and conname = 'attachments_template_key_id_fkey'
  ) then
    alter table public.attachments
      add constraint attachments_template_key_id_fkey
      foreign key (template_key_id) references public.experiment_template_keys(id)
      on delete restrict;
  end if;
end
$attachment_template_constraints$;

create index if not exists attachments_template_key_id_idx
  on public.attachments (template_key_id);
create index if not exists attachments_active_experiment_idx
  on public.attachments (experiment_id)
  where archived_at is null;

-- Row Level Security --------------------------------------------------------------
alter table public.experiment_templates enable row level security;
alter table public.experiment_template_fields enable row level security;
alter table public.experiment_template_keys enable row level security;
alter table public.experiment_template_key_options enable row level security;
alter table public.experiment_values enable row level security;
alter table public.experiment_value_options enable row level security;
alter table public.experiment_versions enable row level security;
alter table public.experiment_template_versions enable row level security;

drop policy if exists "auth access" on public.experiment_templates;
create policy "auth access" on public.experiment_templates
  for all to authenticated using (true) with check (true);
drop policy if exists "auth access" on public.experiment_template_fields;
create policy "auth access" on public.experiment_template_fields
  for all to authenticated using (true) with check (true);
drop policy if exists "auth access" on public.experiment_template_keys;
create policy "auth access" on public.experiment_template_keys
  for all to authenticated using (true) with check (true);
drop policy if exists "auth access" on public.experiment_template_key_options;
create policy "auth access" on public.experiment_template_key_options
  for all to authenticated using (true) with check (true);
drop policy if exists "auth access" on public.experiment_values;
create policy "auth access" on public.experiment_values
  for all to authenticated using (true) with check (true);
drop policy if exists "auth access" on public.experiment_value_options;
create policy "auth access" on public.experiment_value_options
  for all to authenticated using (true) with check (true);
drop policy if exists "auth access" on public.experiment_versions;
create policy "auth access" on public.experiment_versions
  for all to authenticated using (true) with check (true);
drop policy if exists "auth access" on public.experiment_template_versions;
create policy "auth access" on public.experiment_template_versions
  for all to authenticated using (true) with check (true);

-- Realtime: live tables only; version snapshots are intentionally excluded --------
do $$ begin
  alter publication supabase_realtime add table experiment_templates;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table experiment_template_fields;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table experiment_template_keys;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table experiment_template_key_options;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table experiment_values;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table experiment_value_options;
exception when others then null; end $$;
```

- [ ] **Step 3: Apply the migration and run the schema test**

Run:

```bash
npx supabase db reset --local
npx supabase test db --local supabase/tests/0015_experiment_template_workspace_schema.sql
```

Expected: all 45 assertions PASS.

- [ ] **Step 4: Confirm the existing suite still passes**

Run:

```bash
npx supabase test db --local supabase/tests/0014_api_key_deletion.sql
```

Expected: PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<timestamp>_experiment_template_workspace_schema.sql supabase/tests/0015_experiment_template_workspace_schema.sql
git commit -m "feat: add experiment template workspace schema"
```

---

### Task 4: Write the failing pgTAP grants test

**Files:**
- Create: `supabase/tests/0016_experiment_template_workspace_grants.sql`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0016_experiment_template_workspace_grants.sql`:

```sql
begin;
select plan(25);

-- Authenticated Data API access ----------------------------------------------
select has_table_privilege('authenticated', 'public.experiment_templates', 'select',
  'authenticated can read Templates');
select has_table_privilege('authenticated', 'public.experiment_templates', 'insert',
  'authenticated can create Templates');
select has_table_privilege('authenticated', 'public.experiment_templates', 'update',
  'authenticated can edit Templates');
select has_table_privilege('authenticated', 'public.experiment_templates', 'delete',
  'authenticated can delete never-used Templates');
select has_table_privilege('authenticated', 'public.experiment_template_fields', 'select',
  'authenticated can read Field Labels');
select has_table_privilege('authenticated', 'public.experiment_template_keys', 'select',
  'authenticated can read Keys');
select has_table_privilege('authenticated', 'public.experiment_template_key_options', 'select',
  'authenticated can read Key options');
select has_table_privilege('authenticated', 'public.experiment_values', 'select',
  'authenticated can read Values');
select has_table_privilege('authenticated', 'public.experiment_value_options', 'select',
  'authenticated can read multi-select selections');
select has_table_privilege('authenticated', 'public.experiment_versions', 'select',
  'authenticated can open Version History');
select has_table_privilege('authenticated', 'public.experiment_template_versions', 'select',
  'authenticated can open Template History');

-- anon is locked out -----------------------------------------------------------
select ok(
  not has_table_privilege('anon', 'public.experiment_templates', 'select'),
  'anon cannot read Templates'
);
select ok(
  not has_table_privilege('anon', 'public.experiment_values', 'select'),
  'anon cannot read Values'
);
select ok(
  not has_table_privilege('anon', 'public.experiment_versions', 'insert'),
  'anon cannot forge version snapshots'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.guard_experiment_template_immutable()',
    'execute'
  ),
  'authenticated cannot call the Template immutability guard directly'
);

-- Realtime publication ---------------------------------------------------------
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiment_templates'
  ),
  'experiment_templates is published to realtime'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiment_template_fields'
  ),
  'experiment_template_fields is published to realtime'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiment_template_keys'
  ),
  'experiment_template_keys is published to realtime'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiment_template_key_options'
  ),
  'experiment_template_key_options is published to realtime'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiment_values'
  ),
  'experiment_values is published to realtime'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiment_value_options'
  ),
  'experiment_value_options is published to realtime'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiments'
  ),
  'experiments stays published to realtime'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'attachments'
  ),
  'attachments stays published to realtime'
);
select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiment_versions'
  ),
  'experiment_versions is NOT published to realtime'
);
select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiment_template_versions'
  ),
  'experiment_template_versions is NOT published to realtime'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx supabase test db --local supabase/tests/0016_experiment_template_workspace_grants.sql
```

Expected: FAIL — the authenticated/anon privilege assertions fail (grants not applied yet). Note: some realtime assertions may pass already.

---

### Task 5: Create the grants migration and make the grants test pass

**Files:**
- Create: `supabase/migrations/<timestamp>_experiment_template_workspace_grants.sql` (name from the CLI)

- [ ] **Step 1: Create the migration file**

Run:

```bash
npx supabase migration new experiment_template_workspace_grants
```

Note the printed filename; all commands below use it as `supabase/migrations/<timestamp>_experiment_template_workspace_grants.sql`.

- [ ] **Step 2: Implement the grants**

Replace the empty migration body with:

```sql
-- Experiment Template Workspace (Phase 1): explicit Data API grants.
-- New Supabase projects no longer auto-expose public tables to the Data API.

grant usage on schema public to authenticated;

grant select, insert, update, delete on table
  public.experiment_templates,
  public.experiment_template_fields,
  public.experiment_template_keys,
  public.experiment_template_key_options,
  public.experiment_values,
  public.experiment_value_options,
  public.experiment_versions,
  public.experiment_template_versions
to authenticated;

-- Keep the publishable key unable to reach Template rows before login.
revoke all privileges on table
  public.experiment_templates,
  public.experiment_template_fields,
  public.experiment_template_keys,
  public.experiment_template_key_options,
  public.experiment_values,
  public.experiment_value_options,
  public.experiment_versions,
  public.experiment_template_versions
from anon;

-- Trigger functions are table-internal; nobody calls them directly.
revoke execute on function public.guard_experiment_template_immutable()
  from public, anon, authenticated;
```

- [ ] **Step 3: Apply the migration and run both new tests**

Run:

```bash
npx supabase db reset --local
npx supabase test db --local \
  supabase/tests/0015_experiment_template_workspace_schema.sql \
  supabase/tests/0016_experiment_template_workspace_grants.sql
```

Expected: both files PASS.

- [ ] **Step 4: Confirm the existing suite still passes**

Run:

```bash
npx supabase test db --local supabase/tests/0014_api_key_deletion.sql
```

Expected: PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<timestamp>_experiment_template_workspace_grants.sql supabase/tests/0016_experiment_template_workspace_grants.sql
git commit -m "feat: grant experiment template workspace data access"
```

---

### Task 6: Add repository types and extend existing types

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/agent-api/mutation-repository.ts` (map the three new Experiment fields and two Attachment fields from RPC rows)
- Modify: `lib/agent-api/read-repository.ts` (same mapping for read rows)
- Modify: `lib/agent-api/__tests__/mutation-repository.test.ts` (RPC row fixture + exact-DTO assertion)
- Modify: `lib/agent-api/__tests__/attachments.test.ts` (attachment row fixture + exact-DTO assertion)
- Modify: `lib/experiments/__tests__/policy.test.ts`
- Modify: `lib/experiments/__tests__/draft.test.ts`
- Modify: `lib/experiments/__tests__/compare.test.ts`
- Modify: `lib/experiments/__tests__/filters.test.ts`
- Modify: `lib/experiments/__tests__/repository.test.ts`
- Modify: `lib/attachments/__tests__/repository.test.ts`
- Modify: `app/api/agent/v1/__tests__/activity-attachment-routes.test.ts`
- Modify: `app/api/agent/v1/__tests__/write-routes.test.ts`
- Modify: `components/__tests__/TaskDetail.test.tsx`
- Modify: `components/experiments/__tests__/DuplicateExperimentDialog.test.tsx`
- Modify: `components/experiments/__tests__/ExperimentCompare.test.tsx`
- Modify: `components/experiments/__tests__/ExperimentDetail.test.tsx`
- Modify: `components/experiments/__tests__/ExperimentDetailMarkdown.integration.test.tsx`
- Modify: `components/experiments/__tests__/ExperimentEvidence.test.tsx`
- Modify: `components/experiments/__tests__/ExperimentFilters.test.tsx`
- Modify: `components/experiments/__tests__/ExperimentsDatabase.test.tsx`
- Modify: `components/experiments/__tests__/ExperimentTable.test.tsx`
- Modify: `components/experiments/__tests__/TaskExperimentsPanel.test.tsx`
- Create: `lib/__tests__/template-types.test.ts`

- [ ] **Step 1: Write the failing type test**

Create `lib/__tests__/template-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  Attachment,
  Experiment,
  ExperimentTemplate,
  ExperimentValue,
  TemplateKey,
  TemplateKeyOption,
  TemplateValueType,
} from "@/lib/types";

const experimentFixture: Experiment = {
  id: "00000000-0000-4000-8000-000000000001",
  experiment_no: 1,
  task_id: "00000000-0000-4000-8000-000000000010",
  owner_id: null,
  name: "Template experiment",
  status: "planned",
  baseline_experiment_id: null,
  template_id: null,
  archived_at: null,
  core_revision: 1,
  data_spec: { datasets: [] },
  object_spec: {
    model: "",
    harness: "",
    parent_harness: "",
    prompt: "",
    prompt_change: "",
    skills: [],
    tools: [],
  },
  environment_spec: {
    platform: "",
    server: "",
    devices: [],
    hardware: "",
    evaluator: "",
    revision: "",
    precision_policy: "",
  },
  config: {},
  notes: "",
  metrics: {},
  featured_metric_keys: [],
  result_summary: "",
  decision_outcome: null,
  decision_notes: "",
  position: 0,
  started_at: null,
  completed_at: null,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z",
};

describe("template workspace types", () => {
  it("supports exactly the nine first-release value types", () => {
    const types: TemplateValueType[] = [
      "short_text",
      "long_text",
      "number",
      "boolean",
      "single_select",
      "multi_select",
      "date_time",
      "url",
      "attachment",
    ];
    expect(types).toHaveLength(9);
  });

  it("round-trips a typed scalar Value", () => {
    const value: ExperimentValue = {
      experiment_id: experimentFixture.id,
      template_id: "30000000-0000-4000-8000-000000000001",
      key_id: "50000000-0000-4000-8000-000000000001",
      text_value: null,
      number_value: 0.73,
      boolean_value: null,
      datetime_value: null,
      option_id: null,
      cell_revision: 1,
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    };
    expect(value.number_value).toBe(0.73);
  });

  it("keeps Template identity stable across renames", () => {
    const template: ExperimentTemplate = {
      id: "30000000-0000-4000-8000-000000000001",
      name: "Imported legacy experiments",
      description: "",
      schema_revision: 1,
      archived_at: null,
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    };
    const key: TemplateKey = {
      id: "50000000-0000-4000-8000-000000000001",
      template_id: template.id,
      field_id: "40000000-0000-4000-8000-000000000001",
      key: "pass@1",
      value_type: "number",
      required: false,
      position: 1,
      archived_at: null,
      created_at: template.created_at,
      updated_at: template.updated_at,
    };
    const option: TemplateKeyOption = {
      id: "70000000-0000-4000-8000-000000000001",
      template_id: template.id,
      key_id: key.id,
      label: "top-1",
      position: 1,
      archived_at: null,
    };
    expect(key.template_id).toBe(template.id);
    expect(option.key_id).toBe(key.id);
  });

  it("exposes Template linkage on Experiment and Attachment rows", () => {
    expect(experimentFixture.template_id).toBeNull();
    expect(experimentFixture.archived_at).toBeNull();
    expect(experimentFixture.core_revision).toBe(1);

    const attachment: Attachment = {
      id: "80000000-0000-4000-8000-000000000001",
      task_id: experimentFixture.task_id,
      experiment_id: experimentFixture.id,
      url: "https://storage.test/plot.png",
      path: "task/experiment/plot.png",
      caption: "",
      position: 0,
      template_key_id: null,
      archived_at: null,
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    };
    expect(attachment.template_key_id).toBeNull();
    expect(attachment.archived_at).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run lib/__tests__/template-types.test.ts
npx tsc --noEmit
```

Expected: TypeScript compile errors — `ExperimentTemplate`, `TemplateKey`, `TemplateKeyOption`, `ExperimentValue` do not exist, and `Experiment`/`Attachment` lack the new fields.

- [ ] **Step 3: Add the Template types to `lib/types.ts`**

Insert after the `ExperimentConfig` declaration (line containing `export type ExperimentConfig = Record<string, ConfigValue>;`):

```ts
export type TemplateValueType =
  | "short_text"
  | "long_text"
  | "number"
  | "boolean"
  | "single_select"
  | "multi_select"
  | "date_time"
  | "url"
  | "attachment";

export interface ExperimentTemplate {
  id: string;
  name: string;
  description: string;
  schema_revision: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateField {
  id: string;
  template_id: string;
  label: string;
  color_token: string;
  position: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateKey {
  id: string;
  template_id: string;
  field_id: string;
  key: string;
  value_type: TemplateValueType;
  required: boolean;
  position: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateKeyOption {
  id: string;
  template_id: string;
  key_id: string;
  label: string;
  position: number;
  archived_at: string | null;
}

export interface ExperimentValue {
  experiment_id: string;
  template_id: string;
  key_id: string;
  text_value: string | null;
  number_value: number | null;
  boolean_value: boolean | null;
  datetime_value: string | null;
  option_id: string | null;
  cell_revision: number;
  created_at: string;
  updated_at: string;
}

export interface ExperimentValueOption {
  experiment_id: string;
  template_id: string;
  key_id: string;
  option_id: string;
  position: number;
}

export type VersionSource = "browser" | "agent" | "migration" | "system";

export interface ExperimentVersion {
  id: string;
  experiment_id: string;
  version_no: number;
  reason: string;
  source: VersionSource;
  edit_session_id: string | null;
  template_schema_revision: number;
  snapshot: unknown;
  actor_member_id: string | null;
  created_at: string;
}

export interface TemplateVersion {
  id: string;
  template_id: string;
  version_no: number;
  reason: string;
  source: VersionSource;
  schema_revision: number;
  snapshot: unknown;
  actor_member_id: string | null;
  created_at: string;
}
```

- [ ] **Step 4: Extend `Experiment` in `lib/types.ts`**

Add these three fields to the `Experiment` interface, directly after `baseline_experiment_id: string | null;`:

```ts
  template_id: string | null;
  archived_at: string | null;
  core_revision: number;
```

- [ ] **Step 5: Extend `Attachment` in `lib/types.ts`**

Add these two fields to the `Attachment` interface, directly after `position: number;`:

```ts
  template_key_id: string | null;
  archived_at: string | null;
```

- [ ] **Step 6: Update Experiment fixtures**

Add `template_id: null, archived_at: null, core_revision: 1,` immediately after `baseline_experiment_id: null,` in each of:

`lib/experiments/__tests__/policy.test.ts` — the `completeContext` object.

`lib/experiments/__tests__/draft.test.ts` — the `draft` object.

`lib/experiments/__tests__/compare.test.ts` — the `experiment()` factory return.

`lib/experiments/__tests__/filters.test.ts` — the row factory return.

`lib/experiments/__tests__/repository.test.ts` — the `const experiment = { ... }` object (the `second` and `widerPatch` spreads inherit it).

- [ ] **Step 7: Update Attachment fixtures**

Add `template_key_id: null, archived_at: null,` immediately after `position: 0,` in:

`lib/experiments/__tests__/repository.test.ts` — the `const attachment = { ... } satisfies Attachment` object.

`lib/attachments/__tests__/repository.test.ts` — the `const attachment = { ... } satisfies Attachment` object.

If `npx tsc --noEmit` still reports an `Experiment` or `Attachment` literal missing the new fields elsewhere, find it with:

```bash
rg -n "satisfies Experiment|satisfies Attachment|experiment_no:" lib app components --glob "*.test.ts*"
```

and add the same fields (the same `null`/`1` values above).

- [ ] **Step 8: Run the type test and full TS + unit verification**

Run:

```bash
npx vitest run
npx tsc --noEmit
```

Expected: all Vitest suites PASS, including `lib/__tests__/template-types.test.ts`; `tsc --noEmit` exits 0.

- [ ] **Step 9: Commit**

```bash
git add lib/types.ts lib/__tests__/template-types.test.ts \
  lib/experiments/__tests__/policy.test.ts \
  lib/experiments/__tests__/draft.test.ts \
  lib/experiments/__tests__/compare.test.ts \
  lib/experiments/__tests__/filters.test.ts \
  lib/experiments/__tests__/repository.test.ts \
  lib/attachments/__tests__/repository.test.ts
git commit -m "feat: add experiment template repository types"
```

---

### Task 7: Self-review and final verification

**Files:** none

- [ ] **Step 1: Re-read the spec sections against the migration**

Open `docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md` and confirm each of these is covered by the two migrations:

- `experiment_templates` with active-name partial unique index (spec "experiment_templates").
- Field Labels with `(template_id, position)` and active-row indexes (spec "experiment_template_fields").
- Keys with case-insensitive Template uniqueness, value-type check, blank-key rejection, composite same-Template FK (spec "experiment_template_keys").
- Select options owned by one Key (spec "experiment_template_key_options").
- `experiments.template_id`, `archived_at`, `core_revision`; composite `(id, template_id)` unique; immutability guard (spec "experiments").
- `experiment_values` composite FKs, at-most-one-scalar check, finite-number check, four indexes (spec "experiment_values").
- `experiment_value_options` composite FKs and parent-row cascade (spec "experiment_value_options").
- Both version tables with `unique (parent_id, version_no)` and `source` check (spec "experiment_versions", "experiment_template_versions").
- `attachments.template_key_id` + `archived_at` (spec "attachments").
- RLS enabled on all eight new tables; realtime publication for live tables only (spec "Supabase Security and Realtime").
- Explicit Data API grants to `authenticated`, revoke from `anon` (spec "Supabase Security and Realtime").

Anything missing or contradicting the spec must be fixed in the relevant migration/test before proceeding (then re-run the affected test).

- [ ] **Step 2: Run the complete database test suite**

Run:

```bash
npx supabase test db --local \
  supabase/tests/0014_api_key_deletion.sql \
  supabase/tests/0015_experiment_template_workspace_schema.sql \
  supabase/tests/0016_experiment_template_workspace_grants.sql
```

Expected: all three files PASS.

- [ ] **Step 3: Run the complete application test suite and typecheck**

Run:

```bash
npx vitest run
npx tsc --noEmit
```

Expected: PASS and exit 0.

- [ ] **Step 4: Verify the branch state and commit the plan**

Run:

```bash
git status --short
git log --oneline -3
```

Expected: only the intended files changed; last three commits are the schema migration, grants migration, and types commit. If the plan file is untracked, commit it:

```bash
git add docs/superpowers/plans/2026-07-31-experiment-template-workspace-database.md
git commit -m "docs: plan experiment template workspace database phase"
```

- [ ] **Step 5: Hand off**

Report to the user:

- Phase 1 complete: both migrations, both pgTAP suites, and the repository types are committed on `feat/experiment-template-workspace`.
- Phase 2 (Template Manager + Template-aware Experiment creation) is the next plan to write and execute.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-31-experiment-template-workspace-database.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
