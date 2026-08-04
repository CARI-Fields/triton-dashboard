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
