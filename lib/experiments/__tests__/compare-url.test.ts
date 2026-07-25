import { describe, expect, it } from "vitest";
import {
  parseCompareSearchParams,
  serializeCompareSelection,
} from "@/lib/experiments/compare-url";

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";

describe("compare URL state", () => {
  it("deduplicates IDs, rejects invalid IDs, and includes the Baseline", () => {
    expect(parseCompareSearchParams({
      ids: `${second},invalid,${second}`,
      baseline: first,
    })).toEqual({
      ids: [first, second],
      baselineId: first,
    });
  });

  it("round trips a shareable query without an item cap", () => {
    const ids = Array.from(
      { length: 20 },
      (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );
    const query = serializeCompareSelection({ ids, baselineId: ids[4] });
    const params = new URLSearchParams(query);
    expect(parseCompareSearchParams({
      ids: params.get("ids") ?? undefined,
      baseline: params.get("baseline") ?? undefined,
    })).toEqual({ ids: [ids[4], ...ids.filter((id) => id !== ids[4])], baselineId: ids[4] });
  });

  it("omits Baseline when none is selected", () => {
    expect(serializeCompareSelection({ ids: [first, second], baselineId: null })).toBe(
      `ids=${encodeURIComponent(`${first},${second}`)}`,
    );
  });
});
