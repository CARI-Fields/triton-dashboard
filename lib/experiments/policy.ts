import type {
  Experiment,
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
  position: number;
}

export const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, string> = {
  planned: "Planned",
  running: "Running",
  analyzing: "Analyzing",
  completed: "Completed",
  blocked: "Blocked",
  cancelled: "Cancelled",
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
    position: input.position,
  };
}
