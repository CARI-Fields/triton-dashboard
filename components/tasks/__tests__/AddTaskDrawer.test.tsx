import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AddTaskDrawer from "@/components/tasks/AddTaskDrawer";
import type {
  Member,
  NewTaskInput,
  TaskType,
} from "@/lib/types";

const types: TaskType[] = [
  {
    id: "type-kernel",
    name: "Kernel",
    description: "Kernel implementation work",
    position: 0,
    created_at: "2026-07-27T00:00:00.000Z",
  },
  {
    id: "type-research",
    name: "Research",
    description: "Research and evaluation",
    position: 1,
    created_at: "2026-07-27T00:00:00.000Z",
  },
];

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

interface RenderDrawerOptions {
  onCreate?: (input: NewTaskInput) => Promise<void>;
  onCreateType?: (name: string) => Promise<string>;
  onClose?: () => void;
  defaults?: {
    status?: NewTaskInput["status"];
    typeId?: string | null;
  };
}

function renderDrawer({
  onCreate = vi.fn().mockResolvedValue(undefined),
  onCreateType = vi.fn().mockResolvedValue("type-kernel"),
  onClose = vi.fn(),
  defaults,
}: RenderDrawerOptions = {}) {
  return render(
    <AddTaskDrawer
      open
      types={types}
      members={members}
      defaults={defaults}
      onClose={onClose}
      onCreate={onCreate}
      onCreateType={onCreateType}
    />,
  );
}

function InlineTypeHarness({
  onCreate,
  onCreateType,
}: {
  onCreate: (input: NewTaskInput) => Promise<void>;
  onCreateType: (name: string) => Promise<string>;
}) {
  const [currentTypes, setCurrentTypes] = useState(types);

  return (
    <AddTaskDrawer
      open
      types={currentTypes}
      members={members}
      onClose={vi.fn()}
      onCreate={onCreate}
      onCreateType={async (name) => {
        const id = await onCreateType(name);
        setCurrentTypes((current) => [
          ...current,
          {
            id,
            name,
            description: "",
            position: current.length,
            created_at: "2026-07-27T00:00:00.000Z",
          },
        ]);
        return id;
      }}
    />
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

afterEach(cleanup);

describe("AddTaskDrawer", () => {
  it("creates a generic task with Type, Tags, Owner, Priority, and Due date", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ onCreate: create });

    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Validate NPU kernels" },
    });
    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "type-kernel" },
    });
    fireEvent.change(screen.getByLabelText("Tags"), {
      target: { value: "NPU, npu, Verifier" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Maya" }));
    fireEvent.change(screen.getByLabelText("Priority"), {
      target: { value: "high" },
    });
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Run the full verifier matrix." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Validate NPU kernels",
        status: "todo",
        typeId: "type-kernel",
        tags: ["NPU", "Verifier"],
        owners: ["Maya"],
        priority: "high",
        dueDate: "2026-08-01",
        description: "Run the full verifier matrix.",
      }),
    ));
  });

  it("uses Owner copy and never exposes Module or Assignee copy", () => {
    renderDrawer();

    expect(screen.getByText("Owner")).toBeDefined();
    expect(screen.queryByText(/Module|Foundation|Pipeline|Assignee/i)).toBeNull();
  });

  it("submits every selected Owner", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ onCreate: create });

    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Pair owner coverage" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Maya" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Yubai" }));
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ owners: ["Maya", "Yubai"] }),
    ));
  });

  it("preserves the full accessible name for a visually truncatable Owner", () => {
    const longName = "Alexandria Cassandra Montgomery-Wellington";
    render(
      <AddTaskDrawer
        open
        types={types}
        members={[{
          id: "member-long",
          name: longName,
          initials: "AM",
          position: 0,
          created_at: "2026-07-28T00:00:00.000Z",
        }]}
        onClose={vi.fn()}
        onCreate={vi.fn().mockResolvedValue(undefined)}
        onCreateType={vi.fn().mockResolvedValue("type-kernel")}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: longName });
    expect(checkbox.getAttribute("aria-label")).toBe(longName);
    const name = checkbox.closest(".owner-option")
      ?.querySelector(".owner-option-name");
    expect(name?.textContent).toBe(longName);
    expect(name?.getAttribute("title")).toBe(longName);
  });

  it("renders the exact field order and generic create defaults", () => {
    renderDrawer();

    const fields = [
      screen.getByLabelText("Task title"),
      screen.getByLabelText("Status"),
      screen.getByLabelText("Type"),
      screen.getByLabelText("Tags"),
      screen.getByText("Owner"),
      screen.getByLabelText("Priority"),
      screen.getByLabelText("Due date"),
      screen.getByLabelText("Description"),
    ];
    for (let index = 0; index < fields.length - 1; index += 1) {
      expect(
        fields[index].compareDocumentPosition(fields[index + 1])
        & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }

    expect(screen.getByLabelText("Status")).toHaveProperty("value", "todo");
    expect(screen.getByLabelText("Type")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Priority")).toHaveProperty("value", "medium");
    expect(screen.getByLabelText("Due date")).toHaveProperty("value", "");
  });

  it("accepts comma or Enter tags, normalizes duplicates, and removes tags", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ onCreate: create });

    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Tag behavior" },
    });
    fireEvent.change(screen.getByLabelText("Tags"), {
      target: { value: "NPU, npu," },
    });
    expect(screen.getByText("NPU")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Tags"), {
      target: { value: "Verifier" },
    });
    fireEvent.keyDown(screen.getByLabelText("Tags"), { key: "Enter" });
    expect(screen.getByText("Verifier")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Remove NPU" }));
    expect(screen.queryByText("NPU")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["Verifier"] }),
    ));
  });

  it("creates and automatically selects a Type without leaving the task draft", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const createType = vi.fn().mockResolvedValue("type-documentation");
    render(
      <InlineTypeHarness onCreate={create} onCreateType={createType} />,
    );
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Draft stays put" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create type" }));
    fireEvent.change(screen.getByLabelText("New type name"), {
      target: { value: "  Documentation  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add type" }));

    await waitFor(() => {
      expect(createType).toHaveBeenCalledWith("Documentation");
    });
    expect(screen.getByLabelText("Task title")).toHaveProperty(
      "value",
      "Draft stays put",
    );
    expect(screen.getByLabelText("Type")).toHaveProperty(
      "value",
      "type-documentation",
    );

    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ typeId: "type-documentation" }),
    ));
  });

  it.each([
    ["Control", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
  ])(
    "uses %s + Enter in New type name to create only the Type",
    async (_label, modifier) => {
      const create = vi.fn().mockResolvedValue(undefined);
      const createType = vi.fn().mockResolvedValue("type-documentation");
      renderDrawer({ onCreate: create, onCreateType: createType });
      fireEvent.change(screen.getByLabelText("Task title"), {
        target: { value: "Keep this task as a draft" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Create type" }));
      fireEvent.change(screen.getByLabelText("New type name"), {
        target: { value: "Documentation" },
      });

      fireEvent.keyDown(screen.getByLabelText("New type name"), {
        key: "Enter",
        ...modifier,
      });

      await waitFor(() => expect(createType).toHaveBeenCalledWith(
        "Documentation",
      ));
      expect(create).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Task title")).toHaveProperty(
        "value",
        "Keep this task as a draft",
      );
    },
  );

  it("blocks task submission and dismissal while Type creation is pending", async () => {
    const typeWrite = deferred<string>();
    const create = vi.fn().mockResolvedValue(undefined);
    const createType = vi.fn(() => typeWrite.promise);
    const close = vi.fn();
    renderDrawer({
      onCreate: create,
      onCreateType: createType,
      onClose: close,
    });
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Retain while Type saves" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create type" }));
    fireEvent.change(screen.getByLabelText("New type name"), {
      target: { value: "Documentation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add type" }));

    await waitFor(() => expect(createType).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Create task" }))
      .toHaveProperty("disabled", true);
    fireEvent.keyDown(screen.getByLabelText("Description"), {
      key: "Enter",
      ctrlKey: true,
    });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(create).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();

    typeWrite.resolve("type-documentation");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create task" }))
        .toHaveProperty("disabled", false);
    });
  });

  it("blocks Type creation and dismissal while task creation is pending", async () => {
    const taskWrite = deferred<void>();
    const create = vi.fn(() => taskWrite.promise);
    const createType = vi.fn().mockResolvedValue("type-documentation");
    const close = vi.fn();
    renderDrawer({
      onCreate: create,
      onCreateType: createType,
      onClose: close,
    });
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Task write in flight" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create type" }));
    fireEvent.change(screen.getByLabelText("New type name"), {
      target: { value: "Documentation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Add type" }))
      .toHaveProperty("disabled", true);
    fireEvent.keyDown(screen.getByLabelText("New type name"), {
      key: "Enter",
    });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(createType).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();

    taskWrite.resolve();
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });

  it("keeps the complete draft and shows an inline alert when create fails", async () => {
    const create = vi.fn().mockRejectedValue(new Error("Save failed."));
    const close = vi.fn();
    renderDrawer({ onCreate: create, onClose: close });

    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Keep this draft" },
    });
    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "type-research" },
    });
    fireEvent.change(screen.getByLabelText("Tags"), {
      target: { value: "RL" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Yubai" }));
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Do not erase this context." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not create task. Save failed.",
    );
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Task title")).toHaveProperty(
      "value",
      "Keep this draft",
    );
    expect(screen.getByLabelText("Type")).toHaveProperty(
      "value",
      "type-research",
    );
    expect(screen.getByRole("checkbox", { name: "Yubai" })).toHaveProperty(
      "checked",
      true,
    );
    expect(screen.getByText("RL")).toBeDefined();
    expect(screen.getByLabelText("Description")).toHaveProperty(
      "value",
      "Do not erase this context.",
    );
  });

  it.each([
    ["Control", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
  ])("submits with %s + Enter, resets, and closes", async (_label, modifier) => {
    const create = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    renderDrawer({ onCreate: create, onClose: close });
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Keyboard task" },
    });

    fireEvent.keyDown(screen.getByLabelText("Description"), {
      key: "Enter",
      ...modifier,
    });

    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(close).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Task title")).toHaveProperty("value", "");
  });

  it("applies a column's Status and Type defaults when opened", () => {
    renderDrawer({
      defaults: { status: "blocked", typeId: "type-research" },
    });

    expect(screen.getByLabelText("Status")).toHaveProperty("value", "blocked");
    expect(screen.getByLabelText("Type")).toHaveProperty(
      "value",
      "type-research",
    );
  });
});
