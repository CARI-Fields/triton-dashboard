import Link from "next/link";
import { useId } from "react";
import type { ExperimentListRow } from "@/lib/types";
import { relTime } from "@/lib/time";
import {
  DECISION_LABELS,
  formatExperimentId,
} from "@/lib/experiments/policy";
import ExperimentStatusBadge from "@/components/experiments/ExperimentStatusBadge";

function metricValue(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? value.toLocaleString() : Number(value.toPrecision(5)).toString();
}

export default function ExperimentTable({
  rows,
  showTask,
  selectable,
  selectedIds = new Set<string>(),
  onToggle,
}: {
  rows: ExperimentListRow[];
  showTask: boolean;
  selectable: boolean;
  selectedIds?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
}) {
  const helpId = useId();
  if (rows.length === 0) {
    return <div className="experiment-empty">No experiments match this view.</div>;
  }
  return (
    <>
      <div
        className="experiment-table-scroll"
        role="region"
        aria-label="Experiments table"
        aria-describedby={helpId}
        tabIndex={0}
      >
        <table className="experiment-table">
        <thead>
          <tr>
            {selectable && (
              <th scope="col" className="select-column">
                <span className="sr-only">Select</span>
              </th>
            )}
            <th scope="col">ID</th>
            <th scope="col">Name</th>
            {showTask && <th scope="col">Task</th>}
            <th scope="col">Owner</th>
            <th scope="col">Status</th>
            <th scope="col">Decision</th>
            <th scope="col">Featured metrics</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const displayId = formatExperimentId(row.experiment_no);
            const selected = selectedIds.has(row.id);
            return (
              <tr
                key={row.id}
                aria-selected={selectable ? selected : undefined}
                className={selected ? "selected-row" : undefined}
              >
                {selectable && (
                  <td className="select-column">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggle?.(row.id)}
                      aria-label={`Select ${displayId}`}
                    />
                  </td>
                )}
                <td className="experiment-id-cell">{displayId}</td>
                <td><Link className="experiment-name-link" href={`/experiments/${row.id}`}>{row.name}</Link></td>
                {showTask && (
                  <td>
                    {row.task
                      ? <Link href={`/task/${row.task.id}`}>{row.task.title}</Link>
                      : <span className="muted">Deleted task</span>}
                  </td>
                )}
                <td>
                  {row.owner
                    ? <span className="owner-inline"><span className="av">{row.owner.initials}</span>{row.owner.name}</span>
                    : <span className="muted">Unassigned</span>}
                </td>
                <td><ExperimentStatusBadge status={row.status} /></td>
                <td>
                  {row.decision_outcome
                    ? DECISION_LABELS[row.decision_outcome]
                    : <span className="muted">—</span>}
                </td>
                <td>
                  <div className="featured-metrics">
                    {row.featured_metric_keys.length === 0 && <span className="muted">—</span>}
                    {row.featured_metric_keys.map((key) => (
                      <span key={key}>
                        {key} {key in row.metrics ? metricValue(row.metrics[key]) : "—"}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="experiment-updated">{relTime(row.updated_at)}</td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
      <p id={helpId} className="sr-only">
        Scroll horizontally to inspect every Experiment table column.
      </p>
    </>
  );
}
