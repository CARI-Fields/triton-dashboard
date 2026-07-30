"use client";

import { useMemo, useState } from "react";
import { compareContexts } from "@/lib/experiments/compare";
import { formatExperimentId } from "@/lib/experiments/policy";
import type { Experiment, ExperimentListRow } from "@/lib/types";

export default function BaselinePicker({
  current,
  candidates,
  value,
  onChange,
  compact = false,
}: {
  current: Experiment;
  candidates: ExperimentListRow[];
  value: string | null;
  onChange: (id: string | null) => void;
  compact?: boolean;
}) {
  const [search, setSearch] = useState("");
  const selected = value && value !== current.id
    ? candidates.find((candidate) => candidate.id === value) ?? null
    : null;
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = candidates
      .filter((candidate) => candidate.id !== current.id)
      .filter((candidate) => {
        if (!query) {
          return candidate.task_id === current.task_id
            || candidate.id === selected?.id;
        }
        return [
          candidate.name,
          candidate.task?.title ?? "",
          formatExperimentId(candidate.experiment_no),
        ].join(" ").toLowerCase().includes(query);
      })
      .sort((left, right) => {
        const leftSameTask = left.task_id === current.task_id ? 0 : 1;
        const rightSameTask = right.task_id === current.task_id ? 0 : 1;
        return leftSameTask - rightSameTask ||
          right.updated_at.localeCompare(left.updated_at);
      });
    if (selected && !matches.some((candidate) => candidate.id === selected.id)) {
      return [selected, ...matches];
    }
    return matches;
  }, [candidates, current.id, current.task_id, search, selected]);

  return (
    <div className={`baseline-picker ${compact ? "baseline-picker-compact" : ""}`}>
      <label>
        {compact ? null : <span>Baseline</span>}
        <select
          aria-label="Baseline"
          value={selected?.id ?? ""}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">No Baseline</option>
          {visible.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {formatExperimentId(candidate.experiment_no)} · {candidate.name} ·{" "}
              {candidate.task?.title ?? "Deleted task"}
            </option>
          ))}
        </select>
      </label>
      <input
        type="search"
        aria-label="Search Baseline experiments"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search current Task first, or find another Task"
      />
      {selected && selected.task_id !== current.task_id && (
        <p className="context-warning">
          Cross-Task Baseline: {selected.task?.title ?? "Deleted task"} ·{" "}
          {compareContexts(current, selected).length} context fields differ.
        </p>
      )}
    </div>
  );
}
