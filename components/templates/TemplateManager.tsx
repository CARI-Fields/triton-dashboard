"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import WorkspaceSkeleton from "@/components/ui/WorkspaceSkeleton";
import TemplateList from "@/components/templates/TemplateList";
import NewTemplateDialog from "@/components/templates/NewTemplateDialog";
import TemplateEditor from "@/components/templates/TemplateEditor";
import {
  archiveTemplate,
  emptyTemplateDraft,
  listTemplateSummaries,
  loadTemplateDraft,
  saveTemplate,
  unarchiveTemplate,
  type TemplateDraft,
  type TemplateSummary,
} from "@/lib/templates/repository";

export default function TemplateManager() {
  const reloadVersion = useRef(0);
  const selectVersion = useRef(0);
  const [summaries, setSummaries] = useState<TemplateSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const reloadSummaries = useCallback(async () => {
    const requestVersion = ++reloadVersion.current;
    setLoading(true);
    try {
      const next = await listTemplateSummaries();
      if (requestVersion !== reloadVersion.current) return;
      setSummaries(next);
      setLoading(false);
    } catch (caught) {
      if (requestVersion !== reloadVersion.current) return;
      setError(caught instanceof Error ? caught.message : "Could not load Templates.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadSummaries();
  }, [reloadSummaries]);

  const selectTemplate = useCallback(async (templateId: string) => {
    const requestVersion = ++selectVersion.current;
    setSelectedId(templateId);
    setDraft(null);
    setError("");
    try {
      const next = await loadTemplateDraft(templateId);
      if (requestVersion !== selectVersion.current) return;
      setDraft(next);
    } catch (caught) {
      if (requestVersion !== selectVersion.current) return;
      setError(caught instanceof Error ? caught.message : "Could not load the Template.");
    }
  }, []);

  async function createTemplate(name: string, description: string) {
    const { data, error } = await import("@/lib/supabase").then((m) =>
      m.supabase!.from("experiment_templates").insert({ name, description }).select().single(),
    );
    if (error) throw new Error(error.message);
    const template = data as {
      id: string; name: string; description: string; schema_revision: number;
      archived_at: string | null; created_at: string; updated_at: string;
    };
    setNewOpen(false);
    await reloadSummaries();
    setSelectedId(template.id);
    setDraft(emptyTemplateDraft(template));
  }

  async function persist(next: TemplateDraft) {
    const result = await saveTemplate(next);
    setDraft({ ...next, schemaRevision: result.schema_revision });
    await reloadSummaries();
  }

  async function toggleArchive() {
    if (!selectedId || !draft) return;
    const isArchived = summaries.find(
      (summary) => summary.template.id === selectedId,
    )?.template.archived_at != null;
    const confirmed = window.confirm(
      isArchived
        ? "Unarchive this Template? Existing Experiments stay linked."
        : "Archive this Template? Existing Experiments stay readable, but new Experiments cannot use it.",
    );
    if (!confirmed) return;
    if (isArchived) {
      await unarchiveTemplate(selectedId);
    } else {
      await archiveTemplate(selectedId);
    }
    await reloadSummaries();
    await selectTemplate(selectedId);
  }

  if (loading && summaries.length === 0) {
    return <WorkspaceSkeleton variant="table" label="Loading Templates" />;
  }

  const selectedSummary = summaries.find((summary) => summary.template.id === selectedId) ?? null;
  const archived = selectedSummary?.template.archived_at != null;

  return (
    <div className="template-manager">
      <PageHeader
        eyebrow="Schema"
        title="Experiment templates"
        description="One typed schema per comparable series of Experiments."
        actions={
          selectedSummary ? (
            <>
              <button type="button" className="btn ghost" onClick={toggleArchive}>
                {archived ? "Unarchive" : "Archive"}
              </button>
            </>
          ) : null
        }
      />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="template-manager-body">
        <TemplateList
          summaries={summaries}
          selectedId={selectedId}
          onSelect={selectTemplate}
          onNew={() => setNewOpen(true)}
        />
        <div className="template-editor-pane">
          {draft ? (
            <TemplateEditor
              key={draft.templateId}
              draft={draft}
              experimentCount={selectedSummary?.experimentCount ?? 0}
              onPersist={persist}
              readOnly={archived}
            />
          ) : (
            <p className="template-empty">Select a Template to edit its schema.</p>
          )}
        </div>
      </div>
      <NewTemplateDialog open={newOpen} onClose={() => setNewOpen(false)} onCreate={createTemplate} />
    </div>
  );
}
