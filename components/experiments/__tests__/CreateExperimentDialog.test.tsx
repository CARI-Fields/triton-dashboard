import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Experiment, Member, Task } from "@/lib/types";
import CreateExperimentDialog from "@/components/experiments/CreateExperimentDialog";
import { createExperiment } from "@/lib/experiments/repository";

vi.mock("@/lib/experiments/repository", () => ({
  createExperiment: vi.fn(),
}));

const task = {
  id: "00000000-0000-4000-8000-000000000010",
  module_id: "00000000-0000-4000-8000-000000000011",
  title: "Optimize conv2d",
  status: "in_progress",
  assignees: [],
  notes: "",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T00:00:00.000Z",
} satisfies Task;

const member = {
  id: "00000000-0000-4000-8000-000000000020",
  name: "Bruce",
  initials: "BX",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
} satisfies Member;

describe("CreateExperimentDialog", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("requires Name, Owner, and Task and creates a planned row", async () => {
    vi.mocked(createExperiment).mockResolvedValue({ id: "new-experiment" } as Experiment);
    const onCreated = vi.fn();
    render(
      <CreateExperimentDialog
        open
        tasks={[task]}
        members={[member]}
        onClose={() => undefined}
        onCreated={onCreated}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create experiment" }));
    expect(screen.getByText("Name, Owner, and Task are required.")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Experiment name"), {
      target: { value: "NPU guardrail run" },
    });
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: task.id } });
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: member.id } });
    fireEvent.click(screen.getByRole("button", { name: "Create experiment" }));

    await waitFor(() => expect(createExperiment).toHaveBeenCalledWith({
      taskId: task.id,
      ownerId: member.id,
      name: "NPU guardrail run",
    }));
    expect(onCreated).toHaveBeenCalledWith({ id: "new-experiment" });
  });
});
