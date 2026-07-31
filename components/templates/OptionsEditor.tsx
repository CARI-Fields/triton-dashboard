"use client";

import type { TemplateOptionDraft } from "@/lib/templates/repository";

export default function OptionsEditor({
  options,
  onChange,
}: {
  options: TemplateOptionDraft[];
  onChange: (options: TemplateOptionDraft[]) => void;
}) {
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((option, position) => ({ ...option, position })));
  }

  return (
    <div className="options-editor">
      <div className="options-editor-title">Options</div>
      {options.map((option, index) => (
        <div key={option.id ?? `new-${index}`} className="option-row">
          <button
            type="button"
            className="icon-btn"
            aria-label={`Move ${option.label || "option"} up`}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            ↑
          </button>
          <input
            aria-label={`Option label ${index + 1}`}
            value={option.label}
            onChange={(event) => {
              const next = [...options];
              next[index] = { ...option, label: event.target.value };
              onChange(next);
            }}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label={`Move ${option.label || "option"} down`}
            disabled={index === options.length - 1}
            onClick={() => move(index, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Archive ${option.label || "option"}`}
            onClick={() => {
              const next = [...options];
              next[index] = { ...option, archived: true };
              onChange(next);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn ghost small"
        onClick={() => onChange([...options, {
          id: null,
          label: "",
          position: options.length,
          archived: false,
        }])}
      >
        Add option
      </button>
    </div>
  );
}
