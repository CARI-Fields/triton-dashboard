"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Experiment,
  ExperimentListRow,
  Member,
  TaskModel,
} from "@/lib/types";
import CreateExperimentDialog from "@/components/experiments/CreateExperimentDialog";
import ExperimentTable from "@/components/experiments/ExperimentTable";

export default function TaskExperimentsPanel({
  task,
  experiments,
  members,
}: {
  task: TaskModel;
  experiments: Experiment[];
  members: Member[];
}) {
  const router = useRouter();
  const taskExperiments = useMemo(
    () => experiments.filter((experiment) => experiment.task_id === task.id),
    [experiments, task.id],
  );
  const [createTaskId, setCreateTaskId] = useState<string | null>(null);

  const rows = useMemo<ExperimentListRow[]>(
    () => taskExperiments.map((experiment) => ({
      ...experiment,
      task: { id: task.id, title: task.title },
      owner:
        members.find((member) => member.id === experiment.owner_id) ?? null,
    })),
    [members, task.id, task.title, taskExperiments],
  );

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
