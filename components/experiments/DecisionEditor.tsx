"use client";

import MarkdownField from "@/components/MarkdownField";
import { DECISION_LABELS } from "@/lib/experiments/policy";
import type { DecisionOutcome } from "@/lib/types";

export default function DecisionEditor({
  outcome,
  notes,
  onChange,
  onEditingChange,
}: {
  outcome: DecisionOutcome | null;
  notes: string;
  onChange: (outcome: DecisionOutcome | null, notes: string) => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  return (
    <div className="decision-editor">
      <label>
        <span>Outcome</span>
        <select
          aria-label="Decision Outcome"
          value={outcome ?? ""}
          onChange={(event) => onChange(
            event.target.value
              ? event.target.value as DecisionOutcome
              : null,
            notes,
          )}
        >
          <option value="">No decision</option>
          {(Object.entries(DECISION_LABELS) as [DecisionOutcome, string][])
            .map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
        </select>
      </label>
      <div className="stacked-field">
        <span>Decision Notes</span>
        <MarkdownField
          value={notes}
          onSave={(nextNotes) => onChange(outcome, nextNotes)}
          onDraftChange={(nextNotes) => onChange(outcome, nextNotes)}
          onEditingChange={onEditingChange}
          placeholder="Why this outcome was chosen and what happens next"
        />
      </div>
    </div>
  );
}
