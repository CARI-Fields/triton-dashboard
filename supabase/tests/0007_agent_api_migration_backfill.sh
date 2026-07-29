#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$(find "$PROJECT_ROOT/supabase/migrations" -maxdepth 1 -type f -name '*_triton_board_agent_api_schema.sql' -print -quit)"
TEMP_DIR="$(mktemp -d)"

cleanup() {
  npx supabase db reset --local >/dev/null
  npx supabase db query --local "do \$\$
  begin
    if to_regclass('public.task_assignees') is null
      or to_regclass('public.api_keys') is null then
      raise exception 'local reset did not restore the Agent API migration';
    end if;
  end
  \$\$;" >/dev/null
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

if [[ -z "$MIGRATION" ]]; then
  echo 'Agent API migration not found' >&2
  exit 1
fi

cd "$PROJECT_ROOT"

run_query() {
  npx supabase db query --local "$1" >/dev/null
}

apply_file() {
  docker exec -i supabase_db_triton-board \
    psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

prepare_pre_agent_api_schema() {
  run_query 'drop schema public cascade'
  run_query 'create schema public'
  run_query 'grant usage on schema public to postgres, anon, authenticated, service_role'

  local migration
  for migration in \
    "$PROJECT_ROOT/supabase/migrations/0001_schema.sql" \
    "$PROJECT_ROOT/supabase/migrations/0002_task_details.sql" \
    "$PROJECT_ROOT/supabase/migrations/0003_plots_per_experiment.sql" \
    "$PROJECT_ROOT/supabase/migrations/0004_auth_lockdown.sql" \
    "$PROJECT_ROOT/supabase/migrations/0005_activity_and_timestamps.sql" \
    "$PROJECT_ROOT/supabase/migrations/0006_experiment_workspace.sql" \
    "$PROJECT_ROOT/supabase/migrations/20260727174232_grant_authenticated_data_api_access.sql"; do
    apply_file "$migration" >/dev/null 2>&1
  done
}

insert_legacy_fixture() {
  local assignee_name="$1"

  run_query "insert into public.modules (id, name, kind, objective, position)
    values ('10000000-0000-4000-8000-000000000001', 'Fixture', 'pipeline', '', 0)"
  run_query "insert into public.tasks (id, module_id, title, status, assignees, position)
    values (
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'Legacy assignment',
      'todo',
      array['${assignee_name}'],
      0
    )"
}

prepare_pre_agent_api_schema
run_query "insert into public.members (id, name)
  values
    ('20000000-0000-4000-8000-000000000001', 'Legacy Alice'),
    ('20000000-0000-4000-8000-000000000002', 'Legacy Bob');"
insert_legacy_fixture 'Legacy Alice'
run_query "insert into public.tasks (id, module_id, title, status, assignees, position)
  values (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Second legacy assignment',
    'todo',
    array['Legacy Bob'],
    1
  );"
apply_file "$MIGRATION" >/dev/null
run_query "do \$\$
begin
  if (select count(*) from public.task_assignees) <> 2
    or not exists (
      select 1 from public.task_assignees
      where task_id = '30000000-0000-4000-8000-000000000001'
        and member_id = '20000000-0000-4000-8000-000000000001'
    )
    or not exists (
      select 1 from public.task_assignees
      where task_id = '30000000-0000-4000-8000-000000000002'
        and member_id = '20000000-0000-4000-8000-000000000002'
    ) then
    raise exception 'legacy assignee backfill did not preserve UUID mappings';
  end if;
end
\$\$;"
echo 'PASS: valid legacy assignees are backfilled by the committed migration'

prepare_pre_agent_api_schema
insert_legacy_fixture 'Unknown Member'
if apply_file "$MIGRATION" >"$TEMP_DIR/unknown-member.log" 2>&1; then
  echo 'Expected migration to reject an unknown legacy assignee' >&2
  exit 1
fi
rg -F 'Cannot migrate task assignee to a unique Member UUID' "$TEMP_DIR/unknown-member.log" >/dev/null
echo 'PASS: committed migration rejects an unknown legacy assignee'

prepare_pre_agent_api_schema
run_query "insert into public.members (id, name)
  values
    ('20000000-0000-4000-8000-000000000010', 'Duplicate Member'),
    ('20000000-0000-4000-8000-000000000011', 'Duplicate Member');"
insert_legacy_fixture 'Duplicate Member'
if apply_file "$MIGRATION" >"$TEMP_DIR/duplicate-member.log" 2>&1; then
  echo 'Expected migration to reject a non-unique legacy assignee' >&2
  exit 1
fi
rg -F 'Cannot migrate task assignee to a unique Member UUID' "$TEMP_DIR/duplicate-member.log" >/dev/null
echo 'PASS: committed migration rejects a non-unique legacy assignee'
