import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExperimentListRow } from "@/lib/types";
import ExperimentTable from "@/components/experiments/ExperimentTable";

const row = {
  id: "00000000-0000-4000-8000-000000000001",
  experiment_no: 7,
  task_id: "00000000-0000-4000-8000-000000000010",
  owner_id: null,
  name: "Manual NPU run",
  status: "analyzing",
  baseline_experiment_id: null,
  data_spec: { datasets: [] },
  object_spec: {
    model: "",
    harness: "",
    parent_harness: "",
    prompt: "",
    prompt_change: "",
    skills: [],
    tools: [],
  },
  environment_spec: {
    platform: "",
    server: "",
    devices: [],
    hardware: "",
    evaluator: "",
    revision: "",
    precision_policy: "",
  },
  config: {},
  metrics: { "pass@1": 0.2, tokens: 1000 },
  featured_metric_keys: ["pass@1"],
  result_summary: "",
  decision_outcome: null,
  decision_notes: "",
  notes: "",
  position: 0,
  started_at: null,
  completed_at: null,
  created_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T00:00:00.000Z",
  task: { id: "00000000-0000-4000-8000-000000000010", title: "Optimize conv2d" },
  owner: null,
} satisfies ExperimentListRow;

afterEach(cleanup);

describe("ExperimentTable", () => {
  it("renders real stored fields, status and decision labels, and real links", () => {
    const decidedRow = { ...row, decision_outcome: "accepted" as const };
    render(<ExperimentTable rows={[decidedRow]} showTask selectable={false} />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
        "ID",
        "Name",
        "Task",
        "Owner",
        "Status",
        "Decision",
        "Featured metrics",
        "Updated",
      ]);
    expect(headers.every((header) => header.getAttribute("scope") === "col"))
      .toBe(true);
    expect(screen.getByText("EXP-0007")).toBeDefined();
    expect(screen.getByRole("link", { name: "Manual NPU run" }).getAttribute("href"))
      .toBe("/experiments/00000000-0000-4000-8000-000000000001");
    expect(screen.getByRole("link", { name: "Optimize conv2d" }).getAttribute("href"))
      .toBe("/task/00000000-0000-4000-8000-000000000010");
    expect(screen.getByText("Unassigned")).toBeDefined();
    expect(screen.getByText("Analyzing")).toBeDefined();
    expect(screen.getByText("Accepted")).toBeDefined();
  });

  it("renders only finite featured metrics and a dash for missing or invalid values", () => {
    const metricsRow = {
      ...row,
      metrics: {
        finite: 0.2,
        missing: undefined,
        nan: Number.NaN,
        positive: Number.POSITIVE_INFINITY,
        negative: Number.NEGATIVE_INFINITY,
      } as unknown as ExperimentListRow["metrics"],
      featured_metric_keys: ["finite", "missing", "nan", "positive", "negative"],
    };
    render(<ExperimentTable rows={[metricsRow]} showTask selectable={false} />);
    expect(screen.getByText("finite 0.2")).toBeDefined();
    expect(screen.getByText("missing —")).toBeDefined();
    expect(screen.getByText("nan —")).toBeDefined();
    expect(screen.getByText("positive —")).toBeDefined();
    expect(screen.getByText("negative —")).toBeDefined();
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
    expect(screen.queryByText(/tokens/)).toBeNull();
  });

  it("supports controlled selection without wrapping the checkbox in a link", () => {
    const onToggle = vi.fn();
    render(
      <ExperimentTable
        rows={[row]}
        showTask={false}
        selectable
        selectedIds={new Set([row.id])}
        onToggle={onToggle}
      />,
    );
    const checkbox = screen.getByRole("checkbox", { name: "Select EXP-0007" });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(checkbox.closest("a")).toBeNull();
    expect(checkbox.closest("tr")?.getAttribute("aria-selected")).toBe("true");
    expect(checkbox.closest("tr")?.classList.contains("selected-row")).toBe(true);
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith(row.id);
  });

  it("omits the task column in task-scoped mode and uses empty states for missing relations", () => {
    render(<ExperimentTable rows={[{ ...row, task: null }]} showTask={false} selectable={false} />);
    expect(screen.queryByRole("columnheader", { name: "Task" })).toBeNull();
    expect(screen.queryByText("Deleted task")).toBeNull();
    expect(screen.getByText("Unassigned")).toBeDefined();
    expect(screen.getByText("—")).toBeDefined();
  });

  it("renders a deleted task empty state when the global table receives no task", () => {
    render(<ExperimentTable rows={[{ ...row, task: null }]} showTask selectable={false} />);
    expect(screen.getByText("Deleted task")).toBeDefined();
  });

  it("renders an empty state", () => {
    render(<ExperimentTable rows={[]} showTask selectable={false} />);
    expect(screen.getByText("No experiments match this view.")).toBeDefined();
  });
});
