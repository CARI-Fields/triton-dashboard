"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Experiment,
  ExperimentListRow,
  Member,
  Task,
} from "@/lib/types";
import { serializeCompareSelection } from "@/lib/experiments/compare-url";
import CreateExperimentDialog from "@/components/experiments/CreateExperimentDialog";
import ExperimentTable from "@/components/experiments/ExperimentTable";

interface SelectionState {
  taskId: string;
  availableKey: string;
  ids: Set<string>;
}

export default function TaskExperimentsPanel({
  task,
  experiments,
  members,
}: {
  task: Task;
  experiments: Experiment[];
  members: Member[];
}) {
  const router = useRouter();
  const taskExperiments = useMemo(
    () => experiments.filter((experiment) => experiment.task_id === task.id),
    [experiments, task.id],
  );
  const availableIds = new Set(
    taskExperiments.map((experiment) => experiment.id),
  );
  const availableKey = [...availableIds].sort().join(",");
  const [selection, setSelection] = useState<SelectionState>({
    taskId: task.id,
    availableKey,
    ids: new Set(),
  });
  const [createTaskId, setCreateTaskId] = useState<string | null>(null);

  let selectedIds = selection.ids;
  if (
    selection.taskId !== task.id ||
    selection.availableKey !== availableKey
  ) {
    if (selection.taskId !== task.id && createTaskId !== null) {
      setCreateTaskId(null);
    }
    selectedIds = selection.taskId === task.id
      ? new Set([...selection.ids].filter((id) => availableIds.has(id)))
      : new Set();
    setSelection({
      taskId: task.id,
      availableKey,
      ids: selectedIds,
    });
  }

  const rows = useMemo<ExperimentListRow[]>(
    () => taskExperiments.map((experiment) => ({
      ...experiment,
      task: { id: task.id, title: task.title },
      owner:
        members.find((member) => member.id === experiment.owner_id) ?? null,
    })),
    [members, task.id, task.title, taskExperiments],
  );

  function toggle(id: string) {
    if (!availableIds.has(id)) return;
    setSelection((current) => {
      const next = current.taskId === task.id
        ? new Set(
          [...current.ids].filter((selectedId) => availableIds.has(selectedId)),
        )
        : new Set<string>();
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return {
        taskId: task.id,
        availableKey,
        ids: next,
      };
    });
  }

  const canCompare = selectedIds.size >= 2;
  const compareQuery = serializeCompareSelection({
    ids: [...selectedIds],
    baselineId: null,
  });

  return (
    <section className="detail-section task-experiments-section">
      <div className="detail-section-head">
        <div>
          <h2>Experiments</h2>
          <p className="field-help">
            Structured evidence for this Task. Open a row to edit full context.
          </p>
        </div>
        <div className="workspace-actions">
          <Link
            className={`btn ${canCompare ? "" : "disabled"}`}
            aria-disabled={!canCompare}
            href={
              canCompare
                ? `/experiments/compare?${compareQuery}`
                : `/task/${task.id}`
            }
            onClick={(event) => {
              if (!canCompare) event.preventDefault();
            }}
          >
            Compare selected ({selectedIds.size})
          </Link>
          <button
            type="button"
            className="btn primary"
            onClick={() => setCreateTaskId(task.id)}
          >
            New experiment
          </button>
        </div>
      </div>
      <ExperimentTable
        rows={rows}
        showTask={false}
        selectable
        selectedIds={selectedIds}
        onToggle={toggle}
      />
      <CreateExperimentDialog
        key={task.id}
        open={createTaskId === task.id}
        tasks={[task]}
        members={members}
        fixedTaskId={task.id}
        onClose={() => setCreateTaskId(null)}
        onCreated={(experiment) => router.push(`/experiments/${experiment.id}`)}
      />
    </section>
  );
}
