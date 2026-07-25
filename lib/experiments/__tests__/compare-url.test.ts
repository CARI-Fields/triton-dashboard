import { describe, expect, it } from "vitest";
import {
  parseCompareSearchParams,
  serializeCompareSelection,
} from "@/lib/experiments/compare-url";

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const alphaFirst = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const alphaSecond = "ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbb2";

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

  it("serializes valid IDs once and pins an absent Baseline first", () => {
    const query = serializeCompareSelection({
      ids: [second, "invalid", second],
      baselineId: first,
    });
    const params = new URLSearchParams(query);
    expect(params.get("ids")).toBe(`${first},${second}`);
    expect(params.get("baseline")).toBe(first);
  });

  it("pins a later valid Baseline and omits an invalid Baseline", () => {
    const pinned = new URLSearchParams(serializeCompareSelection({
      ids: [second, first],
      baselineId: first,
    }));
    expect(pinned.get("ids")).toBe(`${first},${second}`);
    expect(pinned.get("baseline")).toBe(first);

    const invalid = new URLSearchParams(serializeCompareSelection({
      ids: ["invalid", second],
      baselineId: "invalid",
    }));
    expect(invalid.get("ids")).toBe(second);
    expect(invalid.has("baseline")).toBe(false);
  });

  it("normalizes UUID identity to lowercase and deduplicates case-insensitively", () => {
    expect(parseCompareSearchParams({
      ids: `${alphaSecond.toUpperCase()},${alphaSecond}`,
      baseline: alphaFirst.toUpperCase(),
    })).toEqual({
      ids: [alphaFirst, alphaSecond],
      baselineId: alphaFirst,
    });
  });

  it("serializes uppercase UUIDs as one canonical lowercase identity", () => {
    const params = new URLSearchParams(serializeCompareSelection({
      ids: [
        alphaSecond.toUpperCase(),
        alphaFirst.toUpperCase(),
        alphaSecond,
      ],
      baselineId: alphaFirst.toUpperCase(),
    }));

    expect(params.get("ids")).toBe(`${alphaFirst},${alphaSecond}`);
    expect(params.get("baseline")).toBe(alphaFirst);
  });
});
