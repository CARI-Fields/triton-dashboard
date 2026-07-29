# Task 7 Report — Agent Read Endpoints

## Outcome

Implemented the Task 7 Agent API read surface:

- authenticated capabilities with no scope requirement;
- scoped Board, Module, Member, Task, Experiment, and Activity GETs;
- `audit:read` audit GET filtered through current live `task_assignees`;
- strict Task and Experiment query parsing;
- opaque canonical base64url `{updated_at,id}` cursors;
- descending two-column keyset pagination with a `limit + 1` boundary;
- explicit database projections and public DTO allowlists;
- Task and Experiment detail ETags;
- Experiment detail Attachments including `updated_at`.

The shared Task select was narrowed from `*` to the exact Task storage fields
required by `normalizeTaskRow`, plus the UUID assignee relation. The controller
explicitly authorized this scoped prerequisite after the initial repository
contract conflict was reported.

## TDD Evidence

### RED 1 — read surface and shared Task projection

Tests were written before the new repository/routes. The initial focused run:

```bash
npm test -- \
  lib/tasks/__tests__/assignees.test.ts \
  lib/agent-api/__tests__/read-repository.test.ts \
  app/api/agent/v1/__tests__/read-routes.test.ts
```

failed as expected:

```text
Test Files 3 failed (3)
Tests 1 failed | 5 passed (6)
```

The concrete shared-select failure was:

```text
Expected: id,module_id,title,status,notes,position,created_at,updated_at,...
Received: *,task_assignees(member_id,member:members(name))
```

The two new suites also failed import resolution because the required
repository and routes did not yet exist. After minimal production
implementation, focused GREEN was:

```text
Test Files 3 passed (3)
Tests 60 passed (60)
```

The first implementation run surfaced three test-fixture defects, not contract
failures: two “uppercase” UUID fixtures used numeric-only UUIDs and therefore
had not actually changed case, and a route-wrapper mock referenced a
hoisted top-level binding. The fixtures were corrected without relaxing
production validation.

### RED 2 — missing Task Activity parent

A focused route regression then proved the missing-parent behavior was wrong:

```text
Test Files 1 failed (1)
Tests 1 failed | 19 passed (20)
expected 200 to be 404
```

The Activity handler now verifies the Task before listing its Timeline.
Focused GREEN:

```text
Test Files 1 passed (1)
Tests 20 passed (20)
```

### RED 3 — impossible RFC 3339 calendar dates

Strict timestamp regressions showed that `Date.parse` alone normalized
impossible dates:

```text
Test Files 1 failed (1)
Tests 2 failed | 35 passed (37)
```

Both a cursor and `updated_after=2026-02-30T12:00:00.000Z` were wrongly
accepted. Component-level calendar and clock validation made the repository
suite pass 37/37 without narrowing valid fractional seconds or timezone
offsets.

### Covered behavior

The Task 7 tests cover:

- canonical unpadded base64url cursor round-trip;
- malformed, padded, noncanonical, extra-field, bad timestamp, and
  noncanonical UUID cursor rejection;
- default and maximum list limits, duplicate parameters, unknown filters,
  invalid UUID/status/timestamp/limit values;
- exact `(updated_at < cursor.updated_at) OR
  (updated_at = cursor.updated_at AND id < cursor.id)` predicates;
- equal-`updated_at` ID tie-break pagination;
- documented filter forwarding;
- Task relation normalization without legacy `tasks.assignees`;
- Module, Member, Task, Experiment, Attachment, Activity, audit, and snapshot
  field allowlists;
- audit exclusion of `request_hash`, `idempotency_key`, Key digests, scope
  join rows, legacy Task assignee arrays, and unknown internal columns;
- audit visibility through the current Task assignment join, never the
  historical audit Member/Key;
- `board:read`, `audit:read`, and authenticated-only capabilities;
- awaited dynamic params;
- Task/Experiment/missing-Activity-parent 404 envelopes;
- exact quoted ETags, `Cache-Control: no-store`, and absent permissive CORS
  headers.

## Verification

Shared-select consumers:

```text
Test Files 6 passed (6)
Tests 125 passed (125)
```

This includes Board, Task Detail, Experiment repository, assignee, read
repository, and read route coverage. Analytics has no dedicated test file; its
shared select consumer compiled in both TypeScript and the production build.

Full application suite:

```text
Test Files 37 passed (37)
Tests 557 passed (557)
```

Other gates:

```text
npx tsc --noEmit
exit 0

npm run build
exit 0
Next.js 16.2.10 compiled successfully
all ten Agent read routes emitted as dynamic routes

npx supabase test db --local supabase/tests/0007_agent_api_schema.sql
Files=1, Tests=20
Result: PASS
```

The first pgTAP invocation could not write the Supabase CLI telemetry file
under the sandboxed home directory (`EROFS`). The exact same local-only command
passed 20/20 when rerun with approved filesystem access.

## Security and Scope Audit

Production scans found:

- no `select("*")` or wildcard projection in the new read repository/routes;
- no API Key digest, request hash, idempotency secret, Supabase secret, or
  Authorization value in a read projection or response DTO;
- no permissive CORS headers;
- no `Buffer`, Node-only import, debug logging, or credential logging;
- no Agent `DELETE`, `POST`, `PATCH`, batch, or other write endpoint;
- no legacy Task assignee column in the shared Task projection or public Task
  DTO.

The existing `assignTaskMember`/`unassignTaskMember` browser helpers remain in
the shared assignee module; Task 7 did not add or alter those writes.

## Documentation and Skill Notes

- Read the repository-mandated Next.js 16.2.10 Route Handler,
  backend-for-frontend, and authorization documentation. Dynamic params are
  awaited exactly as documented.
- Reviewed current Supabase JavaScript filter/order documentation and the
  breaking-change changelog. The repository already contains explicit
  `service_role` Data API grants required by the current Supabase exposure
  model.
- The controller-provided path
  `/home/yubaifeng/.codex/skills/supabase/SKILL.md` did not exist. The same
  available repository skill was read from
  `/home/yubaifeng/e84381970/projects/triton-board/.agents/skills/supabase/SKILL.md`.

## Warnings / Concerns

- Vitest continues to print the repository's existing
  `vite-tsconfig-paths` deprecation warning.
- Next.js continues to print the existing multiple-lockfile workspace-root
  inference warning.
- No new contract blocker or unresolved functional concern remains.
