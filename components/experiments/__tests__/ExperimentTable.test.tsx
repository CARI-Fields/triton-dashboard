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
  template_id: null,
  archived_at: null,
  core_revision: 1,
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
  it("renders real stored fields, status, and real links", () => {
    render(<ExperimentTable rows={[row]} showTask selectable={false} />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "ID",
      "Name",
      "Task",
      "Owner",
      "Status",
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

  it("toggles selection from the checkbox's semantic hit-area wrapper", () => {
    const onToggle = vi.fn();
    render(
      <ExperimentTable
        rows={[row]}
        showTask={false}
        selectable
        onToggle={onToggle}
      />,
    );

    const checkbox = screen.getByRole("checkbox", {
      name: "Select EXP-0007",
    });
    const hitArea = checkbox.parentElement;
    expect(hitArea?.tagName).toBe("LABEL");
    expect(hitArea?.classList.contains("experiment-select-control")).toBe(true);

    fireEvent.click(hitArea as HTMLElement);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledWith(row.id);
  });

  it("omits the task column in task-scoped mode and uses empty states for missing relations", () => {
    render(<ExperimentTable rows={[{ ...row, task: null }]} showTask={false} selectable={false} />);
    expect(screen.queryByRole("columnheader", { name: "Task" })).toBeNull();
    expect(screen.queryByText("Deleted task")).toBeNull();
    expect(screen.getByText("Unassigned")).toBeDefined();
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
