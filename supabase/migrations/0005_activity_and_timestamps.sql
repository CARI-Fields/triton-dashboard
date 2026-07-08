-- Task activity timeline + updated_at timestamps (design: Triton Board.dc.html).
-- Applied automatically by `npm run db:migrate`.

alter table tasks       add column if not exists updated_at timestamptz not null default now();
alter table experiments add column if not exists updated_at timestamptz not null default now();

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_set_updated_at on tasks;
create trigger tasks_set_updated_at
  before update on tasks
  for each row execute function set_updated_at();

drop trigger if exists experiments_set_updated_at on experiments;
create trigger experiments_set_updated_at
  before update on experiments
  for each row execute function set_updated_at();

create table if not exists activity (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  text       text not null,
  kind       text not null default 'edit',
  created_at timestamptz not null default now()
);

create index if not exists activity_task_id_idx on activity (task_id, created_at desc);

-- Same lockdown as 0004: authenticated-only.
alter table activity enable row level security;
drop policy if exists "auth access" on activity;
create policy "auth access" on activity for all to authenticated using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table activity;
exception when others then null; end $$;
