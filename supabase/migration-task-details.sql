-- Task details migration: per-task notes, experiments (with metrics), and image attachments.
-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to re-run.

-- 1) freeform markdown notes on each task
alter table tasks add column if not exists notes text not null default '';

-- 2) experiments: one row per run, with numeric metrics as a JSON object
create table if not exists experiments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  name       text not null default 'New experiment',
  notes      text not null default '',
  metrics    jsonb not null default '{}',
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);

-- 3) attachments: uploaded plots / screenshots (files live in Storage)
create table if not exists attachments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  url        text not null,
  path       text not null default '',
  caption    text not null default '',
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);

alter table experiments enable row level security;
alter table attachments enable row level security;

drop policy if exists "public access" on experiments;
drop policy if exists "public access" on attachments;
create policy "public access" on experiments for all using (true) with check (true);
create policy "public access" on attachments for all using (true) with check (true);

do $$ begin alter publication supabase_realtime add table experiments; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table attachments; exception when others then null; end $$;

-- 4) storage bucket for uploaded images (public read; no-login write like the rest of the app)
insert into storage.buckets (id, name, public)
values ('task-images', 'task-images', true)
on conflict (id) do nothing;

drop policy if exists "task-images read"   on storage.objects;
drop policy if exists "task-images insert" on storage.objects;
drop policy if exists "task-images update" on storage.objects;
drop policy if exists "task-images delete" on storage.objects;
create policy "task-images read"   on storage.objects for select using (bucket_id = 'task-images');
create policy "task-images insert" on storage.objects for insert with check (bucket_id = 'task-images');
create policy "task-images update" on storage.objects for update using (bucket_id = 'task-images');
create policy "task-images delete" on storage.objects for delete using (bucket_id = 'task-images');
