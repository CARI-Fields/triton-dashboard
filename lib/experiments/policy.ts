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

function hasConfigValue(config: ExperimentConfig): boolean {
  return Object.entries(config).some(([key, value]) => {
    if (!key.trim()) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return value !== null;
  });
}

function hasResult(experiment: Experiment): boolean {
  const hasMetric = Object.values(experiment.metrics).some(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
  return hasMetric || experiment.result_summary.trim().length > 0;
}

function runnableIssues(experiment: Experiment): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!experiment.owner_id) {
    issues.push({ field: "owner_id", message: "Choose an Owner before running." });
  }
  if (!experiment.data_spec.datasets.some((dataset) => dataset.name.trim().length > 0)) {
    issues.push({
      field: "data_spec.datasets",
      message: "Add at least one named training or evaluation Dataset before running.",
    });
  }
  if (!experiment.object_spec.model.trim()) {
    issues.push({ field: "object_spec.model", message: "Add a Model before running." });
  }
  const environment = experiment.environment_spec;
  if (!environment.platform) {
    issues.push({
      field: "environment_spec.platform",
      message: "Choose NPU or GPU before running.",
    });
  }
  if (!environment.server.trim() && !environment.devices.some((device) => device.trim())) {
    issues.push({
      field: "environment_spec.server_or_devices",
      message: "Add a Server or Device before running.",
    });
  }
  if (!hasConfigValue(experiment.config)) {
    issues.push({
      field: "config",
      message: 'Add an explicit parameter or set profile to "defaults" before running.',
    });
  }
  return issues;
}

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
  if (target === "running") return runnableIssues(experiment);
  if (target === "analyzing") {
    return hasResult(experiment)
      ? []
      : [{ field: "result", message: "Add a numeric metric or Result Summary before analyzing." }];
  }
  if (target === "completed") {
    const issues = runnableIssues(experiment);
    if (!hasResult(experiment)) {
      issues.push({
        field: "result",
        message: "Add a numeric metric or Result Summary before completing.",
      });
    }
    if (!experiment.decision_outcome) {
      issues.push({
        field: "decision_outcome",
        message: "Choose a Decision Outcome before completing.",
      });
    }
    return issues;
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
