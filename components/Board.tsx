"use client";

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AddTaskDrawer from "@/components/tasks/AddTaskDrawer";
import BoardSecondaryViews from "@/components/tasks/BoardSecondaryViews";
import TaskBoardView, {
  type BoardView,
  type GroupBy,
} from "@/components/tasks/TaskBoardView";
import { Icon } from "@/components/ui/Icons";
import PageHeader from "@/components/ui/PageHeader";
import StatusDot from "@/components/ui/StatusDot";
import WorkspaceSkeleton from "@/components/ui/WorkspaceSkeleton";
import { logActivity } from "@/lib/activity";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  newTaskToStorage,
  taskFromStorage,
  taskPatchToStorage,
  taskTypeFromStorage,
  taskTypePatchToStorage,
} from "@/lib/tasks/model";
import { STATUS_OPTIONS, statusLabel } from "@/lib/status";
import type {
  ActivityKind,
  Member,
  Module,
  NewTaskInput,
  Status,
  Task,
  TaskModel,
  TaskPatch,
  TaskType,
} from "@/lib/types";

const BOARD_VIEWS: Array<{ value: BoardView; label: string }> = [
  { value: "board", label: "Board" },
  { value: "types", label: "Types" },
  { value: "ownership", label: "Ownership" },
  { value: "team", label: "Team" },
];

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function nextPosition(items: Array<{ position: number }>): number {
  return items.length > 0
    ? Math.max(...items.map((item) => item.position)) + 1
    : 0;
}

function errorMessage(caught: unknown): string {
  if (caught instanceof Error) return caught.message;
  if (
    typeof caught === "object"
    && caught !== null
    && "message" in caught
    && typeof caught.message === "string"
  ) {
    return caught.message;
  }
  return "The request failed.";
}

function SetupScreen() {
  return (
    <div className="wrap setup">
      <p className="eyebrow">Setup needed</p>
      <h1>Connect your Supabase project</h1>
      <p className="lede">
        The board is built — it just needs a database to talk to. Two values
        and you are live.
      </p>
      <div className="setup-card">
        <ol>
          <li>
            Create a free project at <code>supabase.com</code>.
          </li>
          <li>
            In the Supabase SQL Editor, run <code>supabase/schema.sql</code>,
            then <code>supabase/seed.sql</code>.
          </li>
          <li>
            Copy <code>.env.local.example</code> to <code>.env.local</code> and
            fill in <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (Project Settings → API).
          </li>
          <li>
            Restart the dev server (<code>npm run dev</code>). See{" "}
            <code>README.md</code> for the full walkthrough and Vercel deploy.
          </li>
        </ol>
      </div>
    </div>
  );
}

export default function Board() {
  const [types, setTypes] = useState<TaskType[]>([]);
  const [tasks, setTasks] = useState<TaskModel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [view, setView] = useState<BoardView>("board");
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [loading, setLoading] = useState(true);
  const [hasSuccessfulSnapshot, setHasSuccessfulSnapshot] = useState(false);
  const [loadErrorMsg, setLoadErrorMsg] = useState<string | null>(null);
  const [mutationErrorMsg, setMutationErrorMsg] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<{
    status?: Status;
    typeId?: string | null;
  }>({});
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const reloadGenerationRef = useRef(0);
  const memberRemovalLockRef = useRef(false);

  const recordActivity = useCallback((
    taskId: string,
    text: string,
    kind: ActivityKind,
  ) => {
    void logActivity(taskId, text, kind)
      .then((activityError) => {
        if (activityError) {
          setMutationErrorMsg(
            `Could not record activity. ${activityError}`,
          );
        }
      })
      .catch((caught: unknown) => {
        setMutationErrorMsg(
          `Could not record activity. ${errorMessage(caught)}`,
        );
      });
  }, []);

  const reload = useCallback(async () => {
    const generation = reloadGenerationRef.current + 1;
    reloadGenerationRef.current = generation;
    setLoading(true);
    if (!supabase) {
      if (generation === reloadGenerationRef.current) {
        setLoading(false);
      }
      return;
    }
    try {
      const [typeResult, taskResult, memberResult] = await Promise.all([
        supabase.from("modules").select("*").order("position"),
        supabase.from("tasks").select("*").order("position"),
        supabase.from("members").select("*").order("position"),
      ]);
      const firstError =
        typeResult.error || taskResult.error || memberResult.error;
      if (firstError) throw firstError;
      if (generation !== reloadGenerationRef.current) return;

      setTypes(
        (typeResult.data ?? []).map((row) => (
          taskTypeFromStorage(row as Module)
        )),
      );
      setTasks(
        (taskResult.data ?? []).map((row) => (
          taskFromStorage(row as Task)
        )),
      );
      setMembers((memberResult.data ?? []) as Member[]);
      setHasSuccessfulSnapshot(true);
      setLoadErrorMsg(null);
    } catch (caught) {
      if (generation !== reloadGenerationRef.current) return;
      setLoadErrorMsg(`Could not load board. ${errorMessage(caught)}`);
    } finally {
      if (generation === reloadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    const client = supabase;
    void reload();
    const refresh = () => {
      void reload();
    };
    const channel = client
      .channel("board-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "modules" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "members" },
        refresh,
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [reload]);

  const exposeMutationError = useCallback(async (
    action: string,
    caught: unknown,
  ) => {
    await reload();
    const message = errorMessage(caught);
    setMutationErrorMsg(`Could not ${action}. ${message}`);
    return new Error(message);
  }, [reload]);

  const createTask = useCallback(async (input: NewTaskInput) => {
    if (!supabase) {
      const caught = new Error("Supabase is not configured.");
      setMutationErrorMsg(`Could not create task. ${caught.message}`);
      throw caught;
    }
    setMutationErrorMsg(null);
    const position = tasks.length > 0
      ? Math.min(...tasks.map((task) => task.position)) - 1
      : 0;
    try {
      const result = await supabase
        .from("tasks")
        .insert(newTaskToStorage(input, position))
        .select("id")
        .single();
      if (result.error) throw result.error;
      await reload();
      if (result.data?.id) {
        recordActivity(result.data.id, "Task created", "create");
      }
    } catch (caught) {
      throw await exposeMutationError("create task", caught);
    }
  }, [exposeMutationError, recordActivity, reload, tasks]);

  const patchTask = useCallback(async (
    id: string,
    patch: TaskPatch,
  ) => {
    if (!supabase) {
      throw await exposeMutationError(
        "update task",
        new Error("Supabase is not configured."),
      );
    }
    setMutationErrorMsg(null);
    try {
      const result = await supabase
        .from("tasks")
        .update(taskPatchToStorage(patch))
        .eq("id", id);
      if (result.error) throw result.error;
      await reload();
      if (patch.status) {
        recordActivity(
          id,
          `Status set to ${statusLabel(patch.status)}`,
          "status",
        );
      } else if (patch.title) {
        recordActivity(id, `Renamed to “${patch.title}”`, "edit");
      } else if (patch.owners) {
        recordActivity(id, "Owner updated", "assign");
      }
    } catch (caught) {
      throw await exposeMutationError("update task", caught);
    }
  }, [exposeMutationError, recordActivity, reload]);

  const deleteTask = useCallback(async (id: string) => {
    const task = tasks.find((item) => item.id === id);
    if (!task || !supabase) return;
    if (!window.confirm(
      `Delete task “${task.title}”? This cannot be undone.`,
    )) return;
    setMutationErrorMsg(null);
    try {
      const result = await supabase.from("tasks").delete().eq("id", id);
      if (result.error) throw result.error;
      await reload();
    } catch (caught) {
      throw await exposeMutationError("delete task", caught);
    }
  }, [exposeMutationError, reload, tasks]);

  const createType = useCallback(async (rawName: string) => {
    const name = rawName.trim();
    if (!name) {
      throw new Error("Type name is required.");
    }
    if (!supabase) {
      throw await exposeMutationError(
        "create type",
        new Error("Supabase is not configured."),
      );
    }
    setMutationErrorMsg(null);
    try {
      const result = await supabase
        .from("modules")
        .insert({
          name,
          objective: "",
          kind: "pipeline",
          position: nextPosition(types),
        })
        .select("id")
        .single();
      if (result.error) throw result.error;
      const typeId = result.data?.id;
      if (!typeId) {
        throw new Error("Created Type did not return an id.");
      }
      await reload();
      return typeId;
    } catch (caught) {
      throw await exposeMutationError("create type", caught);
    }
  }, [exposeMutationError, reload, types]);

  const patchType = useCallback(async (
    id: string,
    patch: Partial<TaskType>,
  ) => {
    if (!supabase) {
      throw await exposeMutationError(
        "update type",
        new Error("Supabase is not configured."),
      );
    }
    setMutationErrorMsg(null);
    try {
      const result = await supabase
        .from("modules")
        .update(taskTypePatchToStorage(patch))
        .eq("id", id);
      if (result.error) throw result.error;
      await reload();
    } catch (caught) {
      throw await exposeMutationError("update type", caught);
    }
  }, [exposeMutationError, reload]);

  const deleteType = useCallback(async (type: TaskType) => {
    if (!supabase) return;
    if (!window.confirm(
      `Remove Type “${type.name}”? Its tasks will remain and move to No type.`,
    )) return;
    setMutationErrorMsg(null);
    try {
      const result = await supabase
        .from("modules")
        .delete()
        .eq("id", type.id);
      if (result.error) throw result.error;
      await reload();
    } catch (caught) {
      throw await exposeMutationError("remove type", caught);
    }
  }, [exposeMutationError, reload]);

  const addMember = useCallback(async (rawName: string) => {
    const name = rawName.trim();
    if (
      !name
      || members.some((member) => member.name === name)
    ) return;
    if (!supabase) {
      throw await exposeMutationError(
        "add owner",
        new Error("Supabase is not configured."),
      );
    }
    setMutationErrorMsg(null);
    try {
      const result = await supabase.from("members").insert({
        name,
        initials: initialsFromName(name),
        position: nextPosition(members),
      });
      if (result.error) throw result.error;
      await reload();
    } catch (caught) {
      throw await exposeMutationError("add owner", caught);
    }
  }, [exposeMutationError, members, reload]);

  const removeMember = useCallback(async (member: Member) => {
    if (!supabase || memberRemovalLockRef.current) return;
    if (!window.confirm(`Remove ${member.name} from the team?`)) return;
    memberRemovalLockRef.current = true;
    setMutationErrorMsg(null);

    const affectedTasks = tasks.filter(
      (task) => task.owners.includes(member.name),
    );
    try {
      for (const task of affectedTasks) {
        const owners = task.owners.filter(
          (owner) => owner !== member.name,
        );
        const updateResult = await supabase
          .from("tasks")
          .update(taskPatchToStorage({ owners }))
          .eq("id", task.id);
        if (updateResult.error) throw updateResult.error;
      }

      const deleteResult = await supabase
        .from("members")
        .delete()
        .eq("id", member.id);
      if (deleteResult.error) throw deleteResult.error;
      await reload();
    } catch (caught) {
      throw await exposeMutationError("remove member", caught);
    } finally {
      memberRemovalLockRef.current = false;
    }
  }, [exposeMutationError, reload, tasks]);

  const lastUpdated = useMemo(() => {
    const latest = tasks.reduce<number | null>((current, task) => {
      const timestamp = new Date(task.updated_at).getTime();
      if (Number.isNaN(timestamp)) return current;
      return current === null ? timestamp : Math.max(current, timestamp);
    }, null);
    return latest === null ? null : new Date(latest).toISOString();
  }, [tasks]);
  const errorMsg = mutationErrorMsg ?? loadErrorMsg;

  function handleViewTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % BOARD_VIEWS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + BOARD_VIEWS.length) % BOARD_VIEWS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = BOARD_VIEWS.length - 1;
    }
    if (nextIndex === null) return;

    event.preventDefault();
    setView(BOARD_VIEWS[nextIndex].value);
    tabRefs.current[nextIndex]?.focus();
  }

  if (!isSupabaseConfigured) return <SetupScreen />;

  return (
    <div className="board-page">
      <PageHeader
        eyebrow="Kernel Agent / RL Training"
        title="Task Board"
        description={(
          <p>
            Plan work, assign owners, and follow each task into its
            experiment record.
          </p>
        )}
        actions={(
          <button
            type="button"
            className="btn primary board-new-task"
            onClick={() => {
              setCreateDefaults({});
              setCreateOpen(true);
            }}
          >
            <Icon name="plus" size={18} />
            New task
          </button>
        )}
      />

      <div className="board-view-tabs" role="tablist" aria-label="Task views">
        {BOARD_VIEWS.map((item, index) => (
          <button
            key={item.value}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            id={`board-view-tab-${item.value}`}
            type="button"
            role="tab"
            aria-selected={view === item.value}
            aria-controls="board-view-panel"
            tabIndex={view === item.value ? 0 : -1}
            onClick={() => setView(item.value)}
            onKeyDown={(event) => handleViewTabKeyDown(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        id="board-view-panel"
        className="board-view-panel"
        role="tabpanel"
        aria-labelledby={`board-view-tab-${view}`}
      >
        {view === "board" ? (
          <div className="board-toolbar">
            <div className="board-status-legend" aria-label="Task statuses">
              {STATUS_OPTIONS.map((option) => (
                <StatusDot
                  key={option.value}
                  status={option.value}
                  label={option.label}
                />
              ))}
            </div>
            <label className="group-control">
              <span>Group by</span>
              <select
                aria-label="Group by"
                value={groupBy}
                onChange={(event) => (
                  setGroupBy(event.target.value as GroupBy)
                )}
              >
                <option value="status">Status</option>
                <option value="type">Type</option>
              </select>
            </label>
          </div>
        ) : null}

        {errorMsg ? (
          <div className="error-banner board-error-banner" role="alert">
            <span>{errorMsg}</span>
            {loadErrorMsg ? (
              <button
                type="button"
                className="btn"
                disabled={loading}
                onClick={() => void reload()}
              >
                {loading ? "Retrying…" : "Retry"}
              </button>
            ) : null}
          </div>
        ) : null}

        {loading && !hasSuccessfulSnapshot ? (
          <WorkspaceSkeleton variant="board" label="Loading Task Board" />
        ) : !hasSuccessfulSnapshot ? null : view === "board" ? (
          <>
            <p id="task-board-scroll-help" className="sr-only">
              Scroll horizontally to reach every Task Board column.
            </p>
            <div
              className="task-board-scroll"
              role="region"
              aria-label="Task Board columns"
              aria-describedby="task-board-scroll-help"
              tabIndex={0}
            >
              <TaskBoardView
                tasks={tasks}
                types={types}
                members={members}
                groupBy={groupBy}
                onOpenCreate={(defaults) => {
                  setCreateDefaults(defaults);
                  setCreateOpen(true);
                }}
                onPatchTask={patchTask}
                onDeleteTask={deleteTask}
              />
            </div>
          </>
        ) : (
          <BoardSecondaryViews
            view={view}
            tasks={tasks}
            types={types}
            members={members}
            onCreateType={createType}
            onPatchType={patchType}
            onDeleteType={deleteType}
            onAddMember={addMember}
            onRemoveMember={removeMember}
          />
        )}

        {lastUpdated ? (
          <p className="board-sync-note">
            Live updates enabled · authoritative rows refreshed after every
            change
          </p>
        ) : null}
      </div>

      <AddTaskDrawer
        open={createOpen}
        types={types}
        members={members}
        defaults={createDefaults}
        onClose={() => setCreateOpen(false)}
        onCreate={createTask}
        onCreateType={createType}
      />
    </div>
  );
}
