import { describe, expect, it } from "vitest";
import type { Experiment } from "@/lib/types";
import {
  buildDuplicateInsert,
  canTransition,
  formatExperimentId,
  validateBaseline,
  validateForStatus,
} from "@/lib/experiments/policy";

const completeContext: Experiment = {
  id: "00000000-0000-4000-8000-000000000001",
  experiment_no: 12,
  task_id: "00000000-0000-4000-8000-000000000010",
  owner_id: "00000000-0000-4000-8000-000000000020",
  name: "Ascend guardrail run",
  status: "planned",
  template_id: null,
  archived_at: null,
  core_revision: 1,
  position: 2,
  started_at: "2026-07-24T10:00:00.000Z",
  completed_at: null,
  created_at: "2026-07-24T09:00:00.000Z",
  updated_at: "2026-07-24T11:00:00.000Z",
};

describe("experiment lifecycle", () => {
  it("allows only the approved status graph", () => {
    expect(canTransition("planned", "running")).toBe(true);
    expect(canTransition("planned", "completed")).toBe(false);
    expect(canTransition("running", "blocked")).toBe(true);
    expect(canTransition("analyzing", "completed")).toBe(true);
    expect(canTransition("blocked", "analyzing")).toBe(true);
    expect(canTransition("cancelled", "planned")).toBe(true);
    expect(canTransition("completed", "analyzing")).toBe(true);
    expect(canTransition("completed", "running")).toBe(false);
  });

  it("does not gate Status on legacy content after cutover", () => {
    const invalid = {
      ...completeContext,
      owner_id: null,
    };
    expect(validateForStatus(invalid, "running")).toEqual([]);
  });

  it("allows analyzing and completion without legacy content", () => {
    const invalid = {
      ...completeContext,
      status: "running" as const,
      metrics: {},
      result_summary: "",
    };
    expect(validateForStatus(invalid, "analyzing")).toEqual([]);
    const bare = {
      ...completeContext,
      status: "analyzing" as const,
      metrics: {},
      result_summary: "",
      decision_outcome: null,
    };
    expect(validateForStatus(bare, "completed")).toEqual([]);
  });

  it("rejects an invalid Status transition", () => {
    const planned = {
      ...completeContext,
      status: "planned" as const,
    };
    expect(validateForStatus(planned, "completed").map((issue) => issue.field))
      .toEqual(["status"]);
  });

  it("rejects self baseline and formats stable display IDs", () => {
    expect(validateBaseline(completeContext.id, completeContext.id)).toEqual([
      { field: "baseline_experiment_id", message: "An experiment cannot use itself as Baseline." },
    ]);
    expect(formatExperimentId(12)).toBe("EXP-0012");
  });
});

describe("duplicate policy", () => {
  it("copies context and clears evidence, decision, notes, attachments, and times", () => {
    const duplicate = buildDuplicateInsert(completeContext, {
      name: "Ascend guardrail run v2",
      ownerId: "00000000-0000-4000-8000-000000000021",
      position: 3,
    });
    expect(duplicate).toEqual({
      task_id: completeContext.task_id,
      template_id: completeContext.template_id,
      owner_id: "00000000-0000-4000-8000-000000000021",
      name: "Ascend guardrail run v2",
      status: "planned",
      position: 3,
    });
  });

  it("copies the source Template into a duplicate", () => {
    const insert = buildDuplicateInsert(
      { ...completeContext, template_id: "30000000-0000-4000-8000-000000000001" },
      { name: "Copy", ownerId: completeContext.owner_id!, position: 1 },
    );
    expect(insert.template_id).toBe("30000000-0000-4000-8000-000000000001");
  });
});
