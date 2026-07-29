import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TaskCard from "@/components/tasks/TaskCard";
import type {
  Member,
  TaskModel,
  TaskPatch,
  TaskType,
} from "@/lib/types";

const taskType: TaskType = {
  id: "type-kernel",
  name: "Kernel",
  description: "Kernel implementation work",
  position: 0,
  created_at: "2026-07-27T00:00:00.000Z",
};

const members: Member[] = [
  {
    id: "member-maya",
    name: "Maya",
    initials: "MA",
    position: 0,
    created_at: "2026-07-27T00:00:00.000Z",
  },
  {
    id: "member-yubai",
    name: "Yubai",
    initials: "YF",
    position: 1,
    created_at: "2026-07-27T00:00:00.000Z",
  },
];

const task: TaskModel = {
  id: "task-kernels",
  typeId: "type-kernel",
  title: "Validate NPU kernels",
  status: "todo",
  owners: [],
  notes: "",
  tags: ["NPU"],
  priority: "high",
  dueDate: null,
  position: 0,
  created_at: "2026-07-27T16:00:00.000Z",
  updated_at: "2026-07-27T17:30:00.000Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function renderCard({
  currentTask = task,
  onPatch = vi.fn().mockResolvedValue(undefined),
  onDelete = vi.fn().mockResolvedValue(undefined),
}: {
  currentTask?: TaskModel;
  onPatch?: (patch: TaskPatch) => Promise<void>;
  onDelete?: () => Promise<void>;
} = {}) {
  return render(
    <TaskCard
      task={currentTask}
      type={taskType}
      types={[taskType]}
      members={members}
      showStatus={false}
      onPatch={onPatch}
      onDelete={onDelete}
    />,
  );
}

function openQuickEdit() {
  fireEvent.click(screen.getByRole("button", {
    name: "Actions for Validate NPU kernels",
  }));
  fireEvent.click(screen.getByRole("button", {
    name: "Quick edit Validate NPU kernels",
  }));
}

afterEach(cleanup);

describe("TaskCard", () => {
  it("keeps Type, title, and menu in accessible grid order", () => {
    render(
      <TaskCard
        task={task}
        type={taskType}
        types={[taskType]}
        members={members}
        showStatus
        onPatch={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const card = screen.getByRole("article");
    const heading = card.querySelector(".task-card-head");
    const typeLabel = within(card).getByText("Kernel");
    const title = within(card).getByRole("link", {
      name: "Validate NPU kernels",
    });
    const menu = card.querySelector(".task-card-menu");
    expect(Array.from(heading?.children ?? [])).toEqual([
      typeLabel,
      title,
      menu,
    ]);
    expect(
      title.compareDocumentPosition(
        within(card).getByRole("button", {
          name: "Actions for Validate NPU kernels",
        }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const footer = card.querySelector(".task-card-foot");
    const metadata = card.querySelector(".task-card-meta");
    const updated = within(card).getByText(/^Updated /);
    expect(footer?.contains(metadata)).toBe(true);
    expect(metadata?.contains(updated)).toBe(true);
    expect(within(metadata as HTMLElement).getByText("To do")).toBeDefined();
  });

  it("keeps every Owner in the DOM beside non-shrinking metadata", () => {
    const owners = ["Maya", "Yubai", "Ada", "Grace", "Linus"];
    render(
      <TaskCard
        task={{ ...task, owners }}
        type={taskType}
        types={[taskType]}
        members={members}
        showStatus
        onPatch={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const card = screen.getByRole("article");
    const ownerRegion = card.querySelector(".task-card-owners");
    const metadata = card.querySelector(".task-card-meta");
    expect(ownerRegion?.querySelectorAll(".owner-avatar")).toHaveLength(5);
    for (const owner of owners) {
      expect(
        within(ownerRegion as HTMLElement).getByRole("img", { name: owner }),
      ).toBeDefined();
    }
    expect(within(metadata as HTMLElement).getByText("To do")).toBeDefined();
    expect(within(metadata as HTMLElement).getByText(/^Updated /)).toBeDefined();
  });

  it("renders an unassigned Type with the neutral treatment hook", () => {
    render(
      <TaskCard
        task={{ ...task, typeId: null }}
        type={null}
        types={[taskType]}
        members={members}
        showStatus={false}
        onPatch={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText("No type").classList.contains("is-empty")).toBe(true);
  });

  it("moves focus into Quick edit and restores the disclosure trigger on Escape", async () => {
    renderCard();
    const trigger = screen.getByRole("button", {
      name: "Actions for Validate NPU kernels",
    });

    openQuickEdit();
    const status = screen.getByLabelText("Status for Validate NPU kernels");
    await waitFor(() => expect(document.activeElement).toBe(status));

    fireEvent.keyDown(screen.getByRole("region", {
      name: "Quick edit Validate NPU kernels",
    }), { key: "Escape" });
    expect(screen.queryByRole("region", {
      name: "Quick edit Validate NPU kernels",
    })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("restores the disclosure trigger after completing Quick edit or canceling delete", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderCard({ onDelete });
    const trigger = screen.getByRole("button", {
      name: "Actions for Validate NPU kernels",
    });

    openQuickEdit();
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByLabelText("Status for Validate NPU kernels"),
      );
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Close quick edit Validate NPU kernels",
    }));
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    const deleteAction = screen.getByRole("group", {
      name: "Actions for Validate NPU kernels",
    }).querySelector<HTMLButtonElement>(".danger-action");
    expect(deleteAction).not.toBeNull();
    fireEvent.click(deleteAction!);
    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
    expect(screen.queryByRole("group", {
      name: "Actions for Validate NPU kernels",
    })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("serializes rapid Owner patches from the latest local selection", async () => {
    const firstPatch = deferred<void>();
    const secondPatch = deferred<void>();
    const onPatch = vi.fn()
      .mockImplementationOnce(() => firstPatch.promise)
      .mockImplementationOnce(() => secondPatch.promise);
    const view = renderCard({ onPatch });
    openQuickEdit();

    const maya = screen.getByRole("checkbox", { name: "Maya" });
    const yubai = screen.getByRole("checkbox", { name: "Yubai" });
    fireEvent.click(maya);
    fireEvent.click(yubai);

    expect(maya).toHaveProperty("checked", true);
    expect(yubai).toHaveProperty("checked", true);
    await waitFor(() => expect(onPatch).toHaveBeenCalledTimes(1));
    expect(onPatch).toHaveBeenNthCalledWith(1, {
      owners: ["Maya"],
    });

    await act(async () => {
      firstPatch.reject(new Error("First Owner write failed."));
      await Promise.resolve();
    });
    await waitFor(() => expect(onPatch).toHaveBeenCalledTimes(2));
    expect(onPatch).toHaveBeenNthCalledWith(2, {
      owners: ["Maya", "Yubai"],
    });

    view.rerender(
      <TaskCard
        task={{ ...task, owners: ["Maya"] }}
        type={taskType}
        types={[taskType]}
        members={members}
        showStatus={false}
        onPatch={onPatch}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Maya" }))
      .toHaveProperty("checked", true);
    expect(screen.getByRole("checkbox", { name: "Yubai" }))
      .toHaveProperty("checked", true);

    await act(async () => {
      secondPatch.resolve();
      await secondPatch.promise;
    });
    view.rerender(
      <TaskCard
        task={{ ...task, owners: ["Maya", "Yubai"] }}
        type={taskType}
        types={[taskType]}
        members={members}
        showStatus={false}
        onPatch={onPatch}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Maya" }))
      .toHaveProperty("checked", true);
    expect(screen.getByRole("checkbox", { name: "Yubai" }))
      .toHaveProperty("checked", true);
  });
});
