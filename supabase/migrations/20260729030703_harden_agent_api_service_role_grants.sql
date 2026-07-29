revoke insert, update, delete on table
  public.tasks,
  public.experiments,
  public.activity,
  public.attachments
from service_role;

revoke select on sequence public.experiments_experiment_no_seq
  from service_role;

grant select on public.tasks to service_role;
grant update (title, status, notes, position)
  on public.tasks to service_role;

grant select on public.experiments to service_role;
grant insert (task_id, owner_id, name, status)
  on public.experiments to service_role;
grant update (
  name,
  status,
  baseline_experiment_id,
  data_spec,
  object_spec,
  environment_spec,
  config,
  notes,
  metrics,
  featured_metric_keys,
  result_summary,
  decision_outcome,
  decision_notes,
  position
) on public.experiments to service_role;

grant select on public.activity to service_role;
grant insert (task_id, text, kind)
  on public.activity to service_role;

grant select on public.attachments to service_role;
grant insert (task_id, experiment_id, path, url, caption)
  on public.attachments to service_role;
grant update (caption)
  on public.attachments to service_role;

grant usage on sequence public.experiments_experiment_no_seq
  to service_role;
