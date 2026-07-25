import type { Experiment } from "@/lib/types";

export type EditableExperimentPatch = Pick<
  Experiment,
  | "owner_id"
  | "name"
  | "status"
  | "baseline_experiment_id"
  | "data_spec"
  | "object_spec"
  | "environment_spec"
  | "config"
  | "metrics"
  | "featured_metric_keys"
  | "result_summary"
  | "decision_outcome"
  | "decision_notes"
  | "notes"
>;

export type RealtimeResolution =
  | { kind: "replace"; draft: Experiment; remote: Experiment }
  | { kind: "conflict"; draft: Experiment; remote: Experiment }
  | { kind: "ignore"; draft: Experiment; remote: Experiment };

export function editableExperimentPatch(
  experiment: Experiment,
): EditableExperimentPatch {
  return {
    owner_id: experiment.owner_id,
    name: experiment.name.trim(),
    status: experiment.status,
    baseline_experiment_id: experiment.baseline_experiment_id,
    data_spec: structuredClone(experiment.data_spec),
    object_spec: structuredClone(experiment.object_spec),
    environment_spec: structuredClone(experiment.environment_spec),
    config: structuredClone(experiment.config),
    metrics: { ...experiment.metrics },
    featured_metric_keys: [...experiment.featured_metric_keys],
    result_summary: experiment.result_summary,
    decision_outcome: experiment.decision_outcome,
    decision_notes: experiment.decision_notes,
    notes: experiment.notes,
  };
}

export function reconcileRealtime(
  draft: Experiment,
  remote: Experiment,
  dirty: boolean,
  saving: boolean,
): RealtimeResolution {
  if (saving) return { kind: "ignore", draft, remote };
  if (dirty) return { kind: "conflict", draft, remote };
  return { kind: "replace", draft: remote, remote };
}
