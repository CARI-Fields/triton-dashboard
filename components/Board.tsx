"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import MarkdownField from "@/components/MarkdownField";
import { logActivity } from "@/lib/activity";
import { STATUS_OPTIONS, statusLabel } from "@/lib/status";
import {
  assignTaskMember,
  normalizeTaskRow,
  TASK_WITH_ASSIGNEES_SELECT,
  type TaskRelationRow,
  unassignTaskMember,
} from "@/lib/tasks/assignees";
import { relTime } from "@/lib/time";
import type { ActivityKind, Member, Module, Task } from "@/lib/types";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarText(name: string, members: Member[]): string {
  const m = members.find((mem) => mem.name === name);
  return m?.initials || initialsFromName(name);
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : "The request failed.";
}

function nextPosition(items: { position: number }[]): number {
  return items.length ? Math.max(...items.map((i) => i.position)) + 1 : 0;
}

/** Close a popover when clicking/tabbing outside of it. */
function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onOutside]);
  return ref;
}

/* ------------------------------------------------------------------ */
/* Inline-editable text                                                */
/* ------------------------------------------------------------------ */
function EditableText({
  value,
  onSave,
  placeholder,
  multiline = false,
  ariaLabel,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  // Keep local draft in sync with remote changes, but never clobber an edit in progress.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== value) onSave(trimmed);
  }

  if (editing) {
    const shared = {
      className: "edit-input",
      value: draft,
      autoFocus: true,
      "aria-label": ariaLabel,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onBlur: commit,
    };
    return multiline ? (
      <textarea
        {...shared}
        rows={3}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    ) : (
      <input
        {...shared}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <span
      className={`editable ${value ? "" : "placeholder"}`}
      role="button"
      tabIndex={0}
      title="Click to edit"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      {value || placeholder || "Click to edit"}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Assignee picker                                                     */
/* ------------------------------------------------------------------ */
function AssigneePicker({
  task,
  members,
  open,
  onToggleOpen,
  onClose,
  onToggle,
  onAddMember,
}: {
  task: Task;
  members: Member[];
  open: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  onToggle: (name: string) => void;
  onAddMember: (name: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const ref = useClickOutside(onClose);

  function submitNew() {
    const n = newName.trim();
    if (!n) return;
    onAddMember(n);
    setNewName("");
  }

  const unassigned = members.filter((m) => !task.assignees.includes(m.name));

  return (
    <div className="picker" ref={ref}>
      <div className="owners">
        {task.assignees.map((name) => (
          <span className="owner-chip" key={name} title={name}>
            <span className="av">{avatarText(name, members)}</span>
            <button
              className="owner-x"
              onClick={() => onToggle(name)}
              aria-label={`Unassign ${name}`}
              title={`Unassign ${name}`}
            >
              ✕
            </button>
          </span>
        ))}
        <button
          className="add-owner"
          onClick={onToggleOpen}
          aria-label="Assign people"
          title="Assign people"
        >
          +
        </button>
      </div>

      {open && (
        <div className="menu" role="menu">
          {unassigned.map((m) => (
            <button
              key={m.id}
              className="menu-item"
              onClick={() => onToggle(m.name)}
            >
              <span className="av">{m.initials || initialsFromName(m.name)}</span>
              {m.name}
            </button>
          ))}
          {members.length > 0 && unassigned.length === 0 && (
            <div className="menu-empty">Everyone is assigned.</div>
          )}
          <div className="menu-divider" />
          <div className="menu-add">
            <input
              value={newName}
              placeholder="Add teammate…"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitNew();
                }
              }}
            />
            <button className="btn" onClick={submitNew}>
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Task row                                                            */
/* ------------------------------------------------------------------ */
function TaskRow({
  task,
  members,
  pickerOpen,
  onTogglePicker,
  onClosePicker,
  onPatch,
  onDelete,
  onToggleAssignee,
  onAddMember,
}: {
  task: Task;
  members: Member[];
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onClosePicker: () => void;
  onPatch: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onToggleAssignee: (name: string) => void;
  onAddMember: (name: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  return (
    <div className="task">
      <div className="task-title">
        {renaming ? (
          <input
            className="edit-input"
            autoFocus
            defaultValue={task.title}
            aria-label="Rename task"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== task.title) onPatch({ title: v });
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <>
            <Link className="task-open" href={`/task/${task.id}`}>
              {task.title}
              <span className="open-hint" aria-hidden="true">↗</span>
            </Link>
            <button
              className="icon-btn subtle rename-btn"
              onClick={() => setRenaming(true)}
              aria-label="Rename task"
              title="Rename"
            >
              ✎
            </button>
            <span className="task-updated" title="Last updated">{relTime(task.updated_at)}</span>
          </>
        )}
      </div>
      <div className="task-meta">
        <div className="task-left">
          <AssigneePicker
            task={task}
            members={members}
            open={pickerOpen}
            onToggleOpen={onTogglePicker}
            onClose={onClosePicker}
            onToggle={onToggleAssignee}
            onAddMember={onAddMember}
          />
        </div>
        <div className="task-left">
          <select
            className={`pill ${task.status}`}
            value={task.status}
            aria-label="Status"
            onChange={(e) => onPatch({ status: e.target.value as Task["status"] })}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button className="icon-btn" onClick={onDelete} aria-label="Delete task" title="Delete task">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Module card                                                         */
/* ------------------------------------------------------------------ */
function ModuleCard({
  module,
  number,
  tasks,
  members,
  pickerId,
  onSetPicker,
  onPatchModule,
  onDeleteModule,
  onAddTask,
  onPatchTask,
  onDeleteTask,
  onToggleAssignee,
  onAddMemberToTask,
}: {
  module: Module;
  number: number | null;
  tasks: Task[];
  members: Member[];
  pickerId: string | null;
  onSetPicker: (id: string | null) => void;
  onPatchModule: (patch: Partial<Module>) => void;
  onDeleteModule: () => void;
  onAddTask: () => void;
  onPatchTask: (taskId: string, patch: Partial<Task>) => void;
  onDeleteTask: (taskId: string) => void;
  onToggleAssignee: (taskId: string, name: string) => void;
  onAddMemberToTask: (taskId: string, name: string) => void;
}) {
  const found = module.kind === "foundation";
  return (
    <article className={`stage ${found ? "found" : ""}`}>
      <div className="stage-head">
        {number !== null ? (
          <span className="stage-num">{String(number).padStart(2, "0")}</span>
        ) : (
          <span className="stage-tag">Cross-cutting</span>
        )}
        <span className="stage-name">
          <EditableText
            value={module.name}
            ariaLabel="Module name"
            onSave={(v) => onPatchModule({ name: v })}
          />
        </span>
        <button
          className="icon-btn"
          onClick={onDeleteModule}
          aria-label="Delete module"
          title="Delete module"
        >
          ✕
        </button>
      </div>

      <div className="stage-obj">
        <MarkdownField
          value={module.objective}
          placeholder="Describe the objective… (Markdown)"
          onSave={(v) => onPatchModule({ objective: v })}
        />
      </div>

      <div className="tasks">
        {tasks.length === 0 && <div className="empty">No tasks yet</div>}
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            members={members}
            pickerOpen={pickerId === t.id}
            onTogglePicker={() => onSetPicker(pickerId === t.id ? null : t.id)}
            onClosePicker={() => {
              if (pickerId === t.id) onSetPicker(null);
            }}
            onPatch={(patch) => onPatchTask(t.id, patch)}
            onDelete={() => onDeleteTask(t.id)}
            onToggleAssignee={(name) => onToggleAssignee(t.id, name)}
            onAddMember={(name) => onAddMemberToTask(t.id, name)}
          />
        ))}
        <button className="btn btn-add-task" onClick={onAddTask}>
          + Add task
        </button>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Setup screen (shown when env vars are missing)                      */
/* ------------------------------------------------------------------ */
function SetupScreen() {
  return (
    <div className="wrap setup">
      <p className="eyebrow">Setup needed</p>
      <h1>Connect your Supabase project</h1>
      <p className="lede">
        The board is built — it just needs a database to talk to. Two values and you are live.
      </p>
      <div className="setup-card">
        <ol>
          <li>
            Create a free project at <code>supabase.com</code>.
          </li>
          <li>
            In the Supabase SQL Editor, run <code>supabase/schema.sql</code>, then{" "}
            <code>supabase/seed.sql</code>.
          </li>
          <li>
            Copy <code>.env.local.example</code> to <code>.env.local</code> and fill in{" "}
            <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
            (Project Settings → API).
          </li>
          <li>
            Restart the dev server (<code>npm run dev</code>). See <code>README.md</code> for the full
            walkthrough and Vercel deploy.
          </li>
        </ol>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */
export default function Board() {
  const [modules, setModules] = useState<Module[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErrorMsg, setLoadErrorMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);
  const [newMember, setNewMember] = useState("");
  const [pickerId, setPickerId] = useState<string | null>(null);
  const errorMsg = actionErrorMsg ?? loadErrorMsg;

  const recordActivity = useCallback((
    taskId: string,
    text: string,
    kind: ActivityKind,
  ) => {
    void logActivity(taskId, text, kind)
      .then((activityError) => {
        if (activityError) {
          setActionErrorMsg(`Could not record activity. ${activityError}`);
        }
      })
      .catch((caught: unknown) => {
        const message = caught instanceof Error
          ? caught.message
          : "The request failed.";
        setActionErrorMsg(`Could not record activity. ${message}`);
      });
  }, []);

  const reload = useCallback(async () => {
    if (!supabase) return;
    const [m, t, mem] = await Promise.all([
      supabase.from("modules").select("*").order("position"),
      supabase
        .from("tasks")
        .select(TASK_WITH_ASSIGNEES_SELECT)
        .order("position"),
      supabase.from("members").select("*").order("position"),
    ]);
    const firstError = m.error || t.error || mem.error;
    if (firstError) {
      setLoadErrorMsg(firstError.message);
    } else {
      setModules((m.data ?? []) as Module[]);
      setTasks(
        ((t.data ?? []) as unknown as TaskRelationRow[]).map(normalizeTaskRow),
      );
      setMembers((mem.data ?? []) as Member[]);
      setLoadErrorMsg(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    const client = supabase;
    reload();
    const channel = client
      .channel("board-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "modules" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, reload)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_assignees" },
        reload,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "members" }, reload)
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [reload]);

  /* ---- mutations ---- */
  const addModule = useCallback(
    async (kind: Module["kind"]) => {
      if (!supabase) return;
      const siblings = modules.filter((m) => m.kind === kind);
      await supabase
        .from("modules")
        .insert({ name: "New module", kind, objective: "", position: nextPosition(siblings) });
      reload();
    },
    [modules, reload]
  );

  const patchModule = useCallback(
    async (id: string, patch: Partial<Module>) => {
      if (!supabase) return;
      await supabase.from("modules").update(patch).eq("id", id);
      reload();
    },
    [reload]
  );

  const deleteModule = useCallback(
    async (id: string, name: string) => {
      if (!supabase) return;
      if (!window.confirm(`Delete module "${name}" and all its tasks?`)) return;
      await supabase.from("modules").delete().eq("id", id);
      reload();
    },
    [reload]
  );

  const addTask = useCallback(
    async (moduleId: string) => {
      if (!supabase) return;
      const siblings = tasks.filter((t) => t.module_id === moduleId);
      // Pin new tasks to the top of the column, and open the assignee picker
      // right away so the task can be assigned without another click.
      const topPos = siblings.length ? Math.min(...siblings.map((i) => i.position)) - 1 : 0;
      const { data } = await supabase
        .from("tasks")
        .insert({
          module_id: moduleId,
          title: "New task",
          status: "todo",
          position: topPos,
        })
        .select("id")
        .single();
      if (data) {
        recordActivity(data.id, "Task created", "create");
        setPickerId(data.id);
      }
      reload();
    },
    [recordActivity, tasks, reload]
  );

  const patchTask = useCallback(
    async (id: string, patch: Partial<Task>) => {
      if (!supabase) return;
      await supabase.from("tasks").update(patch).eq("id", id);
      if (patch.status) {
        recordActivity(id, `Status set to ${statusLabel(patch.status)}`, "status");
      }
      if (patch.title) {
        recordActivity(id, `Renamed to “${patch.title}”`, "edit");
      }
      reload();
    },
    [recordActivity, reload]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      if (!supabase) return;
      await supabase.from("tasks").delete().eq("id", id);
      reload();
    },
    [reload]
  );

  const toggleAssignee = useCallback(
    async (taskId: string, name: string) => {
      if (!supabase) return;
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      setActionErrorMsg(null);
      try {
        const member = members.find((candidate) => candidate.name === name);
        if (!member) throw new Error(`Unknown member: ${name}`);
        const had = task.assignees.includes(name);
        if (had) {
          await unassignTaskMember(supabase, taskId, member.id);
        } else {
          await assignTaskMember(supabase, taskId, member.id);
        }
        recordActivity(
          taskId,
          `${had ? "Unassigned" : "Assigned"} ${name}`,
          "assign",
        );
        reload();
      } catch (caught) {
        setActionErrorMsg(
          `Could not update Task assignment. ${errorMessage(caught)}`,
        );
      }
    },
    [members, recordActivity, tasks, reload]
  );

  const addMember = useCallback(
    async (name: string) => {
      if (!supabase) return;
      const n = name.trim();
      if (!n || members.some((m) => m.name === n)) return;
      await supabase
        .from("members")
        .insert({ name: n, initials: initialsFromName(n), position: nextPosition(members) });
      reload();
    },
    [members, reload]
  );

  const addMemberToTask = useCallback(
    async (taskId: string, name: string) => {
      if (!supabase) return;
      const n = name.trim();
      if (!n) return;
      setActionErrorMsg(null);
      try {
        let member = members.find((candidate) => candidate.name === n);
        if (!member) {
          const { data, error } = await supabase
            .from("members")
            .insert({
              name: n,
              initials: initialsFromName(n),
              position: nextPosition(members),
            })
            .select("*")
            .single();
          if (error) throw new Error(error.message);
          member = data as Member;
        }
        const task = tasks.find((t) => t.id === taskId);
        if (task && !task.assignees.includes(n)) {
          await assignTaskMember(supabase, taskId, member.id);
          recordActivity(taskId, `Assigned ${n}`, "assign");
        }
        reload();
      } catch (caught) {
        setActionErrorMsg(
          `Could not add and assign teammate. ${errorMessage(caught)}`,
        );
      }
    },
    [members, recordActivity, tasks, reload]
  );

  const removeMember = useCallback(
    async (member: Member) => {
      if (!supabase) return;
      if (!window.confirm(`Remove ${member.name} from the team?`)) return;
      await supabase.from("members").delete().eq("id", member.id);
      reload();
    },
    [reload]
  );

  /* ---- derived ---- */
  const pipeline = useMemo(() => modules.filter((m) => m.kind === "pipeline"), [modules]);
  const foundations = useMemo(() => modules.filter((m) => m.kind === "foundation"), [modules]);
  const tasksByModule = useCallback(
    (moduleId: string) => tasks.filter((t) => t.module_id === moduleId),
    [tasks]
  );
  const moduleName = useCallback(
    (id: string) => modules.find((m) => m.id === id),
    [modules]
  );

  const lastUpdated = useMemo(() => {
    const times = tasks
      .map((t) => new Date(t.updated_at ?? t.created_at).getTime())
      .filter((n) => !Number.isNaN(n));
    return times.length ? relTime(new Date(Math.max(...times)).toISOString()) : "just now";
  }, [tasks]);

  const ownershipRows = useMemo(() => {
    const rows: { member: string; task: string; module?: Module }[] = [];
    for (const t of tasks) {
      const mod = moduleName(t.module_id);
      if (t.assignees.length === 0) continue;
      for (const a of t.assignees) rows.push({ member: a, task: t.title, module: mod });
    }
    return rows.sort((a, b) => a.member.localeCompare(b.member));
  }, [tasks, moduleName]);

  if (!isSupabaseConfigured) return <SetupScreen />;

  return (
    <div className="wrap">
      <header>
        <p className="eyebrow">Project Dashboard · Live</p>
        <h1>Triton Kernel Agent — RL Training</h1>
        <p className="lede">
          Building an agentic system that writes / optimizes Triton kernels: distill agentic
          trajectories from a large model to SFT Qwen3.6, then run RL. The training sequence is{" "}
          <b>SFT → RL</b>, standing on two cross-cutting foundations — <b>Harness</b> and{" "}
          <b>Skills</b> — that support every stage.
        </p>
        <div className="legend">
          <span className="key"><span className="dot todo" />To do</span>
          <span className="key"><span className="dot in_progress" />In progress</span>
          <span className="key"><span className="dot done" />Done</span>
          <span className="key"><span className="dot blocked" />Blocked</span>
          <span className="updated">Last updated {lastUpdated} · everyone with the link</span>
        </div>
      </header>

      {errorMsg && (
        <div className="error-banner">
          Could not reach the database: {errorMsg}. Check your env vars and that the SQL from{" "}
          <code>supabase/schema.sql</code> has been run.
        </div>
      )}

      {loading ? (
        <p className="state-note">Loading the board…</p>
      ) : (
        <>
          <div className="section-label">
            Training Pipeline
            <span className="rule" />
            <span className="section-actions">
              <button className="btn" onClick={() => addModule("pipeline")}>
                + Add stage
              </button>
            </span>
          </div>
          <div className="pipeline">
            {pipeline.map((mod, i) => (
              <div key={mod.id} style={{ display: "contents" }}>
                {i > 0 && <div className="arrow" aria-hidden="true">→</div>}
                <ModuleCard
                  module={mod}
                  number={i + 1}
                  tasks={tasksByModule(mod.id)}
                  members={members}
                  pickerId={pickerId}
                  onSetPicker={setPickerId}
                  onPatchModule={(patch) => patchModule(mod.id, patch)}
                  onDeleteModule={() => deleteModule(mod.id, mod.name)}
                  onAddTask={() => addTask(mod.id)}
                  onPatchTask={patchTask}
                  onDeleteTask={deleteTask}
                  onToggleAssignee={toggleAssignee}
                  onAddMemberToTask={addMemberToTask}
                />
              </div>
            ))}
            {pipeline.length === 0 && (
              <div className="empty" style={{ flex: 1 }}>
                No pipeline stages yet — add one.
              </div>
            )}
          </div>

          <div className="section-label">
            Cross-cutting Foundations
            <span className="rule" />
            <span className="section-actions">
              <button className="btn" onClick={() => addModule("foundation")}>
                + Add foundation
              </button>
            </span>
          </div>
          <div className="foundation-grid">
            {foundations.map((mod) => (
              <ModuleCard
                key={mod.id}
                module={mod}
                number={null}
                tasks={tasksByModule(mod.id)}
                members={members}
                pickerId={pickerId}
                onSetPicker={setPickerId}
                onPatchModule={(patch) => patchModule(mod.id, patch)}
                onDeleteModule={() => deleteModule(mod.id, mod.name)}
                onAddTask={() => addTask(mod.id)}
                onPatchTask={patchTask}
                onDeleteTask={deleteTask}
                onToggleAssignee={toggleAssignee}
                onAddMemberToTask={addMemberToTask}
              />
            ))}
            {foundations.length === 0 && (
              <div className="empty">No foundations yet — add one.</div>
            )}
          </div>

          <div className="section-label">
            Ownership<span className="rule" />
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Task</th>
                  <th>Module</th>
                </tr>
              </thead>
              <tbody>
                {ownershipRows.map((r, idx) => (
                  <tr key={`${r.member}-${r.task}-${idx}`}>
                    <td>
                      <span className="av">{avatarText(r.member, members)}</span>
                      {r.member}
                    </td>
                    <td>{r.task}</td>
                    <td>
                      {r.module ? (
                        <span className={`mod-chip ${r.module.kind === "foundation" ? "found" : ""}`}>
                          {r.module.name}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {ownershipRows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted-row">
                      No one assigned yet — add assignees on any task.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="section-label">
            Team<span className="rule" />
          </div>
          <div className="team-bar">
            <span className="label">Roster</span>
            {members.map((m) => (
              <span className="chip" key={m.id}>
                <span className="av">{m.initials || initialsFromName(m.name)}</span>
                {m.name}
                <button className="x" onClick={() => removeMember(m)} aria-label={`Remove ${m.name}`}>
                  ✕
                </button>
              </span>
            ))}
            <input
              className="menu-add"
              style={{ padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 8, font: "inherit", fontSize: 13 }}
              value={newMember}
              placeholder="Add teammate…"
              onChange={(e) => setNewMember(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addMember(newMember);
                  setNewMember("");
                }
              }}
            />
            <button
              className="btn"
              onClick={() => {
                addMember(newMember);
                setNewMember("");
              }}
            >
              Add
            </button>
          </div>

          <footer>
            Triton Kernel Agent · RL Training — live board · changes save automatically and sync to
            everyone with the link
          </footer>
        </>
      )}
    </div>
  );
}
