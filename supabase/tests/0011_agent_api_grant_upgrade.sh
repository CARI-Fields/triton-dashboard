#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${TEST_DIR}/../.." && pwd)"
PROJECT_ID="$(
  sed -n 's/^project_id = "\(.*\)"/\1/p' \
    "${PROJECT_DIR}/supabase/config.toml" |
    head -n 1
)"
DB_CONTAINER="supabase_db_${PROJECT_ID}"
SETUP_SQL="${TEST_DIR}/0011_agent_api_grant_upgrade_setup.psql"
PRIOR_TEST_SQL="${TEST_DIR}/0011_agent_api_grant_upgrade_prior.sql"
MIGRATION_SQL="${PROJECT_DIR}/supabase/migrations/20260729100913_support_direct_attachment_patch.sql"
FINAL_TEST_SQL="${TEST_DIR}/0011_agent_api_grant_upgrade.sql"

run_sql_file() {
  local sql_file=$1
  docker exec -i "${DB_CONTAINER}" \
    psql --no-psqlrc --set=ON_ERROR_STOP=1 \
    --username postgres --dbname postgres \
    < "${sql_file}" >/dev/null
}

apply_corrective_migration() {
  run_sql_file "${MIGRATION_SQL}"
}

restore_on_exit() {
  local exit_status=$?
  trap - EXIT
  if ! apply_corrective_migration; then
    echo "Failed to restore narrow Agent API grants" >&2
    if [[ ${exit_status} -eq 0 ]]; then
      exit_status=1
    fi
  fi
  exit "${exit_status}"
}

trap restore_on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cd "${PROJECT_DIR}"
run_sql_file "${SETUP_SQL}"
npx supabase test db --local "${PRIOR_TEST_SQL}"
apply_corrective_migration
npx supabase test db --local "${FINAL_TEST_SQL}"
