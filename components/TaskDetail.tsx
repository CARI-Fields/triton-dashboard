"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MarkdownField from "@/components/MarkdownField";
import PageHeader from "@/components/ui/PageHeader";
import WorkspaceSkeleton from "@/components/ui/WorkspaceSkeleton";
import TaskProperties from "@/components/tasks/TaskProperties";
import AttachmentGallery from "@/components/experiments/AttachmentGallery";
import TaskExperimentsPanel from "@/components/experiments/TaskExperimentsPanel";
import { supabase } from "@/lib/supabase";
import { KIND_COLOR, logActivity } from "@/lib/activity";
import { statusLabel } from "@/lib/status";
import {
  taskFromStorage,
  taskPatchToStorage,
  taskTypeFromStorage,
} from "@/lib/tasks/model";
import { fmtDate, relTime } from "@/lib/time";
import type {
  Activity,
  ActivityKind,
  Attachment,
  Experiment,
  Member,
  Module,
  Task,
  TaskModel,
  TaskPatch,
  TaskType,
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

type MutationField =
  | "title"
  | "status"
  | "notes"
  | "owners"
  | "typeId"
  | "tags"
  | "priority"
  | "dueDate"
  | "delete";
type MutationErrorKey = MutationField | "timeline";

interface TimelineSubmission {
  visit: Visit;
  value: string;
}

interface DeleteSubmission {
  visit: Visit;
}

interface RealtimePayload {
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
}

interface OwnerChange {
  name: string;
  assigned: boolean;
}

interface OwnerCoordinator {
  visit: Visit;
  confirmed: string[];
  pending: OwnerChange[];
}

interface OwnerActivityEvent {
  text: string;
  kind: "assign";
  change: OwnerChange;
  coordinator: OwnerCoordinator;
}

interface TagChange {
  tags: string[];
}

interface TagCoordinator {
  visit: Visit;
  confirmed: string[];
  pending: TagChange[];
}

interface TagMutationEvent {
  change: TagChange;
  coordinator: TagCoordinator;
}

function applyOwnerChange(
  owners: string[],
  change: OwnerChange,
): string[] {
  if (change.assigned) {
    return owners.includes(change.name)
      ? owners
      : [...owners, change.name];
  }
  return owners.filter((owner) => owner !== change.name);
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
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
  const router = useRouter();
  const [visit, setVisit] = useState<Visit>({ id, generation: 0 });
  const visitRef = useRef<Visit | null>(null);
  const requestVersionRef = useRef(0);
  const retryTokenRef = useRef<RetryToken | null>(null);
  const mutationQueuesRef = useRef(new Map<string, Promise<void>>());
  const ownerCoordinatorRef = useRef<OwnerCoordinator | null>(null);
  const tagCoordinatorRef = useRef<TagCoordinator | null>(null);
  const experimentIdsRef = useRef(new Set<string>());
  const attachmentIdsRef = useRef(new Set<string>());
  const activityIdsRef = useRef(new Set<string>());
  const timelineSubmissionRef = useRef<TimelineSubmission | null>(null);
  const deleteSubmissionRef = useRef<DeleteSubmission | null>(null);

  const [loadedGeneration, setLoadedGeneration] = useState<number | null>(null);
  const [task, setTask] = useState<TaskModel | null>(null);
  const [types, setTypes] = useState<TaskType[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
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
  const [deleting, setDeleting] = useState(false);
  const [ownerSyncRevision, setOwnerSyncRevision] = useState(0);
  const [tagSyncRevision, setTagSyncRevision] = useState(0);

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
        setTypes([]);
        setExperiments([]);
        experimentIdsRef.current = new Set();
        setMembers([]);
        setAttachments([]);
        attachmentIdsRef.current = new Set();
        setActivity([]);
        activityIdsRef.current = new Set();
        setLoading(false);
        setNotFound(true);
        setDetailError(null);
        return;
      }

      const nextTask = taskFromStorage(taskResult.data as Task);
      const [
        typesResult,
        experimentsResult,
        membersResult,
        attachmentsResult,
        activityResult,
      ] =
        await Promise.all([
          supabase
            .from("modules")
            .select("*")
            .order("position"),
          supabase
            .from("experiments")
            .select("*")
            .eq("task_id", requestedVisit.id)
            .order("position")
            .order("experiment_no", { ascending: true }),
          supabase.from("members").select("*").order("position"),
          supabase
            .from("attachments")
            .select("*")
            .eq("task_id", requestedVisit.id)
            .is("experiment_id", null)
            .order("position"),
          supabase
            .from("activity")
            .select("*")
            .eq("task_id", requestedVisit.id)
            .order("created_at", { ascending: false }),
        ]);
      if (!isCurrentRequest(requestedVisit, requestVersion)) return;
      throwIfError(typesResult.error);
      throwIfError(experimentsResult.error);
      throwIfError(membersResult.error);
      throwIfError(attachmentsResult.error);
      throwIfError(activityResult.error);

      finishSupersededRetry(requestedVisit, requestVersion);
      const nextTypes = (typesResult.data ?? [])
        .map((row) => taskTypeFromStorage(row as Module));
      const nextExperiments = (experimentsResult.data ?? []) as Experiment[];
      const nextAttachments = (attachmentsResult.data ?? []) as Attachment[];
      const nextActivity = (activityResult.data ?? []) as Activity[];
      setLoadedGeneration(requestedVisit.generation);
      setTask(nextTask);
      if (
        ownerCoordinatorRef.current?.visit !== requestedVisit
        || ownerCoordinatorRef.current.pending.length === 0
      ) {
        ownerCoordinatorRef.current = {
          visit: requestedVisit,
          confirmed: nextTask.owners,
          pending: [],
        };
      }
      if (
        tagCoordinatorRef.current?.visit !== requestedVisit
        || tagCoordinatorRef.current.pending.length === 0
      ) {
        tagCoordinatorRef.current = {
          visit: requestedVisit,
          confirmed: nextTask.tags,
          pending: [],
        };
      }
      setTypes(nextTypes);
      setExperiments(nextExperiments);
      experimentIdsRef.current = new Set(
        nextExperiments.map((experiment) => experiment.id),
      );
      setMembers((membersResult.data ?? []) as Member[]);
      setAttachments(nextAttachments);
      attachmentIdsRef.current = new Set(
        nextAttachments.map((attachment) => attachment.id),
      );
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
    ownerCoordinatorRef.current = null;
    tagCoordinatorRef.current = null;
    experimentIdsRef.current = new Set();
    attachmentIdsRef.current = new Set();
    activityIdsRef.current = new Set();
    timelineSubmissionRef.current = null;
    deleteSubmissionRef.current = null;
    setLoadedGeneration(null);
    setTask(null);
    setTypes([]);
    setExperiments([]);
    setMembers([]);
    setAttachments([]);
    setActivity([]);
    setDraftNote("");
    setLoading(true);
    setNotFound(false);
    setDetailError(null);
    setMutationErrors({});
    setRetrying(false);
    setNotePending(false);
    setDeleting(false);
    setOwnerSyncRevision(0);
    setTagSyncRevision(0);

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
    const refreshTaskAttachment = (payload: RealtimePayload) => {
      const changedId = payload.new?.id;
      if (
        payload.new?.experiment_id !== null
        && !(
          typeof changedId === "string"
          && attachmentIdsRef.current.has(changedId)
        )
      ) {
        return;
      }
      if (typeof changedId === "string") {
        attachmentIdsRef.current.add(changedId);
      }
      refresh();
    };
    const refreshDeletedTask = (payload: RealtimePayload) => {
      if (payload.old?.id === visit.id) refresh();
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
    const refreshDeletedAttachment = (payload: RealtimePayload) => {
      const deletedId = payload.old?.id ?? payload.new?.id;
      const row = Object.keys(payload.old ?? {}).length > 0
        ? payload.old
        : payload.new;
      if (
        (
          row?.task_id === visit.id
          && row.experiment_id === null
        )
        || (
          typeof deletedId === "string"
          && attachmentIdsRef.current.has(deletedId)
        )
      ) {
        if (typeof deletedId === "string") {
          attachmentIdsRef.current.delete(deletedId);
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
          table: "attachments",
          filter: `task_id=eq.${visit.id}`,
        },
        refreshTaskAttachment,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "attachments",
          filter: `task_id=eq.${visit.id}`,
        },
        refreshTaskAttachment,
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "attachments" },
        refreshDeletedAttachment,
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
      deleteSubmissionRef.current = null;
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
    patch: TaskPatch,
    activityEvent?: OwnerActivityEvent,
    tagEvent?: TagMutationEvent,
  ) => {
    if (!supabase) return;
    const client = supabase;
    const requestedVisit = visitRef.current;
    if (!requestedVisit) return;
    const field: MutationField = Object.hasOwn(patch, "owners")
      ? "owners"
      : Object.hasOwn(patch, "status")
        ? "status"
        : Object.hasOwn(patch, "title")
          ? "title"
          : Object.hasOwn(patch, "notes")
            ? "notes"
            : Object.hasOwn(patch, "typeId")
              ? "typeId"
              : Object.hasOwn(patch, "tags")
                ? "tags"
                : Object.hasOwn(patch, "priority")
                  ? "priority"
                  : "dueDate";
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
      let effectivePatch = patch;
      let nextConfirmedOwners: string[] | null = null;
      let ownerChangeIsNoOp = false;
      let tagChangeIsNoOp = false;
      if (activityEvent) {
        ownerChangeIsNoOp =
          activityEvent.coordinator.confirmed.includes(
            activityEvent.change.name,
          ) === activityEvent.change.assigned;
        nextConfirmedOwners = applyOwnerChange(
          activityEvent.coordinator.confirmed,
          activityEvent.change,
        );
        effectivePatch = {
          ...patch,
          owners: nextConfirmedOwners,
        };
      }
      if (tagEvent) {
        tagChangeIsNoOp = sameStrings(
          tagEvent.coordinator.confirmed,
          tagEvent.change.tags,
        );
        effectivePatch = {
          ...patch,
          tags: tagEvent.change.tags,
        };
      }
      const settleOwnerChange = (succeeded: boolean) => {
        if (!activityEvent) return;
        if (succeeded && nextConfirmedOwners) {
          activityEvent.coordinator.confirmed = nextConfirmedOwners;
        }
        activityEvent.coordinator.pending =
          activityEvent.coordinator.pending.filter(
            (change) => change !== activityEvent.change,
          );
        if (visitRef.current === activityEvent.coordinator.visit) {
          setOwnerSyncRevision((current) => current + 1);
        }
      };
      const settleTagChange = (succeeded: boolean) => {
        if (!tagEvent) return;
        if (succeeded) {
          tagEvent.coordinator.confirmed = tagEvent.change.tags;
        }
        tagEvent.coordinator.pending = tagEvent.coordinator.pending.filter(
          (change) => change !== tagEvent.change,
        );
        if (visitRef.current === tagEvent.coordinator.visit) {
          setTagSyncRevision((current) => current + 1);
        }
      };
      if (ownerChangeIsNoOp || tagChangeIsNoOp) {
        settleOwnerChange(false);
        settleTagChange(false);
        return;
      }
      let result;
      try {
        result = await client
          .from("tasks")
          .update(taskPatchToStorage(effectivePatch))
          .eq("id", requestedVisit.id);
        throwIfError(result.error);
      } catch (caught) {
        settleOwnerChange(false);
        settleTagChange(false);
        if (visitRef.current === requestedVisit) {
          setMutationErrors((current) => ({
            ...current,
            [field]: `Could not update task. ${errorMessage(caught)}`,
          }));
        }
        return;
      }
      settleOwnerChange(true);
      settleTagChange(true);

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

  function patchTask(patch: TaskPatch) {
    if (!task) return;
    const requestedVisit = visitRef.current;
    if (!requestedVisit) return;
    if (Object.hasOwn(patch, "tags") && patch.tags) {
      let coordinator = tagCoordinatorRef.current;
      if (coordinator?.visit !== requestedVisit) {
        coordinator = {
          visit: requestedVisit,
          confirmed: task.tags,
          pending: [],
        };
        tagCoordinatorRef.current = coordinator;
      }
      const change = { tags: [...patch.tags] };
      coordinator.pending.push(change);
      void updateTask(patch, undefined, { change, coordinator });
      return;
    }
    if (!Object.hasOwn(patch, "owners") || !patch.owners) {
      void updateTask(patch);
      return;
    }
    let coordinator = ownerCoordinatorRef.current;
    if (coordinator?.visit !== requestedVisit) {
      coordinator = {
        visit: requestedVisit,
        confirmed: task.owners,
        pending: [],
      };
      ownerCoordinatorRef.current = coordinator;
    }
    const currentOwners = coordinator.pending.reduce(
      applyOwnerChange,
      coordinator.confirmed,
    );
    const removals = currentOwners.filter(
      (owner) => !patch.owners!.includes(owner),
    );
    const additions = patch.owners.filter(
      (owner) => !currentOwners.includes(owner),
    );
    for (const [name, assigned] of [
      ...removals.map((owner) => [owner, false] as const),
      ...additions.map((owner) => [owner, true] as const),
    ]) {
      const change: OwnerChange = { name, assigned };
      coordinator.pending.push(change);
      void updateTask(
        { owners: [] },
        {
          text: `${assigned ? "Assigned" : "Unassigned"} ${name}`,
          kind: "assign",
          change,
          coordinator,
        },
      );
    }
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

  async function removeTask() {
    if (
      !task
      || deleteSubmissionRef.current
      || !window.confirm(`Delete task “${task.title}”? This cannot be undone.`)
    ) {
      return;
    }
    const requestedVisit = visitRef.current;
    if (!requestedVisit || !supabase) return;
    const submission = { visit: requestedVisit };
    deleteSubmissionRef.current = submission;
    setDeleting(true);
    setMutationErrors((current) => {
      if (!current.delete) return current;
      const next = { ...current };
      delete next.delete;
      return next;
    });

    try {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", requestedVisit.id);
      if (
        visitRef.current !== requestedVisit
        || deleteSubmissionRef.current !== submission
      ) {
        return;
      }
      if (error) {
        setMutationErrors((current) => ({
          ...current,
          delete: `Could not delete task. ${error.message}`,
        }));
        return;
      }
      router.push("/");
    } catch (caught) {
      if (
        visitRef.current === requestedVisit
        && deleteSubmissionRef.current === submission
      ) {
        setMutationErrors((current) => ({
          ...current,
          delete: `Could not delete task. ${errorMessage(caught)}`,
        }));
      }
    } finally {
      if (
        visitRef.current === requestedVisit
        && deleteSubmissionRef.current === submission
      ) {
        deleteSubmissionRef.current = null;
        setDeleting(false);
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
  const propertyTask = useMemo(() => {
    if (!task) return null;
    const ownerCoordinator = ownerCoordinatorRef.current;
    const tagCoordinator = tagCoordinatorRef.current;
    const owners = ownerCoordinator?.visit === visitRef.current
      ? ownerCoordinator.pending.reduce(
        applyOwnerChange,
        ownerCoordinator.confirmed,
      )
      : task.owners;
    const tags = tagCoordinator?.visit === visitRef.current
      ? (
        tagCoordinator.pending[tagCoordinator.pending.length - 1]?.tags
        ?? tagCoordinator.confirmed
      )
      : task.tags;
    if (owners === task.owners && tags === task.tags) return task;
    return { ...task, owners, tags };
  }, [ownerSyncRevision, tagSyncRevision, task]);

  if (visitLoading) {
    return (
      <WorkspaceSkeleton variant="record" label="Loading Task" />
    );
  }

  if (!task) {
    return (
      <div className="wrap">
        <Link href="/" className="back-link">← Task Board</Link>
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
    <div className="record-page task-detail-page">
      <div className="record-main">
        <Link href="/" className="back-link">← Task Board</Link>

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

        <PageHeader
          eyebrow="Task"
          title={(
            <EditableText
              value={task.title}
              ariaLabel="Task title"
              onSave={(title) => void updateTask({ title })}
            />
          )}
          description={(
            <span className="record-dates">
              Created {fmtDate(task.created_at)} · Updated{" "}
              {relTime(task.updated_at)}
            </span>
          )}
          actions={(
            <details className="action-menu">
              <summary aria-label="More task actions">•••</summary>
              <div className="action-menu-panel">
                <button
                  type="button"
                  className="danger-subtle"
                  disabled={deleting}
                  onClick={() => void removeTask()}
                >
                  {deleting ? "Deleting…" : "Delete task"}
                </button>
              </div>
            </details>
          )}
        />

        <TaskProperties
          task={propertyTask ?? task}
          types={types}
          members={members}
          ownerSyncRevision={ownerSyncRevision}
          tagSyncRevision={tagSyncRevision}
          onPatch={patchTask}
        />

        <section
          id="description"
          className="record-section"
          aria-labelledby="task-description-title"
        >
          <h2 id="task-description-title">Description</h2>
          <MarkdownField
            value={task.notes}
            minHeight={160}
            placeholder="Add context, acceptance criteria, or links"
            onSave={(notes) => void updateTask({ notes })}
          />
        </section>

        <TaskExperimentsPanel
          task={task}
          experiments={experiments}
          members={members}
        />

        <section
          id="attachments"
          className="record-section"
          aria-labelledby="task-attachments-title"
        >
          <h2 id="task-attachments-title">Attachments</h2>
          <AttachmentGallery
            scope={{ taskId: task.id, experimentId: null }}
            visitKey={`task:${task.id}`}
            attachments={attachments}
            title="Task files & images"
            emptyMessage="No task attachments yet."
            altFallback="Task attachment"
            onChanged={() => {
              const currentVisit = visitRef.current;
              if (currentVisit) void loadTask(currentVisit, "refresh");
            }}
          />
        </section>
      </div>

      <aside className="activity-rail" aria-label="Task activity">
        <h2>Activity</h2>
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
            type="button"
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
                      background:
                        KIND_COLOR[event.kind] ?? "var(--status-todo)",
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
      </aside>
    </div>
  );
}
