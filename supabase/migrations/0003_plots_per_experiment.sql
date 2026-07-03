-- Move plots/images from task-level to experiment-level.
-- Run once in Supabase -> SQL Editor.
alter table attachments
  add column if not exists experiment_id uuid references experiments(id) on delete cascade;
