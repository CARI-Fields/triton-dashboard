"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { ExperimentListRow } from "@/lib/types";
import {
  buildCompareColumns,
  orderWithBaseline,
  type CompareGroup,
  type CompareValue,
} from "@/lib/experiments/compare";
import {
  parseCompareSearchParams,
  serializeCompareSelection,
  type CompareSelection,
} from "@/lib/experiments/compare-url";
import {
  listExperimentRows,
  watchExperimentIndex,
} from "@/lib/experiments/repository";
import {
  DECISION_LABELS,
  EXPERIMENT_STATUS_LABELS,
  formatExperimentId,
} from "@/lib/experiments/policy";

const GROUPS: { value: CompareGroup; label: string }[] = [
  { value: "data", label: "Data" },
  { value: "object", label: "Object" },
  { value: "environment", label: "Environment" },
  { value: "config", label: "Config" },
  { value: "result", label: "Result" },
  { value: "decision_note", label: "Decision & Note" },
];

type ShareState = "idle" | "copying" | "copied" | "error";

function canonicalSelection(selection: CompareSelection): CompareSelection {
  const query = new URLSearchParams(serializeCompareSelection(selection));
  return parseCompareSearchParams({
    ids: query.get("ids") ?? undefined,
    baseline: query.get("baseline") ?? undefined,
  });
}

function sameSelection(left: CompareSelection, right: CompareSelection): boolean {
  return left.baselineId === right.baselineId
    && left.ids.length === right.ids.length
    && left.ids.every((id, index) => id === right.ids[index]);
}

function availableSelection(
  selection: CompareSelection,
  rows: ExperimentListRow[],
): { selection: CompareSelection; unavailableIds: string[] } {
  const availableIds = new Set(rows.map((row) => row.id));
  const unavailableIds = selection.ids.filter((id) => !availableIds.has(id));
  if (unavailableIds.length === 0) {
    return { selection, unavailableIds };
  }
  const ids = selection.ids.filter((id) => availableIds.has(id));
  return {
    selection: {
      ids,
      baselineId: selection.baselineId && availableIds.has(selection.baselineId)
        ? selection.baselineId
        : null,
    },
    unavailableIds,
  };
}

function compareHref(selection: CompareSelection): string {
  const query = serializeCompareSelection(selection);
  return query ? `/experiments/compare?${query}` : "/experiments/compare";
}

function displayValue(
  value: CompareValue,
  delta: boolean,
  columnKey: string,
): string {
  if (value === null) return "—";
  if (
    columnKey === "decision.outcome"
    && typeof value === "string"
    && Object.hasOwn(DECISION_LABELS, value)
  ) {
    return DECISION_LABELS[value as keyof typeof DECISION_LABELS];
  }
  if (typeof value !== "number") return String(value);
  const rounded = Number(value.toPrecision(6));
  if (!delta || rounded === 0) return rounded.toString();
  const magnitude = Number(Math.abs(value).toPrecision(6)).toString();
  return `${value > 0 ? "+" : "−"}${magnitude}`;
}

export default function ExperimentCompare({
  initialSelection,
}: {
  initialSelection: CompareSelection;
}) {
  const router = useRouter();
  const initial = canonicalSelection(initialSelection);
  const routerRef = useRef(router);
  const rowsRef = useRef<ExperimentListRow[]>([]);
  const loadedRef = useRef(false);
  const selectionRef = useRef(initial);
  const reloadVersion = useRef(0);
  const loadingRef = useRef(false);
  const [rows, setRows] = useState<ExperimentListRow[]>([]);
  const [selection, setSelection] = useState(initial);
  const [groups, setGroups] = useState<CompareGroup[]>(
    GROUPS.map((group) => group.value),
  );
  const [diffOnly, setDiffOnly] = useState(false);
  const [shareState, setShareState] = useState<ShareState>("idle");
  const [candidateId, setCandidateId] = useState("");
  const [unavailableIds, setUnavailableIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  routerRef.current = router;

  const commitSelection = useCallback((
    requested: CompareSelection,
    replaceUrl: boolean,
    missingIds: string[] = [],
  ) => {
    const next = canonicalSelection(requested);
    selectionRef.current = next;
    setSelection((current) => sameSelection(current, next) ? current : next);
    setUnavailableIds(missingIds);
    if (replaceUrl) routerRef.current.replace(compareHref(next));
  }, []);

  useEffect(() => {
    const next = canonicalSelection(initialSelection);
    if (!loadedRef.current) {
      selectionRef.current = next;
      setSelection((current) => sameSelection(current, next) ? current : next);
      setUnavailableIds([]);
      return;
    }
    const reconciled = availableSelection(next, rowsRef.current);
    commitSelection(
      reconciled.selection,
      reconciled.unavailableIds.length > 0,
      reconciled.unavailableIds,
    );
  }, [commitSelection, initialSelection]);

  const reload = useCallback(async () => {
    const requestVersion = ++reloadVersion.current;
    loadingRef.current = true;
    setLoading(true);
    try {
      const nextRows = await listExperimentRows();
      if (requestVersion !== reloadVersion.current) return;
      rowsRef.current = nextRows;
      loadedRef.current = true;
      setRows(nextRows);
      const reconciled = availableSelection(selectionRef.current, nextRows);
      commitSelection(
        reconciled.selection,
        reconciled.unavailableIds.length > 0,
        reconciled.unavailableIds,
      );
      setError("");
    } catch (caught) {
      if (requestVersion !== reloadVersion.current) return;
      const detail = caught instanceof Error ? caught.message : "The request failed.";
      setError(`Could not load experiments. ${detail}`);
    } finally {
      if (requestVersion === reloadVersion.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [commitSelection]);

  useEffect(() => {
    void reload();
    const unsubscribe = watchExperimentIndex(() => void reload());
    return () => {
      reloadVersion.current += 1;
      loadingRef.current = false;
      unsubscribe();
    };
  }, [reload]);

  function retry() {
    if (!loadingRef.current) void reload();
  }

  function replaceSelection(next: CompareSelection) {
    commitSelection(next, true);
  }

  const selected = useMemo(() => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const inUrlOrder = selection.ids.flatMap((id) => {
      const experiment = byId.get(id);
      return experiment ? [experiment] : [];
    });
    return orderWithBaseline(inUrlOrder, selection.baselineId) as ExperimentListRow[];
  }, [rows, selection]);

  const columns = useMemo(
    () => buildCompareColumns(selected, {
      groups,
      baselineId: selection.baselineId,
      diffOnly,
    }),
    [diffOnly, groups, selected, selection.baselineId],
  );

  const available = rows.filter((row) => !selection.ids.includes(row.id));
  const candidateAvailable = candidateId !== ""
    && available.some((row) => row.id === candidateId);
  const noMatchingSelection = unavailableIds.length > 0 && selection.ids.length === 0;
  const initialLoadFailed = Boolean(error) && !loadedRef.current;

  useEffect(() => {
    if (candidateId && !candidateAvailable) setCandidateId("");
  }, [candidateAvailable, candidateId]);

  useEffect(() => {
    setShareState("idle");
  }, [selection.baselineId, selection.ids]);

  async function copyShareUrl() {
    setShareState("copying");
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareState("copied");
    } catch {
      setShareState("error");
    }
  }

  return (
    <div className="workspace-page compare-page">
      <header className="workspace-page-header">
        <div>
          <p className="eyebrow">Shareable analysis</p>
          <h1>Compare experiments</h1>
          <p>
            Experiments are rows. Recorded fields are columns. Baseline and
            Delta are explicit.
          </p>
        </div>
        <Link href="/experiments" className="btn">Back to database</Link>
      </header>

      <section className="compare-controls" aria-label="Compare controls">
        <div className="compare-picker">
          <select
            aria-label="Add experiment"
            value={candidateId}
            onChange={(event) => setCandidateId(event.target.value)}
          >
            <option value="">Choose an experiment</option>
            {available.map((row) => (
              <option key={row.id} value={row.id}>
                {formatExperimentId(row.experiment_no)} · {row.name} ·{" "}
                {row.task?.title ?? "Deleted task"}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            disabled={!candidateAvailable}
            onClick={() => {
              if (!candidateAvailable) {
                setCandidateId("");
                return;
              }
              replaceSelection({
                ...selectionRef.current,
                ids: [...selectionRef.current.ids, candidateId],
              });
              setCandidateId("");
            }}
          >
            Add
          </button>
        </div>

        <label>
          <span>Baseline</span>
          <select
            aria-label="Compare Baseline"
            value={selection.baselineId ?? ""}
            disabled={selected.length === 0}
            onChange={(event) => replaceSelection({
              ids: selectionRef.current.ids,
              baselineId: event.target.value || null,
            })}
          >
            <option value="">No Baseline</option>
            {selected.map((row) => (
              <option key={row.id} value={row.id}>
                {formatExperimentId(row.experiment_no)} · {row.name}
              </option>
            ))}
          </select>
        </label>

        <label className="diff-toggle">
          <input
            type="checkbox"
            checked={diffOnly}
            onChange={(event) => setDiffOnly(event.target.checked)}
          />
          Diff only
        </label>

        <details className="field-groups">
          <summary>Fields · {groups.length} groups</summary>
          <div className="field-groups-menu">
            {GROUPS.map((group) => (
              <label key={group.value}>
                <input
                  type="checkbox"
                  checked={groups.includes(group.value)}
                  onChange={(event) => setGroups((current) => {
                    if (event.target.checked) {
                      return current.includes(group.value)
                        ? current
                        : [...current, group.value];
                    }
                    return current.filter((value) => value !== group.value);
                  })}
                />
                {group.label}
              </label>
            ))}
          </div>
        </details>
      </section>

      {selected.length > 0 && (
        <div
          className="compare-selection"
          role="group"
          aria-label="Selected experiments"
        >
          <span>{selected.length} selected</span>
          <ul>
            {selected.map((row) => (
              <li key={row.id}>
                <span>
                  {formatExperimentId(row.experiment_no)} · {row.name}
                  {row.id === selection.baselineId ? " · Baseline" : ""}
                </span>
                <button
                  type="button"
                  className="remove-compare"
                  aria-label={`Remove ${formatExperimentId(row.experiment_no)}`}
                  onClick={() => replaceSelection({
                    ids: selectionRef.current.ids.filter((id) => id !== row.id),
                    baselineId: selectionRef.current.baselineId === row.id
                      ? null
                      : selectionRef.current.baselineId,
                  })}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn"
            disabled={shareState === "copying"}
            onClick={() => void copyShareUrl()}
          >
            {shareState === "copying"
              ? "Copying…"
              : shareState === "copied"
                ? "Copied"
                : "Share"}
          </button>
          {shareState === "error" && (
            <span className="form-error" role="alert">
              Could not copy link
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" className="btn" onClick={retry} disabled={loading}>
            {loading ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {unavailableIds.length > 0 && !noMatchingSelection && (
        <p className="state-note" role="status">
          {unavailableIds.length === 1
            ? "One selected experiment is no longer available and was removed."
            : `${unavailableIds.length} selected experiments are no longer available and were removed.`}
        </p>
      )}

      {loading && (
        <p className="state-note" role="status">
          {loadedRef.current ? "Refreshing comparison…" : "Loading comparison…"}
        </p>
      )}

      {!loading && !initialLoadFailed && noMatchingSelection
        ? (
          <div className="experiment-empty">
            No selected experiments could be found. They may have been deleted
            or are unavailable. Choose another experiment to continue.
          </div>
        )
        : !loading && !initialLoadFailed && selected.length === 0
          ? (
            <div className="experiment-empty">
              Add experiments to build a comparison.
            </div>
          )
          : selected.length > 0 && (
            <div
              className="compare-table-scroll"
              role="region"
              aria-label="Experiment comparison table"
              aria-describedby="compare-table-help"
              tabIndex={0}
            >
              <table className="compare-table">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="compare-identity compare-experiment-column"
                    >
                      Experiment
                    </th>
                    <th scope="col" className="compare-task-column">Task</th>
                    <th scope="col" className="compare-status-column">Status</th>
                    {columns.map((column) => (
                      <th
                        key={JSON.stringify(column.identity)}
                        scope="col"
                        className={column.kind === "delta" ? "neutral-delta" : ""}
                      >
                        <span>{column.label}</span>
                        <small>
                          {GROUPS.find((group) => group.value === column.group)?.label}
                        </small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected.map((row) => (
                    <tr
                      key={row.id}
                      className={row.id === selection.baselineId ? "baseline-row" : ""}
                    >
                      <th
                        scope="row"
                        className="compare-identity compare-experiment-column"
                      >
                        <Link href={`/experiments/${row.id}`}>
                          {formatExperimentId(row.experiment_no)}
                        </Link>
                        <strong>{row.name}</strong>
                        {row.id === selection.baselineId && (
                          <span className="baseline-chip">Baseline</span>
                        )}
                      </th>
                      <td className="compare-task-column">
                        {row.task?.title ?? "—"}
                      </td>
                      <td className="compare-status-column">
                        {EXPERIMENT_STATUS_LABELS[row.status]}
                      </td>
                      {columns.map((column) => (
                        <td
                          key={JSON.stringify(column.identity)}
                          className={column.kind === "delta" ? "neutral-delta" : ""}
                        >
                          {displayValue(
                            column.values[row.id] ?? null,
                            column.kind === "delta",
                            column.key,
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

      <p id="compare-table-help" className="field-help">
        {"Missing values are shown as —. Context fields are flattened from the Experiment schema; numeric Result deltas are current minus baseline."}
      </p>
    </div>
  );
}
