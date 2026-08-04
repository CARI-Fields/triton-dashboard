import type { ExperimentListRow, ExperimentStatus } from "@/lib/types";

export type ExperimentSavedView =
  | "all"
  | "running"
  | "blocked";

export interface ExperimentFilterState {
  savedView: ExperimentSavedView;
  ownerId: string;
  taskId: string;
  status: ExperimentStatus | "";
  search: string;
}

export const EMPTY_EXPERIMENT_FILTERS: ExperimentFilterState = {
  savedView: "all",
  ownerId: "",
  taskId: "",
  status: "",
  search: "",
};

export function applyExperimentFilters(
  rows: ExperimentListRow[],
  filters: ExperimentFilterState,
  now = Date.now(),
): ExperimentListRow[] {
  const query = filters.search.trim().toLowerCase();
  return rows
    .filter((row) => {
      if (filters.savedView === "running" && row.status !== "running") return false;
      if (filters.savedView === "blocked" && row.status !== "blocked") return false;
      if (filters.ownerId === "unassigned" && row.owner_id !== null) return false;
      if (
        filters.ownerId
        && filters.ownerId !== "unassigned"
        && row.owner_id !== filters.ownerId
      ) return false;
      if (filters.taskId && row.task_id !== filters.taskId) return false;
      if (filters.status && row.status !== filters.status) return false;
      if (query) {
        const haystack = [
          row.name,
          row.task?.title ?? "",
          row.owner?.name ?? "",
          `exp-${String(row.experiment_no).padStart(4, "0")}`,
        ].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    })
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}
