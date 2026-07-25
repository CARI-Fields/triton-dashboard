import type { Experiment } from "@/lib/types";
import { compareContexts } from "@/lib/experiments/compare";
import { formatExperimentId } from "@/lib/experiments/policy";

function displayValue(value: string | number | boolean | null): string {
  if (value === null || (typeof value === "number" && !Number.isFinite(value))) {
    return "—";
  }
  if (typeof value === "number") return Number(value.toPrecision(6)).toString();
  return String(value);
}

function formatDelta(value: number): string {
  if (value === 0) return "0";
  const formatted = Number(Math.abs(value).toPrecision(6)).toString();
  return `${value > 0 ? "+" : "−"}${formatted}`;
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function ownMetric(
  metrics: Record<string, number>,
  key: string,
): number | undefined {
  return Object.hasOwn(metrics, key) ? metrics[key] : undefined;
}

export default function BaselineSummary({
  current,
  baseline,
}: {
  current: Experiment;
  baseline: Experiment;
}) {
  const metricKeys = [...new Set([
    ...Object.keys(current.metrics),
    ...Object.keys(baseline.metrics),
  ])].sort();
  const contextDifferences = compareContexts(current, baseline);

  return (
    <section
      className="baseline-summary"
      aria-labelledby="baseline-summary-title"
    >
      <header>
        <div>
          <p className="eyebrow">Explicit comparison</p>
          <h2 id="baseline-summary-title">Current vs Baseline</h2>
        </div>
        <span className="baseline-reference">
          {formatExperimentId(baseline.experiment_no)} · {baseline.name}
        </span>
      </header>
      <div className="baseline-metric-grid">
        <div className="baseline-grid-head">Metric</div>
        <div className="baseline-grid-head">Baseline</div>
        <div className="baseline-grid-head">Current</div>
        <div className="baseline-grid-head">Delta</div>
        {metricKeys.map((key) => {
          const baselineValue = ownMetric(baseline.metrics, key);
          const currentValue = ownMetric(current.metrics, key);
          const difference =
            isFiniteNumber(baselineValue) && isFiniteNumber(currentValue)
              ? currentValue - baselineValue
              : null;
          const numericDelta = difference !== null && Number.isFinite(difference)
            ? difference
            : null;
          return (
            <div className="baseline-grid-row" key={key}>
              <strong>{key}</strong>
              <span>
                {baselineValue === undefined
                  ? "—"
                  : displayValue(baselineValue)}
              </span>
              <span>
                {currentValue === undefined ? "—" : displayValue(currentValue)}
              </span>
              <span className="neutral-delta">
                {numericDelta === null ? "—" : formatDelta(numericDelta)}
              </span>
            </div>
          );
        })}
      </div>
      <details open={contextDifferences.length > 0}>
        <summary>Context differences ({contextDifferences.length})</summary>
        {contextDifferences.length === 0
          ? (
            <p className="muted">
              Recorded Data, Object, Environment, and Config are identical.
            </p>
          )
          : (
            <div className="context-difference-list">
              {contextDifferences.map((difference) => (
                <div key={`${difference.group}-${difference.key}`}>
                  <strong>{difference.label}</strong>
                  <span>{displayValue(difference.baseline)}</span>
                  <span>{displayValue(difference.current)}</span>
                </div>
              ))}
            </div>
          )}
      </details>
      <p className="field-help">
        Differences describe recorded context only; Triton Board does not claim
        the runs are comparable or that a Delta is good.
      </p>
    </section>
  );
}
