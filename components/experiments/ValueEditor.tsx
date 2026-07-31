"use client";

import { useState, type KeyboardEvent } from "react";
import type { TemplateKeyDraft, TemplateOptionDraft } from "@/lib/templates/repository";
import type { TypedValue } from "@/lib/experiments/values";

export type CommitOutcome = "saved" | "saving" | "error" | "conflict" | "idle";

export default function ValueEditor({
  keyDef,
  options,
  value,
  cellRevision,
  disabled,
  onCommit,
  outcome,
  error,
}: {
  keyDef: Pick<TemplateKeyDraft, "id" | "key" | "valueType" | "required">;
  options: TemplateOptionDraft[];
  value: TypedValue | null;
  cellRevision: number;
  disabled: boolean;
  onCommit: (value: TypedValue | null, expectedCellRevision: number) => void;
  outcome: CommitOutcome;
  error: string;
}) {
  const type = keyDef.valueType;
  const initialText = (() => {
    switch (type) {
      case "short_text": return value?.kind === "short_text" ? value.text : "";
      case "long_text": return value?.kind === "long_text" ? value.text : "";
      case "url": return value?.kind === "url" ? value.url : "";
      case "number": return value?.kind === "number" ? String(value.number) : "";
      case "date_time": return value?.kind === "date_time" ? value.datetime.slice(0, 16) : "";
      case "single_select": return value?.kind === "single_select" ? value.optionId : "";
      default: return "";
    }
  })();
  const [text, setText] = useState(initialText);
  const [checked, setChecked] = useState(value?.kind === "boolean" && value.boolean);

  function commitText() {
    if (type === "number") {
      const trimmed = text.trim();
      if (trimmed === "") {
        onCommit(null, cellRevision);
        return;
      }
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) return;
      onCommit({ kind: "number", number: parsed }, cellRevision);
      return;
    }
    if (type === "url") {
      onCommit({ kind: "url", url: text.trim() }, cellRevision);
      return;
    }
    if (type === "date_time") {
      if (!text) {
        onCommit(null, cellRevision);
        return;
      }
      onCommit({ kind: "date_time", datetime: new Date(text).toISOString() }, cellRevision);
      return;
    }
    if (type === "short_text") {
      onCommit(text === "" ? null : { kind: "short_text", text }, cellRevision);
      return;
    }
    onCommit(text === "" ? null : { kind: "long_text", text }, cellRevision);
  }

  function commitSingleSelect(optionId: string) {
    onCommit(
      optionId === "" ? null : { kind: "single_select", optionId },
      cellRevision,
    );
  }

  if (type === "boolean") {
    return (
      <label className="value-editor value-editor-boolean">
        <input
          type="checkbox"
          aria-label={`Value for ${keyDef.key}`}
          checked={checked}
          disabled={disabled}
          onChange={(event) => {
            setChecked(event.target.checked);
            onCommit({ kind: "boolean", boolean: event.target.checked }, cellRevision);
          }}
        />
        <CellStatus outcome={outcome} error={error} />
      </label>
    );
  }

  if (type === "single_select") {
    return (
      <span className="value-editor">
        <select
          aria-label={`Value for ${keyDef.key}`}
          value={initialText}
          disabled={disabled}
          onChange={(event) => commitSingleSelect(event.target.value)}
        >
          <option value="">—</option>
          {options
            .filter((option) => !option.archived)
            .map((option) => (
              <option key={option.id ?? `new-${option.position}`} value={option.id ?? ""}>
                {option.label}
              </option>
            ))}
        </select>
        <CellStatus outcome={outcome} error={error} />
      </span>
    );
  }

  if (type === "multi_select") {
    return (
      <span className="value-editor">
        <MultiSelectValue
          label={keyDef.key}
          options={options}
          selected={value?.kind === "multi_select" ? value.optionIds : []}
          disabled={disabled}
          onCommit={(optionIds) => onCommit(
            optionIds.length === 0 ? null : { kind: "multi_select", optionIds },
            cellRevision,
          )}
        />
        <CellStatus outcome={outcome} error={error} />
      </span>
    );
  }

  if (type === "long_text") {
    return (
      <span className="value-editor">
        <textarea
          rows={2}
          aria-label={`Value for ${keyDef.key}`}
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onBlur={commitText}
        />
        <button
          type="button"
          className="btn ghost small"
          onClick={commitText}
          disabled={disabled}
        >
          Done
        </button>
        <CellStatus outcome={outcome} error={error} />
      </span>
    );
  }

  return (
    <span className="value-editor">
      <input
        type={type === "date_time" ? "datetime-local" : "text"}
        aria-label={`Value for ${keyDef.key}`}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={commitText}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter") commitText();
          if (event.key === "Escape") setText(initialText);
        }}
      />
      <CellStatus outcome={outcome} error={error} />
    </span>
  );
}

function MultiSelectValue({
  label,
  options,
  selected,
  disabled,
  onCommit,
}: {
  label: string;
  options: TemplateOptionDraft[];
  selected: string[];
  disabled: boolean;
  onCommit: (optionIds: string[]) => void;
}) {
  function toggle(optionId: string) {
    const next = selected.includes(optionId)
      ? selected.filter((id) => id !== optionId)
      : [...selected, optionId];
    onCommit(next);
  }
  return (
    <span className="multi-select-value" role="group" aria-label={`Value for ${label}`}>
      {options.filter((option) => !option.archived).map((option) => (
        <label key={option.id ?? `new-${option.position}`} className="chip">
          <input
            type="checkbox"
            checked={option.id !== null && selected.includes(option.id)}
            disabled={disabled || option.id === null}
            onChange={() => option.id && toggle(option.id)}
          />
          {option.label}
        </label>
      ))}
    </span>
  );
}

function CellStatus({ outcome, error }: { outcome: CommitOutcome; error: string }) {
  if (outcome === "saving") return <span className="cell-status">Saving…</span>;
  if (outcome === "saved") return <span className="cell-status">Saved just now</span>;
  if (outcome === "error") return <span className="cell-status cell-status-error" role="alert">{error}</span>;
  if (outcome === "conflict") return <span className="cell-status cell-status-error" role="alert">Conflict</span>;
  return null;
}
