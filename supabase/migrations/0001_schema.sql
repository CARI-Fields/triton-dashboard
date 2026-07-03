-- Triton Board — database schema
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run (idempotent).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists modules (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'New module',
  kind       text not null default 'pipeline' check (kind in ('pipeline', 'foundation')),
  objective  text not null default '',
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id         uuid primary key default gen_random_uuid(),
  module_id  uuid not null references modules(id) on delete cascade,
  title      text not null default 'New task',
  status     text not null default 'in_progress' check (status in ('todo', 'in_progress', 'done', 'blocked')),
  assignees  text[] not null default '{}',
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  initials   text not null default '',
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- No-login board: the anon key + these policies give everyone with the link
-- full read/write. The URL is the secret. (Add real auth later by tightening
-- these policies to `to authenticated`.)
-- ---------------------------------------------------------------------------
alter table modules enable row level security;
alter table tasks   enable row level security;
alter table members enable row level security;

drop policy if exists "public access" on modules;
drop policy if exists "public access" on tasks;
drop policy if exists "public access" on members;

create policy "public access" on modules for all using (true) with check (true);
create policy "public access" on tasks   for all using (true) with check (true);
create policy "public access" on members for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Realtime: push row changes to every connected browser so edits sync live.
-- Wrapped so re-running the script does not error if already added.
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table modules;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table tasks;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table members;
exception when others then null; end $$;
