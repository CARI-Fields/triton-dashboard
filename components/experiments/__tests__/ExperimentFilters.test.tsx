import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExperimentFilters from "@/components/experiments/ExperimentFilters";
import { EMPTY_EXPERIMENT_FILTERS } from "@/lib/experiments/filters";
import type { ExperimentListRow } from "@/lib/types";

const rows = [{
  id: "00000000-0000-4000-8000-000000000001",
  experiment_no: 7,
  task_id: "00000000-0000-4000-8000-000000000010",
  owner_id: "00000000-0000-4000-8000-000000000020",
  name: "Manual NPU run",
  status: "analyzing",
  baseline_experiment_id: null,
  data_spec: { datasets: [] },
  object_spec: { model: "", harness: "", parent_harness: "", prompt: "", prompt_change: "", skills: [], tools: [] },
  environment_spec: { platform: "", server: "", devices: [], hardware: "", evaluator: "", revision: "", precision_policy: "" },
  config: {},
  metrics: {},
  featured_metric_keys: [],
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
  owner: { id: "00000000-0000-4000-8000-000000000020", name: "Bruce", initials: "BX", position: 0, created_at: "2026-07-01T00:00:00.000Z" },
}] satisfies ExperimentListRow[];

afterEach(cleanup);

describe("ExperimentFilters", () => {
  it("reports controlled saved-view and field changes and exposes pressed state", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ExperimentFilters
        rows={rows}
        value={EMPTY_EXPERIMENT_FILTERS}
        resultCount={1}
        onChange={onChange}
      />,
    );

    const views = screen.getAllByRole("button");
    expect(views.map((view) => view.textContent)).toEqual([
      "All",
      "Running",
      "Blocked",
      "Needs Decision",
      "Recently Completed",
    ]);
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Running" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("searchbox", { name: "Search experiments" })
      .closest(".database-toolbar")).not.toBeNull();
    expect(screen.getByText("1 experiments")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Needs Decision" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_EXPERIMENT_FILTERS,
      savedView: "needs_decision",
    });
    fireEvent.change(screen.getByLabelText("Search experiments"), { target: { value: "conv" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_EXPERIMENT_FILTERS, search: "conv" });
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: rows[0].owner_id } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_EXPERIMENT_FILTERS, ownerId: rows[0].owner_id });

    rerender(
      <ExperimentFilters
        rows={rows}
        value={{ ...EMPTY_EXPERIMENT_FILTERS, savedView: "running" }}
        resultCount={1}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Running" }).getAttribute("aria-pressed")).toBe("true");
  });
});
