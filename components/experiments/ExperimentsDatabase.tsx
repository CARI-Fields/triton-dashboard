"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import CreateExperimentDialog from "@/components/experiments/CreateExperimentDialog";
import ExperimentFilters from "@/components/experiments/ExperimentFilters";
import ExperimentTable from "@/components/experiments/ExperimentTable";
import PageHeader from "@/components/ui/PageHeader";
import WorkspaceSkeleton from "@/components/ui/WorkspaceSkeleton";

export default function ExperimentsDatabase() {
  const router = useRouter();
  const reloadVersion = useRef(0);
  const loadingRef = useRef(false);
  const loadedRef = useRef(false);
  const [rows, setRows] = useState<ExperimentListRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filters, setFilters] = useState<ExperimentFilterState>(EMPTY_EXPERIMENT_FILTERS);
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const requestVersion = ++reloadVersion.current;
    loadingRef.current = true;
    setLoading(true);
    try {
      const [nextRows, references] = await Promise.all([
        listExperimentRows(),
        loadExperimentReferenceData(),
      ]);
      if (requestVersion !== reloadVersion.current) return;
      loadedRef.current = true;
      setRows(nextRows);
      setTasks(references.tasks);
      setMembers(references.members);
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
  }, []);

  useEffect(() => {
    void reload();
    const unsubscribe = watchExperimentIndex(() => void reload());
    return () => {
      reloadVersion.current += 1;
      loadingRef.current = false;
      loadedRef.current = false;
      unsubscribe();
    };
  }, [reload]);

  function retry() {
    if (!loadingRef.current) void reload();
  }

  const visibleRows = useMemo(
    () => applyExperimentFilters(rows, filters),
    [filters, rows],
  );

  return (
    <div className="workspace-page experiments-database">
      <PageHeader
        eyebrow="Research database"
        title="Experiments"
        description="Manual run context, evidence, and decisions across every Task."
        actions={(
          <>
            <Link className="btn ghost" href="/experiments/templates">
              Templates
            </Link>
            <button type="button" className="btn primary" onClick={() => setCreateOpen(true)}>
              New experiment
            </button>
          </>
        )}
      />

      <ExperimentFilters
        rows={rows}
        value={filters}
        resultCount={visibleRows.length}
        onChange={setFilters}
      />
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" className="btn" onClick={retry} disabled={loading}>
            {loading ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}
      {loading && !loadedRef.current
        ? <WorkspaceSkeleton variant="table" label="Loading Experiments" />
        : !loadedRef.current && error
          ? null
          : visibleRows.length === 0
            ? (
              <div className="experiment-empty">
                <p>No experiments match this view.</p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setCreateOpen(true)}
                >
                  New experiment
                </button>
              </div>
            )
            : (
          <ExperimentTable
            rows={visibleRows}
            showTask
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
