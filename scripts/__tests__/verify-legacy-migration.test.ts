import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const script = readFileSync(
  resolve(import.meta.dirname, "../verify-legacy-migration.mjs"),
  "utf8",
);

describe("legacy migration verification script", () => {
  it("checks the Imported Template and migration invariants", () => {
    expect(script).toContain("11111111-1111-4111-8111-111111111111");
    expect(script).toContain("Imported legacy experiments");
    expect(script).toContain("experiment_versions");
    expect(script).toContain("template_id is null");
    expect(script).toContain("experiments_completed_decision_check");
  });
});
