"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { Experiment } from "@/lib/types";
import { fmtDate } from "@/lib/time";
import MarkdownField from "@/components/MarkdownField";
import ActivityDrawer from "@/components/ui/ActivityDrawer";
import { Icon } from "@/components/ui/Icons";
import PageHeader from "@/components/ui/PageHeader";
import WorkspaceSkeleton from "@/components/ui/WorkspaceSkeleton";
import {
  clearSessionExperimentDraft,
  editableExperimentPatch,
  getSessionExperimentDraftStorage,
  hasEditableExperimentChanges,
  readSessionExperimentDraft,
  reconcileRealtime,
  writeSessionExperimentDraft,
} from "@/lib/experiments/draft";
import {
  allowedTargets,
  EXPERIMENT_STATUS_LABELS,
  formatExperimentId,
  validateBaseline,
  validateForStatus,
  type ValidationIssue,
} from "@/lib/experiments/policy";
import {
  deleteExperiment,
  loadExperimentBundle,
  updateExperiment,
  watchExperiment,
  type ExperimentBundle,
} from "@/lib/experiments/repository";
import { serializeCompareSelection } from "@/lib/experiments/compare-url";
import AttachmentGallery from "@/components/experiments/AttachmentGallery";
import BaselinePicker from "@/components/experiments/BaselinePicker";
import BaselineSummary from "@/components/experiments/BaselineSummary";
import ConfigEditor from "@/components/experiments/ConfigEditor";
import DataEditor from "@/components/experiments/DataEditor";
import DecisionEditor from "@/components/experiments/DecisionEditor";
import DuplicateExperimentDialog from "@/components/experiments/DuplicateExperimentDialog";
import EnvironmentEditor from "@/components/experiments/EnvironmentEditor";
import ExperimentSection from "@/components/experiments/ExperimentSection";
import ExperimentStatusBadge from "@/components/experiments/ExperimentStatusBadge";
import ExperimentTimeline from "@/components/experiments/ExperimentTimeline";
import ObjectEditor from "@/components/experiments/ObjectEditor";
import ResultEditor from "@/components/experiments/ResultEditor";

interface Visit {
  id: string;
  generation: number;
}

type RetryKind = "initial" | "related" | "realtime" | "conflict";

interface DetailError {
  message: string;
  retry: RetryKind | null;
}

function errorDetail(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

function isSameExperimentRevision(
  left: Experiment,
  right: Experiment,
): boolean {
  return left.id === right.id && left.updated_at === right.updated_at;
}

const EXPERIMENT_SECTION_LINKS = [
  { id: "data", label: "Data" },
  { id: "object", label: "Object" },
  { id: "environment", label: "Environment" },
  { id: "config", label: "Config" },
  { id: "result", label: "Result" },
  { id: "decision", label: "Decision" },
  { id: "note", label: "Note" },
] as const;

function ExperimentActionMenu({
  deleting,
  disabled,
  onDelete,
}: {
  deleting: boolean;
  disabled: boolean;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className="action-menu"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        if (!event.currentTarget.open) return;
        event.currentTarget
          .querySelector<HTMLButtonElement>(
            '[role="menuitem"]:not(:disabled)',
          )
          ?.focus();
      }}
      onKeyDown={(event) => {
        const menu = event.currentTarget;
        if (event.key === "Escape" && menu.open) {
          event.preventDefault();
          event.stopPropagation();
          menu.open = false;
          setOpen(false);
          menu.querySelector<HTMLElement>("summary")?.focus();
          return;
        }
        if (
          !menu.open ||
          !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
        ) {
          return;
        }
        const items = [
          ...menu.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]:not(:disabled)',
          ),
        ];
        if (items.length === 0) return;
        event.preventDefault();
        const currentIndex = items.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : event.key === "ArrowDown"
              ? currentIndex < 0
                ? 0
                : (currentIndex + 1) % items.length
              : currentIndex < 0
                ? items.length - 1
                : (currentIndex - 1 + items.length) % items.length;
        items[nextIndex]?.focus();
      }}
    >
      <summary
        role="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More experiment actions"
        onClick={(event) => {
          const menu = event.currentTarget.parentElement as HTMLDetailsElement;
          setOpen(!menu.open);
        }}
      >
        •••
      </summary>
      <div
        className="action-menu-panel"
        role="menu"
        aria-hidden={!open}
      >
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          className="danger-subtle"
          disabled={disabled}
          onClick={onDelete}
        >
          {deleting ? "Deleting…" : "Delete experiment"}
        </button>
      </div>
    </details>
  );
}

export default function ExperimentDetail({ id }: { id: string }) {
  const router = useRouter();
  const visitRef = useRef<Visit>({ id, generation: 0 });
  const initialPendingRef = useRef<object | null>(null);
  const relatedVersionRef = useRef(0);
  const snapshotIssuedRef = useRef(0);
  const snapshotAcceptedRef = useRef(0);
  const snapshotErrorRef = useRef(0);
  const mutationRef = useRef<{
    kind: "save" | "delete" | "reload";
    token: object;
  } | null>(null);
  const draftRevisionRef = useRef(0);
  const draftRef = useRef<Experiment | null>(null);
  const committedRef = useRef<Experiment | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const markdownEditorsRef = useRef<Set<string>>(new Set());

  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ExperimentBundle | null>(null);
  const [server, setServer] = useState<Experiment | null>(null);
  const [draft, setDraft] = useState<Experiment | null>(null);
  const [remoteConflict, setRemoteConflict] = useState<Experiment | null>(null);
  const [remoteDeleted, setRemoteDeleted] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [detailError, setDetailError] = useState<DetailError | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [markdownEditing, setMarkdownEditing] = useState(false);
  const [markdownEpoch, setMarkdownEpoch] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [reloadingLatest, setReloadingLatest] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const activityTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  const isCurrentVisit = useCallback(
    (visit: Visit) => visitRef.current === visit,
    [],
  );

  const clearSnapshotError = useCallback(() => {
    snapshotErrorRef.current = 0;
    setDetailError((current) => (
      current?.retry === "initial" ||
      current?.retry === "realtime" ||
      current?.retry === "conflict"
        ? null
        : current
    ));
  }, []);

  const acceptSnapshot = useCallback((visit: Visit, sequence: number) => {
    if (
      !isCurrentVisit(visit) ||
      sequence < snapshotAcceptedRef.current
    ) {
      return false;
    }
    snapshotAcceptedRef.current = sequence;
    clearSnapshotError();
    return true;
  }, [clearSnapshotError, isCurrentVisit]);

  const reportSnapshotError = useCallback((
    visit: Visit,
    sequence: number,
    nextError: DetailError,
  ) => {
    if (
      !isCurrentVisit(visit) ||
      sequence < snapshotAcceptedRef.current ||
      sequence < snapshotErrorRef.current
    ) {
      return;
    }
    snapshotErrorRef.current = sequence;
    setLoadedId(visit.id);
    setLoading(false);
    setDetailError((current) => (
      current?.retry === null ? current : nextError
    ));
  }, [isCurrentVisit]);

  const establishSnapshotBarrier = useCallback(() => {
    const sequence = ++snapshotIssuedRef.current;
    snapshotAcceptedRef.current = sequence;
    clearSnapshotError();
  }, [clearSnapshotError]);

  const loadInitial = useCallback(async (visit: Visit) => {
    if (initialPendingRef.current) return;
    const operation = {};
    const sequence = ++snapshotIssuedRef.current;
    initialPendingRef.current = operation;
    setLoading(true);
    setNotFound(false);
    setDetailError((current) => (
      current?.retry === "initial" ? null : current
    ));
    try {
      const next = await loadExperimentBundle(visit.id);
      if (!acceptSnapshot(visit, sequence)) return;
      setLoadedId(visit.id);
      setLoading(false);
      if (!next) {
        setNotFound(true);
        setBundle(null);
        setServer(null);
        committedRef.current = null;
        setDraft(null);
        draftRef.current = null;
        draftRevisionRef.current = 0;
        return;
      }
      setNotFound(false);
      setBundle(next);
      setServer(next.experiment);
      committedRef.current = next.experiment;
      const storedDraft = readSessionExperimentDraft(
        getSessionExperimentDraftStorage(),
        next.experiment,
      );
      const nextDraft = storedDraft.kind === "none"
        ? structuredClone(next.experiment)
        : storedDraft.draft;
      setDraft(nextDraft);
      draftRef.current = nextDraft;
      draftRevisionRef.current = 0;
      const restored = storedDraft.kind !== "none";
      setDirty(restored);
      dirtyRef.current = restored;
      setRemoteConflict(
        storedDraft.kind === "conflict" ? next.experiment : null,
      );
      setRemoteDeleted(false);
      setIssues([]);
    } catch (caught) {
      reportSnapshotError(visit, sequence, {
        message: `Could not load the experiment. ${errorDetail(caught, "The request failed.")}`,
        retry: "initial",
      });
    } finally {
      if (initialPendingRef.current === operation) {
        initialPendingRef.current = null;
      }
    }
  }, [acceptSnapshot, reportSnapshotError]);

  const loadRelated = useCallback(async (visit: Visit) => {
    const requestVersion = ++relatedVersionRef.current;
    try {
      const next = await loadExperimentBundle(visit.id);
      if (
        !isCurrentVisit(visit) ||
        requestVersion !== relatedVersionRef.current ||
        !next
      ) {
        return;
      }
      setBundle((current) => (
        current && current.experiment.id === visit.id
          ? { ...next, experiment: current.experiment }
          : current
      ));
      setDetailError((current) => (
        current?.retry === "related" ? null : current
      ));
    } catch (caught) {
      if (!isCurrentVisit(visit) || requestVersion !== relatedVersionRef.current) {
        return;
      }
      setDetailError({
        message: `Could not refresh related evidence. ${errorDetail(caught, "The request failed.")}`,
        retry: "related",
      });
    }
  }, [isCurrentVisit]);

  const loadRealtimeExperiment = useCallback(async (visit: Visit) => {
    const sequence = ++snapshotIssuedRef.current;
    try {
      const next = await loadExperimentBundle(visit.id);
      if (!acceptSnapshot(visit, sequence)) return;
      setLoadedId(visit.id);
      setLoading(false);
      if (!next) {
        committedRef.current = null;
        if (
          dirtyRef.current ||
          markdownEditorsRef.current.size > 0 ||
          savingRef.current
        ) {
          setRemoteConflict(null);
          setRemoteDeleted(true);
          return;
        }
        setLoadedId(visit.id);
        setNotFound(true);
        setBundle(null);
        setServer(null);
        setDraft(null);
        draftRef.current = null;
        draftRevisionRef.current = 0;
        setRemoteDeleted(false);
        return;
      }
      const committed = committedRef.current;
      if (
        committed &&
        isSameExperimentRevision(next.experiment, committed)
      ) {
        const preserveDraft =
          dirtyRef.current ||
          markdownEditorsRef.current.size > 0 ||
          savingRef.current;
        committedRef.current = next.experiment;
        setNotFound(false);
        setBundle(next);
        setServer(next.experiment);
        if (!preserveDraft) {
          setDraft(structuredClone(next.experiment));
          draftRef.current = next.experiment;
          draftRevisionRef.current = 0;
          setDirty(false);
          dirtyRef.current = false;
          setRemoteConflict(null);
          setIssues([]);
        }
        setRemoteDeleted(false);
        return;
      }
      const currentDraft = draftRef.current;
      if (!currentDraft) {
        setNotFound(false);
        setBundle(next);
        setServer(next.experiment);
        committedRef.current = next.experiment;
        setDraft(structuredClone(next.experiment));
        draftRef.current = next.experiment;
        draftRevisionRef.current = 0;
        setDirty(false);
        dirtyRef.current = false;
        setRemoteConflict(null);
        setRemoteDeleted(false);
        setIssues([]);
        return;
      }
      const resolution = reconcileRealtime(
        currentDraft,
        next.experiment,
        dirtyRef.current || markdownEditorsRef.current.size > 0,
        savingRef.current,
      );
      setBundle((current) => ({
        ...next,
        experiment: resolution.kind === "replace"
          ? next.experiment
          : current?.experiment ?? next.experiment,
      }));
      if (resolution.kind === "replace") {
        setServer(next.experiment);
        committedRef.current = next.experiment;
        setDraft(structuredClone(next.experiment));
        draftRef.current = next.experiment;
        draftRevisionRef.current = 0;
        setDirty(false);
        dirtyRef.current = false;
        setRemoteConflict(null);
        setRemoteDeleted(false);
        setIssues([]);
      } else if (resolution.kind === "conflict") {
        setRemoteConflict(next.experiment);
        setRemoteDeleted(false);
      }
    } catch (caught) {
      reportSnapshotError(visit, sequence, {
        message: `Could not refresh the experiment. ${errorDetail(caught, "The request failed.")}`,
        retry: "realtime",
      });
    }
  }, [acceptSnapshot, reportSnapshotError]);

  const refreshConflictComparison = useCallback(async (visit: Visit) => {
    const sequence = ++snapshotIssuedRef.current;
    try {
      const next = await loadExperimentBundle(visit.id);
      if (!acceptSnapshot(visit, sequence)) return;
      if (!next) {
        setRemoteConflict(null);
        setRemoteDeleted(true);
        return;
      }
      setBundle((current) => (
        current
          ? { ...next, experiment: current.experiment }
          : current
      ));
      setRemoteConflict(next.experiment);
      setRemoteDeleted(false);
    } catch (caught) {
      reportSnapshotError(visit, sequence, {
        message: `Could not refresh the remote comparison. ${errorDetail(caught, "The request failed.")}`,
        retry: "conflict",
      });
    }
  }, [acceptSnapshot, reportSnapshotError]);

  useEffect(() => {
    const visit = {
      id,
      generation: visitRef.current.generation + 1,
    };
    visitRef.current = visit;
    initialPendingRef.current = null;
    relatedVersionRef.current += 1;
    const snapshotBarrier = ++snapshotIssuedRef.current;
    snapshotAcceptedRef.current = snapshotBarrier;
    snapshotErrorRef.current = 0;
    mutationRef.current = null;
    draftRef.current = null;
    committedRef.current = null;
    draftRevisionRef.current = 0;
    dirtyRef.current = false;
    savingRef.current = false;
    markdownEditorsRef.current = new Set();
    setBundle(null);
    setServer(null);
    setDraft(null);
    setRemoteConflict(null);
    setRemoteDeleted(false);
    setIssues([]);
    setDetailError(null);
    setLoading(true);
    setNotFound(false);
    setDirty(false);
    setSaving(false);
    setMarkdownEditing(false);
    setMarkdownEpoch((current) => current + 1);
    setDeleting(false);
    setReloadingLatest(false);
    setDuplicateOpen(false);
    setActivityOpen(false);
    void loadInitial(visit);
    const unsubscribe = watchExperiment(
      id,
      () => void loadRealtimeExperiment(visit),
      () => void loadRelated(visit),
    );
    return () => {
      if (visitRef.current === visit) {
        visitRef.current = {
          id: visit.id,
          generation: visit.generation + 1,
        };
      }
      initialPendingRef.current = null;
      relatedVersionRef.current += 1;
      const cleanupBarrier = ++snapshotIssuedRef.current;
      snapshotAcceptedRef.current = cleanupBarrier;
      snapshotErrorRef.current = 0;
      mutationRef.current = null;
      committedRef.current = null;
      unsubscribe();
    };
  }, [id, loadInitial, loadRealtimeExperiment, loadRelated]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current && markdownEditorsRef.current.size === 0) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  function patchDraft(patch: Partial<Experiment>) {
    const current = draftRef.current;
    if (!current) return;
    draftRevisionRef.current += 1;
    const next = { ...current, ...patch };
    draftRef.current = next;
    setDraft(next);
    const source = committedRef.current;
    if (source) {
      if (hasEditableExperimentChanges(source, next)) {
        writeSessionExperimentDraft(
          getSessionExperimentDraftStorage(),
          source,
          next,
        );
      } else {
        clearSessionExperimentDraft(
          getSessionExperimentDraftStorage(),
          source.id,
        );
      }
    }
    const changed = source ? hasEditableExperimentChanges(source, next) : true;
    setDirty(changed);
    dirtyRef.current = changed;
    setIssues([]);
  }

  function setMarkdownEditor(key: string, editing: boolean) {
    const next = new Set(markdownEditorsRef.current);
    if (editing) next.add(key);
    else next.delete(key);
    markdownEditorsRef.current = next;
    setMarkdownEditing(next.size > 0);
  }

  async function save() {
    if (
      !server ||
      !draft ||
      mutationRef.current ||
      markdownEditorsRef.current.size > 0
    ) {
      return;
    }
    const nextIssues: ValidationIssue[] = [];
    if (!draft.name.trim()) {
      nextIssues.push({ field: "name", message: "Experiment Name is required." });
    }
    if (!draft.owner_id) {
      nextIssues.push({ field: "owner_id", message: "Experiment Owner is required." });
    }
    nextIssues.push(...validateBaseline(draft.id, draft.baseline_experiment_id));
    nextIssues.push(...validateForStatus(
      { ...draft, status: server.status },
      draft.status,
    ));
    if (nextIssues.length > 0) {
      setIssues(nextIssues);
      return;
    }

    const token = {};
    const mutation = { kind: "save" as const, token };
    const submissionRevision = draftRevisionRef.current;
    mutationRef.current = mutation;
    setSaving(true);
    savingRef.current = true;
    setDetailError(null);
    const visit = visitRef.current;
    try {
      const result = await updateExperiment(
        draft.id,
        server.updated_at,
        editableExperimentPatch(draft),
      );
      if (!isCurrentVisit(visit) || mutationRef.current !== mutation) return;
      if (!result.ok) {
        await refreshConflictComparison(visit);
        return;
      }
      establishSnapshotBarrier();
      setServer(result.experiment);
      committedRef.current = result.experiment;
      setBundle((current) => (
        current ? { ...current, experiment: result.experiment } : current
      ));
      if (draftRevisionRef.current === submissionRevision) {
        setDraft(structuredClone(result.experiment));
        draftRef.current = result.experiment;
        draftRevisionRef.current = 0;
        setDirty(false);
        dirtyRef.current = false;
        clearSessionExperimentDraft(
          getSessionExperimentDraftStorage(),
          result.experiment.id,
        );
      } else {
        setDirty(true);
        dirtyRef.current = true;
        const latestDraft = draftRef.current;
        if (latestDraft) {
          writeSessionExperimentDraft(
            getSessionExperimentDraftStorage(),
            result.experiment,
            latestDraft,
          );
        }
      }
      setIssues([]);
      savingRef.current = false;
      await loadRealtimeExperiment(visit);
    } catch (caught) {
      if (!isCurrentVisit(visit) || mutationRef.current !== mutation) return;
      setDetailError({
        message: `Could not save the experiment. ${errorDetail(caught, "The request failed.")}`,
        retry: null,
      });
    } finally {
      if (isCurrentVisit(visit) && mutationRef.current === mutation) {
        mutationRef.current = null;
        setSaving(false);
        savingRef.current = false;
      }
    }
  }

  async function loadLatest() {
    if (!remoteConflict || mutationRef.current) return;
    if (!window.confirm(
      "Discard the local draft and reload the remote version?",
    )) {
      return;
    }
    if (mutationRef.current) return;

    const displayedRemote = remoteConflict;
    const token = {};
    const mutation = { kind: "reload" as const, token };
    const visit = visitRef.current;
    mutationRef.current = mutation;
    setReloadingLatest(true);
    setDetailError(null);
    establishSnapshotBarrier();
    setServer(displayedRemote);
    committedRef.current = displayedRemote;
    setDraft(structuredClone(displayedRemote));
    draftRef.current = displayedRemote;
    draftRevisionRef.current = 0;
    setBundle((current) => (
      current
        ? { ...current, experiment: displayedRemote }
        : current
    ));
    setDirty(false);
    dirtyRef.current = false;
    setRemoteConflict(null);
    clearSessionExperimentDraft(
      getSessionExperimentDraftStorage(),
      displayedRemote.id,
    );
    markdownEditorsRef.current = new Set();
    setMarkdownEditing(false);
    setMarkdownEpoch((current) => current + 1);
    setIssues([]);
    try {
      await loadRealtimeExperiment(visit);
    } finally {
      if (isCurrentVisit(visit) && mutationRef.current === mutation) {
        mutationRef.current = null;
        setReloadingLatest(false);
      }
    }
  }

  async function removeExperiment() {
    if (!draft || !bundle || mutationRef.current) return;
    if (!window.confirm(
      `Delete ${formatExperimentId(draft.experiment_no)}? The record, attachment rows, and stored images will be removed.`,
    )) {
      return;
    }
    if (mutationRef.current) return;
    const token = {};
    const mutation = { kind: "delete" as const, token };
    const visit = visitRef.current;
    const destination = bundle.task ? `/task/${bundle.task.id}` : "/experiments";
    mutationRef.current = mutation;
    setDeleting(true);
    setDetailError(null);
    try {
      await deleteExperiment(draft);
      if (isCurrentVisit(visit) && mutationRef.current === mutation) {
        committedRef.current = null;
        clearSessionExperimentDraft(
          getSessionExperimentDraftStorage(),
          draft.id,
        );
        router.push(destination);
      }
    } catch (caught) {
      if (isCurrentVisit(visit) && mutationRef.current === mutation) {
        setDetailError({
          message: `Could not delete the experiment. ${errorDetail(caught, "The request failed.")}`,
          retry: null,
        });
      }
    } finally {
      if (isCurrentVisit(visit) && mutationRef.current === mutation) {
        mutationRef.current = null;
        setDeleting(false);
      }
    }
  }

  function retry() {
    const visit = visitRef.current;
    if (!detailError?.retry) return;
    if (detailError.retry === "initial") void loadInitial(visit);
    if (detailError.retry === "related") void loadRelated(visit);
    if (detailError.retry === "realtime") void loadRealtimeExperiment(visit);
    if (detailError.retry === "conflict") void refreshConflictComparison(visit);
  }

  const baseline = useMemo(() => {
    if (!draft?.baseline_experiment_id || !bundle) return null;
    return bundle.candidates.find(
      (candidate) => candidate.id === draft.baseline_experiment_id,
    ) ?? null;
  }, [bundle, draft?.baseline_experiment_id]);

  const hasLocalChanges = dirty || markdownEditing;
  const compareBlocked = hasLocalChanges || reloadingLatest;
  const visitLoading = loadedId !== id || loading;

  if (visitLoading) {
    return (
      <WorkspaceSkeleton variant="record" label="Loading Experiment" />
    );
  }

  if (notFound) {
    return (
      <div className="workspace-page">
        <Link href="/experiments" className="back-link">← Experiments</Link>
        <p className="state-note">Experiment not found. It may have been deleted.</p>
        {detailError && (
          <div className="error-banner" role="alert">
            <span>{detailError.message}</span>
            {detailError.retry && (
              <button type="button" className="btn" onClick={retry}>Retry</button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!bundle || !server || !draft) {
    return (
      <div className="workspace-page">
        <Link href="/experiments" className="back-link">← Experiments</Link>
        {detailError && (
          <div className="error-banner" role="alert">
            <span>{detailError.message}</span>
            {detailError.retry && (
              <button type="button" className="btn" onClick={retry}>Retry</button>
            )}
          </div>
        )}
      </div>
    );
  }

  const compareQuery = serializeCompareSelection({
    ids: baseline ? [baseline.id, draft.id] : [draft.id],
    baselineId: baseline?.id ?? null,
  });
  const taskHref = bundle.task ? `/task/${bundle.task.id}` : "/experiments";

  return (
    <div
      className="record-page experiment-detail-page"
      data-activity-open={activityOpen}
    >
      <div
        className="record-main experiment-main-column experiment-detail-scroll-region"
        role="region"
        aria-label="Experiment details"
        tabIndex={0}
      >
        <Link href={taskHref} className="back-link">
          ← {bundle.task?.title ?? "Experiments"}
        </Link>

        {(remoteConflict || remoteDeleted) && (
          <div className="conflict-banner" role="alert">
            <div>
              <strong>
                {remoteDeleted
                  ? "This experiment was deleted remotely."
                  : "This experiment changed remotely."}
              </strong>
              <p>Your local draft was not overwritten.</p>
              {remoteConflict && (
                <p>
                  Remote: {remoteConflict.name} ·{" "}
                  {EXPERIMENT_STATUS_LABELS[remoteConflict.status]} · updated{" "}
                  {fmtDate(remoteConflict.updated_at)}
                </p>
              )}
            </div>
            <div className="workspace-actions">
              <button
                type="button"
                className="btn"
                disabled={saving || deleting || reloadingLatest}
                onClick={() => void refreshConflictComparison(visitRef.current)}
              >
                Keep editing / refresh comparison
              </button>
              {remoteConflict && (
                <button
                  type="button"
                  className="btn"
                  disabled={saving || deleting || reloadingLatest}
                  onClick={() => void loadLatest()}
                >
                  {reloadingLatest ? "Loading latest…" : "Load latest"}
                </button>
              )}
            </div>
          </div>
        )}
        {detailError && (
          <div className="error-banner" role="alert">
            <span>{detailError.message}</span>
            {detailError.retry && (
              <button type="button" className="btn" onClick={retry}>Retry</button>
            )}
          </div>
        )}

        <PageHeader
          eyebrow={formatExperimentId(draft.experiment_no)}
          title={
            <input
              className="experiment-title-input"
              aria-label="Experiment Name"
              value={draft.name}
              onChange={(event) => patchDraft({ name: event.target.value })}
            />
          }
          actions={
            <>
              <Link
                className={`btn ${compareBlocked ? "disabled" : ""}`}
                aria-disabled={compareBlocked}
                title={reloadingLatest
                  ? "Wait for the latest saved data before comparing."
                  : hasLocalChanges
                    ? "Finish and save changes before comparing."
                    : "Compare saved data."}
                href={compareBlocked
                  ? `/experiments/${draft.id}`
                  : `/experiments/compare?${compareQuery}`}
                onClick={(event) => {
                  if (compareBlocked) event.preventDefault();
                }}
              >
                Compare
              </Link>
              <button
                type="button"
                className="btn"
                disabled={
                  hasLocalChanges
                  || saving
                  || deleting
                  || reloadingLatest
                  || Boolean(remoteConflict)
                  || remoteDeleted
                }
                title={hasLocalChanges
                  ? "Finish and save changes before duplicating."
                  : "Duplicate saved context."}
                onClick={() => setDuplicateOpen(true)}
              >
                Duplicate
              </button>
              <button
                ref={activityTriggerRef}
                type="button"
                className="btn activity-drawer-trigger"
                aria-controls="experiment-activity-drawer"
                aria-expanded={activityOpen}
                aria-label={activityOpen ? "Hide activity" : "Show activity"}
                onClick={() => setActivityOpen(true)}
              >
                <Icon name="activity" size={16} />
                Activity
              </button>
              <ExperimentActionMenu
                key={draft.id}
                deleting={deleting}
                disabled={saving || deleting || reloadingLatest}
                onDelete={() => void removeExperiment()}
              />
            </>
          }
        />

        <section className="experiment-properties" aria-label="Experiment properties">
          <label>
            <span>Task</span>
            <Link href={taskHref}>{bundle.task?.title ?? "Deleted task"}</Link>
          </label>
          <label>
            <span>Owner</span>
            <select
              aria-label="Experiment Owner"
              value={draft.owner_id ?? ""}
              onChange={(event) => patchDraft({
                owner_id: event.target.value || null,
              })}
            >
              <option value="">Choose an Owner</option>
              {bundle.members.map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              aria-label="Experiment Status"
              value={draft.status}
              onChange={(event) => patchDraft({
                status: event.target.value as Experiment["status"],
              })}
            >
              {allowedTargets(server.status).map((status) => (
                <option key={status} value={status}>
                  {EXPERIMENT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span>Current status</span>
            <ExperimentStatusBadge status={server.status} />
          </div>
          <div><span>Created</span><strong>{fmtDate(server.created_at)}</strong></div>
          <div><span>Started</span><strong>{fmtDate(server.started_at) || "—"}</strong></div>
          <div><span>Completed</span><strong>{fmtDate(server.completed_at) || "—"}</strong></div>
          <BaselinePicker
            current={draft}
            candidates={bundle.candidates}
            value={draft.baseline_experiment_id}
            onChange={(baselineId) => patchDraft({
              baseline_experiment_id: baselineId,
            })}
          />
        </section>

        <nav className="section-anchors" aria-label="Experiment sections">
          {EXPERIMENT_SECTION_LINKS.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.label}
            </a>
          ))}
        </nav>

        <ExperimentSection
          id="data"
          title="Data"
          description="Training and evaluation datasets used by this run."
        >
          <DataEditor
            value={draft.data_spec}
            onChange={(data_spec) => patchDraft({ data_spec })}
          />
        </ExperimentSection>
        <ExperimentSection
          id="object"
          title="Object"
          description="Model plus the Prompt, Skills, and Tools that make up the Harness."
        >
          <ObjectEditor
            value={draft.object_spec}
            onChange={(object_spec) => patchDraft({ object_spec })}
          />
        </ExperimentSection>
        <ExperimentSection
          id="environment"
          title="Environment"
          description="NPU or GPU placement and evaluator context."
        >
          <EnvironmentEditor
            value={draft.environment_spec}
            onChange={(environment_spec) => patchDraft({ environment_spec })}
          />
        </ExperimentSection>
        <ExperimentSection
          id="config"
          title="Config"
          description="Typed experiment parameters; values are stored as structured JSON properties."
        >
          <ConfigEditor
            value={draft.config}
            onChange={(config) => patchDraft({ config })}
          />
        </ExperimentSection>
        <ExperimentSection
          id="result"
          title="Result"
          description="Manual numeric metrics, qualitative summary, plots, and captions."
        >
          <ResultEditor
            metrics={draft.metrics}
            featuredMetricKeys={draft.featured_metric_keys}
            resultSummary={draft.result_summary}
            onChange={(result) => patchDraft({
              metrics: result.metrics,
              featured_metric_keys: result.featuredMetricKeys,
              result_summary: result.resultSummary,
            })}
          />
          <AttachmentGallery
            scope={{
              taskId: server.task_id,
              experimentId: server.id,
            }}
            visitKey={`experiment:${server.id}`}
            attachments={bundle.attachments}
            title="Plots & images"
            emptyMessage="No plots or images attached."
            altFallback="Experiment plot"
            onChanged={() => void loadRelated(visitRef.current)}
          />
        </ExperimentSection>
        <ExperimentSection
          id="decision"
          title="Decision"
          description="A structured outcome and the reasoning that should guide the Task."
        >
          <DecisionEditor
            key={`${draft.id}-decision-${markdownEpoch}`}
            outcome={draft.decision_outcome}
            notes={draft.decision_notes}
            onChange={(decision_outcome, decision_notes) => patchDraft({
              decision_outcome,
              decision_notes,
            })}
            onEditingChange={(editing) => setMarkdownEditor("decision", editing)}
          />
        </ExperimentSection>
        <ExperimentSection
          id="note"
          title="Note"
          description="Freeform experiment-specific Markdown source."
        >
          <div className="stacked-field">
            <span>Experiment Note</span>
            <MarkdownField
              key={`${draft.id}-note-${markdownEpoch}`}
              value={draft.notes}
              minHeight={180}
              onSave={(notes) => patchDraft({ notes })}
              onDraftChange={(notes) => patchDraft({ notes })}
              onEditingChange={(editing) => setMarkdownEditor("note", editing)}
              placeholder="Observations, caveats, links, and follow-up ideas"
            />
          </div>
        </ExperimentSection>

        {baseline && <BaselineSummary current={draft} baseline={baseline} />}

        {issues.length > 0 && (
          <div className="validation-summary" role="alert">
            <strong>Resolve these fields before saving:</strong>
            <ul>
              {issues.map((issue) => (
                <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="experiment-save-bar">
          <span>
            {markdownEditing
              ? "Finish Markdown editing before saving"
              : dirty
                ? "Unsaved changes"
                : `Saved · updated ${fmtDate(server.updated_at)}`}
          </span>
          <button
            type="button"
            className="btn"
            disabled={
              !dirty ||
              saving ||
              deleting ||
              reloadingLatest ||
              markdownEditing
            }
            onClick={() => {
              setDraft(structuredClone(server));
              draftRef.current = server;
              draftRevisionRef.current = 0;
              setDirty(false);
              dirtyRef.current = false;
              clearSessionExperimentDraft(
                getSessionExperimentDraftStorage(),
                server.id,
              );
              setIssues([]);
            }}
          >
            Discard
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={
              !dirty ||
              saving ||
              deleting ||
              reloadingLatest ||
              markdownEditing ||
              Boolean(remoteConflict) ||
              remoteDeleted
            }
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <ActivityDrawer
        open={activityOpen}
        panelId="experiment-activity-drawer"
        label="Experiment activity"
        className="experiment-activity-drawer"
        onClose={() => setActivityOpen(false)}
        returnFocusRef={activityTriggerRef}
      >
        <ExperimentTimeline
          experiment={server}
          activity={bundle.activity}
          onChanged={() => void loadRelated(visitRef.current)}
        />
      </ActivityDrawer>

      <DuplicateExperimentDialog
        open={duplicateOpen}
        source={server}
        members={bundle.members}
        onClose={() => setDuplicateOpen(false)}
        onCreated={(experiment) => router.push(`/experiments/${experiment.id}`)}
      />
    </div>
  );
}
