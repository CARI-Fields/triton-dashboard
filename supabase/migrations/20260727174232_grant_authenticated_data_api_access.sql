-- New Supabase projects no longer expose public-schema tables to the Data API
-- automatically. The browser client is intentionally team-wide after login, so
-- grant only the authenticated role access to the board's application tables.
grant usage on schema public to authenticated;

grant select, insert, update, delete on table
  public.modules,
  public.tasks,
  public.members,
  public.experiments,
  public.attachments,
  public.activity
to authenticated;

-- experiments.experiment_no is identity-backed.
grant usage, select on all sequences in schema public to authenticated;

-- Keep the publishable key unable to access board rows before login.
revoke all privileges on table
  public.modules,
  public.tasks,
  public.members,
  public.experiments,
  public.attachments,
  public.activity
from anon;
revoke all privileges on all sequences in schema public from anon;

-- Authenticated browser users never need to create schema objects or call
-- trigger functions directly.
revoke create on schema public from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.set_experiment_status_timestamps() from public, anon, authenticated;
revoke execute on function public.log_experiment_activity() from public, anon, authenticated;

-- PostgreSQL does not create indexes for foreign-key columns automatically.
create index if not exists tasks_module_id_idx
  on public.tasks (module_id);
create index if not exists attachments_task_id_idx
  on public.attachments (task_id);
create index if not exists attachments_experiment_id_idx
  on public.attachments (experiment_id);
