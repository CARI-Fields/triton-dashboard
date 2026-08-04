# Experiment Template Workspace — Legacy Cleanup Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy fixed Experiment content model now that every Experiment lives on a Template: drop the deprecated `experiments` columns, delete the dead legacy Detail/Compare/editor surfaces and the legacy fixed-field Agent API payloads, and keep the Template model as the only path.

**Architecture:** One additive-destructive migration drops the legacy columns (their data is preserved forever in `experiment_versions` snapshots and the Imported Template's typed Values). Then the TypeScript model, repositories, UI surfaces, and Agent API adapters are pruned in dependency order (types → repositories → UI → Agent API), each with its test fixtures updated. Nothing in this release changes Template behavior or writes to production data beyond the single column drop, which is safe only after the Phase 6 cutover has been verified in production.

**Precondition (independent review gate):** This release runs only after Phase 6 has been applied to production AND the verification script (`scripts/verify-legacy-migration.mjs`) passes there AND a manual review confirms no caller still reads the legacy columns (the Agent API legacy fixed payloads were the last reader; remove them in Task 4 only after confirming no live client depends on them).

**Tech Stack:** Postgres migration + pgTAP, TypeScript, Next.js 16, Vitest, the bundled Agent API skill docs.

---

## Global Constraints

- Work only in `.worktrees/experiment-template-workspace` on `feat/experiment-template-workspace` (already checked out; do not switch branches).
- Authoritative design: `docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md` — "Existing Data Migration" states legacy columns are removed only in a later, independently reviewed cleanup release.
- Phases 1-6 are committed. The Imported Legacy Template (Phase 6) is the permanent home of migrated legacy data; `experiment_versions` snapshots are the historical record. This release only drops the redundant legacy columns and dead code.
- Keep: `experiment_no`, `task_id`, `owner_id`, `name`, `status`, `position`, `template_id`, `archived_at`, `core_revision`, `started_at`, `completed_at`, `created_at`, `updated_at` on `experiments`.
- Drop: `baseline_experiment_id`, `data_spec`, `object_spec`, `environment_spec`, `config`, `notes`, `metrics`, `featured_metric_keys`, `result_summary`, `decision_outcome`, `decision_notes`.
- The Agent API legacy fixed-field create/patch payloads and dual-write adapters are removed only after the review gate; the template-aware payloads become the only contract.
- House patterns: pgTAP in `supabase/tests/NNNN_<name>.sql`, Vitest, migration via `npx supabase migration new`, commit after every task, `npx tsc --noEmit` gate = zero NEW errors.
- Node: run Vitest/tsc/build with `PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH`; `npx supabase ...` needs `require_escalated`.

## Planned File Structure

Create:
- `supabase/tests/0020_legacy_column_cleanup.sql` (Task 1)
- `supabase/migrations/<timestamp>_legacy_column_cleanup.sql` (Task 1)

Modify (deletions dominate):
- `lib/types.ts`, `lib/experiments/repository.ts`, `lib/experiments/draft.ts`, `lib/experiments/policy.ts` (Task 2)
- `components/experiments/ExperimentDetail.tsx` and legacy section editors + `components/experiments/ExperimentCompare.tsx`, `lib/experiments/compare.ts`, `compare-url.ts` (Task 3)
- `lib/agent-api/schemas.ts`, `mutation-repository.ts`, `read-repository.ts`, route handlers, skill docs (Task 4)
- the corresponding test files in each task

---

### Task 1: Drop the legacy `experiments` columns

**Files:**
- Create: `supabase/tests/0020_legacy_column_cleanup.sql`
- Create: `supabase/migrations/<timestamp>_legacy_column_cleanup.sql` (name from the CLI)

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/0020_legacy_column_cleanup.sql`:

```sql
begin;
select plan(9);

-- Legacy columns are gone -------------------------------------------------------
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'experiments'
      and column_name in (
        'baseline_experiment_id', 'data_spec', 'object_spec', 'environment_spec',
        'config', 'notes', 'metrics', 'featured_metric_keys', 'result_summary',
        'decision_outcome', 'decision_notes'
      )
  ),
  'all legacy content columns are dropped'
);

-- Fixed columns stay ---------------------------------------------------------------
select ok(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name = 'experiments'
     and column_name in (
       'id', 'experiment_no', 'task_id', 'owner_id', 'name', 'status', 'position',
       'template_id', 'archived_at', 'core_revision', 'started_at', 'completed_at',
       'created_at', 'updated_at'
     )) = 14,
  'the fixed Experiment columns remain'
);

-- No dangling references ---------------------------------------------------------------
select is(
  (select count(*)::int from pg_constraint
   where conrelid = 'public.experiments'::regclass
     and conname like 'experiments_baseline%'),
  0,
  'Baseline constraint and FK are dropped with the column'
);

-- Template behavior still works ----------------------------------------------------------
insert into public.modules (id, name, kind)
values ('10000000-0000-4000-8000-000000000001', 'Cleanup module', 'pipeline');
insert into public.tasks (id, module_id, title)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Cleanup task');
insert into public.experiments (id, task_id, template_id, name)
values (
  '60000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Cleanup run'
);
select is(
  (select status from public.experiments where id = '60000000-0000-4000-8000-000000000001'),
  'planned',
  'a minimal Template Experiment still inserts with defaults'
);

-- Value mutations still work -------------------------------------------------------------
select is(
  (select public.save_experiment_value(
    '60000000-0000-4000-8000-000000000001',
    (select id from public.experiment_template_keys
     where template_id = '11111111-1111-4111-8111-111111111111'
       and key = 'notes'),
    0,
    '"still works"'::jsonb,
    '80000000-0000-4000-8000-000000000001'
  )->>'status'),
  'ok',
  'typed Value saves still work after the column drop'
);
select is(
  (select version_no::int from public.experiment_versions
   where experiment_id = '60000000-0000-4000-8000-000000000001'),
  1,
  'Value saves still write version snapshots'
);
select is(
  (select core_revision::int from public.experiments
   where id = '60000000-0000-4000-8000-000000000001'),
  2,
  'Value saves still bump core_revision'
);

-- Archive gating still works --------------------------------------------------------------
select throws_ok(
  $$select public.archive_experiment('60000000-0000-4000-8000-000000000001')$$,
  'P0001',
  'REQUIRED_VALUES_MISSING',
  'Required-gated Archive still works'
);

-- Snapshot integrity ----------------------------------------------------------------------
select is(
  (select count(*)::int from public.experiment_versions
   where source = 'migration' and version_no = 1
     and coalesce(snapshot->>'template_id', '') <> '11111111-1111-4111-8111-111111111111'),
  0,
  'historical migration snapshots still reference the Imported Template'
);

select * from finish();
rollback;
```

Run it:

```bash
npx supabase test db --local supabase/tests/0020_legacy_column_cleanup.sql
```

Expected: FAIL — the legacy columns still exist.

- [ ] **Step 2: Create and fill the migration**

Run:

```bash
npx supabase migration new legacy_column_cleanup
```

Replace the empty body with:

```sql
-- Experiment Template Workspace: legacy column cleanup release.
-- Prerequisite: Phase 6 cutover verified in production and the Agent API legacy
-- fixed payloads retired (Task 4). Historical data stays in experiment_versions.

alter table public.experiments
  drop column if exists baseline_experiment_id,
  drop column if exists data_spec,
  drop column if exists object_spec,
  drop column if exists environment_spec,
  drop column if exists config,
  drop column if exists notes,
  drop column if exists metrics,
  drop column if exists featured_metric_keys,
  drop column if exists result_summary,
  drop column if exists decision_outcome,
  drop column if exists decision_notes;
```

- [ ] **Step 3: Apply and test**

Run:

```bash
npx supabase db reset --local
npx supabase test db --local supabase/tests/0020_legacy_column_cleanup.sql supabase/tests/0019_legacy_experiment_cutover.sql
```

Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<timestamp>_legacy_column_cleanup.sql supabase/tests/0020_legacy_column_cleanup.sql
git commit -m "feat: drop legacy experiment content columns"
```

---

### Task 2: Prune the legacy fields from types and repositories

**Files (modify):**
- `lib/types.ts`
- `lib/experiments/repository.ts`
- `lib/experiments/draft.ts`
- `lib/experiments/policy.ts`
- the tests for each

- [ ] **Step 1: Remove the legacy fields from `Experiment` in `lib/types.ts`**

Remove from `Experiment`: `baseline_experiment_id`, `data_spec`, `object_spec`, `environment_spec`, `config`, `notes`, `metrics`, `featured_metric_keys`, `result_summary`, `decision_outcome`, `decision_notes`. Delete the now-unused `DataSpec`, `DatasetSpec`, `DatasetRole`, `ObjectSpec`, `EnvironmentSpec`, `ConfigValue`, `ExperimentConfig` interfaces, and `DecisionOutcome` (keep `ExperimentStatus`).

- [ ] **Step 2: Prune `lib/experiments/repository.ts`**

Remove the legacy columns from `EXPERIMENT_SELECT`/`LIST_SELECT`/`BUNDLE_SELECT`, delete `normalizeExperiment`'s legacy normalization branches (keep the `{ ...row }` passthrough), and remove the legacy fields from the insert payload in `createExperiment` and from `buildDuplicateInsert` in `policy.ts`. Keep `nextExperimentPosition`.

- [ ] **Step 3: Prune `lib/experiments/draft.ts`**

Remove the legacy fields from `EditableExperimentPatch` and the draft serialization/validation helpers (`isDataSpec`, `isObjectSpec`, `isEnvironmentSpec`, `isConfig`, `isMetrics` are no longer needed; delete or keep `isStringArray` if still used).

- [ ] **Step 4: Update every test fixture**

Run `npx tsc --noEmit` and remove the legacy fields from every `Experiment` literal in:

```bash
rg -n "data_spec:|object_spec:|environment_spec:|featured_metric_keys:|result_summary:|decision_outcome:" --glob "*.test.ts*" --glob "*.test.tsx"
```

Follow the pattern: keep `id`, `experiment_no`, `task_id`, `owner_id`, `name`, `status`, `template_id`, `archived_at`, `core_revision`, `position`, `started_at`, `completed_at`, `created_at`, `updated_at`; drop the legacy keys.

- [ ] **Step 5: Run and commit**

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/experiments lib/templates lib/attachments
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
git add lib/types.ts lib/experiments
git commit -m "refactor: drop legacy experiment fields from types and repositories"
```

Expected: PASS; no new type errors; commit succeeds.

---

### Task 3: Remove the legacy Detail, editors, and Compare surfaces

**Files (delete or simplify):**
- `components/experiments/ExperimentDetail.tsx` — always delegate to `TemplateExperimentDetail`
- `components/experiments/DataEditor.tsx`, `ObjectEditor.tsx`, `EnvironmentEditor.tsx`, `ConfigEditor.tsx`, `ResultEditor.tsx`, `DecisionEditor.tsx`, `BaselinePicker.tsx`, `BaselineSummary.tsx`, `ExperimentSection.tsx` — delete
- `components/experiments/ExperimentCompare.tsx` and `lib/experiments/compare.ts`, `lib/experiments/compare-url.ts` — delete (Compare is now Template-scoped)
- the tests for all of the above

- [ ] **Step 1: Reduce `ExperimentDetail.tsx` to a delegate**

Replace the body with:

```tsx
"use client";

import TemplateExperimentDetail from "@/components/experiments/TemplateExperimentDetail";

export default function ExperimentDetail({ id }: { id: string }) {
  return <TemplateExperimentDetail id={id} />;
}
```

- [ ] **Step 2: Delete the legacy editors and Baseline components**

```bash
git rm components/experiments/DataEditor.tsx components/experiments/ObjectEditor.tsx \
  components/experiments/EnvironmentEditor.tsx components/experiments/ConfigEditor.tsx \
  components/experiments/ResultEditor.tsx components/experiments/DecisionEditor.tsx \
  components/experiments/BaselinePicker.tsx components/experiments/BaselineSummary.tsx \
  components/experiments/ExperimentSection.tsx \
  components/experiments/ExperimentCompare.tsx \
  lib/experiments/compare.ts lib/experiments/compare-url.ts
```

Delete the corresponding `__tests__` files (`ExperimentDetail.test.tsx`, `ExperimentDetailMarkdown.integration.test.tsx`, `ExperimentEditors.test.tsx`, `ExperimentCompare.test.tsx`, `compare.test.ts`, `compare-url.test.ts`, `ExperimentTable.test.tsx` if it only exercises legacy tables) after confirming the Template surfaces keep equivalent coverage in `TemplateExperimentDetail.test.tsx` and `TemplateExperimentCompare.test.tsx`.

- [ ] **Step 3: Run and commit**

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run components/experiments components/templates lib/templates
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
git add -A components/experiments lib/experiments
git commit -m "refactor: remove legacy experiment detail and compare surfaces"
```

Expected: PASS; no new type errors; commit succeeds.

---

### Task 4: Remove the legacy Agent API fixed payloads and dual-write adapters

**Files (modify):**
- `lib/agent-api/schemas.ts` — remove `parseExperimentCreate`, `parseExperimentPatch` legacy field handling, and `ExperimentPatch` legacy fields; template-aware create/values become the only contract
- `lib/agent-api/mutation-repository.ts` — remove the legacy `createExperiment`/`patchExperiment` adapters and the `agent_api_*` RPC wrappers; keep `createTemplateExperiment`, `patchExperimentValue`, `archive/unarchive/restore`
- `lib/agent-api/read-repository.ts` — remove the legacy field normalization from `experimentDto`
- `app/api/agent/v1/experiments/[id]/route.ts` and `tasks/[id]/experiments/route.ts` — require `template_id` (drop the legacy create branch)
- `.agents/skills/triton-board-api/references/openapi.yaml` + `SKILL.md` — remove legacy create/patch payload schemas, mark the create contract as template-required
- the agent test files (`write-routes.test.ts`, `read-routes.test.ts`, `mutation-repository.test.ts`, `attachments.test.ts`, `schemas.test.ts`)

- [ ] **Step 1: Make create require a Template**

In `app/api/agent/v1/tasks/[id]/experiments/route.ts`, delete the legacy `parseExperimentCreate` branch and always require `template_id` (422 `TEMPLATE_REQUIRED` when absent).

- [ ] **Step 2: Prune the legacy payload schemas and adapters**

Remove `parseExperimentCreate`, the legacy `ExperimentPatch` fields, and the `agent_api_create_experiment` / `agent_api_patch_experiment` RPC adapters. Keep `parseValuePatch`, `parseVersionNumber`, and the Phase 5 template adapters.

- [ ] **Step 3: Update the Agent tests and skill docs**

Rewrite the affected route/repository tests to the template contract, update `openapi.yaml` (remove the legacy create/patch request schemas; create now requires `template_id` + optional `values`), and update the skill test counts.

- [ ] **Step 4: Run and commit**

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run app/api/agent/v1 lib/agent-api scripts
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
git add app/api/agent lib/agent-api .agents/skills/triton-board-api scripts
git commit -m "refactor: make agent api template-only"
```

Expected: PASS; no new type errors; commit succeeds.

---

### Task 5: Final verification and handoff

**Files:** none

- [ ] **Step 1: Cross-check**

Confirm: no legacy `experiments` column is referenced anywhere in `app/`, `lib/`, `components/`, `supabase/migrations/` (except the drop migration itself); no legacy editor/compare component remains; the Agent API create contract requires a Template; `experiment_versions` historical snapshots are untouched.

```bash
rg -n "data_spec|object_spec|environment_spec|featured_metric_keys|result_summary|decision_outcome|baseline_experiment_id" app components lib scripts --glob "!**/__tests__/**" | head
```

Expected: no matches (or only in `supabase/migrations/20260801..._legacy_experiment_cutover.sql` historical migration comments).

- [ ] **Step 2: Full verification**

Run:

```bash
npx supabase test db --local \
  supabase/tests/0014_api_key_deletion.sql \
  supabase/tests/0015_experiment_template_workspace_schema.sql \
  supabase/tests/0016_experiment_template_workspace_grants.sql \
  supabase/tests/0017_experiment_template_workspace_functions.sql \
  supabase/tests/0018_experiment_template_workspace_values.sql \
  supabase/tests/0019_legacy_experiment_cutover.sql \
  supabase/tests/0020_legacy_column_cleanup.sql
SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54322/postgres node scripts/verify-legacy-migration.mjs
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx next build
```

Expected: all DB suites PASS; verification script exits 0; all Vitest suites PASS; no new type errors; build succeeds.

- [ ] **Step 3: Hand off**

Report: the cleanup release is complete; the Template model is the only Experiment model. The production sequence is: Phase 6 rollout (with backup) → review gate → this release's migration + verification.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-04-experiment-template-workspace-legacy-cleanup.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
