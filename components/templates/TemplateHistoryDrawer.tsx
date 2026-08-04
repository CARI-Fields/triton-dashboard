"use client";

import { useEffect, useState } from "react";
import {
  listTemplateVersions,
  type TemplateVersionSummary,
} from "@/lib/templates/repository";

export default function TemplateHistoryDrawer({
  templateId,
  open,
  onClose,
  onRestore,
}: {
  templateId: string | null;
  open: boolean;
  onClose: () => void;
  onRestore: (versionNo: number) => Promise<void>;
}) {
  const [versions, setVersions] = useState<TemplateVersionSummary[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !templateId) return;
    setError("");
    listTemplateVersions(templateId)
      .then(setVersions)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Could not load history."));
  }, [open, templateId]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={() => { if (!busy) onClose(); }}>
      <aside
        className="history-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Template history"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="history-drawer-header">
          <div>
            <p className="eyebrow">Versions</p>
            <h2>Template history</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <ol className="history-list">
          {versions.map((version) => (
            <li key={version.id} className="history-item">
              <div>
                <strong>v{version.version_no}</strong>
                <span className="history-reason">{version.reason}</span>
                <span className="history-meta">
                  {version.source} · {new Date(version.created_at).toLocaleString()}
                </span>
              </div>
              <button
                type="button"
                className="btn ghost small"
                disabled={busy || version.version_no === 1}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await onRestore(version.version_no);
                    onClose();
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : "Restore failed.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Restore
              </button>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
