"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import MarkdownField from "@/components/MarkdownField";
import TaskExperimentsPanel from "@/components/experiments/TaskExperimentsPanel";
import { supabase } from "@/lib/supabase";
import { KIND_COLOR, logActivity } from "@/lib/activity";
import { STATUS_OPTIONS, statusLabel } from "@/lib/status";
import { fmtDate, relTime } from "@/lib/time";
import type {
  Activity,
  ActivityKind,
  Experiment,
  Member,
  Module,
  Task,
} from "@/lib/types";

interface Visit {
  id: string;
  generation: number;
}

type LoadPhase = "initial" | "refresh";

interface DetailError {
  message: string;
  phase: LoadPhase | null;
}

interface RetryToken {
  visit: Visit;
  requestVersion: number;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarText(name: string, members: Member[]): string {
  return members.find((member) => member.name === name)?.initials
    || initialsFromName(name);
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : "The request failed.";
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function logActivityChecked(
  taskId: string,
  text: string,
  kind: ActivityKind,
): Promise<void> {
  const activityError = await logActivity(taskId, text, kind);
  if (activityError) throw new Error(activityError);
}

/** Close a popover when clicking outside of it. */
function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handle(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onOutside();
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onOutside]);
  return ref;
}

function EditableText({
  value,
  onSave,
  placeholder,
  multiline = false,
  className = "",
  ariaLabel,
}: {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== value) onSave(trimmed);
  }

  if (editing) {
    const props = {
      className: `edit-input ${className}`,
      value: draft,
      autoFocus: true,
      "aria-label": ariaLabel,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => setDraft(event.target.value),
      onBlur: commit,
    };
    return multiline ? (
      <textarea
        {...props}
        rows={2}
        onKeyDown={(event) => {
          if (
            event.key === "Enter"
            && (event.metaKey || event.ctrlKey)
          ) {
            commit();
          }
          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    ) : (
      <input
        {...props}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <span
      className={`editable ${className} ${value ? "" : "placeholder"}`}
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          setEditing(true);
        }
      }}
    >
      {value || placeholder || "Click to edit"}
    </span>
  );
}

export default function TaskDetail({ id }: { id: string }) {
  const [visit, setVisit] = useState<Visit>({ id, generation: 0 });
  const visitRef = useRef<Visit | null>(null);
  const requestVersionRef = useRef(0);
  const retryTokenRef = useRef<RetryToken | null>(null);
  const mutationTokenRef = useRef<object | null>(null);

  const [loadedGeneration, setLoadedGeneration] = useState<number | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [module, setModule] = useState<Module | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [draftNote, setDraftNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [detailError, setDetailError] = useState<DetailError | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const assignRef = useClickOutside(() => setAssignOpen(false));

  if (visit.id !== id) {
    setVisit({ id, generation: visit.generation + 1 });
  }

  const isCurrentRequest = useCallback((
    requestedVisit: Visit,
    requestVersion: number,
  ) => (
    visitRef.current === requestedVisit
    && requestVersionRef.current === requestVersion
  ), []);

  const finishSupersededRetry = useCallback((
    requestedVisit: Visit,
    requestVersion: number,
  ) => {
    const retryToken = retryTokenRef.current;
    if (
      retryToken?.visit === requestedVisit
      && requestVersion > retryToken.requestVersion
    ) {
      retryTokenRef.current = null;
      setRetrying(false);
    }
  }, []);

  const loadTask = useCallback(async (
    requestedVisit: Visit,
    phase: LoadPhase,
    showLoading = false,
  ) => {
    if (!supabase) return;
    const requestVersion = ++requestVersionRef.current;
    if (showLoading) setLoading(true);

    try {
      const taskResult = await supabase
        .from("tasks")
        .select("*")
        .eq("id", requestedVisit.id)
        .maybeSingle();
      if (!isCurrentRequest(requestedVisit, requestVersion)) return;
      throwIfError(taskResult.error);

      if (!taskResult.data) {
        finishSupersededRetry(requestedVisit, requestVersion);
        setLoadedGeneration(requestedVisit.generation);
        setTask(null);
        setModule(null);
        setExperiments([]);
        setMembers([]);
        setActivity([]);
        setLoading(false);
        setNotFound(true);
        setDetailError(null);
        return;
      }

      const nextTask = taskResult.data as Task;
      const [moduleResult, experimentsResult, membersResult, activityResult] =
        await Promise.all([
          supabase
            .from("modules")
            .select("*")
            .eq("id", nextTask.module_id)
            .maybeSingle(),
          supabase
            .from("experiments")
            .select("*")
            .eq("task_id", requestedVisit.id)
            .order("position"),
          supabase.from("members").select("*").order("position"),
          supabase
            .from("activity")
            .select("*")
            .eq("task_id", requestedVisit.id)
            .order("created_at", { ascending: false }),
        ]);
      if (!isCurrentRequest(requestedVisit, requestVersion)) return;
      throwIfError(moduleResult.error);
      throwIfError(experimentsResult.error);
      throwIfError(membersResult.error);
      throwIfError(activityResult.error);

      finishSupersededRetry(requestedVisit, requestVersion);
      setLoadedGeneration(requestedVisit.generation);
      setTask(nextTask);
      setModule((moduleResult.data as Module | null) ?? null);
      setExperiments((experimentsResult.data ?? []) as Experiment[]);
      setMembers((membersResult.data ?? []) as Member[]);
      setActivity((activityResult.data ?? []) as Activity[]);
      setLoading(false);
      setNotFound(false);
      setDetailError(null);
    } catch (caught) {
      if (!isCurrentRequest(requestedVisit, requestVersion)) return;
      finishSupersededRetry(requestedVisit, requestVersion);
      const action = phase === "initial" ? "load" : "refresh";
      setLoadedGeneration(requestedVisit.generation);
      setLoading(false);
      setNotFound(false);
      setDetailError({
        message: `Could not ${action} task. ${errorMessage(caught)}`,
        phase,
      });
    }
  }, [finishSupersededRetry, isCurrentRequest]);

  useEffect(() => {
    visitRef.current = visit;
    requestVersionRef.current += 1;
    retryTokenRef.current = null;
    mutationTokenRef.current = null;
    setLoadedGeneration(null);
    setTask(null);
    setModule(null);
    setExperiments([]);
    setMembers([]);
    setActivity([]);
    setDraftNote("");
    setLoading(true);
    setNotFound(false);
    setDetailError(null);
    setRetrying(false);
    setAssignOpen(false);

    if (!id) {
      setLoadedGeneration(visit.generation);
      setLoading(false);
      setDetailError({
        message: "Could not load task. The Task ID is missing.",
        phase: null,
      });
      return;
    }

    if (!supabase) {
      setLoadedGeneration(visit.generation);
      setLoading(false);
      setDetailError({
        message:
          "Supabase is not configured. Add the public Supabase URL and anon key to use Task Detail.",
        phase: null,
      });
      return;
    }

    const client = supabase;
    void loadTask(visit, "initial", true);
    const refresh = () => {
      void loadTask(visit, "refresh");
    };
    const channel = client
      .channel(`task-${visit.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "experiments" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activity" },
        refresh,
      )
      .subscribe();

    return () => {
      if (visitRef.current === visit) visitRef.current = null;
      requestVersionRef.current += 1;
      retryTokenRef.current = null;
      mutationTokenRef.current = null;
      client.removeChannel(channel);
    };
  }, [id, loadTask, visit]);

  function retry() {
    if (!detailError?.phase || retryTokenRef.current) return;
    const requestedVisit = visitRef.current;
    if (!requestedVisit) return;
    const token: RetryToken = {
      visit: requestedVisit,
      requestVersion: requestVersionRef.current + 1,
    };
    retryTokenRef.current = token;
    setRetrying(true);
    void loadTask(requestedVisit, detailError.phase).finally(() => {
      if (
        visitRef.current === requestedVisit
        && retryTokenRef.current === token
      ) {
        retryTokenRef.current = null;
        setRetrying(false);
      }
    });
  }

  const updateTask = useCallback(async (
    patch: Partial<Task>,
    activityEvent?: { text: string; kind: "assign" },
  ) => {
    if (!supabase) return;
    const requestedVisit = visitRef.current;
    if (!requestedVisit) return;
    const token = {};
    mutationTokenRef.current = token;
    setDetailError(null);

    try {
      const result = await supabase
        .from("tasks")
        .update(patch)
        .eq("id", requestedVisit.id);
      if (
        visitRef.current !== requestedVisit
        || mutationTokenRef.current !== token
      ) {
        return;
      }
      throwIfError(result.error);

      if (activityEvent) {
        await logActivityChecked(
          requestedVisit.id,
          activityEvent.text,
          activityEvent.kind,
        );
      } else if (patch.status) {
        await logActivityChecked(
          requestedVisit.id,
          `Status set to ${statusLabel(patch.status)}`,
          "status",
        );
      } else if (patch.title) {
        await logActivityChecked(
          requestedVisit.id,
          `Renamed to “${patch.title}”`,
          "edit",
        );
      } else if (patch.notes !== undefined) {
        await logActivityChecked(
          requestedVisit.id,
          "Updated progress notes",
          "note",
        );
      }
      if (
        visitRef.current === requestedVisit
        && mutationTokenRef.current === token
      ) {
        await loadTask(requestedVisit, "refresh");
      }
    } catch (caught) {
      if (
        visitRef.current === requestedVisit
        && mutationTokenRef.current === token
      ) {
        setDetailError({
          message: `Could not update task. ${errorMessage(caught)}`,
          phase: null,
        });
      }
    } finally {
      if (
        visitRef.current === requestedVisit
        && mutationTokenRef.current === token
      ) {
        mutationTokenRef.current = null;
      }
    }
  }, [loadTask]);

  function toggleAssignee(name: string) {
    if (!task) return;
    const hadAssignee = task.assignees.includes(name);
    const nextAssignees = hadAssignee
      ? task.assignees.filter((assignee) => assignee !== name)
      : [...task.assignees, name];
    void updateTask(
      { assignees: nextAssignees },
      {
        text: `${hadAssignee ? "Unassigned" : "Assigned"} ${name}`,
        kind: "assign",
      },
    );
  }

  async function addTimelineNote() {
    const value = draftNote.trim();
    const requestedVisit = visitRef.current;
    if (!value || !requestedVisit) return;
    const token = {};
    mutationTokenRef.current = token;
    setDetailError(null);
    try {
      await logActivityChecked(requestedVisit.id, value, "comment");
      if (
        visitRef.current !== requestedVisit
        || mutationTokenRef.current !== token
      ) {
        return;
      }
      setDraftNote("");
      await loadTask(requestedVisit, "refresh");
    } catch (caught) {
      if (
        visitRef.current === requestedVisit
        && mutationTokenRef.current === token
      ) {
        setDetailError({
          message: `Could not add the timeline note. ${errorMessage(caught)}`,
          phase: null,
        });
      }
    } finally {
      if (
        visitRef.current === requestedVisit
        && mutationTokenRef.current === token
      ) {
        mutationTokenRef.current = null;
      }
    }
  }

  const visitLoading =
    visit.id !== id
    || loadedGeneration !== visit.generation
    || loading;

  if (visitLoading) {
    return (
      <div className="wrap">
        <p className="state-note">Loading task…</p>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="wrap">
        <Link href="/" className="back-link">← Back to board</Link>
        {notFound && (
          <p className="state-note">
            Task not found. It may have been deleted.
          </p>
        )}
        {detailError && (
          <div className="error-banner" role="alert">
            <span>{detailError.message}</span>
            {detailError.phase && (
              <button
                type="button"
                className="btn"
                onClick={retry}
                disabled={retrying}
              >
                {retrying ? "Retrying…" : "Retry"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="wrap detail">
      <Link href="/" className="back-link">← Back to board</Link>

      {detailError && (
        <div className="error-banner" role="alert">
          <span>{detailError.message}</span>
          {detailError.phase && (
            <button
              type="button"
              className="btn"
              onClick={retry}
              disabled={retrying}
            >
              {retrying ? "Retrying…" : "Retry"}
            </button>
          )}
        </div>
      )}

      <header className="detail-head">
        {module && (
          <span
            className={`mod-chip ${
              module.kind === "foundation" ? "found" : ""
            }`}
          >
            {module.name}
          </span>
        )}
        <h1 className="detail-title">
          <EditableText
            value={task.title}
            ariaLabel="Task title"
            onSave={(value) => void updateTask({ title: value })}
          />
        </h1>
        <div className="detail-meta">
          <select
            className={`pill ${task.status}`}
            value={task.status}
            aria-label="Status"
            onChange={(event) => {
              void updateTask({
                status: event.target.value as Task["status"],
              });
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="assignees-inline">
            <div className="owners">
              {task.assignees.map((name) => (
                <span className="owner-chip" key={name} title={name}>
                  <span className="av">{avatarText(name, members)}</span>
                  <button
                    className="owner-x"
                    onClick={() => toggleAssignee(name)}
                    aria-label={`Unassign ${name}`}
                    title={`Unassign ${name}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
              <div className="picker" ref={assignRef}>
                <button
                  className="add-owner"
                  onClick={() => setAssignOpen((open) => !open)}
                  aria-label="Assign people"
                  title="Assign people"
                >
                  +
                </button>
                {assignOpen && (
                  <div className="menu" role="menu">
                    {members
                      .filter(
                        (member) => !task.assignees.includes(member.name),
                      )
                      .map((member) => (
                        <button
                          key={member.id}
                          className="menu-item"
                          onClick={() => toggleAssignee(member.name)}
                        >
                          <span className="av">
                            {member.initials || initialsFromName(member.name)}
                          </span>
                          {member.name}
                        </button>
                      ))}
                    {members.length === 0 && (
                      <div className="menu-empty">
                        Add teammates on the board first.
                      </div>
                    )}
                    {members.length > 0
                      && members.every(
                        (member) => task.assignees.includes(member.name),
                      )
                      && (
                        <div className="menu-empty">
                          Everyone is assigned.
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <span className="detail-dates">
            Created {fmtDate(task.created_at)} · Updated{" "}
            {relTime(task.updated_at)}
          </span>
        </div>
      </header>

      <section className="detail-section">
        <div className="detail-section-head">
          <h2>Progress &amp; notes</h2>
        </div>
        <MarkdownField
          value={task.notes}
          minHeight={160}
          placeholder="Click to add progress, findings, and decisions… (Markdown supported: headings, lists, **bold**, tables)"
          onSave={(value) => void updateTask({ notes: value })}
        />
      </section>

      <TaskExperimentsPanel
        task={task}
        experiments={experiments}
        members={members}
      />

      <section className="detail-section">
        <div className="detail-section-head">
          <h2>Activity timeline</h2>
        </div>
        <div className="timeline-add">
          <input
            value={draftNote}
            placeholder="Add a note to the timeline…"
            onChange={(event) => setDraftNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addTimelineNote();
            }}
            aria-label="Add a note to the timeline"
          />
          <button
            className="btn primary"
            onClick={() => void addTimelineNote()}
          >
            Add note
          </button>
        </div>
        {activity.length === 0 ? (
          <p className="muted">No activity yet.</p>
        ) : (
          <div className="timeline">
            {activity.map((event, index) => (
              <div className="tl-row" key={event.id}>
                <div className="tl-rail">
                  <span
                    className="tl-dot"
                    style={{
                      background: KIND_COLOR[event.kind] ?? "var(--todo)",
                    }}
                  />
                  {index < activity.length - 1 && (
                    <span className="tl-line" />
                  )}
                </div>
                <div className="tl-body">
                  <div className="tl-text">{event.text}</div>
                  <div className="tl-time">
                    {relTime(event.created_at)} · {fmtDate(event.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
