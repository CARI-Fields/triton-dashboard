"use client";

import { useEffect, useState } from "react";
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

function ConfigKeyInput({
  configKey,
  onRename,
}: {
  configKey: string;
  onRename: (nextKey: string) => boolean;
}) {
  const [draft, setDraft] = useState(configKey);

  useEffect(() => setDraft(configKey), [configKey]);

  return (
    <input
      aria-label={`${configKey} key`}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (!onRename(draft)) setDraft(configKey);
      }}
    />
  );
}

export default function ConfigEditor({
  value,
  onChange,
}: {
  value: ExperimentConfig;
  onChange: (value: ExperimentConfig) => void;
}) {
  function rename(oldKey: string, newKey: string): boolean {
    const trimmed = newKey.trim();
    if (!trimmed || trimmed === oldKey || Object.hasOwn(value, trimmed)) return false;
    onChange(Object.fromEntries(
      Object.entries(value).map(([key, current]) => [key === oldKey ? trimmed : key, current]),
    ));
    return true;
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
    while (Object.hasOwn(value, key)) {
      index += 1;
      key = `parameter_${index}`;
    }
    onChange({ ...value, [key]: "" });
  }

  return (
    <div className="key-value-editor">
      {Object.entries(value).map(([key, current]) => (
        <div className="key-value-row" key={key}>
          <ConfigKeyInput configKey={key} onRename={(nextKey) => rename(key, nextKey)} />
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
