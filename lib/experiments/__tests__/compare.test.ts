import { describe, expect, it } from "vitest";
import type { Experiment } from "@/lib/types";
import {
  buildCompareColumns,
  compareContexts,
  orderWithBaseline,
} from "@/lib/experiments/compare";

function experiment(id: string, passAt1: number, device: string): Experiment {
  return {
    id,
    experiment_no: Number(id.slice(-2)),
    task_id: "00000000-0000-4000-8000-000000000010",
    owner_id: "00000000-0000-4000-8000-000000000020",
    name: `run-${id.slice(-2)}`,
    status: "analyzing",
    baseline_experiment_id: null,
    data_spec: {
      datasets: [{
        role: "evaluation",
        name: "dr-kernel-rl",
        split: "tier1",
        revision: "r1",
        task_count: 20,
        samples_per_task: 1,
      }],
    },
    object_spec: {
      model: "Qwen",
      harness: "candidate",
      parent_harness: "seed",
      prompt: "prompt.md",
      prompt_change: "",
      skills: ["kernel-designer"],
      tools: ["verify.py"],
    },
    environment_spec: {
      platform: "npu",
      server: "worker-1",
      devices: [device],
      hardware: "Ascend910",
      evaluator: "triton-evaluation",
      revision: "r18",
      precision_policy: "fp32",
    },
    config: { temperature: 0.1, max_turns: 18 },
    metrics: { "pass@1": passAt1 },
    featured_metric_keys: ["pass@1"],
    result_summary: "",
    decision_outcome: null,
    decision_notes: "",
    notes: "",
    position: 0,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-24T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
  };
}

describe("comparison derivation", () => {
  it("does not produce Delta columns without a Baseline", () => {
    const columns = buildCompareColumns(
      [experiment("00000000-0000-4000-8000-000000000001", 0.1, "npu:0")],
      { groups: ["result"], baselineId: null, diffOnly: false },
    );
    expect(columns.length).toBeGreaterThan(0);
    expect(columns.every((column) => column.kind === "value")).toBe(true);
  });

  it("aligns numeric metrics and derives current minus baseline", () => {
    const baseline = experiment("00000000-0000-4000-8000-000000000001", 0.1, "npu:0");
    const current = experiment("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");
    const columns = buildCompareColumns([current, baseline], {
      groups: ["result"],
      baselineId: baseline.id,
      diffOnly: false,
    });
    const delta = columns.find((column) => column.key === "result.metrics.pass@1.delta");
    expect(delta?.values[current.id]).toBeCloseTo(0.15);
    expect(delta?.values[baseline.id]).toBe(0);
  });

  it("shows a missing metric as null instead of fabricating a Delta", () => {
    const baseline = experiment("00000000-0000-4000-8000-000000000001", 0.1, "npu:0");
    const current = { ...experiment("00000000-0000-4000-8000-000000000002", 0.2, "npu:1"), metrics: {} };
    const columns = buildCompareColumns([baseline, current], {
      groups: ["result"],
      baselineId: baseline.id,
      diffOnly: false,
    });
    expect(
      columns.find((column) => column.key === "result.metrics.pass@1.delta")?.values[current.id],
    ).toBeNull();
  });

  it.each([
    [Number.NaN, 0.1],
    [Number.POSITIVE_INFINITY, 0.1],
    [0.2, Number.NaN],
    [0.2, Number.NEGATIVE_INFINITY],
  ])("uses a null Delta when a metric is non-finite (%s, %s)", (currentMetric, baselineMetric) => {
    const baseline = {
      ...experiment("00000000-0000-4000-8000-000000000001", 0.1, "npu:0"),
      metrics: { "pass@1": baselineMetric },
    };
    const current = {
      ...experiment("00000000-0000-4000-8000-000000000002", 0.2, "npu:1"),
      metrics: { "pass@1": currentMetric },
    };
    const columns = buildCompareColumns([baseline, current], {
      groups: ["result"],
      baselineId: baseline.id,
      diffOnly: false,
    });
    expect(
      columns.find((column) => column.key === "result.metrics.pass@1.delta")?.values[current.id],
    ).toBeNull();
  });

  it("returns only changed context and removes all-equal fields in Diff only mode", () => {
    const baseline = experiment("00000000-0000-4000-8000-000000000001", 0.1, "npu:0");
    const current = experiment("00000000-0000-4000-8000-000000000002", 0.2, "npu:1");
    expect(compareContexts(current, baseline).map((difference) => difference.key)).toEqual([
      "environment.devices",
    ]);
    const columns = buildCompareColumns([baseline, current], {
      groups: ["data", "environment"],
      baselineId: baseline.id,
      diffOnly: true,
    });
    expect(columns.map((column) => column.key)).toEqual(["environment.devices"]);
  });

  it("pins the explicit Baseline and keeps all 20 selected experiments", () => {
    const experiments = Array.from({ length: 20 }, (_, index) =>
      experiment(
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        index / 100,
        `npu:${index}`,
      ),
    );
    const ordered = orderWithBaseline(experiments, experiments[13].id);
    expect(ordered).toHaveLength(20);
    expect(ordered[0].id).toBe(experiments[13].id);
  });
});
