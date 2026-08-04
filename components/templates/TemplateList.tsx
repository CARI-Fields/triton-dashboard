"use client";

import type { TemplateSummary } from "@/lib/templates/repository";

export default function TemplateList({
  summaries,
  selectedId,
  onSelect,
  onNew,
}: {
  summaries: TemplateSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="template-rail">
      <div className="template-rail-header">
        <h2>Templates</h2>
        <button type="button" className="btn primary small" onClick={onNew}>
          New template
        </button>
      </div>
      <div className="template-rail-list" role="listbox" aria-label="Experiment templates">
        {summaries.map((summary) => {
          const selected = summary.template.id === selectedId;
          return (
            <button
              key={summary.template.id}
              type="button"
              role="option"
              aria-selected={selected}
              className={`template-card${selected ? " selected" : ""}`}
              onClick={() => onSelect(summary.template.id)}
            >
              <span className="template-card-name">
                {summary.template.name}
                {summary.template.archived_at ? <span className="template-archived-badge">Archived</span> : null}
              </span>
              {summary.template.description ? (
                <span className="template-card-description">{summary.template.description}</span>
              ) : null}
              <span className="template-card-meta">
                <span>{summary.fieldCount} fields</span>
                <span>{summary.keyCount} keys</span>
                <span>{summary.experimentCount} experiments</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
