"use client";

import type {
  DecisionOutcome,
  ExperimentListRow,
  ExperimentStatus,
} from "@/lib/types";
import {
  type ExperimentFilterState,
  type ExperimentSavedView,
} from "@/lib/experiments/filters";
import {
  DECISION_LABELS,
  EXPERIMENT_STATUS_LABELS,
} from "@/lib/experiments/policy";

const SAVED_VIEWS: { value: ExperimentSavedView; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "blocked", label: "Blocked" },
  { value: "needs_decision", label: "Needs Decision" },
  { value: "recently_completed", label: "Recently Completed" },
];

export default function ExperimentFilters({
  rows,
  value,
  onChange,
}: {
  rows: ExperimentListRow[];
  value: ExperimentFilterState;
  onChange: (value: ExperimentFilterState) => void;
}) {
  const owners = [...new Map(
    rows.flatMap((row) => row.owner ? [[row.owner.id, row.owner] as const] : []),
  ).values()].sort((left, right) => left.name.localeCompare(right.name));
  const tasks = [...new Map(
    rows.flatMap((row) => row.task ? [[row.task.id, row.task] as const] : []),
  ).values()].sort((left, right) => left.title.localeCompare(right.title));
  const set = <K extends keyof ExperimentFilterState>(
    key: K,
    next: ExperimentFilterState[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <div className="experiment-filter-stack">
      <div className="saved-view-tabs" aria-label="Experiment saved views">
        {SAVED_VIEWS.map((view) => (
          <button
            key={view.value}
            type="button"
            className={value.savedView === view.value ? "active" : ""}
            onClick={() => set("savedView", view.value)}
          >
            {view.label}
          </button>
        ))}
      </div>
      <div className="experiment-filter-row">
        <label>
          <span>Search</span>
          <input
            type="search"
            value={value.search}
            onChange={(event) => set("search", event.target.value)}
            placeholder="Name, ID, Task, or Owner"
          />
        </label>
        <label>
          <span>Owner</span>
          <select value={value.ownerId} onChange={(event) => set("ownerId", event.target.value)}>
            <option value="">All owners</option>
            <option value="unassigned">Unassigned</option>
            {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={value.status}
            onChange={(event) => set("status", event.target.value as ExperimentStatus | "")}
          >
            <option value="">All statuses</option>
            {(Object.entries(EXPERIMENT_STATUS_LABELS) as [ExperimentStatus, string][])
              .map(([status, label]) => <option key={status} value={status}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Task</span>
          <select value={value.taskId} onChange={(event) => set("taskId", event.target.value)}>
            <option value="">All tasks</option>
            {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
        </label>
        <label>
          <span>Decision</span>
          <select
            value={value.decision}
            onChange={(event) => set(
              "decision",
              event.target.value as DecisionOutcome | "none" | "",
            )}
          >
            <option value="">All decisions</option>
            <option value="none">No decision</option>
            {(Object.entries(DECISION_LABELS) as [DecisionOutcome, string][])
              .map(([decision, label]) => (
                <option key={decision} value={decision}>{label}</option>
              ))}
          </select>
        </label>
      </div>
    </div>
  );
}
