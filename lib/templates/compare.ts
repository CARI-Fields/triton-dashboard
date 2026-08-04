import type { TypedValue } from "@/lib/experiments/values";
import type { ExperimentStatus } from "@/lib/types";

export interface CompareRowValue {
  value: TypedValue | null;
  cellRevision: number;
}

export interface CompareRow {
  experimentId: string;
  experimentNo: number;
  name: string;
  taskTitle: string | null;
  ownerName: string | null;
  status: ExperimentStatus;
  archivedAt: string | null;
  values: Map<string, CompareRowValue>;
}

export type CompareViewFilter =
  | { kind: "contains"; text: string }
  | { kind: "min"; number: number }
  | { kind: "max"; number: number }
  | { kind: "options"; optionIds: string[] }
  | { kind: "present"; present: boolean };

export interface CompareSort {
  keyId: string;
  direction: "asc" | "desc";
}

export type CompareScalar =
  | { kind: "text"; text: string }
  | { kind: "number"; number: number }
  | { kind: "boolean"; boolean: boolean }
  | { kind: "datetime"; datetime: number }
  | { kind: "set"; ids: string[] }
  | { kind: "missing" };

export function scalarValue(value: TypedValue | null): CompareScalar {
  if (!value) return { kind: "missing" };
  switch (value.kind) {
    case "short_text": return { kind: "text", text: value.text };
    case "long_text": return { kind: "text", text: value.text };
    case "url": return { kind: "text", text: value.url };
    case "number": return { kind: "number", number: value.number };
    case "boolean": return { kind: "boolean", boolean: value.boolean };
    case "date_time": return { kind: "datetime", datetime: Date.parse(value.datetime) };
    case "single_select": return { kind: "text", text: value.optionId };
    case "multi_select": return { kind: "set", ids: [...value.optionIds].sort() };
    case "attachment": return { kind: "set", ids: [...value.attachmentIds].sort() };
  }
}

function rowValue(row: CompareRow, keyId: string): CompareScalar {
  return scalarValue(row.values.get(keyId)?.value ?? null);
}

function textMatch(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.trim().toLowerCase());
}

export function applyCompareFilters(
  rows: CompareRow[],
  filters: Record<string, CompareViewFilter>,
): CompareRow[] {
  const entries = Object.entries(filters);
  if (entries.length === 0) return rows;
  return rows.filter((row) =>
    entries.every(([keyId, filter]) => {
      const scalar = rowValue(row, keyId);
      switch (filter.kind) {
        case "contains":
          return scalar.kind === "text" && textMatch(scalar.text, filter.text);
        case "min":
          return scalar.kind === "number" && scalar.number >= filter.number;
        case "max":
          return scalar.kind === "number" && scalar.number <= filter.number;
        case "present":
          return filter.present ? scalar.kind !== "missing" : scalar.kind === "missing";
        case "options":
          if (scalar.kind === "set") {
            return scalar.ids.some((id) => filter.optionIds.includes(id));
          }
          return scalar.kind === "text" && filter.optionIds.includes(scalar.text);
      }
    }),
  );
}

function compareScalars(left: CompareScalar, right: CompareScalar): number {
  if (left.kind === "missing" && right.kind === "missing") return 0;
  if (left.kind === "missing") return 1;
  if (right.kind === "missing") return -1;
  if (left.kind === "number" && right.kind === "number") {
    return left.number - right.number;
  }
  if (left.kind === "datetime" && right.kind === "datetime") {
    return left.datetime - right.datetime;
  }
  const leftText = left.kind === "text"
    ? left.text
    : left.kind === "boolean"
      ? String(left.boolean)
      : (left.kind === "set" ? left.ids.join(",") : "");
  const rightText = right.kind === "text"
    ? right.text
    : right.kind === "boolean"
      ? String(right.boolean)
      : (right.kind === "set" ? right.ids.join(",") : "");
  return leftText.localeCompare(rightText);
}

export function sortCompareRows(
  rows: CompareRow[],
  sort: CompareSort,
): CompareRow[] {
  return [...rows].sort((left, right) => {
    const leftScalar = rowValue(left, sort.keyId);
    const rightScalar = rowValue(right, sort.keyId);
    if (leftScalar.kind === "missing" && rightScalar.kind === "missing") return 0;
    if (leftScalar.kind === "missing") return 1;
    if (rightScalar.kind === "missing") return -1;
    const result = compareScalars(leftScalar, rightScalar);
    return sort.direction === "asc" ? result : -result;
  });
}

export function isDifferent(
  left: TypedValue | null,
  right: TypedValue | null,
): boolean {
  const a = scalarValue(left);
  const b = scalarValue(right);
  if (a.kind === "missing" && b.kind === "missing") return false;
  if (a.kind === "missing" || b.kind === "missing") return true;
  if (a.kind === "set" && b.kind === "set") {
    return a.ids.length !== b.ids.length
      || a.ids.some((id, index) => id !== b.ids[index]);
  }
  return compareScalars(a, b) !== 0;
}

export function deltaFor(
  left: TypedValue | null,
  right: TypedValue | null,
): number | null {
  if (left?.kind !== "number" || right?.kind !== "number") return null;
  if (!Number.isFinite(left.number) || !Number.isFinite(right.number)) return null;
  return left.number - right.number;
}

export interface CellDifference {
  different: boolean;
  delta: number | null;
}

export function cellDifference({
  row,
  baselineRow,
  keyId,
}: {
  row: CompareRow;
  baselineRow: CompareRow;
  keyId: string;
}): CellDifference {
  return {
    different: isDifferent(
      row.values.get(keyId)?.value ?? null,
      baselineRow.values.get(keyId)?.value ?? null,
    ),
    delta: deltaFor(
      row.values.get(keyId)?.value ?? null,
      baselineRow.values.get(keyId)?.value ?? null,
    ),
  };
}
