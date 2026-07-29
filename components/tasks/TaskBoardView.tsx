import { useMemo } from "react";
import TaskCard from "@/components/tasks/TaskCard";
import { STATUS_OPTIONS } from "@/lib/status";
import type {
  Member,
  Status,
  TaskModel,
  TaskPatch,
  TaskType,
} from "@/lib/types";

export type BoardView = "board" | "types" | "ownership" | "team";
export type GroupBy = "status" | "type";

export interface TaskBoardViewProps {
  tasks: TaskModel[];
  types: TaskType[];
  members: Member[];
  groupBy: GroupBy;
  onOpenCreate(defaults: {
    status?: Status;
    typeId?: string | null;
  }): void;
  onPatchTask(id: string, patch: TaskPatch): Promise<void>;
  onDeleteTask(id: string): Promise<void>;
}

interface TaskGroup {
  id: string;
  name: string;
  status?: Status;
  typeId?: string | null;
  tasks: TaskModel[];
}

export default function TaskBoardView({
  tasks,
  types,
  members,
  groupBy,
  onOpenCreate,
  onPatchTask,
  onDeleteTask,
}: TaskBoardViewProps) {
  const typeMap = useMemo(
    () => new Map(types.map((type) => [type.id, type])),
    [types],
  );
  const groups = useMemo<TaskGroup[]>(() => {
    if (groupBy === "status") {
      return STATUS_OPTIONS.map((option) => ({
        id: option.value,
        name: option.label,
        status: option.value,
        tasks: tasks.filter((task) => task.status === option.value),
      }));
    }
    return [
      ...types.map((type) => ({
        id: type.id,
        name: type.name,
        typeId: type.id,
        tasks: tasks.filter((task) => task.typeId === type.id),
      })),
      {
        id: "no-type",
        name: "No type",
        typeId: null,
        tasks: tasks.filter((task) => task.typeId === null),
      },
    ];
  }, [groupBy, tasks, types]);

  return (
    <div
      className={`task-board group-by-${groupBy}`}
      data-group-count={groups.length}
    >
      {groups.map((group) => (
        <section className="task-column" key={group.id}>
          <div className="task-column-head">
            <span
              className={group.status
                ? `column-status-dot status-${group.status}`
                : "column-status-dot type-dot"}
              aria-hidden="true"
            />
            <h2>{group.name}</h2>
            <span className="task-count">{group.tasks.length}</span>
          </div>
          <div
            className="task-column-cards"
            role="region"
            aria-label={`${group.name} task list`}
            tabIndex={0}
          >
            {group.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                type={task.typeId ? typeMap.get(task.typeId) ?? null : null}
                types={types}
                members={members}
                showStatus={groupBy === "type"}
                onPatch={(patch) => onPatchTask(task.id, patch)}
                onDelete={() => onDeleteTask(task.id)}
              />
            ))}
          </div>
          <button
            type="button"
            className="column-add-task"
            aria-label={`Add task to ${group.name}`}
            onClick={() => onOpenCreate(
              groupBy === "status"
                ? { status: group.status }
                : { typeId: group.typeId ?? null },
            )}
          >
            <span aria-hidden="true">+</span>
            Add task
          </button>
        </section>
      ))}
    </div>
  );
}
