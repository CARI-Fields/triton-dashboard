"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExperimentListRow, Member, Task } from "@/lib/types";
import {
  applyExperimentFilters,
  EMPTY_EXPERIMENT_FILTERS,
  type ExperimentFilterState,
} from "@/lib/experiments/filters";
import {
  listExperimentRows,
  loadExperimentReferenceData,
  watchExperimentIndex,
} from "@/lib/experiments/repository";
import { serializeCompareSelection } from "@/lib/experiments/compare-url";
import CreateExperimentDialog from "@/components/experiments/CreateExperimentDialog";
import ExperimentFilters from "@/components/experiments/ExperimentFilters";
import ExperimentTable from "@/components/experiments/ExperimentTable";

export default function ExperimentsDatabase() {
  const router = useRouter();
  const [rows, setRows] = useState<ExperimentListRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filters, setFilters] = useState<ExperimentFilterState>(EMPTY_EXPERIMENT_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const [nextRows, references] = await Promise.all([
        listExperimentRows(),
        loadExperimentReferenceData(),
      ]);
      setRows(nextRows);
      setTasks(references.tasks);
      setMembers(references.members);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load experiments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return watchExperimentIndex(() => void reload());
  }, [reload]);

  const visibleRows = useMemo(
    () => applyExperimentFilters(rows, filters),
    [filters, rows],
  );

  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canCompare = selectedIds.size >= 2;
  const compareQuery = serializeCompareSelection({
    ids: [...selectedIds],
    baselineId: null,
  });

  return (
    <div className="workspace-page">
      <header className="workspace-page-header">
        <div>
          <p className="eyebrow">Research database</p>
          <h1>Experiments</h1>
          <p>Manual run context, evidence, and decisions across every Task.</p>
        </div>
        <div className="workspace-actions">
          <Link
            className={`btn ${canCompare ? "" : "disabled"}`}
            aria-disabled={!canCompare}
            href={canCompare ? `/experiments/compare?${compareQuery}` : "/experiments"}
            onClick={(event) => {
              if (!canCompare) event.preventDefault();
            }}
          >
            Compare selected ({selectedIds.size})
          </Link>
          <button type="button" className="btn primary" onClick={() => setCreateOpen(true)}>
            New experiment
          </button>
        </div>
      </header>

      <ExperimentFilters rows={rows} value={filters} onChange={setFilters} />
      {error && <div className="error-banner">{error}</div>}
      {loading
        ? <p className="state-note">Loading experiments…</p>
        : (
          <ExperimentTable
            rows={visibleRows}
            showTask
            selectable
            selectedIds={selectedIds}
            onToggle={toggle}
          />
        )}

      <CreateExperimentDialog
        open={createOpen}
        tasks={tasks}
        members={members}
        onClose={() => setCreateOpen(false)}
        onCreated={(experiment) => router.push(`/experiments/${experiment.id}`)}
      />
    </div>
  );
}
