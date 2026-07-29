# Task 6 Report: Shared-Admin API Key Management

## Outcome

- Added a server-only Admin key service with strict runtime validation for
  names, Member UUIDs, fixed scopes, RFC 3339 expiries, key UUIDs, and PATCH
  fields. Member UUIDs must resolve in the database.
- Create and rotate generate 256-bit `tb_live_...` credentials, persist only
  the SHA-256 digest and public prefix, and return the raw secret only in that
  operation's result. List, PATCH, and revoke views cannot contain either a
  digest or raw secret.
- Rotation conditionally replaces the digest only while the row remains
  active, so an old secret becomes invalid immediately and a concurrent
  revocation wins safely. Revoked keys cannot rotate. Revocation preserves the
  first timestamp and is idempotent.
- Added GET/POST collection, PATCH item, POST rotate, and POST revoke Route
  Handlers. Every method authenticates the Supabase access token against the
  configured Admin UUID, dynamic handlers await promised params, responses use
  the common safe request-ID envelope with `Cache-Control: no-store`, and no
  DELETE method is exported.
- Added the AuthGate-protected `/admin/api-keys` page. It loads Members and
  managed key metadata, supports create/edit/rotate/revoke, gets a current
  Supabase access token for every mutation, and keeps the one-time secret only
  in component state until dismissal. Copy is supported without localStorage
  or sessionStorage.
- Added loading, empty, session-expired, error/retry, active/revoked,
  never-used, and expiry states. Mutation controls prevent duplicate submits
  and competing one-time-secret operations; stale load and unmount completions
  cannot update state.
- Added the `API Keys` sidebar destination with correct active state and
  minimal CSS that reuses the existing tokens, panels, buttons, spacing, and
  responsive layout.

## TDD Evidence

1. Service lifecycle RED:

   ```text
   Test Files 1 failed (1)
   Tests no tests
   Failed to resolve @/lib/agent-api/admin-keys
   ```

   The first GREEN run passed 8/8 lifecycle tests.

2. Route Handler RED:

   ```text
   Test Files 1 failed (1)
   Tests no tests
   Failed to resolve the Admin api-keys route modules
   ```

   The route and service run then passed 11/11.

3. UI/Navbar RED:

   ```text
   ApiKeyAdmin: failed to resolve the missing component
   Navbar: 2 failures (missing API Keys link and missing active state)
   ```

   After the implementation and correction of three test-fixture issues, the
   UI/Navbar run passed 13/13.

4. Self-review RED:

   - `2026-02-30T12:00:00Z` was incorrectly normalized to March 2 instead of
     rejected.
   - A rotate control stayed enabled while create was waiting, allowing two
     one-time secrets to race.

   Both focused assertions failed for those exact reasons. Calendar-component
   validation and a shared mutation guard made the final focused run pass
   25/25.

## Fresh Verification

- Focused Task 6 tests:
  `npm test -- components/admin/__tests__/ApiKeyAdmin.test.tsx
  lib/agent-api/__tests__/admin-keys.test.ts
  app/api/admin/v1/api-keys/__tests__/routes.test.ts
  components/__tests__/Navbar.test.tsx`
  — 4 files, 25/25 passed.
- Full Vitest suite: 32 files, 433/433 passed.
- `npx tsc --noEmit`: exit 0.
- Next.js 16.2.10 production build: exit 0. The Admin page and all four
  dynamic Admin API routes were generated.
- Supabase rollback-only schema regression:
  `supabase/tests/0007_agent_api_schema.sql` — 20/20 passed.
- `git diff --check`: exit 0.
- Production secret scan found no raw `tb_live_...`, `sb_secret_...`, or
  `SUPABASE_SECRET_KEY=...` literals.
- Admin UI persistence scan found no localStorage, sessionStorage, or
  `setItem()` use.
- `progress.md` is unchanged.

## Concerns

- Vitest emits the repository's existing `vite-tsconfig-paths` deprecation
  notice.
- Next build emits the existing multiple-lockfile workspace-root warning.
- The first Supabase CLI test attempt could not write its telemetry file in
  the sandboxed home directory. The exact rollback-only test was rerun with
  approved filesystem access and passed 20/20.

## Fix Round 1

### Review fixes

- Added a pure `managedKeyStatus(key, now)` classifier with explicit
  `revoked > expired > active` precedence. Exact-now and past expiries are
  expired; expired cards have visible/status styling and cannot rotate.
  Editing and revoking remain available, so an Admin can extend expiry before
  rotating or retire the key.
- Rotate and revoke now require explicit browser confirmation before any
  request or state mutation. Rotate warns that the old credential is
  invalidated immediately and the replacement secret is shown once. Revoke
  states that the operation cannot be undone.
- Admin response parsing now throws a typed client error retaining HTTP status
  and public error code. A real API 401 marks the current token unusable,
  performs `signOut({ scope: "local" })` once, suppresses retry/same-token
  mutation controls, and shows the session-expired message while mounted.
  Sign-out failure is contained; ordinary 403/500 responses do not sign out.
- List loading and mutations are mutually exclusive. Every mutation handler
  and control rejects work during a pending load, preventing an older GET from
  overwriting a newly created/updated view.
- Added clipboard rejection feedback while leaving the one-time secret visible
  for manual copying and dismissal. Pending list fetches are aborted on
  unmount, and resolved stale work cannot render.
- Added direct Supabase store chain coverage. Read and returned projections
  exclude `key_digest`; create/rotate still write it; active-only updates emit
  `.is("revoked_at", null)`; maybeSingle null and query error outcomes stay
  distinct and safe.
- Removed `key_digest` from the public `ManagedKeyRow`. The lifecycle fake now
  keeps its digest only in a private persisted-row type and projects it out of
  `list()`/`get()`/mutation results.

### TDD evidence

1. Expiry and confirmation RED: 3/9 UI tests failed because exact-now keys
   rendered Active and rotate/revoke never called `confirm`. The minimum
   classifier, control condition, prompts, and expired style made 9/9 pass.
2. Session and load-race RED: 3/13 UI tests failed because load/mutation 401s
   stayed ordinary retryable errors and create remained enabled during a
   deferred reload. Typed errors, local sign-out, the invalid-session latch,
   and the loading guard made 13/13 pass.
3. Store projection RED: the lifecycle fake's public `get()` still exposed
   `key_digest`. Private persisted rows plus projection made that assertion
   pass. Five direct adapter tests then covered the real Supabase query chains.
4. Clipboard rejection and fetch-abort characterization tests passed against
   the existing guarded behavior and close the reported coverage gap.

### Fresh verification

- Focused Fix Round 1 tests: 5 files, 39/39 passed.
- Full Vitest suite: 33 files, 447/447 passed.
- `npx tsc --noEmit`: exit 0.
- Next.js 16.2.10 production build: exit 0; the Admin page and four Admin API
  routes were generated.
- Supabase rollback-only schema regression: 20/20 passed.
- `git diff --check`: exit 0.
- Production secret, browser persistence, and Authorization logging scans:
  clean.
- `progress.md` remains unchanged.

## Fix Round 2

### Review fixes

- Bound every load and mutation request to its captured bearer token and an
  operation-generation predicate. A 401 can invalidate the local session only
  while that operation is still current and mounted and a fresh Supabase
  session lookup still returns the same token. Late unmount responses and
  refreshed-token responses have no sign-out or invalid-session side effects.
- Preserved HTTP status and status text before parsing an Admin response body.
  Empty, non-JSON, truncated, and otherwise invalid error bodies still produce
  a typed `AdminApiClientError`, so a current 401 follows the authentication
  path while non-401 failures remain ordinary errors. Invalid successful
  envelopes use the operation's safe fallback rather than exposing parser or
  property-access errors.
- Added an uncertain-rotation recovery state for network rejection, 5xx, and
  malformed successful responses. It explains that the old credential may
  already be invalid and the unseen replacement secret cannot be recovered,
  blocks all mutations, and requires a successful list refresh before another
  rotate. Structured 4xx responses such as 409 remain known failures.
- Added synchronous load/mutation in-flight refs in addition to rendered busy
  state. Every handler atomically acquires the appropriate operation slot, so
  programmatic duplicate submits and stale DOM events cannot bypass React's
  batched state updates. Generation-aware `finally` and unmount cleanup release
  only the matching operation and cannot leave a permanent lock.
- Added a live clock driven by the nearest active expiry. The timer is
  rescheduled when keys change, split at the platform maximum timeout, and
  cleaned up by the effect. Cards become Expired and lose Rotate at the exact
  deadline without another interaction; the rotate handler still checks a
  fresh `Date.now()` before confirmation or POST.

### TDD evidence

1. Stale/session parsing RED: 3/19 UI tests failed because an unmounted
   mutation 401 and an old-token mutation 401 both signed out, while an empty
   401 became a retryable generic error. Token-bound operation predicates and
   status-first parsing made 19/19 pass.
2. Rotation recovery RED: 3/23 failed because network response loss, a 500,
   and malformed 2xx rotation results all displayed ordinary errors. The
   recovery latch and successful-reload reset made 23/23 pass; a structured
   409 remained retryable without reload.
3. Handler mutex RED: 3/26 failed because duplicate programmatic submit and
   both Retry/mutation event orders emitted an extra request. Synchronous
   bidirectional guards made 26/26 pass and the reload-unlock assertion proved
   the lock is released.
4. Live expiry RED: 2/28 failed because exact-deadline and edited-expiry cards
   stayed Active. Nearest-expiry scheduling made 28/28 pass with fake timers
   and no extra POST.
5. Invalid-but-parseable 2xx RED: a `null` envelope exposed a JavaScript
   property-access error. Runtime envelope normalization made the safe
   fallback assertion pass.
6. Handler-entry self-review RED: two same-batch rotate events displayed two
   confirmations before the second request was rejected. Acquiring the
   synchronous mutation slot before destructive confirmation made the focused
   UI suite pass 32/32; cancellation releases the slot immediately.

### Fresh verification

- Focused Fix Round 2 tests: 5 files, 56/56 passed.
- Full Vitest suite: 33 files, 464/464 passed.
- `npx tsc --noEmit`: exit 0.
- Next.js 16.2.10 production build: exit 0; the Admin page and four Admin API
  routes were generated.
- Supabase rollback-only schema regression: 20/20 passed.
- `git diff --check`: exit 0.
- Production secret, browser persistence, Authorization logging, and debug
  scans: clean.
- `progress.md` remains unchanged.
