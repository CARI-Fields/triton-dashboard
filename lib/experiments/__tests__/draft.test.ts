import { describe, expect, it } from "vitest";
import type { Experiment } from "@/lib/types";
import {
  clearSessionExperimentDraft,
  draftStorageKey,
  editableExperimentPatch,
  hasEditableExperimentChanges,
  readSessionExperimentDraft,
  reconcileRealtime,
  writeSessionExperimentDraft,
} from "@/lib/experiments/draft";
import { isMetrics } from "@/lib/experiments/schema";

const draft = {
  id: "00000000-0000-4000-8000-000000000001",
  experiment_no: 1,
  task_id: "00000000-0000-4000-8000-000000000010",
  owner_id: "00000000-0000-4000-8000-000000000020",
  name: "local name",
  status: "planned",
  baseline_experiment_id: null,
  template_id: null,
  archived_at: null,
  core_revision: 1,
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

describe("session Experiment drafts", () => {
  function storage() {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => {
        values.delete(key);
      },
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      values,
    };
  }

  it("restores a valid draft only against the revision it was based on", () => {
    const session = storage();
    const source = { ...draft };
    const local = { ...source, name: "  local exact name  ", notes: "draft" };
    writeSessionExperimentDraft(session, source, local);

    expect(readSessionExperimentDraft(session, source)).toEqual({
      kind: "restore",
      draft: local,
      sourceRevision: source.updated_at,
    });
    expect(draftStorageKey(source.id)).toContain(source.id);
  });

  it.each([Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects a non-finite metric before persistence",
    (metric) => {
      expect(isMetrics({ latency_ms: metric })).toBe(false);
    },
  );

  it("rejects a draft containing an unknown platform", () => {
    const session = storage();
    const source = {
      ...draft,
      id: "00000000-0000-4000-8000-000000000082",
    };
    const raw = JSON.stringify({
      version: 1,
      experimentId: source.id,
      sourceRevision: source.updated_at,
      patch: {
        ...editableExperimentPatch(source),
        environment_spec: {
          ...source.environment_spec,
          platform: "tpu",
        },
      },
    });
    session.setItem(draftStorageKey(source.id), raw);

    expect(readSessionExperimentDraft(session, source)).toEqual({ kind: "none" });
    expect(session.getItem(draftStorageKey(source.id))).toBeNull();
  });

  it("rejects invalid Dataset items in a draft", () => {
    const session = storage();
    const source = {
      ...draft,
      id: "00000000-0000-4000-8000-000000000083",
    };
    const raw = JSON.stringify({
      version: 1,
      experimentId: source.id,
      sourceRevision: source.updated_at,
      patch: {
        ...editableExperimentPatch(source),
        data_spec: {
          datasets: [{
            role: "validation",
            name: "KernelBench",
            split: "test",
            revision: "v1",
            task_count: 100,
            samples_per_task: 1,
          }],
        },
      },
    });
    session.setItem(draftStorageKey(source.id), raw);

    expect(readSessionExperimentDraft(session, source)).toEqual({ kind: "none" });
    expect(session.getItem(draftStorageKey(source.id))).toBeNull();
  });

  it("preserves a valid draft as a conflict when the remote revision advanced", () => {
    const session = storage();
    const source = { ...draft };
    writeSessionExperimentDraft(session, source, {
      ...source,
      name: "Local draft",
    });
    const remote = {
      ...source,
      name: "Remote revision",
      updated_at: "2026-07-24T02:00:00.000Z",
    };

    expect(readSessionExperimentDraft(session, remote)).toEqual({
      kind: "conflict",
      draft: { ...remote, name: "Local draft" },
      sourceRevision: source.updated_at,
    });
  });

  it("rejects and clears malformed or cross-Experiment stored data", () => {
    const session = storage();
    const source = { ...draft };
    session.setItem(draftStorageKey(source.id), JSON.stringify({
      version: 1,
      experimentId: "00000000-0000-4000-8000-000000000099",
      sourceRevision: source.updated_at,
      patch: { name: 42 },
    }));

    expect(readSessionExperimentDraft(session, source)).toEqual({ kind: "none" });
    expect(session.getItem(draftStorageKey(source.id))).toBeNull();
  });

  it("clears only the requested Experiment draft", () => {
    const session = storage();
    const first = { ...draft };
    const second = {
      ...draft,
      id: "00000000-0000-4000-8000-000000000002",
    };
    writeSessionExperimentDraft(session, first, { ...first, name: "First" });
    writeSessionExperimentDraft(session, second, { ...second, name: "Second" });

    clearSessionExperimentDraft(session, first.id);

    expect(readSessionExperimentDraft(session, first)).toEqual({ kind: "none" });
    expect(readSessionExperimentDraft(session, second).kind).toBe("restore");
  });

  it("recognizes when an editor reverts to the exact saved draft", () => {
    expect(hasEditableExperimentChanges(draft, { ...draft, notes: "typing" }))
      .toBe(true);
    expect(hasEditableExperimentChanges(draft, structuredClone(draft)))
      .toBe(false);
  });

  it("keeps an in-memory navigation fallback when sessionStorage is unavailable", () => {
    const source = {
      ...draft,
      id: "00000000-0000-4000-8000-000000000077",
    };
    const unavailable = {
      getItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    writeSessionExperimentDraft(unavailable, source, {
      ...source,
      name: "Memory fallback",
    });

    expect(readSessionExperimentDraft(unavailable, source)).toEqual({
      kind: "restore",
      draft: { ...source, name: "Memory fallback" },
      sourceRevision: source.updated_at,
    });
    clearSessionExperimentDraft(unavailable, source.id);
  });
});
