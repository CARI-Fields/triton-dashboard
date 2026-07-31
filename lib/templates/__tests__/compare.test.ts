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
