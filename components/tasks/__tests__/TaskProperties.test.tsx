import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TaskProperties from "@/components/tasks/TaskProperties";
import type {
  Member,
  TaskModel,
  TaskType,
} from "@/lib/types";

const task = {
  id: "task-a",
  typeId: "type-kernel",
  title: "Validate NPU kernels",
  status: "in_progress",
  owners: [],
  notes: "Check every shape.",
  tags: [],
  priority: "high",
  dueDate: "2026-08-01",
  position: 0,
  created_at: "2026-07-27T00:00:00.000Z",
  updated_at: "2026-07-27T00:00:00.000Z",
} satisfies TaskModel;

const kernelType = {
  id: "type-kernel",
  name: "Kernel",
  description: "Kernel implementation work",
  position: 0,
  created_at: "2026-07-27T00:00:00.000Z",
} satisfies TaskType;

const maya = {
  id: "member-maya",
  name: "Maya",
  initials: "MY",
  position: 0,
  created_at: "2026-07-27T00:00:00.000Z",
} satisfies Member;

const theo = {
  ...maya,
  id: "member-theo",
  name: "Theo",
  initials: "TK",
  position: 1,
} satisfies Member;

afterEach(cleanup);

describe("TaskProperties", () => {
  it("renders editable task properties with approved terminology", () => {
    render(
      <TaskProperties
        task={task}
        types={[kernelType]}
        members={[maya]}
        onPatch={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Task status")).toBeDefined();
    expect(screen.getByLabelText("Task type")).toBeDefined();
    expect(screen.getByLabelText("Task tags")).toBeDefined();
    expect(screen.getByText("Owner")).toBeDefined();
    expect(screen.getByLabelText("Task priority")).toBeDefined();
    expect(screen.getByLabelText("Task due date")).toBeDefined();
    expect(screen.queryByText(/Module|Assignee/i)).toBeNull();
  });

  it("emits domain patches for scalar task properties", () => {
    const onPatch = vi.fn();
    render(
      <TaskProperties
        task={task}
        types={[kernelType]}
        members={[maya]}
        onPatch={onPatch}
      />,
    );

    fireEvent.change(screen.getByLabelText("Task status"), {
      target: { value: "done" },
    });
    fireEvent.change(screen.getByLabelText("Task type"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Task priority"), {
      target: { value: "urgent" },
    });
    fireEvent.change(screen.getByLabelText("Task due date"), {
      target: { value: "" },
    });

    expect(onPatch.mock.calls.map(([patch]) => patch)).toEqual([
      { status: "done" },
      { typeId: null },
      { priority: "urgent" },
      { dueDate: null },
    ]);
  });

  it("keeps rapid Owner changes cumulative before authoritative props refresh", () => {
    const onPatch = vi.fn();
    render(
      <TaskProperties
        task={task}
        types={[kernelType]}
        members={[maya, theo]}
        onPatch={onPatch}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Maya" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Theo" }));

    expect(onPatch.mock.calls.map(([patch]) => patch)).toEqual([
      { owners: ["Maya"] },
      { owners: ["Maya", "Theo"] },
    ]);
    expect(
      (screen.getByRole("checkbox", { name: "Maya" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByRole("checkbox", { name: "Theo" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("keeps rapid Tag additions cumulative and normalizes duplicates", () => {
    const onPatch = vi.fn();
    render(
      <TaskProperties
        task={task}
        types={[kernelType]}
        members={[maya]}
        onPatch={onPatch}
      />,
    );
    const input = screen.getByLabelText("Task tags");

    fireEvent.change(input, { target: { value: " NPU " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "Verifier, npu" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onPatch.mock.calls.map(([patch]) => patch)).toEqual([
      { tags: ["NPU"] },
      { tags: ["NPU", "Verifier"] },
    ]);
    expect(screen.getByText("NPU")).toBeDefined();
    expect(screen.getByText("Verifier")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Remove NPU" }));
    expect(onPatch).toHaveBeenLastCalledWith({ tags: ["Verifier"] });
  });
});
