"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import WorkspaceSkeleton from "@/components/ui/WorkspaceSkeleton";
import {
  listTemplateSummaries,
  loadTemplateDraft,
  type TemplateKeyDraft,
  type TemplateDraft,
  type TemplateSummary,
} from "@/lib/templates/repository";
import type { TypedValue } from "@/lib/experiments/values";
import { loadTemplateCompareRows } from "@/lib/templates/compare-data";
import {
  applyCompareFilters,
  cellDifference,
  sortCompareRows,
  type CompareRow,
  type CompareViewFilter,
} from "@/lib/templates/compare";
import {
  parseCompareSearchParams,
  serializeCompareViewState,
  type CompareSearchParams,
  type CompareViewState,
} from "@/lib/templates/compare-url";

const FIXED_COLUMNS = [
  { id: "experimentId", label: "ID" },
  { id: "name", label: "Name" },
  { id: "task", label: "Task" },
  { id: "owner", label: "Owner" },
  { id: "status", label: "Status" },
  { id: "archived", label: "Archive" },
] as const;

export default function TemplateExperimentCompare({
  initialState,
  searchParams,
}: {
  initialState?: CompareViewState | null;
  searchParams?: CompareSearchParams;
}) {
  const router = useRouter();
  const [summaries, setSummaries] = useState<TemplateSummary[]>([]);
  const [template, setTemplate] = useState<TemplateDraft | null>(null);
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [state, setState] = useState<CompareViewState>(
    () => initialState ?? {
      templateId: null,
      includeArchived: false,
      baselineId: null,
      visibleKeyIds: [],
      sort: null,
      filters: {},
    },
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    listTemplateSummaries()
      .then(setSummaries)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Could not load Templates."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!state.templateId) {
      setTemplate(null);
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      loadTemplateDraft(state.templateId),
      loadTemplateCompareRows(state.templateId, state.includeArchived),
    ]).then(([draft, loadedRows]) => {
      if (cancelled) return;
      setTemplate(draft);
      setRows(loadedRows);
      setLoading(false);
    }).catch((caught) => {
      if (cancelled) return;
      setError(caught instanceof Error ? caught.message : "Could not load the comparison.");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [state.templateId, state.includeArchived]);

  const activeKeys = useMemo(
    () => template?.fields.flatMap((field) => field.keys) ?? [],
    [template],
  );
  const visibleKeys = useMemo(() => {
    if (state.visibleKeyIds.length === 0) return activeKeys;
    const byId = new Map(activeKeys.map((key) => [key.id, key]));
    return state.visibleKeyIds
      .map((id) => byId.get(id))
      .filter((key): key is NonNullable<typeof key> => key !== undefined);
  }, [activeKeys, state.visibleKeyIds]);

  const filteredAndSorted = useMemo(() => {
    let next = applyCompareFilters(rows, state.filters);
    if (state.sort) next = sortCompareRows(next, state.sort);
    return next;
  }, [rows, state.filters, state.sort]);

  const baselineRow = useMemo(
    () => filteredAndSorted.find((entry) => entry.experimentId === state.baselineId) ?? null,
    [filteredAndSorted, state.baselineId],
  );

  function patch(next: Partial<CompareViewState>) {
    const updated = { ...stateRef.current, ...next };
    setState(updated);
    const params = new URLSearchParams(serializeCompareViewState(updated));
    router.replace(`/experiments/compare?${params.toString()}`);
  }

  function selectTemplate(templateId: string) {
    patch({
      templateId,
      baselineId: null,
      visibleKeyIds: [],
      sort: null,
      filters: {},
    });
  }

  function toggleColumn(keyId: string) {
    const currentlyVisible = visibleKeys.some((key) => key.id === keyId);
    const next = currentlyVisible
      ? state.visibleKeyIds.filter((id) => id !== keyId)
      : [...state.visibleKeyIds, keyId];
    patch({ visibleKeyIds: next });
  }

  function setFilter(keyId: string, filter: CompareViewFilter | null) {
    const filters = { ...state.filters };
    if (filter) filters[keyId] = filter;
    else delete filters[keyId];
    patch({ filters });
  }

  if (loading && summaries.length === 0) {
    return <WorkspaceSkeleton variant="table" label="Loading Compare" />;
  }

  return (
    <div className="workspace-page template-compare">
      <PageHeader
        eyebrow="Analysis"
        title="Compare experiments"
        description="One typed schema per comparable series."
        actions={
          <select
            aria-label="Template"
            value={state.templateId ?? ""}
            onChange={(event) => selectTemplate(event.target.value)}
          >
            <option value="">Choose a template…</option>
            {summaries
              .filter((summary) => summary.template.archived_at === null)
              .map((summary) => (
                <option key={summary.template.id} value={summary.template.id}>
                  {summary.template.name}
                </option>
              ))}
          </select>
        }
      />
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {state.templateId && template ? (
        <>
          <div className="compare-toolbar">
            <label>
              <input
                type="checkbox"
                checked={state.includeArchived}
                onChange={(event) => patch({ includeArchived: event.target.checked })}
              />
              Include archived
            </label>
            <label>
              Baseline
              <select
                aria-label="Baseline"
                value={state.baselineId ?? ""}
                onChange={(event) =>
                  patch({ baselineId: event.target.value || null })}
              >
                <option value="">—</option>
                {filteredAndSorted.map((entry) => (
                  <option key={entry.experimentId} value={entry.experimentId}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Columns
              <select
                aria-label="Columns"
                value=""
                onChange={(event) => toggleColumn(event.target.value)}
              >
                <option value="">Toggle columns…</option>
                {activeKeys.map((key) => (
                  <option key={key.id} value={key.id ?? ""}>
                    {visibleKeys.some((visible) => visible.id === key.id)
                      ? `Hide ${key.key}`
                      : `Show ${key.key}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {baselineRow ? (
            <p className="compare-baseline-note">Baseline: {baselineRow.name}</p>
          ) : null}

          <div className="compare-scroll" tabIndex={0}>
            <table className="compare-table">
              <thead>
                <tr className="compare-group-row">
                  <th scope="colgroup" colSpan={FIXED_COLUMNS.length} className="compare-corner">
                    Experiment
                  </th>
                  {template.fields.map((field) => {
                    const fieldKeys = field.keys.filter((key) =>
                      visibleKeys.some((visible) => visible.id === key.id),
                    );
                    if (fieldKeys.length === 0) return null;
                    return (
                      <th
                        key={field.id}
                        scope="colgroup"
                        colSpan={fieldKeys.length}
                        className={`compare-group token-${field.colorToken}`}
                      >
                        {field.label}
                      </th>
                    );
                  })}
                </tr>
                <tr className="compare-key-row">
                  {FIXED_COLUMNS.map((column) => (
                    <th key={column.id} scope="col">{column.label}</th>
                  ))}
                  {visibleKeys.map((key) => (
                    <th key={key.id} scope="col" className="compare-key-head">
                      <button
                        type="button"
                        aria-label={`Sort by ${key.key}`}
                        onClick={() =>
                          patch({
                            sort: {
                              keyId: key.id!,
                              direction: state.sort?.keyId === key.id
                                && state.sort.direction === "asc"
                                ? "desc"
                                : "asc",
                            },
                          })}
                      >
                        {key.key}
                        {state.sort?.keyId === key.id
                          ? (state.sort.direction === "asc" ? " ↑" : " ↓")
                          : ""}
                      </button>
                      <FilterMenu
                        keyId={key.id!}
                        keyDef={key}
                        filter={state.filters[key.id!]}
                        onApply={(filter) => setFilter(key.id!, filter)}
                        onClear={() => setFilter(key.id!, null)}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((entry) => (
                  <CompareRowView
                    key={entry.experimentId}
                    entry={entry}
                    baselineRow={baselineRow}
                    visibleKeys={visibleKeys}
                    isBaseline={entry.experimentId === state.baselineId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="template-empty">
          {summaries.length === 0
            ? "Create a Template first, then compare Experiments that use it."
            : "Choose a Template to compare its Experiments."}
        </p>
      )}
    </div>
  );
}

function CompareRowView({
  entry,
  baselineRow,
  visibleKeys,
  isBaseline,
}: {
  entry: CompareRow;
  baselineRow: CompareRow | null;
  visibleKeys: Array<{ id: string | null; key: string }>;
  isBaseline: boolean;
}) {
  return (
    <tr className={isBaseline ? "compare-baseline-row" : undefined}>
      <td>{entry.experimentNo}</td>
      <td>{entry.name}</td>
      <td>{entry.taskTitle ?? "—"}</td>
      <td>{entry.ownerName ?? "—"}</td>
      <td>{entry.status}</td>
      <td>{entry.archivedAt ? "Archived" : ""}</td>
      {visibleKeys.map((key) => {
        const raw = entry.values.get(key.id!)?.value ?? null;
        const difference = baselineRow
          ? cellDifference({ row: entry, baselineRow, keyId: key.id! })
          : null;
        return (
          <td
            key={key.id}
            className={
              difference?.different
                ? "compare-cell-different"
                : undefined
            }
          >
            <CellValue value={raw} />
            {difference?.different && difference.delta !== null ? (
              <span className="compare-delta">
                {(() => {
                  const rounded = Number(difference.delta.toFixed(4));
                  return `${rounded >= 0 ? "+" : ""}${rounded}`;
                })()}
              </span>
            ) : null}
          </td>
        );
      })}
    </tr>
  );
}

function CellValue({ value }: { value: TypedValue | null }) {
  if (!value) return <span className="compare-missing">—</span>;
  switch (value.kind) {
    case "short_text": return <span>{value.text || "—"}</span>;
    case "long_text": return <span>{value.text || "—"}</span>;
    case "url": return <a href={value.url} target="_blank" rel="noreferrer">{value.url}</a>;
    case "number": return <span>{value.number}</span>;
    case "boolean": return <span>{String(value.boolean)}</span>;
    case "date_time": return <span>{new Date(value.datetime).toLocaleString()}</span>;
    case "single_select": return <span>{value.optionId}</span>;
    case "multi_select": return <span>{value.optionIds.join(", ") || "—"}</span>;
    case "attachment": return <span>{value.attachmentIds.length} attachment{value.attachmentIds.length === 1 ? "" : "s"}</span>;
  }
}

function FilterMenu({
  keyId,
  keyDef,
  filter,
  onApply,
  onClear,
}: {
  keyId: string;
  keyDef: TemplateKeyDraft;
  filter: CompareViewFilter | undefined;
  onApply: (filter: CompareViewFilter) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(filter?.kind === "contains" ? filter.text : "");
  const [min, setMin] = useState(filter?.kind === "min" ? String(filter.number) : "");
  const [max, setMax] = useState(filter?.kind === "max" ? String(filter.number) : "");
  const [present, setPresent] = useState(filter?.kind === "present" ? filter.present : null);
  const [optionIds, setOptionIds] = useState<string[]>(
    filter?.kind === "options" ? filter.optionIds : [],
  );

  if (!open) {
    return (
      <button
        type="button"
        className="compare-filter-toggle"
        aria-label={`Filter ${keyId}`}
        onClick={() => setOpen(true)}
      >
        {filter ? "●" : "○"}
      </button>
    );
  }

  return (
    <span className="compare-filter-menu">
      <input
        aria-label={`Contains for ${keyId}`}
        placeholder="Contains…"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <input
        aria-label={`Min for ${keyId}`}
        placeholder="Min…"
        value={min}
        onChange={(event) => setMin(event.target.value)}
      />
      <input
        aria-label={`Max for ${keyId}`}
        placeholder="Max…"
        value={max}
        onChange={(event) => setMax(event.target.value)}
      />
      {keyDef.options.length > 0 ? (
        <span className="compare-filter-options" role="group" aria-label={`Options for ${keyId}`}>
          {keyDef.options
            .filter((option) => !option.archived)
            .map((option) => (
              <label key={option.id ?? `new-${option.position}`} className="compare-filter-option">
                <input
                  type="checkbox"
                  checked={option.id !== null && optionIds.includes(option.id)}
                  disabled={option.id === null}
                  onChange={() => {
                    if (option.id === null) return;
                    setOptionIds((current) => current.includes(option.id!)
                      ? current.filter((id) => id !== option.id)
                      : [...current, option.id!]);
                  }}
                />
                {option.label}
              </label>
            ))}
        </span>
      ) : null}
      <label className="compare-filter-option">
        <input
          type="checkbox"
          checked={present === true}
          onChange={(event) => setPresent(event.target.checked ? true : null)}
        />
        Present only
      </label>
      <label className="compare-filter-option">
        <input
          type="checkbox"
          checked={present === false}
          onChange={(event) => setPresent(event.target.checked ? false : null)}
        />
        Missing only
      </label>
      <button
        type="button"
        className="btn ghost small"
        onClick={() => {
          const next: CompareViewFilter | null =
            present !== null
              ? { kind: "present", present }
              : optionIds.length > 0
                ? { kind: "options", optionIds }
                : text
              ? { kind: "contains", text }
              : min
                ? { kind: "min", number: Number(min) }
                : max
                  ? { kind: "max", number: Number(max) }
                  : null;
          if (next) onApply(next);
          else onClear();
          setOpen(false);
        }}
      >
        Apply
      </button>
      <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </span>
  );
}
