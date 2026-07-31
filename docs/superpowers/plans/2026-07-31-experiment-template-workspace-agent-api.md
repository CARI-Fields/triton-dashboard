# Experiment Template Workspace — Phase 5 (Agent API Template Compatibility) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/api/agent/v1` template-aware and additive: Template list/schema/Compare-source reads, Experiment responses carrying `template_id` + typed `values` + `archived_at` + current version, and value patch / archive / unarchive / restore mutations that call the SAME Phase 3 database functions the browser uses — while every existing legacy endpoint keeps working unchanged.

**Architecture:** No new tables. `lib/agent-api/read-repository.ts` gains template-aware read adapters; `lib/agent-api/mutation-repository.ts` gains adapters that call `save_experiment_value`, `save_experiment_core`, `archive_experiment`, `unarchive_experiment`, `restore_experiment_version`, and `duplicate_experiment` (Phase 3/2 RPCs) via the server role, so validation, versioning, and conflict behavior are identical to the browser. Route handlers stay thin `withAgent` wrappers. Legacy fixed-field create/patch paths are untouched and remain the only path for `template_id is null` Experiments until Phase 6 dual-write cutover.

**Tech Stack:** Next.js route handlers, Supabase RPC via the server client, the existing `lib/agent-api` schema/permission/handler utilities, Vitest.

---

## Global Constraints

- Work only in `.worktrees/experiment-template-workspace` on `feat/experiment-template-workspace` (already checked out; do not switch branches).
- Authoritative design: `docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md` — read "Agent API Compatibility" and "Test and Acceptance Plan" before starting.
- Additive only: existing endpoints, response shapes, and legacy payloads keep working. New template-aware fields are additive; legacy fields stay and are marked deprecated in the skill docs.
- Agent mutations MUST call the Phase 3/2 database functions (`save_experiment_value`, `save_experiment_core`, `archive_experiment`, `unarchive_experiment`, `restore_experiment_version`, `duplicate_experiment`) — never new divergent SQL. The API rejects what those functions reject (archived writes, Required-missing Archive, stale cell revisions, cross-Template Keys, populated-Key type changes).
- `template_id` is immutable: the API never accepts it on PATCH and rejects creates that reference an archived Template (the Phase 2 insert guard does this server-side).
- House patterns: Vitest (fireEvent; no user-event), `npx tsc --noEmit` gate = zero NEW errors, commit after every task.
- Next.js 16 (AGENTS.md): re-read `01-app/03-api-reference/03-file-conventions/16-route.md` and `01-getting-started/15-route-handlers.md` before the route task; `params` is a Promise (house pattern).
- Node: run Vitest/tsc/build with `PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH`.

## Planned File Structure

Create:
- `lib/agent-api/__tests__/template-read-repository.test.ts` (Task 1)
- `lib/agent-api/__tests__/template-mutation-repository.test.ts` (Task 2)
- `app/api/agent/v1/templates/route.ts` (Task 3)
- `app/api/agent/v1/templates/[id]/route.ts` (Task 3)
- `app/api/agent/v1/templates/[id]/compare/route.ts` (Task 3)
- `app/api/agent/v1/experiments/[id]/values/route.ts` (Task 3)
- `app/api/agent/v1/experiments/[id]/archive/route.ts` (Task 3)
- `app/api/agent/v1/experiments/[id]/unarchive/route.ts` (Task 3)
- `app/api/agent/v1/experiments/[id]/versions/route.ts` (Task 3)
- `app/api/agent/v1/experiments/[id]/versions/[versionNo]/restore/route.ts` (Task 3)
- `app/api/agent/v1/__tests__/template-routes.test.ts` (Task 3)

Modify:
- `lib/agent-api/read-repository.ts` — experiment DTO gains `template_id`, `archived_at`, `core_revision`, `values`, `version_no`, `template`; new `listTemplates` / `getTemplateSchema` / `getTemplateCompareSource` (Task 1)
- `lib/agent-api/schemas.ts` — `parseTemplateCreate`, `parseValuePatch`, `parseTypedValue`, `parseVersionNumber` (Task 2)
- `lib/agent-api/mutation-repository.ts` — `createTemplateExperiment`, `patchExperimentValue`, `archiveExperiment`, `unarchiveExperiment`, `restoreExperimentVersion` (Task 2)
- `app/api/agent/v1/experiments/route.ts` — accept template-aware create (Task 3)
- `app/api/agent/v1/experiments/[id]/route.ts` — extend GET with template fields automatically via the DTO (Task 3)
- `.agents/skills/triton-board-api/references/openapi.yaml` and `SKILL.md` — new paths + deprecated markers (Task 4)
- `scripts/__tests__/triton-board-api-skill.test.ts` — validate the new paths (Task 4)

---

### Task 1: Extend agent read responses and add Template read endpoints

**Files:**
- Create: `lib/agent-api/__tests__/template-read-repository.test.ts`
- Modify: `lib/agent-api/read-repository.ts`

- [ ] **Step 1: Write the failing read test**

Create `lib/agent-api/__tests__/template-read-repository.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getExperiment,
  getTemplateCompareSource,
  getTemplateSchema,
  listTemplates,
} from "@/lib/agent-api/read-repository";

interface MockQuery {
  data: unknown;
  error: unknown;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (
    resolve: (response: unknown) => unknown,
    reject: (error: unknown) => unknown,
  ) => Promise<unknown>;
}

const mocks = vi.hoisted(() => {
  const tables: Record<string, MockQuery> = {};
  function table(name: string): MockQuery {
    if (!tables[name]) {
      tables[name] = {
        data: [] as unknown,
        error: null as unknown,
        select: vi.fn(() => tables[name]),
        eq: vi.fn(() => tables[name]),
        in: vi.fn(() => tables[name]),
        is: vi.fn(() => tables[name]),
        order: vi.fn(() => tables[name]),
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        then: (
          resolve: (response: unknown) => unknown,
          reject: (error: unknown) => unknown,
        ) => Promise.resolve({
          data: (tables[name] as { data: unknown }).data,
          error: (tables[name] as { error: unknown }).error,
        }).then(resolve, reject),
      };
    }
    return tables[name];
  }
  return { table };
});

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (name: string) => mocks.table(name) },
}));

const TEMPLATE_ID = "30000000-0000-4000-8000-000000000001";
const KEY_ID = "50000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.table("experiment_templates").data = [{
    id: TEMPLATE_ID,
    name: "Benchmark A",
    description: "",
    schema_revision: 2,
    archived_at: null,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
  }];
  mocks.table("experiment_template_fields").data = [{
    id: "40000000-0000-4000-8000-000000000001",
    template_id: TEMPLATE_ID,
    label: "Metrics",
    color_token: "blue",
    position: 1,
    archived_at: null,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
  }];
  mocks.table("experiment_template_keys").data = [{
    id: KEY_ID,
    template_id: TEMPLATE_ID,
    field_id: "40000000-0000-4000-8000-000000000001",
    key: "pass@1",
    value_type: "number",
    required: true,
    position: 1,
    archived_at: null,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
  }];
  mocks.table("experiment_template_key_options").data = [];
});

describe("template agent read adapters", () => {
  it("lists Templates", async () => {
    const result = await listTemplates();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(TEMPLATE_ID);
    expect(result[0].name).toBe("Benchmark A");
  });

  it("loads one Template schema with ordered Fields and Keys", async () => {
    mocks.table("experiment_template_fields").data = [{
      id: "40000000-0000-4000-8000-000000000001",
      template_id: TEMPLATE_ID,
      label: "Metrics",
      color_token: "blue",
      position: 1,
      archived_at: null,
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    }];
    const result = await getTemplateSchema(TEMPLATE_ID);
    expect(result?.name).toBe("Benchmark A");
    expect(result?.fields[0].keys[0].key).toBe("pass@1");
  });

  it("returns null for an unknown Template", async () => {
    mocks.table("experiment_templates").data = [];
    const result = await getTemplateSchema(TEMPLATE_ID);
    expect(result).toBeNull();
  });

  it("loads Compare source rows for a Template", async () => {
    mocks.table("experiments").data = [{
      id: "60000000-0000-4000-8000-000000000001",
      experiment_no: 1,
      task_id: "20000000-0000-4000-8000-000000000001",
      owner_id: null,
      name: "Run one",
      status: "analyzing",
      baseline_experiment_id: null,
      template_id: TEMPLATE_ID,
      archived_at: null,
      core_revision: 3,
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    }];
    mocks.table("experiment_values").data = [{
      experiment_id: "60000000-0000-4000-8000-000000000001",
      template_id: TEMPLATE_ID,
      key_id: KEY_ID,
      number_value: 0.73,
      cell_revision: 1,
      text_value: null,
      boolean_value: null,
      datetime_value: null,
      option_id: null,
      template_key: { value_type: "number" },
    }];
    const result = await getTemplateCompareSource(TEMPLATE_ID, false);
    expect(result.experiments).toHaveLength(1);
    expect(result.experiments[0].values[KEY_ID]).toEqual({
      value: { kind: "number", number: 0.73 },
      cell_revision: 1,
    });
  });

  it("includes template fields in an Experiment response", async () => {
    mocks.table("experiment_templates").data = [{
      id: TEMPLATE_ID,
      name: "Benchmark A",
      description: "",
      schema_revision: 2,
      archived_at: null,
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    }];
    mocks.table("experiments").data = [{
      id: "60000000-0000-4000-8000-000000000001",
      experiment_no: 1,
      task_id: "20000000-0000-4000-8000-000000000001",
      owner_id: null,
      name: "Run one",
      status: "analyzing",
      baseline_experiment_id: null,
      template_id: TEMPLATE_ID,
      archived_at: null,
      core_revision: 3,
      data_spec: { datasets: [] },
      object_spec: { model: "", harness: "", parent_harness: "", prompt: "", prompt_change: "", skills: [], tools: [] },
      environment_spec: { platform: "", server: "", devices: [], hardware: "", evaluator: "", revision: "", precision_policy: "" },
      config: {},
      notes: "",
      metrics: {},
      featured_metric_keys: [],
      result_summary: "",
      decision_outcome: null,
      decision_notes: "",
      position: 0,
      started_at: null,
      completed_at: null,
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    }];
    mocks.table("experiment_values").data = [{
      experiment_id: "60000000-0000-4000-8000-000000000001",
      template_id: TEMPLATE_ID,
      key_id: KEY_ID,
      number_value: 0.73,
      cell_revision: 1,
      text_value: null,
      boolean_value: null,
      datetime_value: null,
      option_id: null,
      template_key: { value_type: "number" },
    }];
    const result = await getExperiment("60000000-0000-4000-8000-000000000001");
    expect(result?.template_id).toBe(TEMPLATE_ID);
    expect(result?.values[KEY_ID].value).toEqual({ kind: "number", number: 0.73 });
    expect(result?.template?.name).toBe("Benchmark A");
  });
});
```

Run it:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/agent-api/__tests__/template-read-repository.test.ts
```

Expected: FAIL — `listTemplates`/`getTemplateSchema`/`getTemplateCompareSource` do not exist, and `getExperiment` lacks the template fields.

- [ ] **Step 2: Extend `lib/agent-api/read-repository.ts`**

1. Import `typedValueFromRow` from `@/lib/experiments/values-internal` and `loadTemplateCompareRows`-style helpers as needed. Add the DTO types:

```ts
export interface AgentTemplateSummary {
  id: string;
  name: string;
  description: string;
  schema_revision: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentTemplateSchemaField {
  id: string;
  label: string;
  color_token: string;
  position: number;
  keys: Array<{
    id: string;
    key: string;
    value_type: string;
    required: boolean;
    position: number;
    options: Array<{ id: string; label: string; position: number }>;
  }>;
}
```

2. In `experimentDto`, after the existing fields, include the template fields when the row has a `template_id` (the query select must already include `template_id`, `archived_at`, `core_revision` — extend the SELECT strings in `LIST_SELECT`/`BUNDLE_SELECT` if needed):

```ts
    template_id: row.template_id as string | null,
    archived_at: row.archived_at as string | null,
    core_revision: row.core_revision as number,
    values: (row.values ?? {}) as Record<string, unknown>,
    version_no: row.version_no as number | null,
    template: row.template as AgentTemplateSummary | null,
```

3. Add the three read adapters below `experimentDto`:

```ts
export async function listTemplates(): Promise<AgentTemplateSummary[]> {
  const { data, error } = await client()
    .from("experiment_templates")
    .select("id,name,description,schema_revision,archived_at,created_at,updated_at")
    .order("name");
  throwIfError(error);
  return (data ?? []) as AgentTemplateSummary[];
}

export async function getTemplateSchema(
  templateId: string,
): Promise<AgentTemplateSchemaField[] | null> {
  const c = client();
  const [template, fields, keys, options] = await Promise.all([
    c.from("experiment_templates")
      .select("id,name,description,schema_revision,archived_at,created_at,updated_at")
      .eq("id", templateId)
      .maybeSingle(),
    c.from("experiment_template_fields")
      .select("*")
      .eq("template_id", templateId)
      .is("archived_at", null)
      .order("position"),
    c.from("experiment_template_keys")
      .select("*")
      .eq("template_id", templateId)
      .is("archived_at", null)
      .order("position"),
    c.from("experiment_template_key_options")
      .select("*")
      .eq("template_id", templateId)
      .is("archived_at", null)
      .order("position"),
  ]);
  throwIfError(template.error);
  throwIfError(fields.error);
  throwIfError(keys.error);
  throwIfError(options.error);
  if (!template.data) return null;

  const optionsByKey = new Map<string, Array<{ id: string; label: string; position: number }>>();
  for (const option of (options.data ?? []) as Array<{ key_id: string; id: string; label: string; position: number }>) {
    const group = optionsByKey.get(option.key_id) ?? [];
    group.push({ id: option.id, label: option.label, position: option.position });
    optionsByKey.set(option.key_id, group);
  }
  const keysByField = new Map<string, AgentTemplateSchemaField["keys"]>();
  for (const key of (keys.data ?? []) as Array<Record<string, unknown>>) {
    const group = keysByField.get(key.field_id as string) ?? [];
    group.push({
      id: key.id as string,
      key: key.key as string,
      value_type: key.value_type as string,
      required: key.required as boolean,
      position: key.position as number,
      options: optionsByKey.get(key.id as string) ?? [],
    });
    keysByField.set(key.field_id as string, group);
  }

  return (fields.data ?? [] as Array<Record<string, unknown>>).map((field) => ({
    id: field.id as string,
    label: field.label as string,
    color_token: field.color_token as string,
    position: field.position as number,
    keys: keysByField.get(field.id as string) ?? [],
  }));
}

export async function getTemplateCompareSource(
  templateId: string,
  includeArchived: boolean,
): Promise<{
  template: AgentTemplateSummary | null;
  experiments: Array<{
    experiment: Record<string, unknown>;
    values: Record<string, { value: unknown; cell_revision: number }>;
  }>;
}> {
  const template = await getTemplateSchema(templateId);
  const templateSummary = await client()
    .from("experiment_templates")
    .select("id,name,description,schema_revision,archived_at,created_at,updated_at")
    .eq("id", templateId)
    .maybeSingle();
  throwIfError(templateSummary.error);

  let experimentsQuery = client()
    .from("experiments")
    .select("*")
    .eq("template_id", templateId)
    .order("experiment_no");
  if (!includeArchived) {
    experimentsQuery = experimentsQuery.is("archived_at", null);
  }
  const [experiments, values, valueOptions] = await Promise.all([
    experimentsQuery,
    client().from("experiment_values")
      .select("*,template_key:experiment_template_keys(value_type)")
      .in("template_id", [templateId]),
    client().from("experiment_value_options")
      .select("experiment_id,key_id,option_id,position")
      .in("template_id", [templateId])
      .order("position"),
  ]);
  throwIfError(experiments.error);
  throwIfError(values.error);
  throwIfError(valueOptions.error);

  const optionsByCell = new Map<string, string[]>();
  for (const row of (valueOptions.data ?? []) as Array<{ experiment_id: string; key_id: string; option_id: string }>) {
    const key = `${row.experiment_id}:${row.key_id}`;
    const group = optionsByCell.get(key) ?? [];
    group.push(row.option_id);
    optionsByCell.set(key, group);
  }

  const rows = (experiments.data ?? [] as Array<Record<string, unknown>>).map((experiment) => ({
    experiment,
    values: {} as Record<string, { value: unknown; cell_revision: number }>,
  }));
  const rowById = new Map(rows.map((row) => [row.experiment.id as string, row]));
  for (const row of (values.data ?? []) as Array<Record<string, unknown> & { template_key?: { value_type: string } }>) {
    const target = rowById.get(row.experiment_id as string);
    if (!target) continue;
    const type = row.template_key?.value_type ?? "short_text";
    const typed = typedValueFromRow(
      row as never,
      type as never,
      optionsByCell.get(`${row.experiment_id}:${row.key_id}`) ?? [],
      [],
    );
    target.values[row.key_id as string] = {
      value: typed,
      cell_revision: row.cell_revision as number,
    };
  }

  return {
    template: templateSummary.data as AgentTemplateSummary | null,
    experiments: rows,
  };
}
```

Note: `getExperiment`'s response now includes `values` and `template`; populate them from the same authoritative queries as `getTemplateCompareSource` when `row.template_id` is set (reuse the loader pattern: fetch `experiment_values` + `experiment_value_options` + template summary for that Experiment, then embed via `typedValueFromRow`).

- [ ] **Step 3: Run the read test and commit**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/agent-api/__tests__/template-read-repository.test.ts lib/agent-api/__tests__/read-routes.test.ts
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
git add lib/agent-api/read-repository.ts lib/agent-api/__tests__/template-read-repository.test.ts
git commit -m "feat: add template-aware agent read adapters"
```

Expected: PASS; no new type errors; commit succeeds.

---

### Task 2: Add template-aware agent mutation adapters

**Files:**
- Create: `lib/agent-api/__tests__/template-mutation-repository.test.ts`
- Modify: `lib/agent-api/schemas.ts`
- Modify: `lib/agent-api/mutation-repository.ts`

- [ ] **Step 1: Write the failing mutation test**

Create `lib/agent-api/__tests__/template-mutation-repository.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveExperiment,
  patchExperimentValue,
  restoreExperimentVersion,
  unarchiveExperiment,
} from "@/lib/agent-api/mutation-repository";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc },
}));

const EXPERIMENT_ID = "60000000-0000-4000-8000-000000000001";
const KEY_ID = "50000000-0000-4000-8000-000000000001";

beforeEach(() => vi.clearAllMocks());

describe("template agent mutation adapters", () => {
  it("patches a typed Value through the shared RPC", async () => {
    vi.mocked(mocks.rpc).mockResolvedValue({
      data: { status: "ok", cell_revision: 2, version_no: 3 },
      error: null,
    });
    const result = await patchExperimentValue({
      experimentId: EXPERIMENT_ID,
      keyId: KEY_ID,
      expectedCellRevision: 1,
      value: { kind: "number", number: 0.73 },
      editSessionId: "80000000-0000-4000-8000-000000000001",
    });
    expect(result.status).toBe("ok");
    expect(mocks.rpc).toHaveBeenCalledWith("save_experiment_value", {
      p_experiment_id: EXPERIMENT_ID,
      p_key_id: KEY_ID,
      p_expected_cell_revision: 1,
      p_value: 0.73,
      p_edit_session_id: "80000000-0000-4000-8000-000000000001",
    });
  });

  it("propagates a cell conflict result", async () => {
    vi.mocked(mocks.rpc).mockResolvedValue({
      data: { status: "conflict", remote: 0.9, remote_cell_revision: 2 },
      error: null,
    });
    const result = await patchExperimentValue({
      experimentId: EXPERIMENT_ID,
      keyId: KEY_ID,
      expectedCellRevision: 1,
      value: { kind: "number", number: 0.5 },
      editSessionId: "80000000-0000-4000-8000-000000000001",
    });
    expect(result.status).toBe("conflict");
  });

  it("archives, unarchives, and restores through the shared RPCs", async () => {
    vi.mocked(mocks.rpc).mockResolvedValue({ data: { status: "ok" }, error: null });
    await archiveExperiment(EXPERIMENT_ID);
    expect(mocks.rpc).toHaveBeenCalledWith("archive_experiment", {
      p_experiment_id: EXPERIMENT_ID,
    });
    await unarchiveExperiment(EXPERIMENT_ID);
    expect(mocks.rpc).toHaveBeenCalledWith("unarchive_experiment", {
      p_experiment_id: EXPERIMENT_ID,
    });
    await restoreExperimentVersion(EXPERIMENT_ID, 2);
    expect(mocks.rpc).toHaveBeenCalledWith("restore_experiment_version", {
      p_experiment_id: EXPERIMENT_ID,
      p_version_no: 2,
    });
  });
});
```

Run it:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/agent-api/__tests__/template-mutation-repository.test.ts
```

Expected: FAIL — the adapters do not exist.

- [ ] **Step 2: Add the value patch schema to `lib/agent-api/schemas.ts`**

Add near the other experiment parsers:

```ts
export interface ValuePatch {
  key_id: string;
  expected_cell_revision: number;
  value: unknown;
}

const TYPED_VALUE_KINDS = new Set([
  "short_text", "long_text", "number", "boolean", "date_time", "url",
  "single_select", "multi_select", "attachment",
]);

export function parseValuePatch(body: unknown): ValuePatch {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return invalidBody("Value patch body must be a JSON object.");
  }
  const record = body as Record<string, unknown>;
  const keyId = record.key_id;
  if (typeof keyId !== "string" || !/^[0-9a-f-]{36}$/i.test(keyId)) {
    invalidField("key_id");
  }
  const revision = record.expected_cell_revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
    invalidField("expected_cell_revision");
  }
  if (record.value !== null && (typeof record.value !== "object" || Array.isArray(record.value))) {
    invalidField("value");
  }
  const typed = record.value as Record<string, unknown> | null;
  if (typed && (typeof typed.kind !== "string" || !TYPED_VALUE_KINDS.has(typed.kind))) {
    invalidField("value.kind");
  }
  return {
    key_id: keyId,
    expected_cell_revision: revision,
    value: typed,
  };
}
```

Also add `parseVersionNumber(raw: string): number`:

```ts
export function parseVersionNumber(raw: string): number {
  const versionNo = Number(raw);
  if (!Number.isInteger(versionNo) || versionNo < 1) {
    throw new AgentApiError(
      400,
      "INVALID_VERSION",
      "versionNo must be a positive integer.",
    );
  }
  return versionNo;
}
```

(import `AgentApiError` at the top of `schemas.ts` if it is not already imported; check how other parsers throw `invalidBody`/`invalidField` and reuse the same helpers.)

- [ ] **Step 3: Add the adapters to `lib/agent-api/mutation-repository.ts`**

Append:

```ts
export interface PatchExperimentValueInput {
  experimentId: string;
  keyId: string;
  expectedCellRevision: number;
  value: unknown;
  editSessionId: string;
}

export type PatchExperimentValueResult =
  | { status: "ok"; cell_revision: number; version_no: number }
  | { status: "conflict"; remote: unknown; remote_cell_revision: number };

export async function patchExperimentValue(
  input: PatchExperimentValueInput,
): Promise<PatchExperimentValueResult> {
  const { data, error } = await client().rpc("save_experiment_value", {
    p_experiment_id: input.experimentId,
    p_key_id: input.keyId,
    p_expected_cell_revision: input.expectedCellRevision,
    p_value: input.value,
    p_edit_session_id: input.editSessionId,
  });
  if (error) throw new Error(error.message);
  return data as PatchExperimentValueResult;
}

export async function archiveExperiment(
  experimentId: string,
): Promise<{ status: "ok"; version_no: number }> {
  const { data, error } = await client().rpc("archive_experiment", {
    p_experiment_id: experimentId,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function unarchiveExperiment(
  experimentId: string,
): Promise<{ status: "ok"; version_no: number }> {
  const { data, error } = await client().rpc("unarchive_experiment", {
    p_experiment_id: experimentId,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function restoreExperimentVersion(
  experimentId: string,
  versionNo: number,
): Promise<{ status: "ok"; version_no: number; core_revision: number }> {
  const { data, error } = await client().rpc("restore_experiment_version", {
    p_experiment_id: experimentId,
    p_version_no: versionNo,
  });
  if (error) throw new Error(error.message);
  return data;
}
```

Note: `client()` in `mutation-repository.ts` currently wraps the server supabase client; confirm it throws on missing configuration exactly like the existing helpers and reuse the existing error style (the file already has `invalidRpcData()` and server helpers). If the file's `client()` differs, mirror `lib/experiments/values.ts`'s throw-on-missing pattern.

- [ ] **Step 4: Run the mutation test and commit**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/agent-api/__tests__/template-mutation-repository.test.ts lib/agent-api/__tests__/mutation-repository.test.ts lib/agent-api/__tests__/attachments.test.ts
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
git add lib/agent-api/schemas.ts lib/agent-api/mutation-repository.ts lib/agent-api/__tests__/template-mutation-repository.test.ts
git commit -m "feat: add template-aware agent mutation adapters"
```

Expected: PASS; no new type errors; commit succeeds.

---

### Task 3: Add the Agent API routes

**Files:**
- Create: `app/api/agent/v1/templates/route.ts`
- Create: `app/api/agent/v1/templates/[id]/route.ts`
- Create: `app/api/agent/v1/templates/[id]/compare/route.ts`
- Create: `app/api/agent/v1/experiments/[id]/values/route.ts`
- Create: `app/api/agent/v1/experiments/[id]/archive/route.ts`
- Create: `app/api/agent/v1/experiments/[id]/unarchive/route.ts`
- Create: `app/api/agent/v1/experiments/[id]/versions/route.ts`
- Create: `app/api/agent/v1/experiments/[id]/versions/[versionNo]/restore/route.ts`
- Create: `app/api/agent/v1/__tests__/template-routes.test.ts`
- Modify: `app/api/agent/v1/experiments/route.ts` (template-aware create)

- [ ] **Step 1: Write the failing route test**

Create `app/api/agent/v1/__tests__/template-routes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listTemplates: vi.fn(),
  getTemplateSchema: vi.fn(),
  getTemplateCompareSource: vi.fn(),
  getExperiment: vi.fn(),
  patchValue: vi.fn(),
  archive: vi.fn(),
  unarchive: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("@/lib/agent-api/read-repository", () => ({
  listTemplates: mocks.listTemplates,
  getTemplateSchema: mocks.getTemplateSchema,
  getTemplateCompareSource: mocks.getTemplateCompareSource,
  getExperiment: mocks.getExperiment,
  parseResourceId: (raw: string) => raw,
  assertNoQueryParameters: vi.fn(),
}));
vi.mock("@/lib/agent-api/mutation-repository", () => ({
  patchExperimentValue: mocks.patchValue,
  archiveExperiment: mocks.archive,
  unarchiveExperiment: mocks.unarchive,
  restoreExperimentVersion: mocks.restore,
}));
vi.mock("@/lib/agent-api/permissions", () => ({
  requireTaskCollaboration: async () => undefined,
}));

vi.mock("@/lib/agent-api/handler", () => ({
  withAgent: async (
    _request: Request,
    _permission: string,
    handler: (context: unknown, requestId: string) => Promise<Response>,
  ) => {
    const { errorResponse } = await import("@/lib/agent-api/responses");
    try {
      return await handler({ apiKeyId: "key-1", memberId: "member-1" }, "req-1");
    } catch (reason) {
      return errorResponse(reason, "req-1");
    }
  },
}));

const TEMPLATE_ID = "30000000-0000-4000-8000-000000000001";
const EXPERIMENT_ID = "60000000-0000-4000-8000-000000000001";
const KEY_ID = "50000000-0000-4000-8000-000000000001";

async function get(path: string, route: (request: Request, params?: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return route(new Request(`http://localhost${path}`), { params: Promise.resolve({}) });
}

beforeEach(() => vi.clearAllMocks());

describe("template agent routes", () => {
  it("lists Templates", async () => {
    mocks.listTemplates.mockResolvedValue([{ id: TEMPLATE_ID, name: "Benchmark A" }]);
    const { GET } = await import("./templates/route");
    const response = await get("/api/agent/v1/templates", GET);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[0].name).toBe("Benchmark A");
  });

  it("patches a Value by key_id with a conflict surfaced as 409", async () => {
    const { PATCH } = await import("./experiments/[id]/values/route");
    mocks.getExperiment.mockResolvedValue({
      id: EXPERIMENT_ID,
      task_id: "20000000-0000-4000-8000-000000000001",
      template_id: TEMPLATE_ID,
    });
    mocks.patchValue.mockResolvedValue({
      status: "conflict",
      remote: 0.9,
      remote_cell_revision: 2,
    });
    const request = new Request(`http://localhost/api/agent/v1/experiments/${EXPERIMENT_ID}/values`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key_id: KEY_ID,
        expected_cell_revision: 1,
        value: { kind: "number", number: 0.5 },
      }),
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ id: EXPERIMENT_ID }),
    });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("CELL_REVISION_CONFLICT");
  });
});
```

Run it:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run app/api/agent/v1/__tests__/template-routes.test.ts
```

Expected: FAIL — route modules do not exist.

- [ ] **Step 2: Create the route files**

`app/api/agent/v1/templates/route.ts`:

```ts
import { withAgent } from "@/lib/agent-api/handler";
import { listTemplates } from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";

export async function GET(request: Request): Promise<Response> {
  return withAgent(request, "board:read", async (_context, requestId) => (
    successResponse(await listTemplates(), requestId)
  ));
}
```

`app/api/agent/v1/templates/[id]/route.ts`:

```ts
import { AgentApiError } from "@/lib/agent-api/errors";
import { withAgent } from "@/lib/agent-api/handler";
import {
  assertNoQueryParameters,
  getTemplateSchema,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAgent(request, "board:read", async (_context, requestId) => {
    const { id: rawId } = await params;
    const id = parseResourceId(rawId, "id");
    assertNoQueryParameters(request);
    const schema = await getTemplateSchema(id);
    if (!schema) {
      throw new AgentApiError(
        404,
        "TEMPLATE_NOT_FOUND",
        "Template not found.",
      );
    }
    return successResponse(schema, requestId);
  });
}
```

`app/api/agent/v1/templates/[id]/compare/route.ts`:

```ts
import { AgentApiError } from "@/lib/agent-api/errors";
import { withAgent } from "@/lib/agent-api/handler";
import {
  assertNoQueryParameters,
  getTemplateCompareSource,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAgent(request, "board:read", async (_context, requestId) => {
    const { id: rawId } = await params;
    const id = parseResourceId(rawId, "id");
    assertNoQueryParameters(request);
    const includeArchived = new URL(request.url).searchParams.get("archived") === "true";
    const source = await getTemplateCompareSource(id, includeArchived);
    if (!source.template) {
      throw new AgentApiError(
        404,
        "TEMPLATE_NOT_FOUND",
        "Template not found.",
      );
    }
    return successResponse(source, requestId);
  });
}
```

`app/api/agent/v1/experiments/[id]/values/route.ts`:

```ts
import { AgentApiError } from "@/lib/agent-api/errors";
import { withAgent } from "@/lib/agent-api/handler";
import {
  patchExperimentValue,
} from "@/lib/agent-api/mutation-repository";
import { requireTaskCollaboration } from "@/lib/agent-api/permissions";
import {
  assertNoQueryParameters,
  getExperiment,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";
import {
  parseValuePatch,
  readJsonObject,
} from "@/lib/agent-api/schemas";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAgent(
    request,
    "experiments:write",
    async (context, requestId) => {
      const { id: rawId } = await params;
      const experimentId = parseResourceId(rawId, "id");
      assertNoQueryParameters(request);
      const current = await getExperiment(experimentId);
      if (!current) {
        throw new AgentApiError(
          404,
          "EXPERIMENT_NOT_FOUND",
          "Experiment not found.",
        );
      }
      if (!current.template_id) {
        throw new AgentApiError(
          422,
          "TEMPLATE_REQUIRED",
          "Value patches require a Template Experiment.",
        );
      }
      await requireTaskCollaboration(context, current.task_id);
      const patch = parseValuePatch(await readJsonObject(request));
      const result = await patchExperimentValue({
        experimentId,
        keyId: patch.key_id,
        expectedCellRevision: patch.expected_cell_revision,
        value: patch.value,
        editSessionId: "00000000-0000-4000-8000-000000000001",
      });
      if (result.status === "conflict") {
        throw new AgentApiError(
          409,
          "CELL_REVISION_CONFLICT",
          "The cell changed since it was read.",
          false,
          { remote: result.remote, remote_cell_revision: result.remote_cell_revision },
        );
      }
      return successResponse(result, requestId);
    },
  );
}
```

`app/api/agent/v1/experiments/[id]/archive/route.ts` and `unarchive/route.ts`:

```ts
// archive/route.ts
import { AgentApiError } from "@/lib/agent-api/errors";
import { withAgent } from "@/lib/agent-api/handler";
import { archiveExperiment } from "@/lib/agent-api/mutation-repository";
import { requireTaskCollaboration } from "@/lib/agent-api/permissions";
import {
  assertNoQueryParameters,
  getExperiment,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAgent(
    request,
    "experiments:write",
    async (context, requestId) => {
      const { id: rawId } = await params;
      const experimentId = parseResourceId(rawId, "id");
      assertNoQueryParameters(request);
      const current = await getExperiment(experimentId);
      if (!current) {
        throw new AgentApiError(
          404,
          "EXPERIMENT_NOT_FOUND",
          "Experiment not found.",
        );
      }
      await requireTaskCollaboration(context, current.task_id);
      return successResponse(
        await archiveExperiment(experimentId),
        requestId,
      );
    },
  );
}
```

`unarchive/route.ts` is identical with `unarchiveExperiment` imported and called.

`app/api/agent/v1/experiments/[id]/versions/route.ts`:

```ts
import { withAgent } from "@/lib/agent-api/handler";
import { listExperimentVersions } from "@/lib/experiments/values";
import { requireTaskCollaboration } from "@/lib/agent-api/permissions";
import {
  assertNoQueryParameters,
  getExperiment,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";
import { AgentApiError } from "@/lib/agent-api/errors";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAgent(request, "board:read", async (context, requestId) => {
    const { id: rawId } = await params;
    const experimentId = parseResourceId(rawId, "id");
    assertNoQueryParameters(request);
    const current = await getExperiment(experimentId);
    if (!current) {
      throw new AgentApiError(
        404,
        "EXPERIMENT_NOT_FOUND",
        "Experiment not found.",
      );
    }
    await requireTaskCollaboration(context, current.task_id);
    return successResponse(
      await listExperimentVersions(experimentId),
      requestId,
    );
  });
}
```

`app/api/agent/v1/experiments/[id]/versions/[versionNo]/restore/route.ts`:

```ts
import { AgentApiError } from "@/lib/agent-api/errors";
import { withAgent } from "@/lib/agent-api/handler";
import { restoreExperimentVersion } from "@/lib/agent-api/mutation-repository";
import { requireTaskCollaboration } from "@/lib/agent-api/permissions";
import {
  assertNoQueryParameters,
  getExperiment,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";
import {
  parseVersionNumber,
  readJsonObject,
} from "@/lib/agent-api/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; versionNo: string }> },
): Promise<Response> {
  return withAgent(
    request,
    "experiments:write",
    async (context, requestId) => {
      const { id: rawId, versionNo: rawVersion } = await params;
      const experimentId = parseResourceId(rawId, "id");
      assertNoQueryParameters(request);
      await readJsonObject(request);
      const current = await getExperiment(experimentId);
      if (!current) {
        throw new AgentApiError(
          404,
          "EXPERIMENT_NOT_FOUND",
          "Experiment not found.",
        );
      }
      await requireTaskCollaboration(context, current.task_id);
      return successResponse(
        await restoreExperimentVersion(
          experimentId,
          parseVersionNumber(rawVersion),
        ),
        requestId,
      );
    },
  );
}
```

Modify `app/api/agent/v1/experiments/route.ts` POST: keep the legacy `parseExperimentCreate` path for `template_id: null`; when the body has `template_id`, accept it and create via the legacy insert plus values:

```ts
// In POST, after parsing the create body:
if (typeof body.template_id === "string") {
  const created = await createTemplateExperiment(body);
  return successResponse(created, requestId);
}
```

and add `createTemplateExperiment` to `mutation-repository.ts` (Task 2 extension):

```ts
export interface TemplateExperimentCreateInput {
  task_id: string;
  template_id: string;
  name: string;
  owner_id: string | null;
  values?: Record<string, unknown>;
}

export async function createTemplateExperiment(
  input: TemplateExperimentCreateInput,
): Promise<Record<string, unknown>> {
  const { data, error } = await client().from("experiments").insert({
    task_id: input.task_id,
    template_id: input.template_id,
    owner_id: input.owner_id,
    name: input.name.trim(),
    status: "planned",
    position: 0,
  }).select("*").single();
  if (error) throw new Error(error.message);
  const created = data as Record<string, unknown>;
  for (const [keyId, typed] of Object.entries(input.values ?? {})) {
    await patchExperimentValue({
      experimentId: created.id as string,
      keyId,
      expectedCellRevision: 0,
      value: typed,
      editSessionId: "00000000-0000-4000-8000-000000000001",
    });
  }
  return created;
}
```

Note: the Task 2 mutation test only covers the value/archive/unarchive/restore adapters; extend `template-mutation-repository.test.ts` with a `createTemplateExperiment` case (insert + per-value save) in this task.

- [ ] **Step 3: Run the route tests and commit**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run app/api/agent/v1/__tests__/template-routes.test.ts app/api/agent/v1/__tests__/write-routes.test.ts app/api/agent/v1/__tests__/read-routes.test.ts
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
git add app/api/agent/v1 lib/agent-api
git commit -m "feat: add template-aware agent api routes"
```

Expected: PASS; no new type errors; commit succeeds.

---

### Task 4: Update the bundled Agent API skill

**Files:**
- Modify: `.agents/skills/triton-board-api/references/openapi.yaml`
- Modify: `.agents/skills/triton-board-api/SKILL.md`
- Modify: `scripts/__tests__/triton-board-api-skill.test.ts`

- [ ] **Step 1: Extend `openapi.yaml`**

Add the new paths with the same style as existing ones:

```yaml
  /templates:
    get:
      summary: List Experiment Templates
      security: [{ bearerAuth: [] }]
      responses:
        "200":
          description: Template summaries
  /templates/{id}:
    get:
      summary: Get one Template schema
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      responses:
        "200":
          description: Ordered Fields, Keys, and options
        "404":
          description: Template not found
  /templates/{id}/compare:
    get:
      summary: Compare source rows for a Template
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
        - { name: archived, in: query, schema: { type: boolean } }
      responses:
        "200":
          description: Experiments with typed Values
  /experiments/{id}/values:
    patch:
      summary: Patch one typed Value by stable key_id
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [key_id, expected_cell_revision]
              properties:
                key_id: { type: string, format: uuid }
                expected_cell_revision: { type: integer, minimum: 0 }
                value: { type: object, nullable: true }
      responses:
        "200":
          description: Saved
        "409":
          description: Cell revision conflict
  /experiments/{id}/archive:
    post:
      summary: Archive an Experiment (Required Values gate)
      responses:
        "200": { description: Archived }
        "422": { description: Required Values missing }
  /experiments/{id}/unarchive:
    post:
      summary: Unarchive an Experiment
      responses:
        "200": { description: Unarchived }
  /experiments/{id}/versions:
    get:
      summary: List Experiment versions
      responses:
        "200": { description: Versions }
  /experiments/{id}/versions/{versionNo}/restore:
    post:
      summary: Restore a version as a new forward mutation
      responses:
        "200": { description: Restored }
```

Mark the legacy fixed-field mutation payloads as deprecated in their existing descriptions (append `(deprecated — legacy path; Template Experiments use typed values)`).

- [ ] **Step 2: Update `SKILL.md`**

Add a short paragraph:

```markdown
## Template Experiments

Experiments created from a Template carry `template_id` and expose typed `values` (keyed by stable `key_id`) plus `archived_at` and the current `version_no`. Patch Values via `PATCH /experiments/{id}/values` with `expected_cell_revision`; 409 means the cell changed and the response includes `remote`. Archive is gated on Required Values. Restore is a new forward mutation on unarchived Experiments.
```

- [ ] **Step 3: Extend the skill test**

In `scripts/__tests__/triton-board-api-skill.test.ts`, add assertions that the bundled `openapi.yaml` contains the new paths and that the client script can invoke a template list command:

```ts
  it("documents the template-aware endpoints", () => {
    const openapi = readFileSync(openapiPath, "utf8");
    expect(openapi).toContain("/templates/{id}/compare");
    expect(openapi).toContain("/experiments/{id}/values");
    expect(openapi).toContain("/experiments/{id}/archive");
  });
```

- [ ] **Step 4: Run the skill test and commit**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run scripts/__tests__/triton-board-api-skill.test.ts
git add .agents/skills/triton-board-api scripts/__tests__/triton-board-api-skill.test.ts
git commit -m "docs: document template-aware agent api endpoints"
```

Expected: PASS; commit succeeds.

---

### Task 5: Final verification and spec cross-check

**Files:** none

- [ ] **Step 1: Cross-check the spec**

Re-read `docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md` section "Agent API Compatibility" and confirm:

- Experiment responses gain `template_id`, Template summary, typed `values` (key_id, current Key string, Value Type, Value, cell revision), `archived_at`, and current version number; legacy fields remain and are marked deprecated in the skill docs.
- Create accepts the deprecated fixed legacy payload (Imported Legacy Template path — Phase 6) OR `template_id` plus typed `values` addressed by stable `key_id`.
- Patch addresses a stable `key_id` with the expected cell revision; Key strings are convenience only; legacy fixed patches remain valid only for the Imported Legacy Template.
- Template-aware endpoints: Template list + one schema; Experiment create/read/update/archive/unarchive; versions + restore; same-Template Compare source.
- The API rejects: changing `template_id`; cross-Template Keys; populated-Key Value Type changes; writes to Archived Experiments; Archive with missing Required Values; stale cell revisions.
- Agent mutations call the same database functions as the browser.

Fix any gap found before continuing.

- [ ] **Step 2: Run the full verification**

Run:

```bash
npx supabase test db --local \
  supabase/tests/0014_api_key_deletion.sql \
  supabase/tests/0015_experiment_template_workspace_schema.sql \
  supabase/tests/0016_experiment_template_workspace_grants.sql \
  supabase/tests/0017_experiment_template_workspace_functions.sql \
  supabase/tests/0018_experiment_template_workspace_values.sql
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx next build
```

Expected: all DB suites PASS; all Vitest suites PASS; no new type errors; build succeeds.

- [ ] **Step 3: Verify branch state and hand off**

Run:

```bash
git status --short --branch
git log --oneline -6
```

Expected: clean tree; the last commits are the five Phase 5 commits. Report to the user:

- Phase 5 complete on `feat/experiment-template-workspace`.
- Phase 6 (legacy data migration cutover, Imported Legacy Template, Realtime verification, browser QA, production rollout) is the final plan; it retires the legacy content gates and enables dual-write adapters.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-31-experiment-template-workspace-agent-api.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
