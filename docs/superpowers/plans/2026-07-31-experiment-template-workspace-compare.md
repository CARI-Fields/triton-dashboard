# Experiment Template Workspace — Phase 4 (Same-Template Compare) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/experiments/compare` with a same-Template, read-only data table: one Template selects its non-archived Experiments as rows, every active Key is an independently sortable/filterable column under a Field Label group header, a Baseline row pins and neutral-highlights differences (with numeric Delta), and the whole view state is shareable in the URL.

**Architecture:** No new migrations. One authoritative client-side load (`loadTemplateCompareRows`) pulls the Template's active Keys, Experiments, current Values, multi-select option sets, attachments, Tasks, and Members, then pure functions in `lib/templates/compare.ts` filter/sort/compare rows. The view state (Template, Baseline, include-archived, visible columns, sort, filters) round-trips through `lib/templates/compare-url.ts` and the page syncs it with `router.replace`, exactly like the legacy Compare.

**Tech Stack:** TypeScript pure functions + Vitest, Next.js 16 client component with `useSearchParams`-style URL state via serialized search params, existing `lib/templates/repository.ts` + `lib/experiments/values.ts` types.

---

## Global Constraints

- Work only in `.worktrees/experiment-template-workspace` on `feat/experiment-template-workspace` (already checked out; do not switch branches).
- Authoritative design: `docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md` — read "Compare", "Sorting and filtering", "Baseline difference", "Realtime and Error Handling", and "Test and Acceptance Plan" before starting.
- Phases 1-3 are committed (tables, template/value functions, Detail, versions). Reuse `lib/templates/repository.ts` (draft loading) and `lib/experiments/values.ts` (TypedValue). Do not modify prior migrations.
- The table NEVER mixes Templates. A shared URL whose Template is missing or whose rows cannot load shows an explanatory empty state instead of a broken table.
- Interactive sorting/filtering happens client-side after one authoritative fetch (acceptance envelope: 200 Experiments × 50 active Keys).
- Comparison is Baseline-relative only and never infers good/bad: two missing Values are equal; missing vs present differs; Multi select compares as sets; Attachments compare by active Attachment identity; numeric Delta is neutral.
- House patterns: Vitest under `**/__tests__/**/*.test.{ts,tsx}` (use `fireEvent`; `@testing-library/user-event` is not installed), commit after every task, `npx tsc --noEmit` gate = zero NEW errors (pre-existing failures in Analytics/Board/ExperimentCompare/ExperimentsDatabase/OwnerPicker test files stay).
- Next.js 16 (AGENTS.md): re-read `01-getting-started/04-linking-and-navigating.md` and `01-app/03-api-reference/03-file-conventions/06-page.md` before the route task; the page receives `searchParams` as a Promise (house pattern already in `app/experiments/compare/page.tsx`).
- Node: run Vitest/tsc/build with `PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH`.

## Planned File Structure

Create:
- `lib/templates/compare.ts` (Task 1)
- `lib/templates/__tests__/compare.test.ts` (Task 1)
- `lib/templates/compare-url.ts` (Task 2)
- `lib/templates/__tests__/compare-url.test.ts` (Task 2)
- `lib/templates/compare-data.ts` (Task 3)
- `lib/templates/__tests__/compare-data.test.ts` (Task 3)
- `components/experiments/TemplateExperimentCompare.tsx` (Task 4)
- `components/experiments/__tests__/TemplateExperimentCompare.test.tsx` (Task 4)

Modify:
- `app/experiments/compare/page.tsx` — render the new Template Compare (Task 5)
- `app/template-manager.css` — Compare table styles (Task 4)

Legacy `components/experiments/ExperimentCompare.tsx` and `lib/experiments/compare.ts` stay in the tree but are no longer routed. They are removed in the Phase 6 cutover cleanup.

---

### Task 1: Add the Compare pure logic (rows, filters, sort, Baseline)

**Files:**
- Create: `lib/templates/__tests__/compare.test.ts`
- Create: `lib/templates/compare.ts`

- [ ] **Step 1: Write the failing logic test**

Create `lib/templates/__tests__/compare.test.ts`:

```ts

import { describe, expect, it } from "vitest";
import {
  applyCompareFilters,
  cellDifference,
  deltaFor,
  isDifferent,
  sortCompareRows,
  type CompareRow,
  type CompareViewFilter,
} from "@/lib/templates/compare";
import type { TypedValue } from "@/lib/experiments/values";

const KEY_ID = "50000000-0000-4000-8000-000000000001";

function row(
  id: string,
  value: TypedValue | null,
  archived = false,
): CompareRow {
  return {
    experimentId: id,
    experimentNo: Number(id.slice(-1)),
    name: `run-${id.slice(-1)}`,
    taskTitle: "Optimize conv2d",
    ownerName: null,
    status: "analyzing",
    archivedAt: archived ? "2026-07-31T00:00:00.000Z" : null,
    values: new Map([[KEY_ID, { value, cellRevision: 1 }]]),
  };
}

describe("compare logic", () => {
  it("filters Numbers by min and max", () => {
    const rows = [
      row("00000000-0000-4000-8000-000000000001", { kind: "number", number: 0.5 }),
      row("00000000-0000-4000-8000-000000000002", { kind: "number", number: 0.9 }),
      row("00000000-0000-4000-8000-000000000003", null),
    ];
    const filter: CompareViewFilter = { kind: "min", number: 0.7 };
    const result = applyCompareFilters(rows, { [KEY_ID]: filter });
    expect(result.map((entry) => entry.experimentId)).toEqual([
      "00000000-0000-4000-8000-000000000002",
    ]);
  });

  it("filters Multi select with contains-any", () => {
    const rows = [
      row("00000000-0000-4000-8000-000000000001", {
        kind: "multi_select",
        optionIds: ["a"],
      }),
      row("00000000-0000-4000-8000-000000000002", {
        kind: "multi_select",
        optionIds: ["b"],
      }),
    ];
    const filter: CompareViewFilter = { kind: "options", optionIds: ["a", "c"] };
    const result = applyCompareFilters(rows, { [KEY_ID]: filter });
    expect(result.map((entry) => entry.experimentId)).toEqual([
      "00000000-0000-4000-8000-000000000001",
    ]);
  });

  it("sorts Numbers numerically in both directions", () => {
    const rows = [
      row("00000000-0000-4000-8000-000000000001", { kind: "number", number: 0.9 }),
      row("00000000-0000-4000-8000-000000000002", null),
      row("00000000-0000-4000-8000-000000000003", { kind: "number", number: 0.5 }),
    ];
    const ascending = sortCompareRows(rows, {
      keyId: KEY_ID,
      direction: "asc",
    });
    expect(ascending.map((entry) => entry.name)).toEqual(["run-3", "run-1", "run-2"]);
    const descending = sortCompareRows(rows, {
      keyId: KEY_ID,
      direction: "desc",
    });
    expect(descending.map((entry) => entry.name)).toEqual(["run-1", "run-3", "run-2"]);
  });

  it("treats missing equal to missing and different from present", () => {
    expect(isDifferent(null, null)).toBe(false);
    expect(isDifferent(null, { kind: "number", number: 1 })).toBe(true);
    expect(isDifferent({ kind: "number", number: 1 }, { kind: "number", number: 1 }))
      .toBe(false);
    expect(isDifferent({ kind: "number", number: 1 }, { kind: "number", number: 2 }))
      .toBe(true);
  });

  it("compares Multi select as sets and computes neutral Delta", () => {
    const a: TypedValue = { kind: "multi_select", optionIds: ["a", "b"] };
    const b: TypedValue = { kind: "multi_select", optionIds: ["b", "a"] };
    expect(isDifferent(a, b)).toBe(false);
    expect(deltaFor(
      { kind: "number", number: 1 },
      { kind: "number", number: 0.8 },
    )).toBeCloseTo(0.2);
    expect(deltaFor(null, { kind: "number", number: 0.8 })).toBeNull();
    expect(cellDifference({
      row: row("00000000-0000-4000-8000-000000000001", { kind: "number", number: 1 }),
      baselineRow: row("00000000-0000-4000-8000-000000000002", { kind: "number", number: 0.8 }),
      keyId: KEY_ID,
    })).toEqual({ different: true, delta: expect.closeTo(0.2) });
  });
});
```

Run it:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/templates/__tests__/compare.test.ts
```

Expected: FAIL — `@/lib/templates/compare` cannot be resolved.

- [ ] **Step 2: Implement `lib/templates/compare.ts`**

Create `lib/templates/compare.ts`:

```ts

import type { TypedValue } from "@/lib/experiments/values";
import type { ExperimentStatus } from "@/lib/types";

export interface CompareRowValue {
  value: TypedValue | null;
  cellRevision: number;
}

export interface CompareRow {
  experimentId: string;
  experimentNo: number;
  name: string;
  taskTitle: string | null;
  ownerName: string | null;
  status: ExperimentStatus;
  archivedAt: string | null;
  values: Map<string, CompareRowValue>;
}

export type CompareViewFilter =
  | { kind: "contains"; text: string }
  | { kind: "min"; number: number }
  | { kind: "max"; number: number }
  | { kind: "options"; optionIds: string[] }
  | { kind: "present"; present: boolean };

export interface CompareSort {
  keyId: string;
  direction: "asc" | "desc";
}

export type CompareScalar =
  | { kind: "text"; text: string }
  | { kind: "number"; number: number }
  | { kind: "boolean"; boolean: boolean }
  | { kind: "datetime"; datetime: number }
  | { kind: "set"; ids: string[] }
  | { kind: "missing" };

export function scalarValue(value: TypedValue | null): CompareScalar {
  if (!value) return { kind: "missing" };
  switch (value.kind) {
    case "short_text": return { kind: "text", text: value.text };
    case "long_text": return { kind: "text", text: value.text };
    case "url": return { kind: "text", text: value.url };
    case "number": return { kind: "number", number: value.number };
    case "boolean": return { kind: "boolean", boolean: value.boolean };
    case "date_time": return { kind: "datetime", datetime: Date.parse(value.datetime) };
    case "single_select": return { kind: "text", text: value.optionId };
    case "multi_select": return { kind: "set", ids: [...value.optionIds].sort() };
    case "attachment": return { kind: "set", ids: [...value.attachmentIds].sort() };
  }
}

function rowValue(row: CompareRow, keyId: string): CompareScalar {
  return scalarValue(row.values.get(keyId)?.value ?? null);
}

function textMatch(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.trim().toLowerCase());
}

export function applyCompareFilters(
  rows: CompareRow[],
  filters: Record<string, CompareViewFilter>,
): CompareRow[] {
  const entries = Object.entries(filters);
  if (entries.length === 0) return rows;
  return rows.filter((row) =>
    entries.every(([keyId, filter]) => {
      const scalar = rowValue(row, keyId);
      switch (filter.kind) {
        case "contains":
          return scalar.kind === "text" && textMatch(scalar.text, filter.text);
        case "min":
          return scalar.kind === "number" && scalar.number >= filter.number;
        case "max":
          return scalar.kind === "number" && scalar.number <= filter.number;
        case "present":
          return filter.present ? scalar.kind !== "missing" : scalar.kind === "missing";
        case "options":
          if (scalar.kind === "set") {
            return scalar.ids.some((id) => filter.optionIds.includes(id));
          }
          return scalar.kind === "text" && filter.optionIds.includes(scalar.text);
      }
    }),
  );
}

function compareScalars(left: CompareScalar, right: CompareScalar): number {
  if (left.kind === "missing" && right.kind === "missing") return 0;
  if (left.kind === "missing") return 1;
  if (right.kind === "missing") return -1;
  if (left.kind === "number" && right.kind === "number") {
    return left.number - right.number;
  }
  if (left.kind === "datetime" && right.kind === "datetime") {
    return left.datetime - right.datetime;
  }
  const leftText = left.kind === "text"
    ? left.text
    : left.kind === "boolean"
      ? String(left.boolean)
      : (left.kind === "set" ? left.ids.join(",") : "");
  const rightText = right.kind === "text"
    ? right.text
    : right.kind === "boolean"
      ? String(right.boolean)
      : (right.kind === "set" ? right.ids.join(",") : "");
  return leftText.localeCompare(rightText);
}

export function sortCompareRows(
  rows: CompareRow[],
  sort: CompareSort,
): CompareRow[] {
  return [...rows].sort((left, right) => {
    const leftScalar = rowValue(left, sort.keyId);
    const rightScalar = rowValue(right, sort.keyId);
    if (leftScalar.kind === "missing" && rightScalar.kind === "missing") return 0;
    if (leftScalar.kind === "missing") return 1;
    if (rightScalar.kind === "missing") return -1;
    const result = compareScalars(leftScalar, rightScalar);
    return sort.direction === "asc" ? result : -result;
  });
}

export function isDifferent(
  left: TypedValue | null,
  right: TypedValue | null,
): boolean {
  const a = scalarValue(left);
  const b = scalarValue(right);
  if (a.kind === "missing" && b.kind === "missing") return false;
  if (a.kind === "missing" || b.kind === "missing") return true;
  if (a.kind === "set" && b.kind === "set") {
    return a.ids.length !== b.ids.length
      || a.ids.some((id, index) => id !== b.ids[index]);
  }
  return compareScalars(a, b) !== 0;
}

export function deltaFor(
  left: TypedValue | null,
  right: TypedValue | null,
): number | null {
  if (left?.kind !== "number" || right?.kind !== "number") return null;
  if (!Number.isFinite(left.number) || !Number.isFinite(right.number)) return null;
  return left.number - right.number;
}

export interface CellDifference {
  different: boolean;
  delta: number | null;
}

export function cellDifference({
  row,
  baselineRow,
  keyId,
}: {
  row: CompareRow;
  baselineRow: CompareRow;
  keyId: string;
}): CellDifference {
  return {
    different: isDifferent(
      row.values.get(keyId)?.value ?? null,
      baselineRow.values.get(keyId)?.value ?? null,
    ),
    delta: deltaFor(
      row.values.get(keyId)?.value ?? null,
      baselineRow.values.get(keyId)?.value ?? null,
    ),
  };
}
```

- [ ] **Step 3: Run the logic test and commit**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/templates/__tests__/compare.test.ts
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
git add lib/templates/compare.ts lib/templates/__tests__/compare.test.ts
git commit -m "feat: add template compare logic"
```

Expected: PASS; no new type errors; commit succeeds.

---

### Task 2: Add Compare URL state serialization

**Files:**
- Create: `lib/templates/__tests__/compare-url.test.ts`
- Create: `lib/templates/compare-url.ts`

- [ ] **Step 1: Write the failing URL test**

Create `lib/templates/__tests__/compare-url.test.ts`:

```ts

import { describe, expect, it } from "vitest";
import {
  parseCompareSearchParams,
  serializeCompareViewState,
  type CompareViewState,
} from "@/lib/templates/compare-url";

const TEMPLATE_ID = "30000000-0000-4000-8000-000000000001";
const KEY_A = "50000000-0000-4000-8000-000000000001";
const KEY_B = "50000000-0000-4000-8000-000000000002";
const OPTION = "70000000-0000-4000-8000-000000000001";
const BASELINE = "60000000-0000-4000-8000-000000000001";

const activeKeys = [KEY_A, KEY_B];

describe("compare URL state", () => {
  it("round-trips a full view state", () => {
    const state: CompareViewState = {
      templateId: TEMPLATE_ID,
      includeArchived: true,
      baselineId: BASELINE,
      visibleKeyIds: [KEY_B, KEY_A],
      sort: { keyId: KEY_A, direction: "desc" },
      filters: {
        [KEY_A]: { kind: "min", number: 0.7 },
        [KEY_B]: { kind: "options", optionIds: [OPTION] },
      },
    };
    const serialized = serializeCompareViewState(state);
    const parsed = parseCompareSearchParams(
      Object.fromEntries(new URLSearchParams(serialized)),
      activeKeys,
    );
    expect(parsed).toEqual(state);
  });

  it("drops unknown Keys and the archived flag when absent", () => {
    const parsed = parseCompareSearchParams({
      template: TEMPLATE_ID,
      columns: `${KEY_A},unknown-key`,
      archived: "true",
      filter: `${KEY_A}:max:5`,
    }, activeKeys);
    expect(parsed.visibleKeyIds).toEqual([KEY_A]);
    expect(parsed.includeArchived).toBe(true);
    expect(parsed.filters[KEY_A]).toEqual({ kind: "max", number: 5 });
    expect(parsed.sort).toBeNull();
  });
});
```

Run it:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/templates/__tests__/compare-url.test.ts
```

Expected: FAIL — module cannot be resolved.

- [ ] **Step 2: Implement `lib/templates/compare-url.ts`**

Create `lib/templates/compare-url.ts`:

```ts

import type { CompareViewFilter, CompareSort } from "@/lib/templates/compare";

export interface CompareSearchParams {
  template?: string | string[];
  baseline?: string | string[];
  archived?: string | string[];
  sort?: string | string[];
  filter?: string | string[];
  columns?: string | string[];
}

export interface CompareViewState {
  templateId: string | null;
  includeArchived: boolean;
  baselineId: string | null;
  visibleKeyIds: string[];
  sort: CompareSort | null;
  filters: Record<string, CompareViewFilter>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeUuid(value: string): string | null {
  const trimmed = value.trim();
  return UUID.test(trimmed) ? trimmed.toLowerCase() : null;
}

function parseSort(raw: string): CompareSort | null {
  const [keyIdRaw, directionRaw] = raw.split(":");
  const keyId = normalizeUuid(keyIdRaw ?? "");
  if (!keyId || (directionRaw !== "asc" && directionRaw !== "desc")) return null;
  return { keyId, direction: directionRaw };
}

function parseFilter(raw: string): { keyId: string; filter: CompareViewFilter } | null {
  const [keyIdRaw, kind, ...rest] = raw.split(":");
  const keyId = normalizeUuid(keyIdRaw ?? "");
  if (!keyId) return null;
  const value = rest.join(":");
  switch (kind) {
    case "contains":
      return value ? { keyId, filter: { kind: "contains", text: value } } : null;
    case "min": {
      const number = Number(value);
      return Number.isFinite(number)
        ? { keyId, filter: { kind: "min", number } }
        : null;
    }
    case "max": {
      const number = Number(value);
      return Number.isFinite(number)
        ? { keyId, filter: { kind: "max", number } }
        : null;
    }
    case "options": {
      const optionIds = value.split("|").map(normalizeUuid).filter((id): id is string => id !== null);
      return optionIds.length > 0
        ? { keyId, filter: { kind: "options", optionIds } }
        : null;
    }
    case "present": {
      if (value === "true") return { keyId, filter: { kind: "present", present: true } };
      if (value === "false") return { keyId, filter: { kind: "present", present: false } };
      return null;
    }
    default:
      return null;
  }
}

export function parseCompareSearchParams(
  params: CompareSearchParams,
  activeKeys: string[],
): CompareViewState {
  const keySet = new Set(activeKeys);
  const templateId = normalizeUuid(first(params.template));
  const baselineId = normalizeUuid(first(params.baseline));
  const includeArchived = first(params.archived) === "true";
  const sort = parseSort(first(params.sort));
  const filters: Record<string, CompareViewFilter> = {};
  for (const raw of (Array.isArray(params.filter) ? params.filter : [params.filter])
    .flatMap((entry) => (entry ?? "").split(";"))
    .filter(Boolean)) {
    const parsed = parseFilter(raw);
    if (parsed && keySet.has(parsed.keyId)) {
      filters[parsed.keyId] = parsed.filter;
    }
  }
  const visibleKeyIds = first(params.columns)
    .split(",")
    .map(normalizeUuid)
    .filter((id): id is string => id !== null && keySet.has(id));
  if (sort && !keySet.has(sort.keyId)) {
    return {
      templateId,
      includeArchived,
      baselineId,
      visibleKeyIds,
      sort: null,
      filters,
    };
  }
  return {
    templateId,
    includeArchived,
    baselineId,
    visibleKeyIds,
    sort,
    filters,
  };
}

function serializeFilter(keyId: string, filter: CompareViewFilter): string {
  switch (filter.kind) {
    case "contains": return `${keyId}:contains:${filter.text}`;
    case "min": return `${keyId}:min:${filter.number}`;
    case "max": return `${keyId}:max:${filter.number}`;
    case "present": return `${keyId}:present:${filter.present}`;
    case "options": return `${keyId}:options:${filter.optionIds.join("|")}`;
  }
}

export function serializeCompareViewState(state: CompareViewState): string {
  const params = new URLSearchParams();
  if (state.templateId) params.set("template", state.templateId);
  if (state.baselineId) params.set("baseline", state.baselineId);
  if (state.includeArchived) params.set("archived", "true");
  if (state.sort) params.set("sort", `${state.sort.keyId}:${state.sort.direction}`);
  const filterEntries = Object.entries(state.filters)
    .map(([keyId, filter]) => serializeFilter(keyId, filter));
  if (filterEntries.length > 0) params.set("filter", filterEntries.join(";"));
  if (state.visibleKeyIds.length > 0) params.set("columns", state.visibleKeyIds.join(","));
  return params.toString();
}
```

- [ ] **Step 3: Run the URL test and commit**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/templates/__tests__/compare-url.test.ts lib/templates/__tests__/compare.test.ts
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
git add lib/templates/compare-url.ts lib/templates/__tests__/compare-url.test.ts
git commit -m "feat: add template compare url state"
```

Expected: PASS; no new type errors; commit succeeds.

---

### Task 3: Add the Compare dataset loader

**Files:**
- Create: `lib/templates/__tests__/compare-data.test.ts`
- Create: `lib/templates/compare-data.ts`

- [ ] **Step 1: Write the failing loader test**

Create `lib/templates/__tests__/compare-data.test.ts`:

```ts

import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadTemplateCompareRows } from "@/lib/templates/compare-data";

interface MockQuery {
  data: unknown;
  error: unknown;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
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
        not: vi.fn(() => tables[name]),
        is: vi.fn((column: string, value: unknown) => {
          const rows = (tables[name] as { data: unknown[] }).data as Array<Record<string, unknown>>;
          (tables[name] as { data: unknown }).data = value === null
            ? rows.filter((row) => row[column] == null)
            : rows.filter((row) => row[column] === value);
          return tables[name];
        }),
        order: vi.fn(() => tables[name]),
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
  mocks.table("experiment_value_options").data = [];
  mocks.table("attachments").data = [];
  mocks.table("tasks").data = [{
    id: "20000000-0000-4000-8000-000000000001",
    title: "Optimize conv2d",
  }];
  mocks.table("members").data = [];
});

describe("loadTemplateCompareRows", () => {
  it("loads typed Values keyed by Key id", async () => {
    const rows = await loadTemplateCompareRows(TEMPLATE_ID, false);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Run one");
    expect(rows[0].taskTitle).toBe("Optimize conv2d");
    const entry = rows[0].values.get(KEY_ID);
    expect(entry?.value).toEqual({ kind: "number", number: 0.73 });
  });

  it("filters archived rows unless requested", async () => {
    const rows = mocks.table("experiments").data as unknown[];
    const archivedRow = {
      id: "60000000-0000-4000-8000-000000000002",
      experiment_no: 2,
      task_id: "20000000-0000-4000-8000-000000000001",
      owner_id: null,
      name: "Run two",
      status: "completed",
      baseline_experiment_id: null,
      template_id: TEMPLATE_ID,
      archived_at: "2026-07-31T00:00:00.000Z",
      core_revision: 1,
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    };
    mocks.table("experiments").data = [...rows, archivedRow];
    const withoutArchived = await loadTemplateCompareRows(TEMPLATE_ID, false);
    expect(withoutArchived).toHaveLength(1);
    mocks.table("experiments").data = [...rows, archivedRow];
    const withArchived = await loadTemplateCompareRows(TEMPLATE_ID, true);
    expect(withArchived).toHaveLength(2);
    expect(withArchived[1].archivedAt).not.toBeNull();
  });
});
```

Run it:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/templates/__tests__/compare-data.test.ts
```

Expected: FAIL — module cannot be resolved.

- [ ] **Step 2: Implement `lib/templates/compare-data.ts`**

Create `lib/templates/compare-data.ts`:

```ts

import { supabase } from "@/lib/supabase";
import type {
  Attachment,
  Experiment,
  ExperimentValue,
  ExperimentValueOption,
  Member,
  Task,
  TemplateValueType,
} from "@/lib/types";
import { typedValueFromRow } from "@/lib/experiments/values-internal";
import type { CompareRow, CompareRowValue } from "@/lib/templates/compare";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function loadTemplateCompareRows(
  templateId: string,
  includeArchived: boolean,
): Promise<CompareRow[]> {
  const c = client();
  let experimentsQuery = c
    .from("experiments")
    .select("*")
    .eq("template_id", templateId)
    .order("experiment_no");
  if (!includeArchived) {
    experimentsQuery = experimentsQuery.is("archived_at", null);
  }
  const [experiments, values, valueOptions, attachments, tasks, members] = await Promise.all([
    experimentsQuery,
    c.from("experiment_values")
      .select("*,template_key:experiment_template_keys(value_type)")
      .in("template_id", [templateId]),
    c.from("experiment_value_options")
      .select("experiment_id,key_id,option_id,position")
      .in("template_id", [templateId])
      .order("position"),
    c.from("attachments")
      .select("id,experiment_id,template_key_id,position,caption")
      .not("template_key_id", "is", null)
      .is("archived_at", null),
    c.from("tasks")
      .select("id,title"),
    c.from("members")
      .select("id,name"),
  ]);
  throwIfError(experiments.error);
  throwIfError(values.error);
  throwIfError(valueOptions.error);
  throwIfError(attachments.error);
  throwIfError(tasks.error);
  throwIfError(members.error);

  const taskTitles = new Map(
    (tasks.data ?? [] as Task[]).map((task) => [task.id, task.title]),
  );
  const ownerNames = new Map(
    (members.data ?? [] as Member[]).map((member) => [member.id, member.name]),
  );
  const optionsByCell = new Map<string, string[]>();
  for (const row of (valueOptions.data ?? []) as ExperimentValueOption[]) {
    const key = `${row.experiment_id}:${row.key_id}`;
    const group = optionsByCell.get(key) ?? [];
    group.push(row.option_id);
    optionsByCell.set(key, group);
  }
  const attachmentsByCell = new Map<string, string[]>();
  for (const row of (attachments.data ?? []) as Attachment[]) {
    if (!row.template_key_id) continue;
    const key = `${row.experiment_id}:${row.template_key_id}`;
    const group = attachmentsByCell.get(key) ?? [];
    group.push(row.id);
    attachmentsByCell.set(key, group);
  }

  const rows = new Map<string, CompareRow>();
  for (const row of (experiments.data ?? []) as Experiment[]) {
    rows.set(row.id, {
      experimentId: row.id,
      experimentNo: row.experiment_no,
      name: row.name,
      taskTitle: row.task_id ? taskTitles.get(row.task_id) ?? null : null,
      ownerName: row.owner_id ? ownerNames.get(row.owner_id) ?? null : null,
      status: row.status,
      archivedAt: row.archived_at,
      values: new Map<string, CompareRowValue>(),
    });
  }

  for (const row of (values.data ?? []) as Array<ExperimentValue & {
    template_key?: { value_type: TemplateValueType };
  }>) {
    const compareRow = rows.get(row.experiment_id);
    if (!compareRow) continue;
    const type = row.template_key?.value_type ?? "short_text";
    const value = typedValueFromRow(
      row,
      type,
      optionsByCell.get(`${row.experiment_id}:${row.key_id}`) ?? [],
      attachmentsByCell.get(`${row.experiment_id}:${row.key_id}`) ?? [],
    );
    compareRow.values.set(row.key_id, { value, cellRevision: row.cell_revision });
  }

  return [...rows.values()];
}
```

Note: `typedValueFromRow` currently lives inside `lib/experiments/values.ts` as a private function. Export it from there, or move it to a shared module. Prefer a shared module:

- [ ] **Step 3: Extract the typed-value serializer into `lib/experiments/values-internal.ts`**

Create `lib/experiments/values-internal.ts` with the exact body of the current private `typedValueFromRow` from `lib/experiments/values.ts`:

```ts
import type {
  ExperimentValue,
  TemplateValueType,
} from "@/lib/types";
import type { TypedValue } from "@/lib/experiments/values";

export function typedValueFromRow(
  row: ExperimentValue,
  type: TemplateValueType,
  optionIds: string[],
  attachmentIds: string[],
): TypedValue | null {
  switch (type) {
    case "short_text":
      return row.text_value === null ? null : { kind: "short_text", text: row.text_value };
    case "long_text":
      return row.text_value === null ? null : { kind: "long_text", text: row.text_value };
    case "url":
      return row.text_value === null ? null : { kind: "url", url: row.text_value };
    case "number":
      return row.number_value === null ? null : { kind: "number", number: row.number_value };
    case "boolean":
      return row.boolean_value === null ? null : { kind: "boolean", boolean: row.boolean_value };
    case "date_time":
      return row.datetime_value === null ? null : { kind: "date_time", datetime: row.datetime_value };
    case "single_select":
      return row.option_id === null ? null : { kind: "single_select", optionId: row.option_id };
    case "multi_select":
      return { kind: "multi_select", optionIds };
    case "attachment":
      return { kind: "attachment", attachmentIds };
  }
}
```

Then remove the private copy from `lib/experiments/values.ts` and import the shared one (keep `loadExperimentValues` behavior identical — its tests must still pass unchanged).

- [ ] **Step 4: Run the loader test and the values suite**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run lib/templates/__tests__/compare-data.test.ts lib/experiments/__tests__/values.test.ts
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
git add lib/templates/compare-data.ts lib/templates/__tests__/compare-data.test.ts lib/experiments/values-internal.ts lib/experiments/values.ts
git commit -m "feat: add template compare dataset loader"
```

Expected: PASS; no new type errors; commit succeeds.

---

### Task 4: Build the Template Compare table

**Files:**
- Create: `components/experiments/__tests__/TemplateExperimentCompare.test.tsx`
- Create: `components/experiments/TemplateExperimentCompare.tsx`
- Modify: `app/template-manager.css`

- [ ] **Step 1: Write the failing component test**

Create `components/experiments/__tests__/TemplateExperimentCompare.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TemplateExperimentCompare from "@/components/experiments/TemplateExperimentCompare";
import type { CompareRow } from "@/lib/templates/compare";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  loadDraft: vi.fn(),
  loadRows: vi.fn(),
}));

vi.mock("@/lib/templates/repository", () => ({
  listTemplateSummaries: mocks.list,
  loadTemplateDraft: mocks.loadDraft,
}));
vi.mock("@/lib/templates/compare-data", () => ({
  loadTemplateCompareRows: mocks.loadRows,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const TEMPLATE_ID = "30000000-0000-4000-8000-000000000001";
const KEY_ID = "50000000-0000-4000-8000-000000000001";

const summary = {
  template: {
    id: TEMPLATE_ID,
    name: "Benchmark A",
    description: "",
    schema_revision: 2,
    archived_at: null,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
  },
  fieldCount: 1,
  keyCount: 1,
  experimentCount: 2,
};

const draft = {
  templateId: TEMPLATE_ID,
  name: "Benchmark A",
  description: "",
  schemaRevision: 2,
  fields: [{
    id: "f1",
    label: "Metrics",
    colorToken: "blue",
    position: 1,
    archived: false,
    keys: [{
      id: KEY_ID,
      key: "pass@1",
      valueType: "number",
      required: false,
      position: 1,
      archived: false,
      options: [],
      valueCount: 0,
    }],
  }],
};

function row(id: string, number: number | null, archived = false): CompareRow {
  return {
    experimentId: id,
    experimentNo: Number(id.slice(-1)),
    name: `run-${id.slice(-1)}`,
    taskTitle: "Optimize conv2d",
    ownerName: null,
    status: "analyzing",
    archivedAt: archived ? "2026-07-31T00:00:00.000Z" : null,
    values: new Map([[KEY_ID, {
      value: number === null ? null : { kind: "number", number },
      cellRevision: 1,
    }]]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([summary]);
  mocks.loadDraft.mockResolvedValue(draft);
  mocks.loadRows.mockResolvedValue([
    row("60000000-0000-4000-8000-000000000001", 0.8),
    row("60000000-0000-4000-8000-000000000002", 0.9),
  ]);
});

afterEach(cleanup);

describe("TemplateExperimentCompare", () => {
  it("renders a two-level header and typed cells for a selected Template", async () => {
    render(<TemplateExperimentCompare initialState={null} />);
    await screen.findByText("Benchmark A");
    fireEvent.change(screen.getByLabelText("Template"), {
      target: { value: TEMPLATE_ID },
    });
    await screen.findByText("pass@1");
    expect(screen.getByText("Metrics")).not.toBeNull();
    expect(screen.getByText("0.8")).not.toBeNull();
  });

  it("pins a Baseline and highlights differing cells with a neutral Delta", async () => {
    render(<TemplateExperimentCompare initialState={null} />);
    await screen.findByText("Benchmark A");
    fireEvent.change(screen.getByLabelText("Template"), {
      target: { value: TEMPLATE_ID },
    });
    await screen.findByText("pass@1");
    fireEvent.change(screen.getByLabelText("Baseline"), {
      target: { value: "60000000-0000-4000-8000-000000000001" },
    });
    expect(await screen.findByText("Baseline: run-1")).not.toBeNull();
    expect(screen.getByText("+0.1")).not.toBeNull();
  });
});
```

Run it:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run components/experiments/__tests__/TemplateExperimentCompare.test.tsx
```

Expected: FAIL — module cannot be resolved.

- [ ] **Step 2: Implement `components/experiments/TemplateExperimentCompare.tsx`**

Create `components/experiments/TemplateExperimentCompare.tsx`:

```tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import WorkspaceSkeleton from "@/components/ui/WorkspaceSkeleton";
import {
  listTemplateSummaries,
  loadTemplateDraft,
  type TemplateKeyDraft,
  type TemplateDraft,
  type TemplateSummary,
} from "@/lib/templates/repository";
import type { TypedValue } from "@/lib/experiments/values";
import { loadTemplateCompareRows } from "@/lib/templates/compare-data";
import {
  applyCompareFilters,
  cellDifference,
  sortCompareRows,
  type CompareRow,
  type CompareViewFilter,
} from "@/lib/templates/compare";
import {
  parseCompareSearchParams,
  serializeCompareViewState,
  type CompareSearchParams,
  type CompareViewState,
} from "@/lib/templates/compare-url";

const FIXED_COLUMNS = [
  { id: "experimentId", label: "ID" },
  { id: "name", label: "Name" },
  { id: "task", label: "Task" },
  { id: "owner", label: "Owner" },
  { id: "status", label: "Status" },
  { id: "archived", label: "Archive" },
] as const;

export default function TemplateExperimentCompare({
  initialState,
  searchParams,
}: {
  initialState?: CompareViewState | null;
  searchParams?: CompareSearchParams;
}) {
  const router = useRouter();
  const [summaries, setSummaries] = useState<TemplateSummary[]>([]);
  const [template, setTemplate] = useState<TemplateDraft | null>(null);
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [state, setState] = useState<CompareViewState>(
    () => initialState ?? {
      templateId: null,
      includeArchived: false,
      baselineId: null,
      visibleKeyIds: [],
      sort: null,
      filters: {},
    },
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    listTemplateSummaries()
      .then(setSummaries)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Could not load Templates."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!state.templateId) {
      setTemplate(null);
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      loadTemplateDraft(state.templateId),
      loadTemplateCompareRows(state.templateId, state.includeArchived),
    ]).then(([draft, loadedRows]) => {
      if (cancelled) return;
      setTemplate(draft);
      setRows(loadedRows);
      setLoading(false);
    }).catch((caught) => {
      if (cancelled) return;
      setError(caught instanceof Error ? caught.message : "Could not load the comparison.");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [state.templateId, state.includeArchived]);

  const activeKeys = useMemo(
    () => template?.fields.flatMap((field) => field.keys) ?? [],
    [template],
  );
  const visibleKeys = useMemo(() => {
    if (state.visibleKeyIds.length === 0) return activeKeys;
    const byId = new Map(activeKeys.map((key) => [key.id, key]));
    return state.visibleKeyIds
      .map((id) => byId.get(id))
      .filter((key): key is NonNullable<typeof key> => key !== undefined);
  }, [activeKeys, state.visibleKeyIds]);

  const filteredAndSorted = useMemo(() => {
    let next = applyCompareFilters(rows, state.filters);
    if (state.sort) next = sortCompareRows(next, state.sort);
    return next;
  }, [rows, state.filters, state.sort]);

  const baselineRow = useMemo(
    () => filteredAndSorted.find((entry) => entry.experimentId === state.baselineId) ?? null,
    [filteredAndSorted, state.baselineId],
  );

  function patch(next: Partial<CompareViewState>) {
    const updated = { ...stateRef.current, ...next };
    setState(updated);
    const params = new URLSearchParams(serializeCompareViewState(updated));
    router.replace(`/experiments/compare?${params.toString()}`);
  }

  function selectTemplate(templateId: string) {
    patch({
      templateId,
      baselineId: null,
      visibleKeyIds: [],
      sort: null,
      filters: {},
    });
  }

  function toggleColumn(keyId: string) {
    const currentlyVisible = visibleKeys.some((key) => key.id === keyId);
    const next = currentlyVisible
      ? state.visibleKeyIds.filter((id) => id !== keyId)
      : [...state.visibleKeyIds, keyId];
    patch({ visibleKeyIds: next });
  }

  function setFilter(keyId: string, filter: CompareViewFilter | null) {
    const filters = { ...state.filters };
    if (filter) filters[keyId] = filter;
    else delete filters[keyId];
    patch({ filters });
  }

  if (loading && summaries.length === 0) {
    return <WorkspaceSkeleton variant="table" label="Loading Compare" />;
  }

  return (
    <div className="workspace-page template-compare">
      <PageHeader
        eyebrow="Analysis"
        title="Compare experiments"
        description="One typed schema per comparable series."
        actions={
          <select
            aria-label="Template"
            value={state.templateId ?? ""}
            onChange={(event) => selectTemplate(event.target.value)}
          >
            <option value="">Choose a template…</option>
            {summaries
              .filter((summary) => summary.template.archived_at === null)
              .map((summary) => (
                <option key={summary.template.id} value={summary.template.id}>
                  {summary.template.name}
                </option>
              ))}
          </select>
        }
      />
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {state.templateId && template ? (
        <>
          <div className="compare-toolbar">
            <label>
              <input
                type="checkbox"
                checked={state.includeArchived}
                onChange={(event) => patch({ includeArchived: event.target.checked })}
              />
              Include archived
            </label>
            <label>
              Baseline
              <select
                aria-label="Baseline"
                value={state.baselineId ?? ""}
                onChange={(event) =>
                  patch({ baselineId: event.target.value || null })}
              >
                <option value="">—</option>
                {filteredAndSorted.map((entry) => (
                  <option key={entry.experimentId} value={entry.experimentId}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Columns
              <select
                aria-label="Columns"
                value=""
                onChange={(event) => toggleColumn(event.target.value)}
              >
                <option value="">Toggle columns…</option>
                {activeKeys.map((key) => (
                  <option key={key.id} value={key.id}>
                    {visibleKeys.some((visible) => visible.id === key.id)
                      ? `Hide ${key.key}`
                      : `Show ${key.key}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {baselineRow ? (
            <p className="compare-baseline-note">Baseline: {baselineRow.name}</p>
          ) : null}

          <div className="compare-scroll" tabIndex={0}>
            <table className="compare-table">
              <thead>
                <tr className="compare-group-row">
                  <th scope="colgroup" colSpan={FIXED_COLUMNS.length} className="compare-corner">
                    Experiment
                  </th>
                  {template.fields.map((field) => {
                    const fieldKeys = visibleKeys.filter((key) => key.field_id === field.id);
                    if (fieldKeys.length === 0) return null;
                    return (
                      <th
                        key={field.id}
                        scope="colgroup"
                        colSpan={fieldKeys.length}
                        className={`compare-group token-${field.colorToken}`}
                      >
                        {field.label}
                      </th>
                    );
                  })}
                </tr>
                <tr className="compare-key-row">
                  {FIXED_COLUMNS.map((column) => (
                    <th key={column.id} scope="col">{column.label}</th>
                  ))}
                  {visibleKeys.map((key) => (
                    <th key={key.id} scope="col" className="compare-key-head">
                      <button
                        type="button"
                        aria-label={`Sort by ${key.key}`}
                        onClick={() =>
                          patch({
                            sort: {
                              keyId: key.id!,
                              direction: state.sort?.keyId === key.id
                                && state.sort.direction === "asc"
                                ? "desc"
                                : "asc",
                            },
                          })}
                      >
                        {key.key}
                        {state.sort?.keyId === key.id
                          ? (state.sort.direction === "asc" ? " ↑" : " ↓")
                          : ""}
                      </button>
                      <FilterMenu
                        keyId={key.id!}
                        keyDef={key}
                        filter={state.filters[key.id!]}
                        onApply={(filter) => setFilter(key.id!, filter)}
                        onClear={() => setFilter(key.id!, null)}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((entry) => (
                  <CompareRowView
                    key={entry.experimentId}
                    entry={entry}
                    baselineRow={baselineRow}
                    visibleKeys={visibleKeys}
                    isBaseline={entry.experimentId === state.baselineId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="template-empty">
          {summaries.length === 0
            ? "Create a Template first, then compare Experiments that use it."
            : "Choose a Template to compare its Experiments."}
        </p>
      )}
    </div>
  );
}

function CompareRowView({
  entry,
  baselineRow,
  visibleKeys,
  isBaseline,
}: {
  entry: CompareRow;
  baselineRow: CompareRow | null;
  visibleKeys: Array<{ id: string | null; key: string }>;
  isBaseline: boolean;
}) {
  return (
    <tr className={isBaseline ? "compare-baseline-row" : undefined}>
      <td>{entry.experimentNo}</td>
      <td>{entry.name}</td>
      <td>{entry.taskTitle ?? "—"}</td>
      <td>{entry.ownerName ?? "—"}</td>
      <td>{entry.status}</td>
      <td>{entry.archivedAt ? "Archived" : ""}</td>
      {visibleKeys.map((key) => {
        const raw = entry.values.get(key.id!)?.value ?? null;
        const difference = baselineRow
          ? cellDifference({ row: entry, baselineRow, keyId: key.id! })
          : null;
        return (
          <td
            key={key.id}
            className={
              difference?.different
                ? "compare-cell-different"
                : undefined
            }
          >
            <CellValue value={raw} />
            {difference?.different && difference.delta !== null ? (
              <span className="compare-delta">
                {difference.delta >= 0 ? "+" : ""}{difference.delta}
              </span>
            ) : null}
          </td>
        );
      })}
    </tr>
  );
}

function CellValue({ value }: { value: TypedValue | null }) {
  if (!value) return <span className="compare-missing">—</span>;
  switch (value.kind) {
    case "short_text": return <span>{value.text || "—"}</span>;
    case "long_text": return <span>{value.text || "—"}</span>;
    case "url": return <a href={value.url} target="_blank" rel="noreferrer">{value.url}</a>;
    case "number": return <span>{value.number}</span>;
    case "boolean": return <span>{String(value.boolean)}</span>;
    case "date_time": return <span>{new Date(value.datetime).toLocaleString()}</span>;
    case "single_select": return <span>{value.optionId}</span>;
    case "multi_select": return <span>{value.optionIds.join(", ") || "—"}</span>;
    case "attachment": return <span>{value.attachmentIds.length} attachment{value.attachmentIds.length === 1 ? "" : "s"}</span>;
  }
}

function FilterMenu({
  keyId,
  keyDef,
  filter,
  onApply,
  onClear,
}: {
  keyId: string;
  keyDef: TemplateKeyDraft;
  filter: CompareViewFilter | undefined;
  onApply: (filter: CompareViewFilter) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(filter?.kind === "contains" ? filter.text : "");
  const [min, setMin] = useState(filter?.kind === "min" ? String(filter.number) : "");
  const [max, setMax] = useState(filter?.kind === "max" ? String(filter.number) : "");
  const [present, setPresent] = useState(filter?.kind === "present" ? filter.present : null);
  const [optionIds, setOptionIds] = useState<string[]>(
    filter?.kind === "options" ? filter.optionIds : [],
  );

  if (!open) {
    return (
      <button
        type="button"
        className="compare-filter-toggle"
        aria-label={`Filter ${keyId}`}
        onClick={() => setOpen(true)}
      >
        {filter ? "●" : "○"}
      </button>
    );
  }

  return (
    <span className="compare-filter-menu">
      <input
        aria-label={`Contains for ${keyId}`}
        placeholder="Contains…"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <input
        aria-label={`Min for ${keyId}`}
        placeholder="Min…"
        value={min}
        onChange={(event) => setMin(event.target.value)}
      />
      <input
        aria-label={`Max for ${keyId}`}
        placeholder="Max…"
        value={max}
        onChange={(event) => setMax(event.target.value)}
      />
      {keyDef.options.length > 0 ? (
        <span className="compare-filter-options" role="group" aria-label={`Options for ${keyId}`}>
          {keyDef.options
            .filter((option) => !option.archived)
            .map((option) => (
              <label key={option.id ?? `new-${option.position}`} className="compare-filter-option">
                <input
                  type="checkbox"
                  checked={option.id !== null && optionIds.includes(option.id)}
                  disabled={option.id === null}
                  onChange={() => {
                    if (option.id === null) return;
                    setOptionIds((current) => current.includes(option.id!)
                      ? current.filter((id) => id !== option.id)
                      : [...current, option.id!]);
                  }}
                />
                {option.label}
              </label>
            ))}
        </span>
      ) : null}
      <label className="compare-filter-option">
        <input
          type="checkbox"
          checked={present === true}
          onChange={(event) => setPresent(event.target.checked ? true : null)}
        />
        Present only
      </label>
      <label className="compare-filter-option">
        <input
          type="checkbox"
          checked={present === false}
          onChange={(event) => setPresent(event.target.checked ? false : null)}
        />
        Missing only
      </label>
      <button
        type="button"
        className="btn ghost small"
        onClick={() => {
          const next: CompareViewFilter | null =
            present !== null
              ? { kind: "present", present }
              : optionIds.length > 0
                ? { kind: "options", optionIds }
                : text
              ? { kind: "contains", text }
              : min
                ? { kind: "min", number: Number(min) }
                : max
                  ? { kind: "max", number: Number(max) }
                  : null;
          if (next) onApply(next);
          else onClear();
          setOpen(false);
        }}
      >
        Apply
      </button>
      <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </span>
  );
}
```

Note: the `searchParams` prop is optional; the server page passes the parsed state instead (see Task 5), so the component does not need `useSearchParams`. If you prefer the house pattern, pass `initialState` only and drop the unused `searchParams` prop.

- [ ] **Step 3: Add the Compare CSS**

Append to `app/template-manager.css`:

```css
.template-compare { min-width: 0; }
.compare-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
  margin-bottom: 12px;
}
.compare-toolbar label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--ink-soft);
}
.compare-scroll {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 10px;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}
.compare-scroll:focus-visible { outline: var(--focus-ring); }
.compare-table { border-collapse: collapse; min-width: 100%; }
.compare-table th,
.compare-table td {
  border-bottom: 1px solid var(--line-soft);
  padding: 8px 10px;
  text-align: left;
  white-space: nowrap;
}
.compare-table thead th {
  position: sticky;
  top: 0;
  background: var(--surface);
  z-index: 1;
}
.compare-table thead tr:first-child th { top: 0; }
.compare-table thead tr:nth-child(2) th { top: 34px; }
.compare-group {
  background: var(--field-soft);
  color: var(--field-accent);
  font-weight: 600;
  text-align: center;
}
.compare-key-head { position: relative; min-width: 120px; }
.compare-key-head button {
  border: 0;
  background: transparent;
  font-weight: 600;
  color: var(--ink);
  cursor: pointer;
  padding: 0;
}
.compare-filter-toggle { border: 0; background: transparent; cursor: pointer; }
.compare-filter-menu {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow-3);
  padding: 8px;
}
.compare-filter-menu input { width: 140px; }
.compare-filter-options {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.compare-filter-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.compare-baseline-row td { background: var(--accent-subtle); }
.compare-baseline-row td:first-child::before { content: "◎ "; }
.compare-baseline-note { color: var(--accent-foreground); font-size: 13px; }
.compare-cell-different { background: var(--warn-soft); }
.compare-delta {
  margin-left: 8px;
  font-size: 12px;
  color: var(--warn);
  font-variant-numeric: tabular-nums;
}
.compare-missing { color: var(--text-tertiary); }
.compare-corner { text-align: left; }
```

- [ ] **Step 4: Run the component test and commit**

Run:

```bash
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx vitest run components/experiments/__tests__/TemplateExperimentCompare.test.tsx
PATH=/tmp/node-v24.18.0-linux-arm64/bin:$PATH npx tsc --noEmit 2>&1 | rg -v "Analytics.test|Board.test|ExperimentCompare.test.tsx\(302|ExperimentsDatabase.test|OwnerPicker.test" | rg -v "missing the following properties from type 'Task'" | head -10
git add components/experiments app/template-manager.css
git commit -m "feat: add template compare table"
```

Expected: PASS; no new type errors; commit succeeds.

---

### Task 5: Route the new Compare page and verify end to end

**Files:**
- Modify: `app/experiments/compare/page.tsx`

- [ ] **Step 1: Route the page**

Replace `app/experiments/compare/page.tsx` with:

```tsx
import TemplateExperimentCompare from "@/components/experiments/TemplateExperimentCompare";
import { parseCompareSearchParams } from "@/lib/templates/compare-url";
import { loadTemplateDraft } from "@/lib/templates/repository";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{
    template?: string | string[];
    baseline?: string | string[];
    archived?: string | string[];
    sort?: string | string[];
    filter?: string | string[];
    columns?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const templateId = Array.isArray(params.template)
    ? params.template[0]
    : params.template;
  let activeKeys: string[] = [];
  if (templateId) {
    const draft = await loadTemplateDraft(templateId);
    activeKeys = draft?.fields.flatMap((field) => field.keys)
      .map((key) => key.id!)
      .filter((id): id is string => id !== null) ?? [];
  }
  const initialState = parseCompareSearchParams(params, activeKeys);
  return <TemplateExperimentCompare initialState={initialState} />;
}
```

- [ ] **Step 2: Cross-check the spec**

Re-read `docs/superpowers/specs/2026-07-30-experiment-template-workspace-design.md` sections "Compare", "Sorting and filtering", and "Baseline difference" and confirm:

- One Template selects its non-archived Experiments; archived rows appear only through Include archived; the table never mixes Template IDs and an unavailable/mixed URL explains why (empty state + Template picker).
- Fixed sticky columns: Experiment ID, Name, Task, Owner, Status, and Archive state when archived rows are included.
- Two-level header: Field Label spans its active Keys with the stable color; each Key is independently sortable and filterable; Template order preserved by default; columns can be hidden/reordered without changing the Template.
- Column selection, filters, sorting, Template ID, Baseline ID, and Include Archived are encoded in the URL.
- Type-aware behavior: Number sorts numerically with min/max filters; Date/time chronological with ranges; Boolean/Select exact options; Multi select contains-any/all; text/URL contains; Attachment present/missing. No good/bad inference.
- Missing displays `—`; Baseline row is pinned and labeled; every other cell whose normalized value differs is highlighted; neutral numeric Delta when both are Numbers; missing==missing equal; missing vs present different; Multi select as sets; Attachments by active identity.
- Interactive sorting/filtering is client-side after one authoritative fetch.

Fix any gap found before continuing.

- [ ] **Step 3: Run the full verification**

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

Expected: all DB suites PASS; all Vitest suites PASS; no new type errors; build succeeds with the Compare route.

- [ ] **Step 4: Verify branch state and hand off**

Run:

```bash
git status --short --branch
git log --oneline -6
git add app/experiments/compare/page.tsx
git commit -m "feat: route template compare page"
```

Expected: clean tree; the last commits are the five Phase 4 commits. Report to the user:

- Phase 4 complete on `feat/experiment-template-workspace`.
- Phase 5 (additive Agent API compatibility and legacy dual-write) is the next plan to write and execute; the legacy Compare component remains in the tree until Phase 6 cleanup.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-31-experiment-template-workspace-compare.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
