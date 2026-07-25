"use client";

import { useEffect, useState } from "react";

export interface ResultValue {
  metrics: Record<string, number>;
  featuredMetricKeys: string[];
  resultSummary: string;
}

function finiteMetrics(metrics: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(metrics).filter(([, value]) => Number.isFinite(value)),
  );
}

function MetricKeyInput({
  metricKey,
  onRename,
}: {
  metricKey: string;
  onRename: (nextKey: string) => boolean;
}) {
  const [draft, setDraft] = useState(metricKey);

  useEffect(() => setDraft(metricKey), [metricKey]);

  return (
    <input
      aria-label={`${metricKey} metric name`}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        onRename(draft);
        setDraft(metricKey);
      }}
    />
  );
}

function MetricValueInput({
  metricKey,
  value,
  onChange,
}: {
  metricKey: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      aria-label={`${metricKey} metric value`}
      type="number"
      step="any"
      value={value}
      onChange={(event) => {
        const raw = event.target.value;
        if (!raw.trim()) return;
        const next = Number(raw);
        if (Number.isFinite(next)) onChange(next);
      }}
    />
  );
}

export default function ResultEditor({
  metrics,
  featuredMetricKeys,
  resultSummary,
  onChange,
}: ResultValue & {
  onChange: (value: ResultValue) => void;
}) {
  const validMetrics = finiteMetrics(metrics);
  const validFeatured = featuredMetricKeys.filter((key) =>
    Object.hasOwn(validMetrics, key)
  );

  function emit(
    nextMetrics = validMetrics,
    nextFeatured = validFeatured,
    nextSummary = resultSummary,
  ) {
    const nextValidMetrics = finiteMetrics(nextMetrics);
    onChange({
      metrics: nextValidMetrics,
      featuredMetricKeys: [
        ...new Set(
          nextFeatured.filter((key) => Object.hasOwn(nextValidMetrics, key)),
        ),
      ],
      resultSummary: nextSummary,
    });
  }

  function rename(oldKey: string, rawKey: string): boolean {
    const key = rawKey.trim();
    if (!key || key === oldKey || Object.hasOwn(validMetrics, key)) return false;
    const next = Object.fromEntries(
      Object.entries(validMetrics).map(([currentKey, currentValue]) => [
        currentKey === oldKey ? key : currentKey,
        currentValue,
      ]),
    );
    emit(
      next,
      validFeatured.map((featured) => featured === oldKey ? key : featured),
    );
    return true;
  }

  function remove(key: string) {
    const next = Object.fromEntries(
      Object.entries(validMetrics).filter(([currentKey]) => currentKey !== key),
    );
    emit(next, validFeatured.filter((featured) => featured !== key));
  }

  function add() {
    let index = Object.keys(validMetrics).length + 1;
    let key = `metric_${index}`;
    while (Object.hasOwn(validMetrics, key)) {
      index += 1;
      key = `metric_${index}`;
    }
    emit({ ...validMetrics, [key]: 0 });
  }

  return (
    <div className="result-editor">
      <div className="metric-editor">
        {Object.entries(validMetrics).map(([key, metricValue]) => (
          <div className="metric-edit-row" key={key}>
            <MetricKeyInput
              metricKey={key}
              onRename={(nextKey) => rename(key, nextKey)}
            />
            <MetricValueInput
              metricKey={key}
              value={metricValue}
              onChange={(nextValue) => emit({
                ...validMetrics,
                [key]: nextValue,
              })}
            />
            <label className="featured-toggle">
              <input
                type="checkbox"
                aria-label={`Feature ${key}`}
                checked={validFeatured.includes(key)}
                onChange={(event) => emit(
                  validMetrics,
                  event.target.checked
                    ? [...validFeatured, key]
                    : validFeatured.filter((featured) => featured !== key),
                )}
              />
              Featured
            </label>
            <button
              type="button"
              className="icon-btn"
              onClick={() => remove(key)}
              aria-label={`Remove ${key}`}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn" onClick={add}>Add metric</button>
      </div>
      <label className="stacked-field">
        <span>Result Summary</span>
        <textarea
          aria-label="Result Summary"
          value={resultSummary}
          onChange={(event) => emit(
            validMetrics,
            validFeatured,
            event.target.value,
          )}
          placeholder="Qualitative outcome, failures, and observations"
        />
      </label>
    </div>
  );
}
