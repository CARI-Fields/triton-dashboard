# Task 11 Report

## README acceptance questions (recorded before README editing)

1. Where is `/admin/api-keys`?
2. Which two server-only environment variables are required?
3. How is a Key scoped to a Member and Task collaboration?
4. Which endpoints can never delete Task/Experiment?
5. How does `PATCH` use `ETag`/`If-Match`?
6. How does `POST` reuse `Idempotency-Key`?
7. Where is the Skill and which client environment variables does it use?

## Verification evidence

- README acceptance: the Agent API section identifies `/admin/api-keys`, the two server-only
  variables, Member/Task collaboration, the no-delete guarantee, ETag/If-Match behavior,
  Idempotency-Key reuse, and the bundled Skill/client variables.
- Environment example: `.env.local.example` already contained safe placeholders and the final
  server-only comments, so Task 11 did not modify it.
- Local database reset: `npx supabase db reset --local` succeeded and applied every migration
  through `20260729100913_support_direct_attachment_patch.sql`. No linked or production database
  was used.
- Required minimum pgTAP run: `0007_agent_api_schema.sql` and
  `0008_agent_api_mutations.sql` passed, 2 files / 36 assertions.
- Expanded canonical pgTAP run: `0007`, `0008`, `0009`, `0012`, and `0013` passed,
  5 files / 108 assertions.
- Application tests: `npm test` passed, 42 Vitest files / 840 tests.
- Production build: `npm run build` compiled, type-checked, generated all 16 static pages, and
  listed `/admin/api-keys`, Admin API routes, and every Agent API route.
- Skill: Python 3.12.3 compiled the client; client `--help` exposed only
  `capabilities`, `get`, `patch`, and `post`; the Codex skill-creator `quick_validate.py`
  validator reported `Skill is valid!`.
- Skill safety scan: `DELETE` appeared only in the Skill prohibition, never as a client
  operation. `task_id`/`owner_id` are server-derived fields or read/filter response fields, not
  writable create/patch fields. `If-Match` and `Idempotency-Key` are present in the Skill,
  OpenAPI contract, and safe client.
- Security/diff checks: `git diff --check` passed. No
  `export async function DELETE` or repository `.delete()` exists under the Agent API. The only
  storage `.remove()` is best-effort cleanup of the just-uploaded Attachment path (or an
  idempotent replay's unused upload). `SUPABASE_SECRET_KEY` is read through the `server-only`
  Supabase client and is not rendered or logged; browser `Authorization` construction contains
  the signed-in Admin's Supabase session token, not the server secret or an Agent Key.

## Warnings and maintainer handoff

- The prescribed `python` executable is absent (`command not found`, exit 127). Equivalent Skill
  checks passed with the installed `/usr/bin/python3`; README uses `python3`.
- Next.js emitted a non-fatal warning that multiple lockfiles caused it to infer the outer
  workspace as the Turbopack root. Compilation and type-check still succeeded.
- Production still requires a maintainer to set `SUPABASE_SECRET_KEY` and
  `TRITON_BOARD_ADMIN_USER_ID` as server-only deployment variables. Agent operators separately
  need `TRITON_BOARD_API_URL` and a deliberately issued raw Key in `TRITON_BOARD_API_KEY`.
- No production values were inspected, changed, rendered, or recorded. No deployment or Key
  creation was performed.
- Task 11 commit: `docs: document Triton Board Agent API` (the commit hash is reported after
  creation because a commit cannot contain its own final hash). Previous branch HEAD:
  `5de8d87 fix: refine agent skill audit contracts`.
