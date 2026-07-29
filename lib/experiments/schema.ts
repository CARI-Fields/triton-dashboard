import type { Experiment } from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

export function isDataSpec(value: unknown): value is Experiment["data_spec"] {
  return isRecord(value)
    && Array.isArray(value.datasets)
    && value.datasets.every((dataset) => (
      isRecord(dataset)
      && (dataset.role === "training" || dataset.role === "evaluation")
      && typeof dataset.name === "string"
      && typeof dataset.split === "string"
      && typeof dataset.revision === "string"
      && isNullableFiniteNumber(dataset.task_count)
      && isNullableFiniteNumber(dataset.samples_per_task)
    ));
}

export function isObjectSpec(value: unknown): value is Experiment["object_spec"] {
  return isRecord(value)
    && typeof value.model === "string"
    && typeof value.harness === "string"
    && typeof value.parent_harness === "string"
    && typeof value.prompt === "string"
    && typeof value.prompt_change === "string"
    && isStringArray(value.skills)
    && isStringArray(value.tools);
}

export function isEnvironmentSpec(
  value: unknown,
): value is Experiment["environment_spec"] {
  return isRecord(value)
    && (value.platform === "" || value.platform === "npu" || value.platform === "gpu")
    && typeof value.server === "string"
    && isStringArray(value.devices)
    && typeof value.hardware === "string"
    && typeof value.evaluator === "string"
    && typeof value.revision === "string"
    && typeof value.precision_policy === "string";
}

export function isConfig(value: unknown): value is Experiment["config"] {
  return isRecord(value) && Object.values(value).every((item) => (
    item === null
    || typeof item === "string"
    || typeof item === "boolean"
    || (typeof item === "number" && Number.isFinite(item))
  ));
}

export function isMetrics(value: unknown): value is Experiment["metrics"] {
  return isRecord(value) && Object.values(value).every(
    (item) => typeof item === "number" && Number.isFinite(item),
  );
}
