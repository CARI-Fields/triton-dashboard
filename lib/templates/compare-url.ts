import type { CompareViewFilter, CompareSort } from "@/lib/templates/compare";

export interface CompareSearchParams {
  template?: string | string[];
  baseline?: string | string[];
  archived?: string | string[];
  sort?: string | string[];
  filter?: string | string[];
  columns?: string | string[];
}

export interface CompareViewState {
  templateId: string | null;
  includeArchived: boolean;
  baselineId: string | null;
  visibleKeyIds: string[];
  sort: CompareSort | null;
  filters: Record<string, CompareViewFilter>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeUuid(value: string): string | null {
  const trimmed = value.trim();
  return UUID.test(trimmed) ? trimmed.toLowerCase() : null;
}

function parseSort(raw: string): CompareSort | null {
  const [keyIdRaw, directionRaw] = raw.split(":");
  const keyId = normalizeUuid(keyIdRaw ?? "");
  if (!keyId || (directionRaw !== "asc" && directionRaw !== "desc")) return null;
  return { keyId, direction: directionRaw };
}

function parseFilter(raw: string): { keyId: string; filter: CompareViewFilter } | null {
  const [keyIdRaw, kind, ...rest] = raw.split(":");
  const keyId = normalizeUuid(keyIdRaw ?? "");
  if (!keyId) return null;
  const value = rest.join(":");
  switch (kind) {
    case "contains":
      return value ? { keyId, filter: { kind: "contains", text: value } } : null;
    case "min": {
      const number = Number(value);
      return Number.isFinite(number)
        ? { keyId, filter: { kind: "min", number } }
        : null;
    }
    case "max": {
      const number = Number(value);
      return Number.isFinite(number)
        ? { keyId, filter: { kind: "max", number } }
        : null;
    }
    case "options": {
      const optionIds = value.split("|").map(normalizeUuid).filter((id): id is string => id !== null);
      return optionIds.length > 0
        ? { keyId, filter: { kind: "options", optionIds } }
        : null;
    }
    case "present": {
      if (value === "true") return { keyId, filter: { kind: "present", present: true } };
      if (value === "false") return { keyId, filter: { kind: "present", present: false } };
      return null;
    }
    default:
      return null;
  }
}

export function parseCompareSearchParams(
  params: CompareSearchParams,
  activeKeys: string[],
): CompareViewState {
  const keySet = new Set(activeKeys);
  const templateId = normalizeUuid(first(params.template));
  const baselineId = normalizeUuid(first(params.baseline));
  const includeArchived = first(params.archived) === "true";
  const sort = parseSort(first(params.sort));
  const filters: Record<string, CompareViewFilter> = {};
  for (const raw of (Array.isArray(params.filter) ? params.filter : [params.filter])
    .flatMap((entry) => (entry ?? "").split(";"))
    .filter(Boolean)) {
    const parsed = parseFilter(raw);
    if (parsed && keySet.has(parsed.keyId)) {
      filters[parsed.keyId] = parsed.filter;
    }
  }
  const visibleKeyIds = first(params.columns)
    .split(",")
    .map(normalizeUuid)
    .filter((id): id is string => id !== null && keySet.has(id));
  if (sort && !keySet.has(sort.keyId)) {
    return {
      templateId,
      includeArchived,
      baselineId,
      visibleKeyIds,
      sort: null,
      filters,
    };
  }
  return {
    templateId,
    includeArchived,
    baselineId,
    visibleKeyIds,
    sort,
    filters,
  };
}

function serializeFilter(keyId: string, filter: CompareViewFilter): string {
  switch (filter.kind) {
    case "contains": return `${keyId}:contains:${filter.text}`;
    case "min": return `${keyId}:min:${filter.number}`;
    case "max": return `${keyId}:max:${filter.number}`;
    case "present": return `${keyId}:present:${filter.present}`;
    case "options": return `${keyId}:options:${filter.optionIds.join("|")}`;
  }
}

export function serializeCompareViewState(state: CompareViewState): string {
  const params = new URLSearchParams();
  if (state.templateId) params.set("template", state.templateId);
  if (state.baselineId) params.set("baseline", state.baselineId);
  if (state.includeArchived) params.set("archived", "true");
  if (state.sort) params.set("sort", `${state.sort.keyId}:${state.sort.direction}`);
  const filterEntries = Object.entries(state.filters)
    .map(([keyId, filter]) => serializeFilter(keyId, filter));
  if (filterEntries.length > 0) params.set("filter", filterEntries.join(";"));
  if (state.visibleKeyIds.length > 0) params.set("columns", state.visibleKeyIds.join(","));
  return params.toString();
}
