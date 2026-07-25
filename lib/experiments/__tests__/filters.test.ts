import { describe, expect, it } from "vitest";
import type { ExperimentListRow } from "@/lib/types";
import {
  applyExperimentFilters,
  EMPTY_EXPERIMENT_FILTERS,
} from "@/lib/experiments/filters";

function row(
  id: string,
  status: ExperimentListRow["status"],
  decision: ExperimentListRow["decision_outcome"],
  completedAt: string | null,
): ExperimentListRow {
  return {
    id,
    experiment_no: Number(id.slice(-1)),
    task_id: "00000000-0000-4000-8000-000000000010",
    owner_id: "00000000-0000-4000-8000-000000000020",
    name: `run-${id.slice(-1)}`,
    status,
    baseline_experiment_id: null,
    data_spec: { datasets: [] },
    object_spec: {
      model: "",
      harness: "",
      parent_harness: "",
      prompt: "",
      prompt_change: "",
      skills: [],
      tools: [],
    },
    environment_spec: {
      platform: "",
      server: "",
      devices: [],
      hardware: "",
      evaluator: "",
      revision: "",
      precision_policy: "",
    },
    config: {},
    metrics: {},
    featured_metric_keys: [],
    result_summary: "",
    decision_outcome: decision,
    decision_notes: "",
    notes: "",
    position: 0,
    started_at: null,
    completed_at: completedAt,
    created_at: "2026-07-20T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
    task: { id: "00000000-0000-4000-8000-000000000010", title: "Optimize conv2d" },
    owner: {
      id: "00000000-0000-4000-8000-000000000020",
      name: "Bruce",
      initials: "BX",
      position: 0,
      created_at: "2026-07-01T00:00:00.000Z",
    },
  };
}

const rows = [
  row("00000000-0000-4000-8000-000000000001", "running", null, null),
  row("00000000-0000-4000-8000-000000000002", "blocked", null, null),
  row("00000000-0000-4000-8000-000000000003", "analyzing", null, null),
  row("00000000-0000-4000-8000-000000000004", "completed", "accepted", "2026-07-20T00:00:00.000Z"),
  row("00000000-0000-4000-8000-000000000005", "completed", "rejected", "2026-06-01T00:00:00.000Z"),
];

describe("experiment filters", () => {
  it("implements the four named saved views", () => {
    const now = new Date("2026-07-24T00:00:00.000Z").getTime();
    expect(applyExperimentFilters(rows, { ...EMPTY_EXPERIMENT_FILTERS, savedView: "running" }, now))
      .toHaveLength(1);
    expect(applyExperimentFilters(rows, { ...EMPTY_EXPERIMENT_FILTERS, savedView: "blocked" }, now))
      .toHaveLength(1);
    expect(applyExperimentFilters(rows, { ...EMPTY_EXPERIMENT_FILTERS, savedView: "needs_decision" }, now)[0].status)
      .toBe("analyzing");
    expect(applyExperimentFilters(rows, { ...EMPTY_EXPERIMENT_FILTERS, savedView: "recently_completed" }, now)
      .map((item) => item.id)).toEqual(["00000000-0000-4000-8000-000000000004"]);
  });

  it("combines owner, task, status, decision, and search filters", () => {
    expect(applyExperimentFilters(rows, {
      savedView: "all",
      ownerId: "00000000-0000-4000-8000-000000000020",
      taskId: "00000000-0000-4000-8000-000000000010",
      status: "completed",
      decision: "accepted",
      search: "conv2d",
    })).toHaveLength(1);
  });
});
