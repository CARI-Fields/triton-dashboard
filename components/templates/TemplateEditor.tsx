"use client";

import { useMemo, useState } from "react";
import OptionsEditor from "@/components/templates/OptionsEditor";
import { describeTemplateImpact } from "@/lib/templates/impact";
import type {
  TemplateDraft,
  TemplateFieldDraft,
  TemplateKeyDraft,
  TemplateOptionDraft,
} from "@/lib/templates/repository";
import type { TemplateValueType as ValueType } from "@/lib/types";

const VALUE_TYPES: Array<{ value: ValueType; label: string }> = [
  { value: "short_text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "single_select", label: "Single select" },
  { value: "multi_select", label: "Multi select" },
  { value: "date_time", label: "Date/time" },
  { value: "url", label: "URL" },
  { value: "attachment", label: "Attachment" },
];

const COLOR_TOKENS = ["blue", "green", "amber", "purple", "rose", "teal"];

export default function TemplateEditor({
  draft,
  experimentCount,
  onPersist,
  readOnly,
}: {
  draft: TemplateDraft;
  experimentCount: number;
  onPersist: (draft: TemplateDraft) => Promise<void>;
  readOnly: boolean;
}) {
  const [next, setNext] = useState<TemplateDraft>(() => structuredClone(draft));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [optionsFor, setOptionsFor] = useState<string | null>(null);
  const impact = useMemo(
    () => describeTemplateImpact(draft, next, experimentCount),
    [draft, next, experimentCount],
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(next);

  function updateField(index: number, patch: Partial<TemplateFieldDraft>) {
    const fields = [...next.fields];
    fields[index] = { ...fields[index], ...patch };
    setNext({ ...next, fields });
  }

  function updateKey(fieldIndex: number, keyIndex: number, patch: Partial<TemplateKeyDraft>) {
    const fields = [...next.fields];
    const keys = [...fields[fieldIndex].keys];
    keys[keyIndex] = { ...keys[keyIndex], ...patch };
    fields[fieldIndex] = { ...fields[fieldIndex], keys };
    setNext({ ...next, fields });
  }

  function moveKey(fieldIndex: number, keyIndex: number, direction: -1 | 1) {
    const fields = [...next.fields];
    const keys = [...fields[fieldIndex].keys];
    const target = keyIndex + direction;
    if (target < 0 || target >= keys.length) return;
    [keys[keyIndex], keys[target]] = [keys[target], keys[keyIndex]];
    fields[fieldIndex] = {
      ...fields[fieldIndex],
      keys: keys.map((key, position) => ({ ...key, position })),
    };
    setNext({ ...next, fields });
  }

  function moveField(fieldIndex: number, direction: -1 | 1) {
    const fields = [...next.fields];
    const target = fieldIndex + direction;
    if (target < 0 || target >= fields.length) return;
    [fields[fieldIndex], fields[target]] = [fields[target], fields[fieldIndex]];
    setNext({ ...next, fields: fields.map((field, position) => ({ ...field, position })) });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await onPersist(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the Template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="template-editor">
      <div className="template-editor-heading">
        <input
          className="template-editor-name"
          aria-label="Template name"
          value={next.name}
          disabled={readOnly}
          onChange={(event) => setNext({ ...next, name: event.target.value })}
        />
        <textarea
          className="template-editor-description"
          aria-label="Template description"
          rows={2}
          value={next.description}
          disabled={readOnly}
          onChange={(event) => setNext({ ...next, description: event.target.value })}
        />
      </div>

      <div className="template-schema-scroll" tabIndex={0}>
        <table className="template-schema-table">
          <thead>
            <tr>
              <th scope="col">Field label</th>
              <th scope="col">Key</th>
              <th scope="col">Value type</th>
              <th scope="col">Required / optional</th>
              <th scope="col" className="sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {next.fields.map((field, fieldIndex) => {
              const rowCount = Math.max(field.keys.length, 1);
              return (
                <TemplateFieldRows
                  key={field.id ?? `new-field-${fieldIndex}`}
                  field={field}
                  fieldIndex={fieldIndex}
                  rowCount={rowCount}
                  readOnly={readOnly}
                  onFieldChange={(patch) => updateField(fieldIndex, patch)}
                  onKeyChange={(keyIndex, patch) => updateKey(fieldIndex, keyIndex, patch)}
                  onMoveKey={(keyIndex, direction) => moveKey(fieldIndex, keyIndex, direction)}
                  onArchiveField={() => updateField(fieldIndex, { archived: true })}
                  onAddKey={() => {
                    const fields = [...next.fields];
                    const keys = [...fields[fieldIndex].keys];
                    keys.push({
                      id: null,
                      key: "",
                      valueType: "short_text",
                      required: false,
                      position: keys.length,
                      archived: false,
                      options: [],
                      valueCount: 0,
                    });
                    fields[fieldIndex] = { ...fields[fieldIndex], keys };
                    setNext({ ...next, fields });
                  }}
                  onOpenOptions={(keyId) => setOptionsFor(keyId)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="template-editor-footer">
        <button
          type="button"
          className="btn ghost small"
          disabled={readOnly}
          onClick={() => {
            const fields = [...next.fields];
            fields.push({
              id: null,
              label: "",
              colorToken: COLOR_TOKENS[next.fields.length % COLOR_TOKENS.length],
              position: next.fields.length,
              archived: false,
              keys: [],
            });
            setNext({ ...next, fields });
          }}
        >
          Add field label
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={readOnly || !dirty || saving || !next.name.trim()}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save schema"}
        </button>
      </div>

      {impact.length > 0 ? (
        <div className="template-impact" role="status">
          {impact.map((line) => <p key={line}>{line}</p>)}
        </div>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {optionsFor ? (
        <OptionsDrawer
          keyId={optionsFor}
          field={next.fields.find((field) =>
            field.keys.some((key) => key.id === optionsFor),
          )}
          onClose={() => setOptionsFor(null)}
          onChange={(options) => {
            const fields = next.fields.map((field) => {
              const keys = field.keys.map((key) =>
                key.id === optionsFor ? { ...key, options } : key,
              );
              return { ...field, keys };
            });
            setNext({ ...next, fields });
          }}
        />
      ) : null}
    </div>
  );
}

function TemplateFieldRows({
  field,
  fieldIndex,
  rowCount,
  readOnly,
  onFieldChange,
  onKeyChange,
  onMoveKey,
  onArchiveField,
  onAddKey,
  onOpenOptions,
}: {
  field: TemplateFieldDraft;
  fieldIndex: number;
  rowCount: number;
  readOnly: boolean;
  onFieldChange: (patch: Partial<TemplateFieldDraft>) => void;
  onKeyChange: (keyIndex: number, patch: Partial<TemplateKeyDraft>) => void;
  onMoveKey: (keyIndex: number, direction: -1 | 1) => void;
  onArchiveField: () => void;
  onAddKey: () => void;
  onOpenOptions: (keyId: string) => void;
}) {
  return (
    <>
      <tr className="template-field-row">
        <td
          className={`template-field-cell token-${field.colorToken}`}
          rowSpan={rowCount + (readOnly ? 0 : 1)}
        >
          <input
            aria-label={`Field label ${fieldIndex + 1}`}
            value={field.label}
            disabled={readOnly}
            onChange={(event) => onFieldChange({ label: event.target.value })}
          />
          {!readOnly ? (
            <select
              aria-label={`Color for ${field.label || "field"}`}
              value={field.colorToken}
              onChange={(event) => onFieldChange({ colorToken: event.target.value })}
            >
              {COLOR_TOKENS.map((token) => <option key={token} value={token}>{token}</option>)}
            </select>
          ) : null}
          {!readOnly ? (
            <button type="button" className="btn ghost small" onClick={onArchiveField}>
              Archive field
            </button>
          ) : null}
        </td>
      </tr>
      {field.keys.map((key, keyIndex) => (
        <tr key={key.id ?? `new-key-${keyIndex}`} className="template-key-row">
          <td>
            <input
              aria-label={`Key name ${keyIndex + 1}`}
              value={key.key}
              disabled={readOnly}
              onChange={(event) => onKeyChange(keyIndex, { key: event.target.value })}
            />
          </td>
          <td>
            <select
              aria-label={`Value type for ${key.key || "key"}`}
              value={key.valueType}
              disabled={readOnly || key.valueCount > 0}
              onChange={(event) =>
                onKeyChange(keyIndex, { valueType: event.target.value as ValueType })}
            >
              {VALUE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            {(key.valueType === "single_select" || key.valueType === "multi_select") && key.id ? (
              <button
                type="button"
                className="btn ghost small"
                onClick={() => onOpenOptions(key.id!)}
              >
                Options
              </button>
            ) : null}
          </td>
          <td>
            <select
              aria-label={`Required for ${key.key || "key"}`}
              value={key.required ? "required" : "optional"}
              disabled={readOnly}
              onChange={(event) =>
                onKeyChange(keyIndex, { required: event.target.value === "required" })}
            >
              <option value="required">Required</option>
              <option value="optional">Optional</option>
            </select>
          </td>
          <td className="template-key-actions">
            <button
              type="button"
              className="icon-btn"
              aria-label={`Move ${key.key || "key"} up`}
              disabled={readOnly || keyIndex === 0}
              onClick={() => onMoveKey(keyIndex, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Move ${key.key || "key"} down`}
              disabled={readOnly || keyIndex === field.keys.length - 1}
              onClick={() => onMoveKey(keyIndex, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Archive ${key.key || "key"}`}
              disabled={readOnly}
              onClick={() => onKeyChange(keyIndex, { archived: true })}
            >
              ×
            </button>
          </td>
        </tr>
      ))}
      {!readOnly ? (
        <tr className="template-key-row">
          <td colSpan={4}>
            <button type="button" className="btn ghost small" onClick={onAddKey}>
              Add key
            </button>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function OptionsDrawer({
  keyId,
  field,
  onClose,
  onChange,
}: {
  keyId: string;
  field: TemplateFieldDraft | undefined;
  onClose: () => void;
  onChange: (options: TemplateOptionDraft[]) => void;
}) {
  const key = field?.keys.find((candidate) => candidate.id === keyId);
  if (!field || !key) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="experiment-dialog options-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Select options"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">Value type</p>
            <h2>Options for {key.key}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <OptionsEditor
          options={key.options}
          onChange={onChange}
        />
      </section>
    </div>
  );
}
