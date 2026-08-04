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
