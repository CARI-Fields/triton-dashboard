"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import MarkdownField from "@/components/MarkdownField";
import TaskExperimentsPanel from "@/components/experiments/TaskExperimentsPanel";
import { supabase } from "@/lib/supabase";
import { KIND_COLOR, logActivity } from "@/lib/activity";
import { STATUS_OPTIONS, statusLabel } from "@/lib/status";
import {
  assignTaskMember,
  normalizeTaskRow,
  TASK_WITH_ASSIGNEES_SELECT,
  type TaskRelationRow,
  unassignTaskMember,
} from "@/lib/tasks/assignees";
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

type MutationField = "title" | "status" | "notes" | "assignees";
type MutationErrorKey = MutationField | "timeline";

interface TimelineSubmission {
  visit: Visit;
  value: string;
}

interface RealtimePayload {
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
}

interface AssigneeChange {
  name: string;
  assigned: boolean;
}

interface AssigneeCoordinator {
  visit: Visit;
  confirmed: string[];
  pending: AssigneeChange[];
}

interface AssignActivityEvent {
  text: string;
  kind: "assign";
  change: AssigneeChange;
  coordinator: AssigneeCoordinator;
}

function applyAssigneeChange(
  assignees: string[],
  change: AssigneeChange,
): string[] {
  if (change.assigned) {
    return assignees.includes(change.name)
      ? assignees
      : [...assignees, change.name];
  }
  return assignees.filter((assignee) => assignee !== change.name);
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
  const mutationQueuesRef = useRef(new Map<string, Promise<void>>());
  const assigneeCoordinatorRef = useRef<AssigneeCoordinator | null>(null);
  const membersRef = useRef<Member[]>([]);
  const experimentIdsRef = useRef(new Set<string>());
  const activityIdsRef = useRef(new Set<string>());
  const timelineSubmissionRef = useRef<TimelineSubmission | null>(null);

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
  const [mutationErrors, setMutationErrors] = useState<
    Partial<Record<MutationErrorKey, string>>
  >({});
  const [retrying, setRetrying] = useState(false);
  const [notePending, setNotePending] = useState(false);
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
        .select(TASK_WITH_ASSIGNEES_SELECT)
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
        experimentIdsRef.current = new Set();
        setMembers([]);
        setActivity([]);
        activityIdsRef.current = new Set();
        setLoading(false);
        setNotFound(true);
        setDetailError(null);
        return;
      }

      const nextTask = normalizeTaskRow(
        taskResult.data as unknown as TaskRelationRow,
      );
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
            .order("position")
            .order("experiment_no", { ascending: true }),
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
      const nextExperiments = (experimentsResult.data ?? []) as Experiment[];
      const nextActivity = (activityResult.data ?? []) as Activity[];
      setLoadedGeneration(requestedVisit.generation);
      setTask(nextTask);
      if (
        assigneeCoordinatorRef.current?.visit !== requestedVisit
        || assigneeCoordinatorRef.current.pending.length === 0
      ) {
        assigneeCoordinatorRef.current = {
          visit: requestedVisit,
          confirmed: nextTask.assignees,
          pending: [],
        };
      }
      setModule((moduleResult.data as Module | null) ?? null);
      setExperiments(nextExperiments);
      experimentIdsRef.current = new Set(
        nextExperiments.map((experiment) => experiment.id),
      );
      const nextMembers = (membersResult.data ?? []) as Member[];
      membersRef.current = nextMembers;
      setMembers(nextMembers);
      setActivity(nextActivity);
      activityIdsRef.current = new Set(
        nextActivity.map((event) => event.id),
      );
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
    assigneeCoordinatorRef.current = null;
    membersRef.current = [];
    experimentIdsRef.current = new Set();
    activityIdsRef.current = new Set();
    timelineSubmissionRef.current = null;
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
    setMutationErrors({});
    setRetrying(false);
    setNotePending(false);
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
    const refreshInsertedExperiment = (payload: RealtimePayload) => {
      const insertedId = payload.new?.id;
      if (typeof insertedId === "string") {
        experimentIdsRef.current.add(insertedId);
      }
      refresh();
    };
    const refreshInsertedActivity = (payload: RealtimePayload) => {
      const insertedId = payload.new?.id;
      if (typeof insertedId === "string") {
        activityIdsRef.current.add(insertedId);
      }
      refresh();
    };
    const refreshDeletedTask = (payload: RealtimePayload) => {
      if (payload.old?.id === visit.id) refresh();
    };
    const refreshTaskAssignee = (payload: RealtimePayload) => {
      const changedTaskId = payload.new?.task_id ?? payload.old?.task_id;
      if (changedTaskId === visit.id) refresh();
    };
    const refreshDeletedExperiment = (payload: RealtimePayload) => {
      const deletedId = payload.old?.id;
      if (
        payload.old?.task_id === visit.id
        || (
          typeof deletedId === "string"
          && experimentIdsRef.current.has(deletedId)
        )
      ) {
        if (typeof deletedId === "string") {
          experimentIdsRef.current.delete(deletedId);
        }
        refresh();
      }
    };
    const refreshDeletedActivity = (payload: RealtimePayload) => {
      const deletedId = payload.old?.id;
      if (
        payload.old?.task_id === visit.id
        || (
          typeof deletedId === "string"
          && activityIdsRef.current.has(deletedId)
        )
      ) {
        if (typeof deletedId === "string") {
          activityIdsRef.current.delete(deletedId);
        }
        refresh();
      }
    };
    const channel = client
      .channel(`task-${visit.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tasks",
          filter: `id=eq.${visit.id}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasks",
          filter: `id=eq.${visit.id}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "tasks" },
        refreshDeletedTask,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_assignees",
        },
        refreshTaskAssignee,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "members" },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "experiments",
          filter: `task_id=eq.${visit.id}`,
        },
        refreshInsertedExperiment,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "experiments",
          filter: `task_id=eq.${visit.id}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "experiments" },
        refreshDeletedExperiment,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity",
          filter: `task_id=eq.${visit.id}`,
        },
        refreshInsertedActivity,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "activity",
          filter: `task_id=eq.${visit.id}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "activity" },
        refreshDeletedActivity,
      )
      .subscribe();

    return () => {
      if (visitRef.current === visit) visitRef.current = null;
      requestVersionRef.current += 1;
      retryTokenRef.current = null;
      timelineSubmissionRef.current = null;
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
    activityEvent?: AssignActivityEvent,
  ) => {
    if (!supabase) return;
    const client = supabase;
    const requestedVisit = visitRef.current;
    if (!requestedVisit) return;
    const field: MutationField = activityEvent
      ? "assignees"
      : Object.hasOwn(patch, "status")
        ? "status"
        : Object.hasOwn(patch, "title")
          ? "title"
          : "notes";
    const queueKey =
      `${requestedVisit.generation}:${requestedVisit.id}:${field}`;
    const previous = mutationQueuesRef.current.get(queueKey);
    const runOperation = async () => {
      if (visitRef.current === requestedVisit) {
        setMutationErrors((current) => {
          if (!(field in current)) return current;
          const next = { ...current };
          delete next[field];
          return next;
        });
      }
      let nextConfirmedAssignees: string[] | null = null;
      let assigneeChangeIsNoOp = false;
      if (activityEvent) {
        assigneeChangeIsNoOp =
          activityEvent.coordinator.confirmed.includes(
            activityEvent.change.name,
          ) === activityEvent.change.assigned;
        nextConfirmedAssignees = applyAssigneeChange(
          activityEvent.coordinator.confirmed,
          activityEvent.change,
        );
      }
      const settleAssigneeChange = (succeeded: boolean) => {
        if (!activityEvent) return;
        if (succeeded && nextConfirmedAssignees) {
          activityEvent.coordinator.confirmed = nextConfirmedAssignees;
        }
        activityEvent.coordinator.pending =
          activityEvent.coordinator.pending.filter(
            (change) => change !== activityEvent.change,
          );
      };
      if (assigneeChangeIsNoOp) {
        settleAssigneeChange(false);
        return;
      }
      try {
        if (activityEvent) {
          const member = membersRef.current.find(
            (candidate) => candidate.name === activityEvent.change.name,
          );
          if (!member) throw new Error("Assignee no longer exists.");
          if (activityEvent.change.assigned) {
            await assignTaskMember(client, requestedVisit.id, member.id);
          } else {
            await unassignTaskMember(client, requestedVisit.id, member.id);
          }
        } else {
          const result = await client
            .from("tasks")
            .update(patch)
            .eq("id", requestedVisit.id);
          throwIfError(result.error);
        }
      } catch (caught) {
        settleAssigneeChange(false);
        if (visitRef.current === requestedVisit) {
          setMutationErrors((current) => ({
            ...current,
            [field]: `Could not update task. ${errorMessage(caught)}`,
          }));
        }
        return;
      }
      settleAssigneeChange(true);

      let activityFailure: unknown = null;
      try {
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
      } catch (caught) {
        activityFailure = caught;
      }

      if (visitRef.current === requestedVisit) {
        await loadTask(requestedVisit, "refresh");
        if (
          activityFailure
          && visitRef.current === requestedVisit
        ) {
          setMutationErrors((current) => ({
            ...current,
            [field]:
              "Task updated, but activity could not be recorded. "
              + errorMessage(activityFailure),
          }));
        }
      }
    };
    const operation = previous
      ? previous.catch(() => undefined).then(runOperation)
      : runOperation();

    mutationQueuesRef.current.set(queueKey, operation);
    await operation;
    if (mutationQueuesRef.current.get(queueKey) === operation) {
      mutationQueuesRef.current.delete(queueKey);
    }
  }, [loadTask]);

  function toggleAssignee(name: string) {
    if (!task) return;
    const requestedVisit = visitRef.current;
    if (!requestedVisit) return;
    let coordinator = assigneeCoordinatorRef.current;
    if (coordinator?.visit !== requestedVisit) {
      coordinator = {
        visit: requestedVisit,
        confirmed: task.assignees,
        pending: [],
      };
      assigneeCoordinatorRef.current = coordinator;
    }
    const currentAssignees = coordinator.pending.reduce(
      applyAssigneeChange,
      coordinator.confirmed,
    );
    const hadAssignee = currentAssignees.includes(name);
    const change: AssigneeChange = {
      name,
      assigned: !hadAssignee,
    };
    coordinator.pending.push(change);
    void updateTask(
      {},
      {
        text: `${hadAssignee ? "Unassigned" : "Assigned"} ${name}`,
        kind: "assign",
        change,
        coordinator,
      },
    );
  }

  async function addTimelineNote() {
    const value = draftNote.trim();
    const requestedVisit = visitRef.current;
    if (!value || !requestedVisit || timelineSubmissionRef.current) return;
    const submission = { visit: requestedVisit, value };
    timelineSubmissionRef.current = submission;
    setMutationErrors((current) => {
      if (!current.timeline) return current;
      const next = { ...current };
      delete next.timeline;
      return next;
    });
    setNotePending(true);
    try {
      await logActivityChecked(requestedVisit.id, value, "comment");
      if (
        visitRef.current !== requestedVisit
        || timelineSubmissionRef.current !== submission
      ) {
        return;
      }
      setDraftNote((current) => current.trim() === value ? "" : current);
      await loadTask(requestedVisit, "refresh");
    } catch (caught) {
      if (
        visitRef.current === requestedVisit
        && timelineSubmissionRef.current === submission
      ) {
        setMutationErrors((current) => ({
          ...current,
          timeline:
            `Could not add the timeline note. ${errorMessage(caught)}`,
        }));
      }
    } finally {
      if (
        visitRef.current === requestedVisit
        && timelineSubmissionRef.current === submission
      ) {
        timelineSubmissionRef.current = null;
        setNotePending(false);
      }
    }
  }

  const visitLoading =
    visit.id !== id
    || loadedGeneration !== visit.generation
    || loading;
  const mutationMessage = Object.values(mutationErrors).join(" ");
  const mutationError: DetailError | null = mutationMessage
    ? { message: mutationMessage, phase: null }
    : null;

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

      {mutationError && (
        <div className="error-banner" role="alert">
          <span>{mutationError.message}</span>
        </div>
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
            disabled={notePending}
          >
            {notePending ? "Adding…" : "Add note"}
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
