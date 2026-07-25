"use client";

import type { DataSpec, DatasetSpec } from "@/lib/types";

const EMPTY_DATASET: DatasetSpec = {
  role: "evaluation",
  name: "",
  split: "",
  revision: "",
  task_count: null,
  samples_per_task: null,
};

function nullableNumber(raw: string): number | null {
  return raw.trim() === "" ? null : Number(raw);
}

export default function DataEditor({
  value,
  onChange,
}: {
  value: DataSpec;
  onChange: (value: DataSpec) => void;
}) {
  function patch(index: number, next: Partial<DatasetSpec>) {
    onChange({
      ...value,
      datasets: value.datasets.map((dataset, datasetIndex) =>
        datasetIndex === index ? { ...dataset, ...next } : dataset),
    });
  }

  function remove(index: number) {
    onChange({
      ...value,
      datasets: value.datasets.filter((_, datasetIndex) => datasetIndex !== index),
    });
  }

  return (
    <div className="structured-editor">
      {value.datasets.map((dataset, index) => (
        <fieldset className="dataset-row" key={`${dataset.role}-${index}`}>
          <legend>Dataset {index + 1}</legend>
          <label>
            <span>Role</span>
            <select
              aria-label={`Dataset ${index + 1} role`}
              value={dataset.role}
              onChange={(event) => patch(index, {
                role: event.target.value as DatasetSpec["role"],
              })}
            >
              <option value="training">Training</option>
              <option value="evaluation">Evaluation</option>
            </select>
          </label>
          <label>
            <span>Name</span>
            <input
              aria-label={`Dataset ${index + 1} name`}
              value={dataset.name}
              onChange={(event) => patch(index, { name: event.target.value })}
            />
          </label>
          <label>
            <span>Split</span>
            <input
              aria-label={`Dataset ${index + 1} split`}
              value={dataset.split}
              onChange={(event) => patch(index, { split: event.target.value })}
            />
          </label>
          <label>
            <span>Revision</span>
            <input
              aria-label={`Dataset ${index + 1} revision`}
              value={dataset.revision}
              onChange={(event) => patch(index, { revision: event.target.value })}
            />
          </label>
          <label>
            <span>Task count</span>
            <input
              aria-label={`Dataset ${index + 1} task count`}
              type="number"
              min="0"
              value={dataset.task_count ?? ""}
              onChange={(event) => patch(index, { task_count: nullableNumber(event.target.value) })}
            />
          </label>
          <label>
            <span>Samples / task</span>
            <input
              aria-label={`Dataset ${index + 1} samples per task`}
              type="number"
              min="0"
              value={dataset.samples_per_task ?? ""}
              onChange={(event) => patch(index, {
                samples_per_task: nullableNumber(event.target.value),
              })}
            />
          </label>
          <button type="button" className="btn danger-subtle" onClick={() => remove(index)}>
            Remove dataset
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() => onChange({
          ...value,
          datasets: [...value.datasets, structuredClone(EMPTY_DATASET)],
        })}
      >
        Add dataset
      </button>
    </div>
  );
}
