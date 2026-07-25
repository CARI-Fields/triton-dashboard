import type {
  DecisionOutcome,
  ExperimentListRow,
  ExperimentStatus,
} from "@/lib/types";

export type ExperimentSavedView =
  | "all"
  | "running"
  | "blocked"
  | "needs_decision"
  | "recently_completed";

export interface ExperimentFilterState {
  savedView: ExperimentSavedView;
  ownerId: string;
  taskId: string;
  status: ExperimentStatus | "";
  decision: DecisionOutcome | "none" | "";
  search: string;
}

export const EMPTY_EXPERIMENT_FILTERS: ExperimentFilterState = {
  savedView: "all",
  ownerId: "",
  taskId: "",
  status: "",
  decision: "",
  search: "",
};

const RECENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

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
      if (
        filters.savedView === "needs_decision"
        && (row.status !== "analyzing" || row.decision_outcome !== null)
      ) return false;
      if (filters.savedView === "recently_completed") {
        if (row.status !== "completed" || !row.completed_at) return false;
        const completed = new Date(row.completed_at).getTime();
        if (!Number.isFinite(completed) || now - completed > RECENT_WINDOW_MS) return false;
      }
      if (filters.ownerId === "unassigned" && row.owner_id !== null) return false;
      if (
        filters.ownerId
        && filters.ownerId !== "unassigned"
        && row.owner_id !== filters.ownerId
      ) return false;
      if (filters.taskId && row.task_id !== filters.taskId) return false;
      if (filters.status && row.status !== filters.status) return false;
      if (filters.decision === "none" && row.decision_outcome !== null) return false;
      if (
        filters.decision
        && filters.decision !== "none"
        && row.decision_outcome !== filters.decision
      ) return false;
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
