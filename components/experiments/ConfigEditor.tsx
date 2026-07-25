"use client";

import type { ConfigValue, ExperimentConfig } from "@/lib/types";

type ValueType = "string" | "number" | "boolean" | "null";

function valueType(value: ConfigValue): ValueType {
  if (value === null) return "null";
  return typeof value as Exclude<ValueType, "null">;
}

function changeType(type: ValueType): ConfigValue {
  if (type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "null") return null;
  return "";
}

export default function ConfigEditor({
  value,
  onChange,
}: {
  value: ExperimentConfig;
  onChange: (value: ExperimentConfig) => void;
}) {
  function rename(oldKey: string, newKey: string) {
    const trimmed = newKey.trim();
    if (!trimmed || trimmed === oldKey || Object.hasOwn(value, trimmed)) return;
    const next = { ...value };
    const currentValue = next[oldKey];
    delete next[oldKey];
    next[trimmed] = currentValue;
    onChange(next);
  }

  function setValue(key: string, raw: string) {
    const current = value[key];
    let next: ConfigValue = raw;
    if (typeof current === "number") next = raw === "" ? 0 : Number(raw);
    if (typeof current === "boolean") next = raw === "true";
    if (current === null) next = null;
    onChange({ ...value, [key]: next });
  }

  function remove(key: string) {
    const next = { ...value };
    delete next[key];
    onChange(next);
  }

  function add() {
    let index = Object.keys(value).length + 1;
    let key = `parameter_${index}`;
    while (key in value) {
      index += 1;
      key = `parameter_${index}`;
    }
    onChange({ ...value, [key]: "" });
  }

  return (
    <div className="key-value-editor">
      {Object.entries(value).map(([key, current]) => (
        <div className="key-value-row" key={key}>
          <input
            aria-label={`${key} key`}
            defaultValue={key}
            onBlur={(event) => rename(key, event.target.value)}
          />
          <select
            aria-label={`${key} type`}
            value={valueType(current)}
            onChange={(event) => onChange({
              ...value,
              [key]: changeType(event.target.value as ValueType),
            })}
          >
            <option value="string">Text</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
            <option value="null">Null</option>
          </select>
          {typeof current === "boolean"
            ? (
              <select
                aria-label={`${key} value`}
                value={String(current)}
                onChange={(event) => setValue(key, event.target.value)}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            )
            : (
              <input
                aria-label={`${key} value`}
                type={typeof current === "number" ? "number" : "text"}
                value={current ?? ""}
                disabled={current === null}
                onChange={(event) => setValue(key, event.target.value)}
              />
            )}
          <button type="button" className="icon-btn" onClick={() => remove(key)} aria-label={`Remove ${key}`}>×</button>
        </div>
      ))}
      <button type="button" className="btn" onClick={add}>Add parameter</button>
      {Object.keys(value).length === 0 && (
        <p className="field-help">
          Add explicit parameters, or add a text parameter named profile with value defaults.
        </p>
      )}
    </div>
  );
}
