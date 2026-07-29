# Task 8 Report — Scoped Task and Experiment Writes

## Outcome

Implemented the Task 8 Agent API write surface:

- canonical SHA-256 request hashing over the recursively key-sorted
  `[method,path,body]` tuple while preserving array order;
- typed adapters for `agent_api_patch_task`,
  `agent_api_create_experiment`, and `agent_api_patch_experiment`;
- exact RPC argument names, stable SQL-domain error mapping, retry metadata,
  strict RPC-envelope validation, and explicit response DTO allowlists;
- Task PATCH, nested Experiment POST, and Experiment PATCH Route Handlers;
- strict canonical lowercase resource/Idempotency UUIDs, quoted If-Match,
  unsupported-query rejection, one-read JSON handling, ETags, and replay
  status/metadata;
- current collaboration prechecks plus the authoritative atomic RPC recheck;
- Experiment transition, merged-candidate, and Baseline workflow validation;
- explicit Node runtime declarations and no Task/Experiment DELETE exports.

Task mutation responses omit the legacy `tasks.assignees` field. Experiment
responses strip arbitrary RPC, audit, idempotency, and nested internal extras.
The adapter normalizes the database's real `{}`/null Experiment structured
defaults into the same strict, PATCH-compatible DTO defaults as Task 7 reads.

## TDD Evidence

### RED 1 — mutation repository

The repository tests were written before production code:

```bash
npm test -- lib/agent-api/__tests__/mutation-repository.test.ts
```

Expected RED:

```text
Test Files 1 failed (1)
Tests no tests
Failed to resolve import "@/lib/agent-api/mutation-repository"
```

After the minimal repository implementation:

```text
Test Files 1 passed (1)
Tests 25 passed (25)
```

### RED 2 — write routes

The write-route tests were written before the nested POST route or PATCH
handlers:

```bash
npm test -- app/api/agent/v1/__tests__/write-routes.test.ts
```

Expected RED:

```text
Test Files 1 failed (1)
Tests no tests
Failed to resolve import
"@/app/api/agent/v1/tasks/[id]/experiments/route"
```

After the minimal handlers and strict If-Match implementation:

```text
Test Files 1 passed (1)
Tests 56 passed (56)
```

### RED 3 — real database Experiment defaults

A repository regression then supplied the exact `{}`/null defaults returned by
the real create RPC. The focused run failed 1 of 25 tests because the first
adapter rejected that valid storage shape:

```text
Agent API mutation RPC returned invalid data.
```

Normalizing those fields through exact DTO allowlists made the repository
suite pass 25/25. A final unchanged-Baseline case raised the focused write
surface to:

```text
Test Files 4 passed (4)
Tests 115 passed (115)
```

The focused command was:

```bash
npm test -- \
  lib/agent-api/__tests__/mutation-repository.test.ts \
  app/api/agent/v1/__tests__/write-routes.test.ts \
  lib/agent-api/__tests__/responses.test.ts \
  app/api/agent/v1/__tests__/read-routes.test.ts
```

## Covered Behavior

The Task 8 tests cover:

- nested key-order equivalence, array-order significance, and method/path/body
  hash separation;
- exact RPC names and arguments for all three adapters;
- all mutation SQL domain messages:
  `VERSION_CONFLICT`, `TASK_SCOPE_FORBIDDEN`, `WRITE_RATE_LIMITED`,
  `IDEMPOTENCY_KEY_REUSED`, `IDEMPOTENCY_INPUT_REQUIRED`, and
  `INVALID_EXPERIMENT_NAME`;
- exact-message matching so database-detail near-matches are not exposed;
- malformed/null RPC envelopes and rows, replay propagation, default
  normalization, and broad/raw response extras;
- omission of legacy assignees, internal fields, audit snapshots, request
  hashes, and idempotency keys;
- exact write scopes without `board:read`, awaited params, canonical resource
  IDs, unsupported queries, collaboration checks, and no mutation RPC after a
  failed precondition;
- missing, empty, malformed, and multi-value If-Match/Idempotency headers;
- one-read JSON behavior and strict normalized schema output;
- writable/protected Task and Experiment fields;
- first-create 201 versus replay 200, exact replay metadata, normalized-name
  hashing, and new ETags;
- stale ETags, idempotency conflicts, and revoked scope/assignment races
  surfaced from the authoritative RPC;
- missing current Experiment, Bruce editing Alice's Experiment under a shared
  Task, and Owner irrelevance;
- original-to-target status transitions while validating runnable/result
  requirements against the merged candidate;
- stable `422 WORKFLOW_INVALID` issue details;
- Baseline missing, self, cross-Task, same-Task, unchanged, and null cases;
- absent CORS headers, explicit Node runtimes, and no DELETE exports.

## Database and PostgREST Verification

Canonical local Agent API pgTAP:

```bash
npx supabase test db --local \
  supabase/tests/0007_agent_api_schema.sql \
  supabase/tests/0008_agent_api_mutations.sql \
  supabase/tests/0009_agent_api_security_behavior.sql \
  supabase/tests/0012_agent_api_reads.sql
```

```text
Files=4, Tests=97
Result: PASS
```

Concurrency:

```bash
bash supabase/tests/0010_agent_api_concurrency.sh
```

```text
Files=1, Tests=10
Result: PASS
```

Historical grant upgrade:

```bash
bash supabase/tests/0011_agent_api_grant_upgrade.sh
```

```text
prior: Files=1, Tests=3, Result: PASS
final: Files=1, Tests=9, Result: PASS
```

A temporary local-only PostgREST smoke invoked
`agent_api_create_experiment` through `/rest/v1/rpc`, without printing
credentials. It verified server-derived Task/Owner/planned status, the real
`{}` structured defaults, matching replay returning the same resource with
`idempotency_replayed=true`, and a changed hash returning
`IDEMPOTENCY_KEY_REUSED`:

```text
PASS PostgREST create/replay/mismatch and server-derived Experiment fields
```

## Application Verification

Full Vitest:

```bash
npm test
```

```text
Test Files 39 passed (39)
Tests 644 passed (644)
```

The final test-only unchanged-Baseline case is included in the final focused
115-test run above and the pre-commit full-suite rerun recorded below.

Other gates:

```text
npx tsc --noEmit
exit 0

npm run build
exit 0
Next.js 16.2.10 compiled successfully
/api/agent/v1/tasks/[id]/experiments emitted as a dynamic route

git diff --check
exit 0
```

## Security and Contract Audit

Production scans found:

- no wildcard database projection or raw RPC response forwarding;
- no permissive CORS, debug logging, credential logging, or secret access;
- no direct table insert/update/delete in the handlers or mutation adapter;
- no Task/Experiment DELETE handler or batch endpoint;
- only expected RPC request arguments mention `request_hash` or
  `idempotency_key`;
- all three Node-crypto-dependent route modules declare
  `runtime = "nodejs"`;
- response DTOs never include legacy `tasks.assignees`, audit snapshots, or
  arbitrary RPC extras.

The first combined security-scan shell command had a quoting error and exited
2 before running. This was a verification-command defect, not an application
or test failure. The scans were split into simple commands and passed.

## Documentation and Supabase Notes

- Read the installed Next.js 16.2.10 Route Handler, backend-for-frontend, and
  authentication/authorization guides. Dynamic params are awaited; public
  endpoints authorize in the DAL; request bodies are read once; DTOs are
  explicit.
- Read the repository Supabase skill, current changelog, JavaScript RPC, and
  TypeScript response documentation. The 2026 Data API auto-exposure change
  does not require a Task 8 schema change because the existing migrations
  explicitly grant only the required service-role RPC execution.
- The RPC remains the race-proof scope/collaboration/ETag/idempotency/quota
  authority; Route Handler prechecks only provide early public errors.

## Warnings

- Vitest prints the repository's existing `vite-tsconfig-paths` deprecation
  warning.
- Next.js prints the existing multiple-lockfile workspace-root inference
  warning.
- The Supabase CLI initially hit its known sandbox telemetry `EROFS`; the same
  local-only commands passed when rerun with approved filesystem access.

## Fix Round 1 — Validate If-Match Timestamps Before RPC

### Root Cause

`parseIfMatch` enforced one nonempty quoted value but did not validate the
inner value as a timestamp. A value such as `"not-a-timestamp"` therefore
reached a `timestamptz` RPC argument, where Postgres/PostgREST returned
`22007`; the generic unknown-RPC path then produced a public 500.

Task 7 already had the required strict RFC 3339 validator, but it was private
to `read-repository.ts`. The fix extracts that implementation into the tiny
pure `lib/agent-api/timestamps.ts` module and uses the same function for:

- read cursors;
- `updated_after` filters;
- quoted If-Match values.

There is no second timestamp regex or divergent calendar implementation.

### RED

Response-level and Task/Experiment route regressions were added before
production changes:

```bash
npm test -- \
  lib/agent-api/__tests__/responses.test.ts \
  lib/agent-api/__tests__/read-repository.test.ts \
  app/api/agent/v1/__tests__/write-routes.test.ts
```

The run failed exactly at the missing boundary validation:

```text
Test Files 2 failed | 1 passed (3)
Tests 14 failed | 130 passed (144)
```

Ten response cases accepted quoted non-timestamps, impossible dates/times, or
invalid offsets. Both Task and Experiment handlers returned 200 and called
their mutation adapters for `"not-a-timestamp"` and
`"2026-02-30T12:00:00.000Z"`.

### GREEN

After extracting and applying the shared validator:

```text
Test Files 3 passed (3)
Tests 144 passed (144)
```

The focused coverage proves:

- valid `Z`, numeric-offset, and 1/6/9-digit fractional values are forwarded
  byte-for-byte unchanged;
- Task and Experiment reject quoted non-timestamps and impossible dates with
  stable `400 MISSING_IF_MATCH` before reading JSON or calling an RPC;
- missing, empty, multiple, weak, wildcard, date-only, space-separated,
  timezone-free, impossible clock, and impossible offset values are rejected;
- a valid stale timestamp still reaches the RPC and remains a 412
  `VERSION_CONFLICT`;
- read cursor/query behavior still accepts fractional numeric-offset
  timestamps and keeps canonical cursor round-trips.

### Verification

Fresh full application gates:

```text
npm test
Test Files 39 passed (39)
Tests 676 passed (676)

npx tsc --noEmit
exit 0

npm run build
exit 0
Next.js 16.2.10 compiled successfully

git diff --check
exit 0
```

The proportionate local mutation RPC suite also remained green:

```bash
npx supabase test db --local supabase/tests/0008_agent_api_mutations.sql
```

```text
Files=1, Tests=16
Result: PASS
```

Security scans found no new CORS, secret/debug logging, direct resource write,
or DELETE surface. Only the existing Admin-key validators retain separate
date-time parsing because Fix Round 1 intentionally changes the Task 7 read
and Task 8 If-Match boundary only.
