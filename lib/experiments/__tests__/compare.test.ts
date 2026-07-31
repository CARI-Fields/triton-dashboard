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
    template_id: null,
    archived_at: null,
    core_revision: 1,
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
  it("derives only the recorded metric key without synthesizing Result fields", () => {
    const baseline = experiment(
      "00000000-0000-4000-8000-000000000001",
      0.1,
      "npu:0",
    );
    const current = experiment(
      "00000000-0000-4000-8000-000000000002",
      0.2,
      "npu:1",
    );

    const keys = buildCompareColumns(
      [
        { ...baseline, metrics: { "pass@1": 0.42 }, result_summary: "" },
        { ...current, metrics: { "pass@1": 0.48 }, result_summary: "" },
      ],
      { groups: ["result"], baselineId: null, diffOnly: false },
    ).map((column) => column.key);

    expect(keys).toEqual(["result.metrics.pass@1"]);
  });

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
    const delta = columns.find((column) => (
      column.key === "result.metrics.pass@1" && column.kind === "delta"
    ));
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
      columns.find((column) => (
        column.key === "result.metrics.pass@1" && column.kind === "delta"
      ))?.values[current.id],
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
      columns.find((column) => (
        column.key === "result.metrics.pass@1" && column.kind === "delta"
      ))?.values[current.id],
    ).toBeNull();
  });

  it("keeps metric value and Delta identities distinct for reserved-looking keys", () => {
    const baseline = {
      ...experiment("00000000-0000-4000-8000-000000000001", 0.1, "npu:0"),
      metrics: { foo: 1, "foo.delta": 10 },
    };
    const current = {
      ...experiment("00000000-0000-4000-8000-000000000002", 0.2, "npu:1"),
      metrics: { foo: 3, "foo.delta": 16 },
    };
    const columns = buildCompareColumns([baseline, current], {
      groups: ["result"],
      baselineId: baseline.id,
      diffOnly: false,
    }).filter((column) => column.key.startsWith("result.metrics.foo"));

    expect(columns.map(({ identity, kind, key }) => ({ identity, kind, key })))
      .toEqual([
        {
          identity: { fieldId: '["result","metrics","foo"]', kind: "value" },
          kind: "value",
          key: "result.metrics.foo",
        },
        {
          identity: { fieldId: '["result","metrics","foo"]', kind: "delta" },
          kind: "delta",
          key: "result.metrics.foo",
        },
        {
          identity: {
            fieldId: '["result","metrics","foo.delta"]',
            kind: "value",
          },
          kind: "value",
          key: "result.metrics.foo.delta",
        },
        {
          identity: {
            fieldId: '["result","metrics","foo.delta"]',
            kind: "delta",
          },
          kind: "delta",
          key: "result.metrics.foo.delta",
        },
      ]);
    expect(new Set(columns.map((column) => JSON.stringify(column.identity))).size)
      .toBe(4);
    expect(columns.map((column) => column.values[current.id])).toEqual([
      3,
      2,
      16,
      6,
    ]);
  });

  it("keeps dotted and bracketed object keys distinct from nested paths", () => {
    const candidate = {
      ...experiment("00000000-0000-4000-8000-000000000001", 0.1, "npu:0"),
      config: {
        "a.b": 1,
        a: { b: 2 },
        "items[0]": "literal",
        items: ["array"],
      } as unknown as Experiment["config"],
    };
    const columns = buildCompareColumns([candidate], {
      groups: ["config"],
      baselineId: null,
      diffOnly: false,
    });

    expect(columns).toHaveLength(4);
    expect(new Set(columns.map((column) => column.identity.fieldId)).size).toBe(4);
    expect(Object.fromEntries(columns.map((column) => [
      column.identity.fieldId,
      column.values[candidate.id],
    ]))).toEqual({
      '["config","a.b"]': 1,
      '["config","a","b"]': 2,
      '["config","items[0]"]': "literal",
      '["config","items"]': "array",
    });
  });

  it("preserves collision-free field ids in context differences", () => {
    const baseline = {
      ...experiment("00000000-0000-4000-8000-000000000001", 0.1, "npu:0"),
      config: {
        "a.b": 1,
        a: { b: 2 },
        "items[0]": "literal baseline",
        items: ["array baseline"],
      } as unknown as Experiment["config"],
    };
    const current = {
      ...experiment("00000000-0000-4000-8000-000000000002", 0.2, "npu:0"),
      config: {
        "a.b": 3,
        a: { b: 4 },
        "items[0]": "literal current",
        items: ["array current"],
      } as unknown as Experiment["config"],
    };

    expect(compareContexts(current, baseline).map((difference) => ({
      fieldId: difference.fieldId,
      key: difference.key,
    }))).toEqual([
      { fieldId: '["config","a.b"]', key: "config.a.b" },
      { fieldId: '["config","a","b"]', key: "config.a.b" },
      { fieldId: '["config","items"]', key: "config.items" },
      { fieldId: '["config","items[0]"]', key: "config.items[0]" },
    ]);
  });

  it("uses null when finite operands overflow during Delta subtraction", () => {
    const baseline = {
      ...experiment("00000000-0000-4000-8000-000000000001", 0.1, "npu:0"),
      metrics: { huge: -Number.MAX_VALUE },
    };
    const current = {
      ...experiment("00000000-0000-4000-8000-000000000002", 0.2, "npu:1"),
      metrics: { huge: Number.MAX_VALUE },
    };
    const columns = buildCompareColumns([baseline, current], {
      groups: ["result"],
      baselineId: baseline.id,
      diffOnly: false,
    });

    expect(columns.find((column) => (
      column.key === "result.metrics.huge" && column.kind === "delta"
    ))?.values[current.id]).toBeNull();
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
