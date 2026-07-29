alter table public.tasks
  add column if not exists tags text[] not null default '{}',
  add column if not exists priority text not null default 'medium',
  add column if not exists due_date date;

alter table public.tasks
  alter column module_id drop not null;

alter table public.tasks
  drop constraint if exists tasks_module_id_fkey;

alter table public.tasks
  add constraint tasks_module_id_fkey
  foreign key (module_id)
  references public.modules(id)
  on delete set null;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_priority_check'
  ) then
    alter table public.tasks
      add constraint tasks_priority_check
      check (priority in ('low', 'medium', 'high', 'urgent'));
  end if;
end
$constraints$;

create index if not exists tasks_module_id_idx
  on public.tasks (module_id);
