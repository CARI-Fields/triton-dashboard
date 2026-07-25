import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

describe("ExperimentTable", () => {
  it("renders real stored fields and only featured metrics", () => {
    render(<ExperimentTable rows={[row]} showTask selectable={false} />);
    expect(screen.getByText("EXP-0007")).toBeDefined();
    expect(screen.getByText("Manual NPU run")).toBeDefined();
    expect(screen.getByText("Optimize conv2d")).toBeDefined();
    expect(screen.getByText("Unassigned")).toBeDefined();
    expect(screen.getByText("pass@1 0.2")).toBeDefined();
    expect(screen.queryByText(/tokens/)).toBeNull();
  });

  it("reports explicit selection by UUID", () => {
    const onToggle = vi.fn();
    render(
      <ExperimentTable
        rows={[row]}
        showTask={false}
        selectable
        selectedIds={new Set()}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0007" }));
    expect(onToggle).toHaveBeenCalledWith(row.id);
  });
});
