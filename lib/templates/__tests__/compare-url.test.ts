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
