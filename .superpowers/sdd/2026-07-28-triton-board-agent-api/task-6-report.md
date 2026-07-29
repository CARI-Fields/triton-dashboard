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
