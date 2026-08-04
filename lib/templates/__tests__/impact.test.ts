import { describe, expect, it } from "vitest";
import { describeTemplateImpact } from "@/lib/templates/impact";
import type { TemplateDraft } from "@/lib/templates/repository";

function draft(overrides: Partial<TemplateDraft> = {}): TemplateDraft {
  return {
    templateId: "30000000-0000-4000-8000-000000000001",
    name: "Benchmark",
    description: "",
    schemaRevision: 3,
    fields: [],
    ...overrides,
  };
}

describe("describeTemplateImpact", () => {
  it("describes a newly added Key for the existing Experiment count", () => {
    const current = draft({
      fields: [{
        id: "f1", label: "Metrics", colorToken: "blue", position: 1, archived: false,
        keys: [],
      }],
    });
    const next = draft({
      fields: [{
        id: "f1", label: "Metrics", colorToken: "blue", position: 1, archived: false,
        keys: [{
          id: null, key: "pass@1", valueType: "number", required: false,
          position: 1, archived: false, options: [], valueCount: 0,
        }],
      }],
    });
    expect(describeTemplateImpact(current, next, 24)).toEqual([
      "Adding pass@1 creates an empty Key for 24 existing Experiments.",
    ]);
  });

  it("describes archiving a Key as hiding it", () => {
    const current = draft({
      fields: [{
        id: "f1", label: "Metrics", colorToken: "blue", position: 1, archived: false,
        keys: [{
          id: "k1", key: "pass@1", valueType: "number", required: false,
          position: 1, archived: false, options: [], valueCount: 3,
        }],
      }],
    });
    const next = draft({
      fields: [{
        id: "f1", label: "Metrics", colorToken: "blue", position: 1, archived: false,
        keys: [{
          id: "k1", key: "pass@1", valueType: "number", required: false,
          position: 1, archived: true, options: [], valueCount: 3,
        }],
      }],
    });
    expect(describeTemplateImpact(current, next, 24)).toEqual([
      "Archiving pass@1 hides it from 24 existing Experiments.",
    ]);
  });

  it("reports an empty array when nothing changed", () => {
    const same = draft();
    expect(describeTemplateImpact(same, same, 4)).toEqual([]);
  });
});
