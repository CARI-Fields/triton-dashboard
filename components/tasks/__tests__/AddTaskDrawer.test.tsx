import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  onCreateType?: (name: string) => Promise<void>;
  onClose?: () => void;
  defaults?: {
    status?: NewTaskInput["status"];
    typeId?: string | null;
  };
}

function renderDrawer({
  onCreate = vi.fn().mockResolvedValue(undefined),
  onCreateType = vi.fn().mockResolvedValue(undefined),
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

  it("creates a Type inline without leaving the task draft", async () => {
    const createType = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ onCreateType: createType });
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
  });

  it.each([
    ["Control", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
  ])(
    "uses %s + Enter in New type name to create only the Type",
    async (_label, modifier) => {
      const create = vi.fn().mockResolvedValue(undefined);
      const createType = vi.fn().mockResolvedValue(undefined);
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
