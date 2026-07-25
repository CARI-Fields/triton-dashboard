export interface CompareSearchParams {
  ids?: string | string[];
  baseline?: string | string[];
}

export interface CompareSelection {
  ids: string[];
  baselineId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function parseCompareSearchParams(params: CompareSearchParams): CompareSelection {
  const ids = [...new Set(
    first(params.ids)
      .split(",")
      .map((id) => id.trim())
      .filter((id) => UUID.test(id)),
  )];
  const baselineCandidate = first(params.baseline).trim();
  const baselineId = UUID.test(baselineCandidate) ? baselineCandidate : null;
  if (baselineId && !ids.includes(baselineId)) ids.unshift(baselineId);
  if (baselineId) {
    return {
      ids: [baselineId, ...ids.filter((id) => id !== baselineId)],
      baselineId,
    };
  }
  return { ids, baselineId: null };
}

export function serializeCompareSelection(selection: CompareSelection): string {
  const params = new URLSearchParams();
  const baselineId = selection.baselineId && UUID.test(selection.baselineId)
    ? selection.baselineId
    : null;
  const ids = [...new Set(selection.ids.filter((id) => UUID.test(id)))];
  const orderedIds = baselineId
    ? [baselineId, ...ids.filter((id) => id !== baselineId)]
    : ids;
  if (orderedIds.length > 0) params.set("ids", orderedIds.join(","));
  if (baselineId) params.set("baseline", baselineId);
  return params.toString();
}
