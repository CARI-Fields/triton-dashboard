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
TEST_SQL="${TEST_DIR}/0010_agent_api_concurrency.sql"
CLEANUP_SQL="${TEST_DIR}/0010_agent_api_concurrency_cleanup.psql"

cleanup_fixtures() {
  docker exec -i "${DB_CONTAINER}" \
    psql --no-psqlrc --set=ON_ERROR_STOP=1 \
    --username postgres --dbname postgres \
    < "${CLEANUP_SQL}" >/dev/null
}

cleanup_on_exit() {
  local exit_status=$?
  trap - EXIT
  if ! cleanup_fixtures; then
    echo "Failed to clean Agent API concurrency fixtures" >&2
    if [[ ${exit_status} -eq 0 ]]; then
      exit_status=1
    fi
  fi
  exit "${exit_status}"
}

trap cleanup_on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cleanup_fixtures
cd "${PROJECT_DIR}"
npx supabase test db --local "${TEST_SQL}"
