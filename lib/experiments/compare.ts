import type { Experiment } from "@/lib/types";

export type CompareGroup =
  | "data"
  | "object"
  | "environment"
  | "config"
  | "result"
  | "decision_note";

export type CompareValue = string | number | boolean | null;

export interface FlatField {
  key: string;
  label: string;
  group: CompareGroup;
  value: CompareValue;
}

export interface ContextDifference {
  key: string;
  label: string;
  group: Exclude<CompareGroup, "result" | "decision_note">;
  current: CompareValue;
  baseline: CompareValue;
}

export interface CompareOptions {
  groups: CompareGroup[];
  baselineId: string | null;
  diffOnly: boolean;
}

export interface CompareColumn {
  key: string;
  label: string;
  group: CompareGroup;
  kind: "value" | "delta";
  values: Record<string, CompareValue>;
}

function titleFromKey(key: string): string {
  const humanize = (value: string) => value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
  const dataset = key.match(/datasets\[(\d+)\]\.([^.]+)$/);
  if (dataset) {
    return `Dataset ${Number(dataset[1]) + 1} ${humanize(dataset[2])}`;
  }
  return humanize(key.split(".").at(-1)!);
}

function scalar(value: unknown): CompareValue {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value);
}

function flattenRecord(
  group: CompareGroup,
  prefix: string,
  value: unknown,
  output: FlatField[],
): void {
  if (Array.isArray(value)) {
    if (value.length === 0) return;
    if (value.every((item) => typeof item !== "object" || item === null)) {
      output.push({
        key: prefix,
        label: titleFromKey(prefix),
        group,
        value: value.map(String).join(", ") || null,
      });
      return;
    }
    value.forEach((item, index) => flattenRecord(group, `${prefix}[${index}]`, item, output));
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      flattenRecord(group, prefix ? `${prefix}.${key}` : key, child, output);
    }
    return;
  }
  output.push({ key: prefix, label: titleFromKey(prefix), group, value: scalar(value) });
}

export function flattenContext(experiment: Experiment): FlatField[] {
  const fields: FlatField[] = [];
  flattenRecord("data", "data", experiment.data_spec, fields);
  flattenRecord("object", "object", experiment.object_spec, fields);
  flattenRecord("environment", "environment", experiment.environment_spec, fields);
  flattenRecord("config", "config", experiment.config, fields);
  return fields;
}

function flattenExperiment(experiment: Experiment): FlatField[] {
  const fields = flattenContext(experiment);
  for (const [key, value] of Object.entries(experiment.metrics).sort(([a], [b]) => a.localeCompare(b))) {
    fields.push({
      key: `result.metrics.${key}`,
      label: key,
      group: "result",
      value,
    });
  }
  fields.push({
    key: "result.summary",
    label: "Result Summary",
    group: "result",
    value: scalar(experiment.result_summary),
  });
  fields.push({
    key: "decision.outcome",
    label: "Decision Outcome",
    group: "decision_note",
    value: scalar(experiment.decision_outcome),
  });
  fields.push({
    key: "decision.notes",
    label: "Decision Notes",
    group: "decision_note",
    value: scalar(experiment.decision_notes),
  });
  fields.push({
    key: "note",
    label: "Note",
    group: "decision_note",
    value: scalar(experiment.notes),
  });
  return fields;
}

function sameValue(left: CompareValue, right: CompareValue): boolean {
  return Object.is(left, right);
}

function isFiniteNumber(value: CompareValue): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function compareContexts(
  current: Experiment,
  baseline: Experiment,
): ContextDifference[] {
  const currentMap = new Map(flattenContext(current).map((field) => [field.key, field]));
  const baselineMap = new Map(flattenContext(baseline).map((field) => [field.key, field]));
  const keys = [...new Set([...currentMap.keys(), ...baselineMap.keys()])].sort();
  return keys.flatMap((key) => {
    const currentField = currentMap.get(key);
    const baselineField = baselineMap.get(key);
    const currentValue = currentField?.value ?? null;
    const baselineValue = baselineField?.value ?? null;
    if (sameValue(currentValue, baselineValue)) return [];
    const source = currentField ?? baselineField!;
    return [{
      key,
      label: source.label,
      group: source.group as ContextDifference["group"],
      current: currentValue,
      baseline: baselineValue,
    }];
  });
}

export function orderWithBaseline(
  experiments: Experiment[],
  baselineId: string | null,
): Experiment[] {
  if (!baselineId) return experiments;
  const baseline = experiments.find((experiment) => experiment.id === baselineId);
  if (!baseline) return experiments;
  return [baseline, ...experiments.filter((experiment) => experiment.id !== baselineId)];
}

export function buildCompareColumns(
  experiments: Experiment[],
  options: CompareOptions,
): CompareColumn[] {
  const flattened = new Map(
    experiments.map((experiment) => [
      experiment.id,
      new Map(flattenExperiment(experiment).map((field) => [field.key, field])),
    ]),
  );
  const fieldKeys = [...new Set(
    [...flattened.values()].flatMap((fieldMap) => [...fieldMap.keys()]),
  )].sort();
  const baseline = options.baselineId
    ? experiments.find((experiment) => experiment.id === options.baselineId) ?? null
    : null;

  const columns: CompareColumn[] = [];
  for (const key of fieldKeys) {
    const source = experiments
      .map((experiment) => flattened.get(experiment.id)?.get(key))
      .find((field): field is FlatField => Boolean(field));
    if (!source || !options.groups.includes(source.group)) continue;
    const values = Object.fromEntries(
      experiments.map((experiment) => [
        experiment.id,
        flattened.get(experiment.id)?.get(key)?.value ?? null,
      ]),
    );
    if (Object.values(values).every((value) => value === null)) continue;
    const distinct = new Set(Object.values(values).map((value) => JSON.stringify(value)));
    if (options.diffOnly && distinct.size <= 1) continue;
    columns.push({
      key,
      label: source.label,
      group: source.group,
      kind: "value",
      values,
    });

    if (baseline && key.startsWith("result.metrics.")) {
      const baselineValue = values[baseline.id];
      const deltas = Object.fromEntries(experiments.map((experiment) => {
        const currentValue = values[experiment.id];
        const delta = isFiniteNumber(currentValue) && isFiniteNumber(baselineValue)
          ? currentValue - baselineValue
          : null;
        return [experiment.id, delta];
      }));
      columns.push({
        key: `${key}.delta`,
        label: `Δ ${source.label}`,
        group: "result",
        kind: "delta",
        values: deltas,
      });
    }
  }
  return columns;
}
