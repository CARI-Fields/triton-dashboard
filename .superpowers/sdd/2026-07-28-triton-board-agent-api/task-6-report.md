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

## Fix Round 3

### Review fixes

- Added strict runtime response DTO validators for `ManagedKeyView`,
  `ManagedKeyWithSecret`, and managed-key arrays. The validators require exact
  public keys, UUIDs, bounded names, valid public prefixes, fixed unique scopes,
  nullable RFC 3339 timestamps, and the full generated-secret format. Unknown
  fields such as `key_digest` and misplaced `secret` values are rejected.
- Extended `readEnvelope(response, fallback, validator)` so every successful
  endpoint response is validated before reaching component state. List,
  create, patch, rotate, and revoke each use the endpoint-specific validator;
  malformed successes fail with the operation's safe fallback without
  exposing response payloads, digests, or candidate secrets.
- Added an explicit `requestDispatched` marker to typed request failures.
  Missing/rejected sessions and local header construction failures remain
  known preflight failures, while fetch rejection and malformed responses after
  dispatch retain the uncertain-rotation recovery latch. Structured 4xx
  responses remain known server failures.
- Made initial load error handling deterministic with `Promise.allSettled`.
  The Admin response is processed before a concurrent Members error or
  rejection, so an Admin 401 always triggers the session-expired path and an
  Admin transport failure keeps the stable safe list fallback. A Members
  failure is reported only after a valid Admin list response.

### TDD evidence

1. DTO validator RED: the direct validator suite initially failed to resolve
   the missing module. Exact view, secret, and array validators made 3/3 pass.
2. Endpoint-boundary RED: 10/42 UI tests failed for null/string/invalid list
   payloads, missing or malformed create/rotate secrets, and extra digest
   fields in list/PATCH/revoke results. Wiring each endpoint to its validator
   made the UI and DTO run pass after correcting pre-existing fixtures to use
   real response shapes.
3. Dispatch-marker RED: 2/44 UI tests failed because missing-token and rejected
   session lookups incorrectly latched uncertain rotation. Explicit preflight
   versus dispatched errors made 44/44 pass and allowed a later valid rotation
   without a forced reload.
4. Load-priority RED: 2/47 UI tests failed because Members failures masked an
   Admin 401 and exposed a rejected Members error message. Settled concurrency
   with Admin-first processing made the expanded UI and DTO run pass 52/52.

### Fresh verification

- Focused Task 6/Fix Round 3 tests: 6 files, 76/76 passed.
- Full Vitest suite: 34 files, 484/484 passed.
- `npx tsc --noEmit`: exit 0.
- Next.js 16.2.10 production build: exit 0; the Admin page and four Admin API
  routes were generated.
- Supabase rollback-only schema regression: 20/20 passed.
- `git diff --check`: exit 0.
- Production secret, browser persistence, Authorization logging, and debug
  scans: clean.
- `progress.md` remains unchanged.

### Concerns

- Vitest still emits the repository's existing `vite-tsconfig-paths`
  deprecation notice.
- Next build still emits the existing multiple-lockfile workspace-root
  warning.

## Fix Round 4

### Review fixes

- Tightened `ManagedKeyWithSecret` validation to parse the generated credential
  with capture groups. The public prefix captured before the separator must
  equal the first eight characters of the 43-character encoded secret, and the
  response DTO's `key_prefix` must equal that same `tb_live_...` prefix.
  Create and rotate fixtures now mirror the generator's real three-way
  relationship; intentional mismatch fixtures are rejected and never rendered.
- Contained rejection of the initial Admin-page session lookup in a
  non-dispatched `AdminRequestError` with a fixed session-verification message.
  Native rejection text cannot reach the DOM, and a later list retry remains
  available.
- Contained rejection of the fresh-token session recheck after an Admin 401.
  A current operation receives the fixed safe verification message without
  signing out or latching the session invalid; stale or unmounted operations
  perform no state update. Both paths consume the rejected promise, and a later
  valid mutation can recover normally.
- Audited all three production `auth.getSession()` paths in
  `ApiKeyAdmin.tsx`. Initial load, 401 recheck, and mutation preflight now each
  contain both synchronous throws and rejected promises.

### TDD evidence

1. Secret consistency RED: the direct DTO assertion accepted an internally
   mismatched prefix, while create and rotate rendered well-shaped but
   inconsistent secrets instead of using safe failure paths.
2. Session rejection RED: the initial lookup exposed the native rejection
   message, the current 401 recheck never produced the safe alert, and Vitest
   reported two unhandled rejections for current and post-unmount rechecks.
   The combined RED run had 5 failed assertions and 2 unhandled errors.
3. Capture validation and rejection containment made the targeted DTO/UI run
   pass 57/57 with no unhandled errors. The current 401 test then successfully
   retried create, proving the error does not latch an invalid session.

### Fresh verification

- Focused Task 6/Fix Round 4 tests: 6 files, 81/81 passed, preserving all prior
  76 focused tests plus five new regressions.
- Full Vitest suite: 34 files, 489/489 passed.
- `npx tsc --noEmit`: exit 0.
- Next.js 16.2.10 production build: exit 0; the Admin page and four Admin API
  routes were generated.
- Supabase rollback-only schema regression: 20/20 passed.
- `git diff --check`: exit 0.
- Production `getSession()` audit found no uncontained await/rejection path.
- Production secret, browser persistence, Authorization logging, and debug
  scans: clean.
- `progress.md` remains unchanged.

### Concerns

- Vitest still emits the repository's existing `vite-tsconfig-paths`
  deprecation notice.
- Next build still emits the existing multiple-lockfile workspace-root
  warning.

## Fix Round 5

### Review fixes

- Tightened the 43-character generated-secret suffix to canonical unpadded
  base64url for exactly 32 bytes. The final sextet is restricted to
  `[AEIMQUYcgkosw048]`, whose low two padding bits are zero; the existing
  internal prefix and DTO `key_prefix` equality checks remain in force. This
  uses only a browser/Node-compatible regular expression and adds no runtime
  dependency or permissive decode-only check.
- Added actual 32-byte vector coverage for all 16 valid final characters.
  Each vector contains 31 zero bytes and a final byte from 0 through 15 and is
  independently encoded in the test. Neighboring noncanonical aliases ending
  in `9`, `B`, `-`, and `_` are rejected even though they decode to the same
  bytes under permissive decoders.
- Added create and rotate response regressions for well-shaped but
  noncanonical secrets. Create uses the safe operation fallback without
  rendering the credential; rotate treats the malformed 2xx as uncertain,
  latches recovery, and never exposes the candidate secret.
- Reworked AuthGate's initial session read into an async
  `try`/`catch`/`finally` lifecycle with an active guard. Synchronous throws,
  rejected promises, and resolved Auth errors all finish loading with no
  session and the fixed `Could not verify your session. Sign in again.`
  message. Native error and token text are never rendered.
- The active guard prevents late initial resolve/reject work from mutating
  state after unmount, and the rejection is always consumed. Auth-state
  transitions clear the old verification error when a new session arrives, so
  later logout/login screens do not retain it. Normal initial sessions still
  render the real child.

### TDD evidence

1. Canonical suffix RED: the direct validator accepted noncanonical final
   sextets, and create/rotate rendered candidates ending in `_` and `9`.
   The targeted run failed 3/60. Restricting the final character made the
   DTO/UI run pass 60/60.
2. AuthGate RED: 4/7 real-component tests failed for synchronous throw,
   rejected promise, resolved Auth error, and stale transition error; Vitest
   also reported two unhandled rejections, including one after unmount.
   Async containment and the active guard made 7/7 pass with no unhandled
   errors.
3. The AuthGate suite directly renders a protected child and exercises valid
   initial auth plus signed-in, logout, signed-out, login, and signed-in
   transitions without replacing AuthGate itself.

### Fresh verification

- Focused Task 6/Fix Round 5 tests: 7 files, 91/91 passed, preserving all prior
  81 focused tests plus ten final-round regressions.
- Full Vitest suite: 35 files, 499/499 passed.
- `npx tsc --noEmit`: exit 0.
- Next.js 16.2.10 production build: exit 0; the Admin page and four Admin API
  routes were generated.
- Supabase rollback-only schema regression: 20/20 passed.
- `git diff --check`: exit 0.
- Production `auth.getSession()` audit found four call sites and no
  uncontained synchronous throw or rejected-promise path.
- Production secret, browser persistence, Authorization logging, runtime
  Node-only base64 usage, and debug scans: clean.
- `progress.md` remains unchanged.

### Concerns

- Vitest still emits the repository's existing `vite-tsconfig-paths`
  deprecation notice.
- Next build still emits the existing multiple-lockfile workspace-root
  warning.
