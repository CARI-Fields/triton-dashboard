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
  baseline_experiment_id: null,
  data_spec: {
    datasets: [{
      role: "evaluation",
      name: "dr-kernel-rl",
      split: "tier1-gen1",
      revision: "seed20260717-gen1",
      task_count: 20,
      samples_per_task: 1,
    }],
  },
  object_spec: {
    model: "Qwen3.6-35B-A3B",
    harness: "cand_0000",
    parent_harness: "seed",
    prompt: "prompts/ascend.md",
    prompt_change: "+6 lines of Ascend guardrails",
    skills: ["kernel-designer"],
    tools: ["verify.py"],
  },
  environment_spec: {
    platform: "npu",
    server: "localhost.localdomain",
    devices: ["npu:14", "npu:15"],
    hardware: "Ascend910_9372",
    evaluator: "triton-evaluation",
    revision: "r18",
    precision_policy: "fp32 reference",
  },
  config: { max_turns: 18, temperature: 0.1 },
  metrics: { "pass@1": 0.2, tokens: 671552 },
  featured_metric_keys: ["pass@1"],
  result_summary: "4 of 20 tasks passed.",
  decision_outcome: "accepted",
  decision_notes: "Keep the guardrail.",
  notes: "Compiler failures remain.",
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

  it("requires owner and runnable context before running", () => {
    const invalid = {
      ...completeContext,
      owner_id: null,
      data_spec: { datasets: [] },
      object_spec: { ...completeContext.object_spec, model: "" },
      environment_spec: { ...completeContext.environment_spec, server: "", devices: [] },
      config: {},
    };
    expect(validateForStatus(invalid, "running").map((issue) => issue.field)).toEqual([
      "owner_id",
      "data_spec.datasets",
      "object_spec.model",
      "environment_spec.server_or_devices",
      "config",
    ]);
  });

  it("requires a result before analyzing", () => {
    const invalid = {
      ...completeContext,
      status: "running" as const,
      metrics: {},
      result_summary: "",
    };
    expect(validateForStatus(invalid, "analyzing")).toEqual([
      { field: "result", message: "Add a numeric metric or Result Summary before analyzing." },
    ]);
  });

  it("requires runnable context, result, and a decision before completion", () => {
    const invalid = {
      ...completeContext,
      status: "analyzing" as const,
      metrics: {},
      result_summary: "",
      decision_outcome: null,
    };
    expect(validateForStatus(invalid, "completed").map((issue) => issue.field)).toEqual([
      "result",
      "decision_outcome",
    ]);
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
      owner_id: "00000000-0000-4000-8000-000000000021",
      name: "Ascend guardrail run v2",
      status: "planned",
      baseline_experiment_id: completeContext.id,
      data_spec: completeContext.data_spec,
      object_spec: completeContext.object_spec,
      environment_spec: completeContext.environment_spec,
      config: completeContext.config,
      metrics: {},
      featured_metric_keys: [],
      result_summary: "",
      decision_outcome: null,
      decision_notes: "",
      notes: "",
      position: 3,
      started_at: null,
      completed_at: null,
    });
    expect(duplicate.data_spec).not.toBe(completeContext.data_spec);
    expect(duplicate.config).not.toBe(completeContext.config);
  });
});
