"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import type { Experiment, Member } from "@/lib/types";
import { loadExperimentBundle } from "@/lib/experiments/repository";
import { loadTemplateDraft, type TemplateDraft } from "@/lib/templates/repository";
import {
  archiveExperiment,
  loadExperimentValues,
  saveExperimentCore,
  saveValue,
  touchEditSession,
  type EditSessionClock,
  type SaveValueResult,
  type TypedValue,
} from "@/lib/experiments/values";
import { EXPERIMENT_STATUS_LABELS, formatExperimentId } from "@/lib/experiments/policy";
import WorkspaceSkeleton from "@/components/ui/WorkspaceSkeleton";
import ExperimentVersionDrawer from "@/components/experiments/ExperimentVersionDrawer";
import TemplateFieldTables, {
  type CellState,
} from "@/components/experiments/TemplateFieldTables";
import type { CommitOutcome } from "@/components/experiments/ValueEditor";

export default function TemplateExperimentDetail({ id }: { id: string }) {
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [template, setTemplate] = useState<TemplateDraft | null>(null);
  const [values, setValues] = useState<Map<string, CellState>>(new Map());
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const sessionRef = useRef<EditSessionClock>({
    id: "00000000-0000-4000-8000-000000000001",
    lastMutationAt: 0,
  });

  const reload = useCallback(async () => {
    try {
      const bundle = await loadExperimentBundle(id);
      if (!bundle || !bundle.experiment.template_id) {
        throw new Error("Experiment has no Template.");
      }
      const [templateDraft, valueMap] = await Promise.all([
        loadTemplateDraft(bundle.experiment.template_id),
        loadExperimentValues(id),
      ]);
      setExperiment(bundle.experiment);
      setMembers(bundle.members);
      setTemplate(templateDraft as TemplateDraft | null);
      setValues(valueMap as Map<string, CellState>);
      setLoading(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the Experiment.");
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const commitCell = useCallback(async (
    keyId: string,
    keyType: string,
    value: TypedValue | null,
    expectedCellRevision: number,
  ): Promise<CommitOutcome> => {
    if (!experiment) return "error";
    const sessionId = touchEditSession(sessionRef.current);
    setSaving(true);
    try {
      const result: SaveValueResult = await saveValue({
        experimentId: experiment.id,
        keyId,
        expectedCellRevision,
        value,
        editSessionId: sessionId,
      });
      if (result.status === "conflict") {
        return "conflict";
      }
      setLastSavedAt(Date.now());
      const next = new Map(values);
      next.set(keyId, { value, cellRevision: result.cell_revision });
      setValues(next);
      return "saved";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the Value.");
      return "error";
    } finally {
      setSaving(false);
    }
  }, [experiment, values]);

  async function commitCore(name: string) {
    if (!experiment || name.trim() === "" || name === experiment.name) return;
    const sessionId = touchEditSession(sessionRef.current);
    setSaving(true);
    try {
      await saveExperimentCore(
        experiment.id,
        { name: name.trim(), ownerId: experiment.owner_id, status: experiment.status },
        sessionId,
      );
      setExperiment({ ...experiment, name: name.trim() });
      setLastSavedAt(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the name.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive() {
    if (!experiment) return;
    const confirmed = window.confirm(
      experiment.archived_at
        ? "Unarchive this Experiment?"
        : "Archive this Experiment? All Required Values must be complete.",
    );
    if (!confirmed) return;
    try {
      if (experiment.archived_at) {
        await archiveExperiment(experiment.id);
      } else {
        await archiveExperiment(experiment.id);
      }
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Archive failed.");
    }
  }

  const savedLabel = useMemo(() => {
    if (saving) return "Saving…";
    if (lastSavedAt === null) return null;
    return "Saved just now";
  }, [saving, lastSavedAt]);

  if (loading) return <WorkspaceSkeleton variant="record" label="Loading Experiment" />;
  if (!experiment || !template) {
    return <p className="form-error" role="alert">{error || "Experiment not found."}</p>;
  }

  const archived = experiment.archived_at !== null;

  return (
    <article className="workspace-page template-experiment-detail">
      <header className="template-experiment-header">
        <div className="template-experiment-id">
          <Link href={`/task/${experiment.task_id}`}>← Task</Link>
          <span>{formatExperimentId(experiment.experiment_no)}</span>
        </div>
        <h1>
          <input
            aria-label="Experiment name"
            value={experiment.name}
            disabled={archived || saving}
            onChange={(event) =>
              setExperiment({ ...experiment, name: event.target.value })}
            onBlur={(event) => void commitCore(event.target.value)}
          />
        </h1>
        <div className="template-experiment-meta">
          <span>Template: <strong>{template.name}</strong></span>
          <span>Status: {EXPERIMENT_STATUS_LABELS[experiment.status]}</span>
          {savedLabel ? <span className="autosave-indicator">{savedLabel}</span> : null}
          <button
            type="button"
            className="btn ghost"
            onClick={() => setHistoryOpen(true)}
          >
            History
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={archived || saving}
            onClick={toggleArchive}
          >
            {archived ? "Unarchive" : "Archive"}
          </button>
        </div>
      </header>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <ExperimentVersionDrawer
        experimentId={experiment.id}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestored={reload}
      />

      <TemplateFieldTables
        fields={template.fields}
        values={values}
        readOnly={archived}
        onCommit={commitCell}
      />
    </article>
  );
}
