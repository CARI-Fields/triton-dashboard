# Final AuthGate Race Report

## Root cause

`AuthGate` registers `onAuthStateChange` while the initial `getSession()` request is pending.
The callback updated `session` but did not mark the gate ready or invalidate the initial
request. A newer `SIGNED_IN`/`SIGNED_OUT` event therefore remained behind the loading screen,
and the late initial success, error, or `finally` path could overwrite that newer state.

## RED evidence

Before production changes:

```text
npm test -- components/__tests__/AuthGate.test.tsx
Test Files  1 failed (1)
Tests       4 failed | 7 passed (11)
```

The four new cases failed at the post-event render assertion: a pending initial request followed
by either `SIGNED_IN` or `SIGNED_OUT` remained on `Loading…`. Both late-success and late-error
variants reproduced the missing event-order guarantee.

## GREEN and final verification evidence

- Focused AuthGate GREEN: `components/__tests__/AuthGate.test.tsx` passed,
  1 file / 11 tests.
- Focused AuthGate/Admin verification passed, 6 files / 87 tests:
  AuthGate, Admin UI, Admin routes, Admin DTO, Admin store, and Admin Key lifecycle.
- Full `npm test` passed, 42 files / 844 tests.
- Standalone `npx tsc --noEmit` passed.
- `npm run build` compiled and type-checked successfully and generated all 16 static pages.
- `git diff --check` passed before staging.
- The existing Vite `vite-tsconfig-paths` deprecation notice and Next.js multiple-lockfile
  workspace-root warning remain non-fatal.

## Scope

- `components/AuthGate.tsx`: one effect-local observed-auth-event guard; the callback is
  authoritative and marks the gate ready.
- `components/__tests__/AuthGate.test.tsx`: four race regressions covering newer
  `SIGNED_IN`/`SIGNED_OUT` events followed by late initial success/error outcomes. Existing
  unmount coverage remains.
- No API, database, environment, or controller progress file changed.
