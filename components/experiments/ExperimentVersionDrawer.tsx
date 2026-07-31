"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listExperimentVersions,
  restoreExperimentVersion,
  type ExperimentVersionSummary,
} from "@/lib/experiments/values";

export default function ExperimentVersionDrawer({
  experimentId,
  open,
  onClose,
  onRestored,
}: {
  experimentId: string;
  open: boolean;
  onClose: () => void;
  onRestored: () => Promise<void> | void;
}) {
  const [versions, setVersions] = useState<ExperimentVersionSummary[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    listExperimentVersions(experimentId)
      .then(setVersions)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Could not load history."));
  }, [open, experimentId]);

  const sessions = useMemo(() => {
    const groups = new Map<string, ExperimentVersionSummary[]>();
    for (const version of [...versions].reverse()) {
      const key = version.edit_session_id ?? `direct-${version.id}`;
      const group = groups.get(key) ?? [];
      group.push(version);
      groups.set(key, group);
    }
    return [...groups.entries()].reverse();
  }, [versions]);

  if (!open) return null;

  async function restore(versionNo: number) {
    setBusy(true);
    setError("");
    try {
      await restoreExperimentVersion(experimentId, versionNo);
      await onRestored();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={() => { if (!busy) onClose(); }}>
      <aside
        className="history-drawer experiment-history-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Experiment history"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="history-drawer-header">
          <div>
            <p className="eyebrow">Versions</p>
            <h2>Experiment history</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {sessions.map(([sessionId, group], sessionIndex) => {
          const expandedSession = expanded.has(sessionId);
          return (
            <section key={sessionId} className="history-session">
              <button
                type="button"
                className="history-session-toggle"
                aria-expanded={expandedSession}
                onClick={() => {
                  const next = new Set(expanded);
                  if (expandedSession) next.delete(sessionId);
                  else next.add(sessionId);
                  setExpanded(next);
                }}
              >
                Session {sessionIndex + 1}
              </button>
              {expandedSession ? (
                <ol className="history-list">
                  {group.map((version) => (
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
                        aria-label={`Restore version ${version.version_no}`}
                        disabled={busy || version.version_no === 1}
                        onClick={() => void restore(version.version_no)}
                      >
                        Restore
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          );
        })}
      </aside>
    </div>
  );
}
