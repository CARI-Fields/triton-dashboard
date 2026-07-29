# Task 10 report — Triton Board Agent API Skill

## Generator

Ran the official generator with `python3`, resource set `scripts,references`, and the plan's exact three interface values. Inspection immediately afterward showed only:

- `SKILL.md`
- `agents/openai.yaml`
- empty `scripts/`
- empty `references/`

The generated `agents/openai.yaml` remains unchanged and contains only the three required interface fields.

## RED

Created `scripts/__tests__/triton-board-api-skill.test.ts` while the generated Skill stub remained.

Command:

```text
npm test -- scripts/__tests__/triton-board-api-skill.test.ts
```

Observed: 1 file failed, 18/18 tests failed for the intended missing artifacts and behavior (`SKILL.md` workflow absent, OpenAPI/client absent).

During safety refinement, added a regression requiring local POST validation before printing a generated idempotency key. It failed as intended because the then-current client printed the key before rejecting a non-object JSON body.

## GREEN

Implemented:

- a 28-line imperative Triton Board workflow and recovery guide;
- generated UI metadata with the required `$triton-board-api` prompt;
- an OpenAPI 3.1 source of truth for 16 implemented operations on 13 paths;
- a standard-library Python client with only `capabilities`, `get`, `patch`, and `post`;
- JSON PATCH/POST and actual Attachment multipart POST support;
- strict in-base URL/path validation, redirect refusal, a 30-second timeout, safe output, quoted ETags, and stable canonical UUID idempotency behavior.

Focused result: 1 file passed, 18/18 tests passed.

## Verification

- `python3 -m py_compile .../triton_board_api.py` — passed.
- `python3 .../triton_board_api.py --help` — passed; lists only `capabilities,get,patch,post`.
- official `quick_validate.py` — `Skill is valid!`.
- OpenAPI YAML parse/local-reference check — 13 paths, 16 operations, and 261 local references resolved.
- Route-by-route response audit — aligned status codes with route/helper behavior, including Attachment POST 404 and 422 file validation.
- Full Vitest — 42 files, 814 tests passed.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed.
- Canonical local pgTAP suites `0007`, `0008`, `0009`, `0012`, `0013` — 5 files, 108 tests passed.
- Security scans — no Agent API delete handler/operation; server secret read remains isolated to `lib/agent-api/server.ts`; `git diff --check` passed.

Warnings:

- Vitest reports the repository's existing `vite-tsconfig-paths` deprecation notice.
- Next.js reports the existing multiple-lockfile workspace-root inference warning.

No production URL, API Key, deployment, or external write was used.

## Forward test

A fresh-context validation agent received only the Skill path and a mocked 412 scenario. It:

- GET the latest Task and retained the new quoted ETag;
- compared only the intended `title` and `notes` fields;
- preserved the teammate's non-target `status` change;
- proposed exactly one minimal `{"changes":{"title":...,"notes":...}}` PATCH with the fresh `If-Match`;
- omitted `Idempotency-Key` from PATCH;
- stopped on target-field overlap, a second 412, or an unverifiable transport outcome;
- rejected delete, batch, Owner, assignee, parent, and system-field changes.

No real request or credential was used.

## Fix round 1 — conditional PATCH and POST recipes

Evaluation RED: a fresh Skill user treated the original linear “GET current resource” step as universal and incorrectly concluded that Attachment POST required `board:read` plus `attachments:write`. The implemented POST routes actually require only their endpoint-specific write scope and live Task collaboration; they do not require a preflight GET.

Added a focused artifact test before editing the Skill. The focused run produced 18 passes and the new assertion failed because the Skill did not distinguish `For PATCH:` from `For POST:`.

Evaluation GREEN: kept the Skill at 29 lines and replaced only the universal write sequence:

- GET/read now uses the exact relative endpoint, documented filters, and required read scope.
- PATCH now performs GET, retains the quoted ETag, computes the smallest change, and uses `If-Match`.
- POST now uses the exact known parent/path/input and one stable `Idempotency-Key` with the endpoint-specific write scope while the server checks live Task collaboration.
- The Skill states that POST does not require `board:read` or a preflight GET, treats a successful POST response as sufficient verification, and makes GET verification optional when `board:read` is available.

A follow-up consistency assertion first failed because the conditional section said “write recipe” and omitted read-only use; the one-line GET/read recipe made it GREEN without changing the POST fix.

The focused suite then passed 19/19. Full verification passed 42 Vitest files / 815 tests, `tsc --noEmit`, `py_compile`, official `quick_validate.py`, client `--help`, and `git diff --check`. The controller will perform the fresh re-evaluation; no context-carrying forward test was launched from this fix round.
