import { describe, expect, it } from "vitest";
import type { Experiment } from "@/lib/types";
import {
  editableExperimentPatch,
  reconcileRealtime,
} from "@/lib/experiments/draft";

const draft = {
  id: "00000000-0000-4000-8000-000000000001",
  experiment_no: 1,
  task_id: "00000000-0000-4000-8000-000000000010",
  owner_id: "00000000-0000-4000-8000-000000000020",
  name: "local name",
  status: "planned",
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
  decision_outcome: null,
  decision_notes: "",
  notes: "",
  position: 0,
  started_at: null,
  completed_at: null,
  created_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T00:00:00.000Z",
} satisfies Experiment;

describe("realtime draft reconciliation", () => {
  it("replaces a clean draft with the remote row", () => {
    const remote = {
      ...draft,
      name: "remote name",
      updated_at: "2026-07-24T00:01:00.000Z",
    };
    expect(reconcileRealtime(draft, remote, false, false)).toEqual({
      kind: "replace",
      draft: remote,
      remote,
    });
  });

  it("preserves a dirty draft and exposes a conflict", () => {
    const remote = {
      ...draft,
      name: "remote name",
      updated_at: "2026-07-24T00:01:00.000Z",
    };
    expect(reconcileRealtime(draft, remote, true, false)).toEqual({
      kind: "conflict",
      draft,
      remote,
    });
  });

  it("ignores a realtime echo while the local save is in flight", () => {
    const remote = {
      ...draft,
      name: "remote name",
      updated_at: "2026-07-24T00:01:00.000Z",
    };
    expect(reconcileRealtime(draft, remote, true, true)).toEqual({
      kind: "ignore",
      draft,
      remote,
    });
  });

  it("removes immutable and server-maintained fields from an update patch", () => {
    expect(editableExperimentPatch(draft)).not.toHaveProperty("id");
    expect(editableExperimentPatch(draft)).not.toHaveProperty("experiment_no");
    expect(editableExperimentPatch(draft)).not.toHaveProperty("task_id");
    expect(editableExperimentPatch(draft)).not.toHaveProperty("updated_at");
    expect(editableExperimentPatch(draft).name).toBe("local name");
  });
});
