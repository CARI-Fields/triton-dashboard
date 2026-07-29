import type { Experiment } from "@/lib/types";
import {
  isConfig,
  isDataSpec,
  isEnvironmentSpec,
  isMetrics,
  isObjectSpec,
} from "@/lib/experiments/schema";

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

export interface SessionStorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export type SessionDraftStorage = SessionStorageLike | null | undefined;

export type SessionDraftResolution =
  | { kind: "none" }
  | {
    kind: "restore" | "conflict";
    draft: Experiment;
    sourceRevision: string;
  };

const EXPERIMENT_STATUSES = new Set([
  "planned",
  "running",
  "analyzing",
  "completed",
  "blocked",
  "cancelled",
]);
const DECISION_OUTCOMES = new Set([
  "reference",
  "accepted",
  "rejected",
  "inconclusive",
]);
const sessionDraftFallback = new Map<string, string>();

export function draftStorageKey(experimentId: string): string {
  return `triton-board:experiment-draft:v1:${experimentId}`;
}

export function getSessionExperimentDraftStorage(): SessionStorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function editableDraftPatch(
  experiment: Experiment,
): EditableExperimentPatch {
  return {
    ...editableExperimentPatch(experiment),
    name: experiment.name,
  };
}

export function hasEditableExperimentChanges(
  source: Experiment,
  draft: Experiment,
): boolean {
  return JSON.stringify(editableDraftPatch(source))
    !== JSON.stringify(editableDraftPatch(draft));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isEditablePatch(value: unknown): value is EditableExperimentPatch {
  return isRecord(value)
    && isNullableString(value.owner_id)
    && typeof value.name === "string"
    && typeof value.status === "string"
    && EXPERIMENT_STATUSES.has(value.status)
    && isNullableString(value.baseline_experiment_id)
    && isDataSpec(value.data_spec)
    && isObjectSpec(value.object_spec)
    && isEnvironmentSpec(value.environment_spec)
    && isConfig(value.config)
    && isMetrics(value.metrics)
    && isStringArray(value.featured_metric_keys)
    && typeof value.result_summary === "string"
    && (
      value.decision_outcome === null
      || (
        typeof value.decision_outcome === "string"
        && DECISION_OUTCOMES.has(value.decision_outcome)
      )
    )
    && typeof value.decision_notes === "string"
    && typeof value.notes === "string";
}

export function writeSessionExperimentDraft(
  storage: SessionDraftStorage,
  source: Experiment,
  draft: Experiment,
): void {
  const raw = JSON.stringify({
    version: 1,
    experimentId: source.id,
    sourceRevision: source.updated_at,
    patch: editableDraftPatch(draft),
  });
  const key = draftStorageKey(source.id);
  sessionDraftFallback.set(key, raw);
  try {
    storage?.setItem(key, raw);
  } catch {
    // The tab-local module fallback still protects client-side navigation.
  }
}

export function clearSessionExperimentDraft(
  storage: SessionDraftStorage,
  experimentId: string,
): void {
  const key = draftStorageKey(experimentId);
  sessionDraftFallback.delete(key);
  try {
    storage?.removeItem(key);
  } catch {
    // A storage policy failure is non-fatal; beforeunload remains a fallback.
  }
}

export function readSessionExperimentDraft(
  storage: SessionDraftStorage,
  server: Experiment,
): SessionDraftResolution {
  const key = draftStorageKey(server.id);
  let raw = sessionDraftFallback.get(key) ?? null;
  try {
    raw = storage?.getItem(key) ?? raw;
  } catch {
    // Continue with the tab-local module fallback.
  }
  if (!raw) return { kind: "none" };
  try {
    const stored: unknown = JSON.parse(raw);
    if (
      !isRecord(stored)
      || stored.version !== 1
      || stored.experimentId !== server.id
      || typeof stored.sourceRevision !== "string"
      || !isEditablePatch(stored.patch)
    ) {
      clearSessionExperimentDraft(storage, server.id);
      return { kind: "none" };
    }
    sessionDraftFallback.set(key, raw);
    return {
      kind: stored.sourceRevision === server.updated_at ? "restore" : "conflict",
      draft: {
        ...server,
        ...structuredClone(stored.patch),
      },
      sourceRevision: stored.sourceRevision,
    };
  } catch {
    clearSessionExperimentDraft(storage, server.id);
    return { kind: "none" };
  }
}

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
