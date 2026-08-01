import type {
  DecisionOutcome,
  Experiment,
  ExperimentConfig,
  ExperimentStatus,
} from "@/lib/types";

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface DuplicateInput {
  name: string;
  ownerId: string;
  position: number;
}

export interface ExperimentInsert {
  task_id: string;
  template_id: string | null;
  owner_id: string;
  name: string;
  status: ExperimentStatus;
  baseline_experiment_id: string | null;
  data_spec: Experiment["data_spec"];
  object_spec: Experiment["object_spec"];
  environment_spec: Experiment["environment_spec"];
  config: ExperimentConfig;
  metrics: Record<string, number>;
  featured_metric_keys: string[];
  result_summary: string;
  decision_outcome: DecisionOutcome | null;
  decision_notes: string;
  notes: string;
  position: number;
  started_at: string | null;
  completed_at: string | null;
}

export const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, string> = {
  planned: "Planned",
  running: "Running",
  analyzing: "Analyzing",
  completed: "Completed",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

export const DECISION_LABELS: Record<DecisionOutcome, string> = {
  reference: "Reference",
  accepted: "Accepted",
  rejected: "Rejected",
  inconclusive: "Inconclusive",
};

const TRANSITIONS: Record<ExperimentStatus, ExperimentStatus[]> = {
  planned: ["running", "cancelled"],
  running: ["analyzing", "blocked", "cancelled"],
  analyzing: ["completed", "blocked", "cancelled"],
  completed: ["analyzing"],
  blocked: ["planned", "running", "analyzing", "cancelled"],
  cancelled: ["planned"],
};

export function formatExperimentId(experimentNo: number): string {
  return `EXP-${String(experimentNo).padStart(4, "0")}`;
}

export function canTransition(from: ExperimentStatus, to: ExperimentStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function allowedTargets(from: ExperimentStatus): ExperimentStatus[] {
  return [from, ...TRANSITIONS[from]];
}

export function validateForStatus(
  experiment: Experiment,
  target: ExperimentStatus,
): ValidationIssue[] {
  if (!canTransition(experiment.status, target)) {
    return [{
      field: "status",
      message: `Cannot move from ${EXPERIMENT_STATUS_LABELS[experiment.status]} to ${EXPERIMENT_STATUS_LABELS[target]}.`,
    }];
  }
  return [];
}

export function validateBaseline(
  experimentId: string,
  baselineId: string | null,
): ValidationIssue[] {
  return baselineId === experimentId
    ? [{
        field: "baseline_experiment_id",
        message: "An experiment cannot use itself as Baseline.",
      }]
    : [];
}

export function buildDuplicateInsert(
  source: Experiment,
  input: DuplicateInput,
): ExperimentInsert {
  return {
    task_id: source.task_id,
    template_id: source.template_id,
    owner_id: input.ownerId,
    name: input.name.trim(),
    status: "planned",
    baseline_experiment_id: source.id,
    data_spec: structuredClone(source.data_spec),
    object_spec: structuredClone(source.object_spec),
    environment_spec: structuredClone(source.environment_spec),
    config: structuredClone(source.config),
    metrics: {},
    featured_metric_keys: [],
    result_summary: "",
    decision_outcome: null,
    decision_notes: "",
    notes: "",
    position: input.position,
    started_at: null,
    completed_at: null,
  };
}
