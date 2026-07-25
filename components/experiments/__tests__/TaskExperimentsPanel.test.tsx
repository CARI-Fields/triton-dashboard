import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Experiment, Member, Task } from "@/lib/types";
import TaskExperimentsPanel from "@/components/experiments/TaskExperimentsPanel";
import { createExperiment } from "@/lib/experiments/repository";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

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

const otherTask = {
  ...task,
  id: "00000000-0000-4000-8000-000000000030",
  title: "Optimize attention",
} satisfies Task;

function experiment(
  id: string,
  no: number,
  patch: Partial<Experiment> = {},
): Experiment {
  return {
    id,
    experiment_no: no,
    task_id: task.id,
    owner_id: member.id,
    name: `run-${no}`,
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
    metrics: { "pass@1": no / 10 },
    featured_metric_keys: ["pass@1"],
    result_summary: "",
    decision_outcome: null,
    decision_notes: "",
    notes: "",
    position: no,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-24T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
    ...patch,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("TaskExperimentsPanel", () => {
  it("links compact rows and builds an explicit selected comparison", () => {
    const experiments = [
      experiment("00000000-0000-4000-8000-000000000001", 1),
      experiment("00000000-0000-4000-8000-000000000002", 2),
    ];
    render(
      <TaskExperimentsPanel
        task={task}
        experiments={experiments}
        members={[member]}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0001" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0002" }));
    const compare = screen.getByRole("link", { name: "Compare selected (2)" });
    expect(compare.getAttribute("href")).toContain("/experiments/compare?ids=");
    expect(screen.getByRole("link", { name: "run-1" }).getAttribute("href")).toBe(
      "/experiments/00000000-0000-4000-8000-000000000001",
    );
    expect(screen.getByRole("columnheader", { name: "ID" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Owner" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Decision" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Featured metrics" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Updated" })).toBeDefined();
    expect(screen.queryByRole("columnheader", { name: "Task" })).toBeNull();
    expect(screen.getAllByText("Bruce")).toHaveLength(2);
  });

  it("keeps comparison inert below two and uses a canonical URL without a baseline", () => {
    const first = experiment("00000000-0000-4000-8000-000000000001", 1);
    const second = experiment("00000000-0000-4000-8000-000000000002", 2);
    render(
      <TaskExperimentsPanel
        task={task}
        experiments={[first, second]}
        members={[member]}
      />,
    );

    const empty = screen.getByRole("link", { name: "Compare selected (0)" });
    expect(empty.getAttribute("aria-disabled")).toBe("true");
    expect(empty.getAttribute("href")).toBe(`/task/${task.id}`);
    expect(fireEvent.click(empty)).toBe(false);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0001" }));
    const one = screen.getByRole("link", { name: "Compare selected (1)" });
    expect(one.getAttribute("aria-disabled")).toBe("true");
    expect(one.getAttribute("href")).toBe(`/task/${task.id}`);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0002" }));
    const two = screen.getByRole("link", { name: "Compare selected (2)" });
    expect(two.getAttribute("aria-disabled")).toBe("false");
    expect(two.getAttribute("href")).toBe(
      `/experiments/compare?ids=${first.id}%2C${second.id}`,
    );
    expect(two.getAttribute("href")).not.toContain("baseline");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0001" }));
    const removed = screen.getByRole("link", { name: "Compare selected (1)" });
    expect(removed.getAttribute("aria-disabled")).toBe("true");
    expect(removed.getAttribute("href")).toBe(`/task/${task.id}`);
  });

  it("prunes deleted selections during the prop render and does not resurrect them", () => {
    const first = experiment("00000000-0000-4000-8000-000000000001", 1);
    const second = experiment("00000000-0000-4000-8000-000000000002", 2);
    const props = { task, members: [member] };
    const { rerender } = render(
      <TaskExperimentsPanel {...props} experiments={[first, second]} />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0001" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0002" }));

    rerender(<TaskExperimentsPanel {...props} experiments={[first]} />);
    const pruned = screen.getByRole("link", { name: "Compare selected (1)" });
    expect(pruned.getAttribute("href")).toBe(`/task/${task.id}`);

    rerender(<TaskExperimentsPanel {...props} experiments={[first, second]} />);
    expect(screen.getByRole("link", { name: "Compare selected (1)" })).toBeDefined();
    expect(
      (screen.getByRole("checkbox", { name: "Select EXP-0002" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });

  it("clears selection and closes a create dialog synchronously for a new Task", () => {
    const first = experiment("00000000-0000-4000-8000-000000000001", 1);
    const second = experiment("00000000-0000-4000-8000-000000000002", 2);
    const { rerender } = render(
      <TaskExperimentsPanel
        task={task}
        experiments={[first, second]}
        members={[member]}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0001" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0002" }));
    fireEvent.click(screen.getByRole("button", { name: "New experiment" }));
    expect((screen.getByLabelText("Task") as HTMLSelectElement).value).toBe(task.id);

    const otherFirst = experiment(
      "00000000-0000-4000-8000-000000000041",
      41,
      { task_id: otherTask.id },
    );
    rerender(
      <TaskExperimentsPanel
        task={otherTask}
        experiments={[otherFirst]}
        members={[member]}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("link", { name: "Compare selected (0)" })).toBeDefined();

    rerender(
      <TaskExperimentsPanel
        task={task}
        experiments={[first, second]}
        members={[member]}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("link", { name: "Compare selected (0)" })).toBeDefined();

    rerender(
      <TaskExperimentsPanel
        task={otherTask}
        experiments={[otherFirst]}
        members={[member]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "New experiment" }));
    expect((screen.getByLabelText("Task") as HTMLSelectElement).value).toBe(otherTask.id);
  });

  it("maps owners only by owner UUID and routes creation by the returned UUID", async () => {
    const unknownOwner = experiment(
      "00000000-0000-4000-8000-000000000001",
      1,
      { owner_id: "00000000-0000-4000-8000-000000000099" },
    );
    const created = experiment(
      "00000000-0000-4000-8000-000000000077",
      77,
    );
    vi.mocked(createExperiment).mockResolvedValue(created);
    render(
      <TaskExperimentsPanel
        task={task}
        experiments={[unknownOwner]}
        members={[member]}
      />,
    );

    expect(screen.getByText("Unassigned")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "New experiment" }));
    fireEvent.change(screen.getByLabelText("Experiment name"), {
      target: { value: "Created from Task" },
    });
    fireEvent.change(screen.getByLabelText("Owner"), {
      target: { value: member.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create experiment" }));

    await waitFor(() => expect(createExperiment).toHaveBeenCalledWith({
      taskId: task.id,
      ownerId: member.id,
      name: "Created from Task",
    }));
    expect(routerPush).toHaveBeenCalledWith(`/experiments/${created.id}`);
  });
});
