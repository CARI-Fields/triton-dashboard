import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Board from "@/components/Board";
import type { Member, Module, Task } from "@/lib/types";

type TableName = "modules" | "tasks" | "members";
type MutationOperation = "insert" | "update" | "delete";

interface QueryError {
  message: string;
  details: string;
  hint: string;
  code: string;
}

interface FailureRule {
  table: TableName;
  operation: MutationOperation;
  id?: string;
  message: string;
}

interface ReadFailureRule {
  table: TableName;
  message: string;
}

interface MutationDelayRule {
  table: TableName;
  operation: MutationOperation;
  id?: string;
  promise: Promise<void>;
}

interface MutationTrace {
  table: TableName;
  operation: MutationOperation;
  id: string | null;
  payload: Record<string, unknown> | null;
  outcome: "success" | "error";
}

interface RealtimeHandler {
  table: TableName;
  callback: (payload: unknown) => void;
}

const supabaseState = vi.hoisted(() => ({
  tables: {
    modules: [] as Array<Record<string, unknown>>,
    tasks: [] as Array<Record<string, unknown>>,
    members: [] as Array<Record<string, unknown>>,
  },
  failures: [] as FailureRule[],
  readFailures: [] as ReadFailureRule[],
  mutationDelays: [] as MutationDelayRule[],
  mutationTrace: [] as MutationTrace[],
  readTrace: [] as TableName[],
  readDelays: [] as Array<Promise<void>>,
  handlers: [] as RealtimeHandler[],
  removeChannel: vi.fn(),
  nextId: 100,
}));

vi.mock("@/lib/activity", () => ({
  logActivity: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/supabase", () => {
  function queryError(message: string): QueryError {
    return {
      message,
      details: "",
      hint: "",
      code: "TEST_ERROR",
    };
  }

  function cloneRows(table: TableName): Array<Record<string, unknown>> {
    return supabaseState.tables[table].map((row) => ({ ...row }));
  }

  const client = {
    from: vi.fn((table: TableName) => {
      let operation: MutationOperation | null = null;
      let payload: Record<string, unknown> | null = null;
      let filterId: string | null = null;
      let orderColumn: string | null = null;
      let returnSingle = false;

      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.order = vi.fn((column: string) => {
        orderColumn = column;
        return builder;
      });
      builder.eq = vi.fn((column: string, value: unknown) => {
        if (column === "id") filterId = String(value);
        return builder;
      });
      builder.single = vi.fn(() => {
        returnSingle = true;
        return builder;
      });
      builder.insert = vi.fn((nextPayload: Record<string, unknown>) => {
        operation = "insert";
        payload = nextPayload;
        return builder;
      });
      builder.update = vi.fn((nextPayload: Record<string, unknown>) => {
        operation = "update";
        payload = nextPayload;
        return builder;
      });
      builder.delete = vi.fn(() => {
        operation = "delete";
        return builder;
      });

      async function execute() {
        if (!operation) {
          supabaseState.readTrace.push(table);
          const readFailureIndex = supabaseState.readFailures.findIndex(
            (rule) => rule.table === table,
          );
          const readFailure = readFailureIndex >= 0
            ? supabaseState.readFailures.splice(readFailureIndex, 1)[0]
            : null;
          let rows = cloneRows(table);
          const readDelay = supabaseState.readDelays.shift();
          if (readDelay) await readDelay;
          if (readFailure) {
            return {
              data: null,
              error: queryError(readFailure.message),
            };
          }
          if (filterId !== null) {
            rows = rows.filter((row) => String(row.id) === filterId);
          }
          if (orderColumn) {
            rows.sort((first, second) => (
              Number(first[orderColumn]) - Number(second[orderColumn])
            ));
          }
          return { data: rows, error: null };
        }

        const delayIndex = supabaseState.mutationDelays.findIndex((rule) => (
          rule.table === table
          && rule.operation === operation
          && (rule.id === undefined || rule.id === filterId)
        ));
        if (delayIndex >= 0) {
          const [delay] = supabaseState.mutationDelays.splice(delayIndex, 1);
          await delay.promise;
        }

        const failureIndex = supabaseState.failures.findIndex((rule) => (
          rule.table === table
          && rule.operation === operation
          && (rule.id === undefined || rule.id === filterId)
        ));
        if (failureIndex >= 0) {
          const [failure] = supabaseState.failures.splice(failureIndex, 1);
          supabaseState.mutationTrace.push({
            table,
            operation,
            id: filterId,
            payload,
            outcome: "error",
          });
          return { data: null, error: queryError(failure.message) };
        }

        let returnedRow: Record<string, unknown> | null = null;
        if (operation === "insert") {
          const id = `${table}-${supabaseState.nextId}`;
          supabaseState.nextId += 1;
          const now = "2026-07-27T18:00:00.000Z";
          returnedRow = {
            ...payload,
            id,
            created_at: now,
            ...(table === "tasks" ? { updated_at: now } : {}),
          };
          supabaseState.tables[table].push(returnedRow);
        } else if (operation === "update") {
          supabaseState.tables[table] = supabaseState.tables[table].map(
            (row) => (
              filterId === null || String(row.id) === filterId
                ? { ...row, ...payload }
                : row
            ),
          );
        } else {
          supabaseState.tables[table] = supabaseState.tables[table].filter(
            (row) => filterId !== null && String(row.id) !== filterId,
          );
          if (table === "modules" && filterId !== null) {
            supabaseState.tables.tasks = supabaseState.tables.tasks.map(
              (row) => (
                row.module_id === filterId
                  ? { ...row, module_id: null }
                  : row
              ),
            );
          }
        }

        supabaseState.mutationTrace.push({
          table,
          operation,
          id: filterId,
          payload,
          outcome: "success",
        });
        return {
          data: returnSingle && returnedRow ? { id: returnedRow.id } : null,
          error: null,
        };
      }

      builder.then = (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => execute().then(onFulfilled, onRejected);
      return builder;
    }),
    channel: vi.fn(() => {
      const channel = {
        on: vi.fn((
          _kind: string,
          config: { table: TableName },
          callback: (payload: unknown) => void,
        ) => {
          supabaseState.handlers.push({
            table: config.table,
            callback,
          });
          return channel;
        }),
        subscribe: vi.fn(() => channel),
      };
      return channel;
    }),
    removeChannel: supabaseState.removeChannel,
  };

  return {
    isSupabaseConfigured: true,
    supabase: client,
  };
});

const moduleRows: Module[] = [
  {
    id: "type-kernel",
    name: "Kernel",
    kind: "foundation",
    objective: "Kernel implementation work",
    position: 0,
    created_at: "2026-07-27T00:00:00.000Z",
  },
  {
    id: "type-research",
    name: "Research",
    kind: "pipeline",
    objective: "Research and evaluation",
    position: 1,
    created_at: "2026-07-27T00:00:00.000Z",
  },
];

const taskRows: Task[] = [
  {
    id: "task-kernels",
    module_id: "type-kernel",
    title: "Validate NPU kernels",
    status: "todo",
    assignees: ["Maya", "Yubai"],
    notes: "Run every verifier case.",
    tags: ["NPU", "Verifier"],
    priority: "high",
    due_date: "2026-08-01",
    position: 0,
    created_at: "2026-07-27T16:00:00.000Z",
    updated_at: "2026-07-27T17:30:00.000Z",
  },
  {
    id: "task-benchmark",
    module_id: "type-kernel",
    title: "Benchmark convolution kernels",
    status: "done",
    assignees: ["Theo"],
    notes: "",
    tags: ["NPU"],
    priority: "medium",
    due_date: null,
    position: 1,
    created_at: "2026-07-27T15:00:00.000Z",
    updated_at: "2026-07-27T17:00:00.000Z",
  },
  {
    id: "task-untyped",
    module_id: null,
    title: "Triage shared failures",
    status: "blocked",
    assignees: [],
    notes: "",
    tags: [],
    priority: "urgent",
    due_date: null,
    position: 2,
    created_at: "2026-07-27T14:00:00.000Z",
    updated_at: "2026-07-27T16:00:00.000Z",
  },
  {
    id: "task-research",
    module_id: "type-research",
    title: "Collect agentic trajectories",
    status: "in_progress",
    assignees: ["Maya"],
    notes: "",
    tags: ["SFT"],
    priority: "medium",
    due_date: null,
    position: 3,
    created_at: "2026-07-27T13:00:00.000Z",
    updated_at: "2026-07-27T15:00:00.000Z",
  },
];

const memberRows: Member[] = [
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
  {
    id: "member-theo",
    name: "Theo",
    initials: "TH",
    position: 2,
    created_at: "2026-07-27T00:00:00.000Z",
  },
];

function resetSupabaseState() {
  supabaseState.tables.modules = moduleRows.map((row) => ({ ...row }));
  supabaseState.tables.tasks = taskRows.map((row) => ({
    ...row,
    assignees: [...row.assignees],
    tags: [...row.tags],
  }));
  supabaseState.tables.members = memberRows.map((row) => ({ ...row }));
  supabaseState.failures.length = 0;
  supabaseState.readFailures.length = 0;
  supabaseState.mutationDelays.length = 0;
  supabaseState.mutationTrace.length = 0;
  supabaseState.readTrace.length = 0;
  supabaseState.readDelays.length = 0;
  supabaseState.handlers.length = 0;
  supabaseState.removeChannel.mockClear();
  supabaseState.nextId = 100;
}

function failNext(
  table: TableName,
  operation: MutationOperation,
  message: string,
  id?: string,
) {
  supabaseState.failures.push({ table, operation, message, id });
}

function failNextRead(table: TableName, message: string) {
  supabaseState.readFailures.push({ table, message });
}

function delayNextMutation(
  table: TableName,
  operation: MutationOperation,
  promise: Promise<void>,
  id?: string,
) {
  supabaseState.mutationDelays.push({
    table,
    operation,
    promise,
    id,
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function renderLoadedBoard() {
  const result = render(<Board />);
  await screen.findByRole("link", { name: "Validate NPU kernels" });
  return result;
}

function openTaskActions(title: string) {
  fireEvent.click(screen.getByRole("button", {
    name: `Actions for ${title}`,
  }));
}

beforeEach(resetSupabaseState);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Board", () => {
  it("uses a labelled structural board skeleton only for the initial load", async () => {
    const pending = deferred();
    supabaseState.readDelays.push(pending.promise);
    const view = render(<Board />);

    const skeleton = screen.getByRole("status", {
      name: "Loading Task Board",
    });
    expect(skeleton.classList).toContain("workspace-skeleton-board");
    expect(skeleton.querySelectorAll(".skeleton-board-column")).toHaveLength(4);
    expect(screen.queryByText("Loading the board…")).toBeNull();

    view.unmount();
    await act(async () => pending.resolve());
  });

  it("shows only a retryable error when the initial three-table read fails", async () => {
    failNextRead("modules", "Types unavailable.");
    failNextRead("tasks", "Tasks unavailable.");
    failNextRead("members", "Owners unavailable.");
    render(<Board />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not load board. Types unavailable.",
    );
    expect(screen.queryByRole("region", {
      name: "Task Board columns",
    })).toBeNull();
    expect(screen.queryByRole("heading", { name: "To do" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", {
      name: "Validate NPU kernels",
    })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("retains the last successful Board snapshot when a refresh fails", async () => {
    await renderLoadedBoard();
    failNextRead("modules", "Refresh unavailable.");
    failNextRead("tasks", "Refresh tasks unavailable.");
    failNextRead("members", "Refresh owners unavailable.");

    const taskHandler = supabaseState.handlers.find(
      ({ table }) => table === "tasks",
    );
    act(() => {
      taskHandler?.callback({});
    });

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not load board. Refresh unavailable.",
    );
    expect(screen.getByRole("link", {
      name: "Validate NPU kernels",
    })).toBeDefined();
    expect(screen.queryByRole("status", {
      name: "Loading Task Board",
    })).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });

  it("uses the exact generic Status columns and four approved views", async () => {
    await renderLoadedBoard();

    const pageHeader = screen.getByRole("heading", {
      name: "Task Board",
    }).closest("header");
    expect(pageHeader).not.toBeNull();
    expect(within(pageHeader!).getByText("Research Workspace")).toBeDefined();
    expect(pageHeader?.textContent).not.toMatch(
      /\b(Distill|SFT|RL|Pipeline)\b/i,
    );
    expect(screen.getByRole("heading", { name: "To do" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "In progress" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Done" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Blocked" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "SFT" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Types" })).toBeDefined();
    for (const view of ["Board", "Types", "Ownership", "Team"]) {
      expect(screen.getByRole("tab", { name: view })).toBeDefined();
    }
    expect(document.body.textContent).not.toMatch(
      /\b(Module|Foundation|Pipeline|Assignee|Assignees)\b/i,
    );
    const boardRegion = screen.getByRole("region", {
      name: "Task Board columns",
    });
    const helpId = boardRegion.getAttribute("aria-describedby");
    expect(helpId).toBe("task-board-scroll-help");
    expect(document.getElementById(helpId ?? "")?.textContent).toContain(
      "Scroll horizontally",
    );
    expect(boardRegion.tabIndex).toBe(0);
  });

  it("implements keyboard activation and relationships for the view tabs", async () => {
    await renderLoadedBoard();

    const boardTab = screen.getByRole("tab", { name: "Board" });
    const typesTab = screen.getByRole("tab", { name: "Types" });
    const teamTab = screen.getByRole("tab", { name: "Team" });
    const panel = screen.getByRole("tabpanel");
    expect(boardTab.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(boardTab.id);
    expect(boardTab.tabIndex).toBe(0);
    expect(typesTab.tabIndex).toBe(-1);

    boardTab.focus();
    fireEvent.keyDown(boardTab, { key: "ArrowRight" });
    expect(document.activeElement).toBe(typesTab);
    expect(typesTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("columnheader", { name: "Task count" }))
      .toBeDefined();
    expect(panel.getAttribute("aria-labelledby")).toBe(typesTab.id);

    fireEvent.keyDown(typesTab, { key: "End" });
    expect(document.activeElement).toBe(teamTab);
    expect(teamTab.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(teamTab, { key: "Home" });
    expect(document.activeElement).toBe(boardTab);
    expect(boardTab.getAttribute("aria-selected")).toBe("true");
  });

  it("groups by Status or Type, including No type, and carries column defaults", async () => {
    await renderLoadedBoard();

    fireEvent.click(screen.getByRole("button", { name: "Add task to Blocked" }));
    expect(screen.getByRole("dialog", { name: "Create task" })).toBeDefined();
    expect(screen.getByLabelText("Status")).toHaveProperty("value", "blocked");
    fireEvent.click(screen.getByRole("button", { name: "Close create task" }));

    fireEvent.change(screen.getByLabelText("Group by"), {
      target: { value: "type" },
    });
    expect(screen.getByRole("heading", { name: "Kernel" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Research" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "No type" })).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Triage shared failures" })
        .closest(".task-card")?.textContent,
    ).toContain("Blocked");

    fireEvent.click(screen.getByRole("button", { name: "Add task to Research" }));
    expect(screen.getByLabelText("Type")).toHaveProperty(
      "value",
      "type-research",
    );
  });

  it("renders complete cards with a detail link and accessible quick-edit/delete controls", async () => {
    await renderLoadedBoard();

    const link = screen.getByRole("link", { name: "Validate NPU kernels" });
    expect(link.getAttribute("href")).toBe("/task/task-kernels");
    const card = link.closest(".task-card") as HTMLElement;
    expect(within(card).getByText("Kernel")).toBeDefined();
    expect(within(card).getByText("NPU")).toBeDefined();
    expect(within(card).getByText("Verifier")).toBeDefined();
    expect(within(card).getByRole("img", { name: "Maya" })).toBeDefined();
    expect(within(card).getByRole("img", { name: "Yubai" })).toBeDefined();
    expect(within(card).getByText(/^Updated /)).toBeDefined();
    expect(within(card).queryByText("To do")).toBeNull();

    const trigger = screen.getByRole("button", {
      name: "Actions for Validate NPU kernels",
    });
    openTaskActions("Validate NPU kernels");
    const actions = screen.getByRole("group", {
      name: "Actions for Validate NPU kernels",
    });
    expect(trigger.getAttribute("aria-controls")).toBe(actions.id);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const quickEdit = screen.getByRole("button", {
      name: "Quick edit Validate NPU kernels",
    });
    await waitFor(() => expect(document.activeElement).toBe(quickEdit));
    fireEvent.keyDown(quickEdit, { key: "Escape" });
    expect(screen.queryByRole("group", {
      name: "Actions for Validate NPU kernels",
    })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    openTaskActions("Validate NPU kernels");
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("group", {
      name: "Actions for Validate NPU kernels",
    })).toBeNull();

    openTaskActions("Validate NPU kernels");
    fireEvent.click(screen.getByRole("button", {
      name: "Quick edit Validate NPU kernels",
    }));
    expect(screen.getByRole("region", {
      name: "Quick edit Validate NPU kernels",
    })).toBeDefined();
    expect(screen.getByLabelText("Status for Validate NPU kernels")).toBeDefined();
    expect(screen.getByLabelText("Type for Validate NPU kernels")).toBeDefined();
    expect(screen.getByRole("button", {
      name: "Delete Validate NPU kernels",
    })).toBeDefined();
  });

  it("maps quick edits through storage and reloads authoritative rows", async () => {
    await renderLoadedBoard();
    openTaskActions("Validate NPU kernels");
    fireEvent.click(screen.getByRole("button", {
      name: "Quick edit Validate NPU kernels",
    }));
    fireEvent.change(screen.getByLabelText("Status for Validate NPU kernels"), {
      target: { value: "done" },
    });

    await waitFor(() => {
      expect(supabaseState.mutationTrace).toContainEqual(
        expect.objectContaining({
          table: "tasks",
          operation: "update",
          id: "task-kernels",
          payload: { status: "done" },
          outcome: "success",
        }),
      );
    });
    expect(supabaseState.readTrace.length).toBeGreaterThanOrEqual(6);
    const doneColumn = screen.getByRole("heading", { name: "Done" })
      .closest(".task-column") as HTMLElement;
    expect(
      within(doneColumn).getByRole("link", { name: "Validate NPU kernels" }),
    ).toBeDefined();
  });

  it("uses exact Task deletion copy and checks failed Task writes", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderLoadedBoard();

    openTaskActions("Validate NPU kernels");
    fireEvent.click(screen.getByRole("button", {
      name: "Quick edit Validate NPU kernels",
    }));
    failNext("tasks", "update", "Task update failed.", "task-kernels");
    fireEvent.change(screen.getByLabelText("Status for Validate NPU kernels"), {
      target: { value: "done" },
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Could not update task. Task update failed.",
    );
    expect(supabaseState.readTrace.length).toBeGreaterThanOrEqual(6);

    openTaskActions("Validate NPU kernels");
    const actions = screen.getByRole("group", {
      name: "Actions for Validate NPU kernels",
    });
    fireEvent.click(within(actions).getByRole("button", {
      name: "Delete Validate NPU kernels",
    }));
    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(
        "Delete task “Validate NPU kernels”? This cannot be undone.",
      );
      expect(supabaseState.mutationTrace).toContainEqual(
        expect.objectContaining({
          table: "tasks",
          operation: "delete",
          id: "task-kernels",
          outcome: "success",
        }),
      );
    });
  });

  it("keeps a Task and reports a failed destructive write", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    failNext("tasks", "delete", "Task delete failed.", "task-kernels");
    await renderLoadedBoard();

    openTaskActions("Validate NPU kernels");
    fireEvent.click(screen.getByRole("button", {
      name: "Delete Validate NPU kernels",
    }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Could not delete task. Task delete failed.",
    );
    expect(screen.getByRole("link", {
      name: "Validate NPU kernels",
    })).toBeDefined();
    expect(supabaseState.mutationTrace).toContainEqual(
      expect.objectContaining({
        table: "tasks",
        operation: "delete",
        id: "task-kernels",
        outcome: "error",
      }),
    );
  });

  it("renders exact Types and Ownership table semantics", async () => {
    await renderLoadedBoard();

    fireEvent.click(screen.getByRole("tab", { name: "Types" }));
    for (const heading of [
      "Type",
      "Description",
      "Task count",
      "Progress",
      "Position",
    ]) {
      expect(
        screen.getByRole("columnheader", { name: heading }).getAttribute("scope"),
      ).toBe("col");
    }
    const kernelRow = screen.getByRole("cell", { name: "Kernel" })
      .closest("tr") as HTMLElement;
    expect(
      within(kernelRow).getByLabelText("Description for Kernel"),
    ).toHaveProperty("value", "Kernel implementation work");
    expect(within(kernelRow).getByRole("cell", { name: "2" })).toBeDefined();
    const progress = within(kernelRow).getByRole("progressbar", {
      name: "Kernel progress",
    });
    expect(progress.getAttribute("max")).toBe("2");
    expect(progress.getAttribute("value")).toBe("1");

    fireEvent.click(screen.getByRole("tab", { name: "Ownership" }));
    for (const heading of ["Owner", "Task", "Type", "Status", "Updated"]) {
      expect(
        screen.getByRole("columnheader", { name: heading }).getAttribute("scope"),
      ).toBe("col");
    }
    expect(screen.getByText("No owner yet")).toBeDefined();
    expect(screen.getAllByText("Validate NPU kernels")).toHaveLength(2);
    expect(screen.getAllByRole("cell", { name: "Maya" })).toHaveLength(2);
    expect(screen.getByRole("cell", { name: "Yubai" })).toBeDefined();
  });

  it("renders concise empty states for Types, Ownership, and Team", async () => {
    supabaseState.tables.modules = [];
    supabaseState.tables.tasks = [];
    supabaseState.tables.members = [];
    render(<Board />);
    await screen.findByRole("button", { name: "Add task to To do" });

    fireEvent.click(screen.getByRole("tab", { name: "Types" }));
    expect(screen.getByText("No types yet.")).toBeDefined();

    fireEvent.click(screen.getByRole("tab", { name: "Ownership" }));
    expect(screen.getByText("No tasks yet.")).toBeDefined();

    fireEvent.click(screen.getByRole("tab", { name: "Team" }));
    expect(screen.getByText("No team members yet.")).toBeDefined();
  });

  it("creates, patches, and deletes Types with compatibility defaults and exact copy", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderLoadedBoard();
    fireEvent.click(screen.getByRole("tab", { name: "Types" }));

    fireEvent.change(screen.getByLabelText("New type name"), {
      target: { value: "Documentation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add type" }));
    await waitFor(() => {
      expect(supabaseState.mutationTrace).toContainEqual(
        expect.objectContaining({
          table: "modules",
          operation: "insert",
          payload: {
            name: "Documentation",
            objective: "",
            kind: "pipeline",
            position: 2,
          },
          outcome: "success",
        }),
      );
    });

    fireEvent.change(screen.getByLabelText("Description for Kernel"), {
      target: { value: "Specialized kernel work" },
    });
    fireEvent.blur(screen.getByLabelText("Description for Kernel"));
    await waitFor(() => {
      expect(supabaseState.mutationTrace).toContainEqual(
        expect.objectContaining({
          table: "modules",
          operation: "update",
          id: "type-kernel",
          payload: { objective: "Specialized kernel work" },
          outcome: "success",
        }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove Kernel" }));
    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(
        "Remove Type “Kernel”? Its tasks will remain and move to No type.",
      );
      expect(supabaseState.mutationTrace).toContainEqual(
        expect.objectContaining({
          table: "modules",
          operation: "delete",
          id: "type-kernel",
          outcome: "success",
        }),
      );
    });
  });

  it("reconciles failed Type drafts and external realtime values", async () => {
    await renderLoadedBoard();
    fireEvent.click(screen.getByRole("tab", { name: "Types" }));

    failNext("modules", "update", "Description failed.", "type-kernel");
    const description = screen.getByLabelText("Description for Kernel");
    fireEvent.change(description, {
      target: { value: "Unsaved description" },
    });
    fireEvent.blur(description);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not update type. Description failed.",
    );
    await waitFor(() => expect(description).toHaveProperty(
      "value",
      "Kernel implementation work",
    ));

    failNext("modules", "update", "Position failed.", "type-kernel");
    const position = screen.getByLabelText("Position for Kernel");
    fireEvent.change(position, { target: { value: "99" } });
    fireEvent.blur(position);
    await waitFor(() => {
      expect(supabaseState.mutationTrace).toContainEqual(
        expect.objectContaining({
          table: "modules",
          operation: "update",
          id: "type-kernel",
          payload: { position: 99 },
          outcome: "error",
        }),
      );
      expect(position).toHaveProperty("value", "0");
    });

    supabaseState.tables.modules = supabaseState.tables.modules.map((row) => (
      row.id === "type-kernel"
        ? {
            ...row,
            objective: "Externally revised description",
            position: 7,
          }
        : row
    ));
    const moduleHandler = supabaseState.handlers.find(
      ({ table }) => table === "modules",
    );
    act(() => {
      moduleHandler?.callback({});
    });
    await waitFor(() => {
      expect(description).toHaveProperty(
        "value",
        "Externally revised description",
      );
      expect(position).toHaveProperty("value", "7");
    });
  });

  it("rolls a failed Type commit back to the latest realtime value", async () => {
    await renderLoadedBoard();
    fireEvent.click(screen.getByRole("tab", { name: "Types" }));

    const delayedCommit = deferred();
    delayNextMutation(
      "modules",
      "update",
      delayedCommit.promise,
      "type-kernel",
    );
    failNext("modules", "update", "Deferred description failed.", "type-kernel");
    const description = screen.getByLabelText("Description for Kernel");
    fireEvent.change(description, {
      target: { value: "Local description attempt" },
    });
    fireEvent.blur(description);
    await waitFor(() => {
      expect(supabaseState.mutationDelays).toHaveLength(0);
    });

    supabaseState.tables.modules = supabaseState.tables.modules.map((row) => (
      row.id === "type-kernel"
        ? { ...row, objective: "Realtime authoritative description" }
        : row
    ));
    const moduleHandler = supabaseState.handlers.find(
      ({ table }) => table === "modules",
    );
    act(() => {
      moduleHandler?.callback({});
    });
    await waitFor(() => {
      expect(description).toHaveProperty(
        "value",
        "Realtime authoritative description",
      );
    });

    await act(async () => {
      delayedCommit.resolve();
      await delayedCommit.promise;
    });
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not update type. Deferred description failed.",
    );
    await waitFor(() => {
      expect(description).toHaveProperty(
        "value",
        "Realtime authoritative description",
      );
    });
  });

  it("updates every affected Task before removing a Team member", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderLoadedBoard();
    fireEvent.click(screen.getByRole("tab", { name: "Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Maya" }));

    await waitFor(() => {
      expect(supabaseState.mutationTrace.some((entry) => (
        entry.table === "members"
        && entry.operation === "delete"
        && entry.id === "member-maya"
      ))).toBe(true);
    });
    const taskUpdates = supabaseState.mutationTrace
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => (
        entry.table === "tasks"
        && entry.operation === "update"
        && entry.outcome === "success"
      ));
    const memberDeleteIndex = supabaseState.mutationTrace.findIndex((entry) => (
      entry.table === "members" && entry.operation === "delete"
    ));
    expect(taskUpdates).toHaveLength(2);
    expect(taskUpdates.every(({ index }) => index < memberDeleteIndex)).toBe(true);
    expect(taskUpdates.map(({ entry }) => entry.payload)).toEqual([
      { assignees: ["Yubai"] },
      { assignees: [] },
    ]);
    expect(screen.queryByRole("button", { name: "Remove Maya" })).toBeNull();
  });

  it("serializes same-tick Team removals and disables every remove action", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const removalWrite = deferred();
    delayNextMutation(
      "tasks",
      "update",
      removalWrite.promise,
      "task-kernels",
    );
    await renderLoadedBoard();
    fireEvent.click(screen.getByRole("tab", { name: "Team" }));
    const removeMaya = screen.getByRole("button", { name: "Remove Maya" });
    const removeYubai = screen.getByRole("button", { name: "Remove Yubai" });

    act(() => {
      removeMaya.click();
      removeYubai.click();
    });
    await waitFor(() => {
      expect(confirm).toHaveBeenCalledOnce();
      expect(screen.getAllByRole("button", { name: /^Remove / }).every(
        (button) => (button as HTMLButtonElement).disabled,
      )).toBe(true);
    });
    expect(supabaseState.mutationTrace).not.toContainEqual(
      expect.objectContaining({
        table: "members",
        operation: "delete",
        id: "member-yubai",
      }),
    );

    await act(async () => {
      removalWrite.resolve();
      await removalWrite.promise;
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Remove Maya" })).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Remove Yubai" })).toBeDefined();
    expect(supabaseState.mutationTrace).not.toContainEqual(
      expect.objectContaining({
        table: "members",
        operation: "delete",
        id: "member-yubai",
      }),
    );
  });

  it("keeps the member, reports the error, and reloads when an Owner update fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    failNext("tasks", "update", "Owner update failed.", "task-kernels");
    await renderLoadedBoard();
    fireEvent.click(screen.getByRole("tab", { name: "Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Maya" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Could not remove member. Owner update failed.",
    );
    expect(supabaseState.mutationTrace.some((entry) => (
      entry.table === "members" && entry.operation === "delete"
    ))).toBe(false);
    expect(screen.getByRole("button", { name: "Remove Maya" })).toBeDefined();
    expect(supabaseState.readTrace.length).toBeGreaterThanOrEqual(6);
  });

  it("keeps a partial-cleanup failure visible after a slower realtime reload", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderLoadedBoard();
    fireEvent.click(screen.getByRole("tab", { name: "Team" }));

    const slowRealtime = deferred();
    supabaseState.readDelays.push(
      slowRealtime.promise,
      slowRealtime.promise,
      slowRealtime.promise,
    );
    const readsBeforeRealtime = supabaseState.readTrace.length;
    const taskHandler = supabaseState.handlers.find(
      ({ table }) => table === "tasks",
    );
    act(() => {
      taskHandler?.callback({});
    });
    await waitFor(() => {
      expect(supabaseState.readTrace.length).toBe(
        readsBeforeRealtime + 3,
      );
    });

    failNext("tasks", "update", "Second Owner update failed.", "task-research");
    fireEvent.click(screen.getByRole("button", { name: "Remove Maya" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Could not remove member. Second Owner update failed.",
    );
    expect(supabaseState.mutationTrace).toContainEqual(
      expect.objectContaining({
        table: "tasks",
        operation: "update",
        id: "task-kernels",
        outcome: "success",
      }),
    );
    expect(supabaseState.mutationTrace).toContainEqual(
      expect.objectContaining({
        table: "tasks",
        operation: "update",
        id: "task-research",
        outcome: "error",
      }),
    );
    expect(supabaseState.mutationTrace.some((entry) => (
      entry.table === "members" && entry.operation === "delete"
    ))).toBe(false);

    await act(async () => {
      slowRealtime.resolve();
      await slowRealtime.promise;
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Could not remove member. Second Owner update failed.",
      );
    });
    expect(screen.getByRole("button", { name: "Remove Maya" })).toBeDefined();
  });

  it("keeps the Team draft and reports a failed add-member write", async () => {
    failNext("members", "insert", "Owner insert failed.");
    await renderLoadedBoard();
    fireEvent.click(screen.getByRole("tab", { name: "Team" }));
    fireEvent.change(screen.getByLabelText("New owner name"), {
      target: { value: "Nova" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not add owner. Owner insert failed.",
    );
    expect(screen.getByLabelText("New owner name")).toHaveProperty(
      "value",
      "Nova",
    );
    expect(screen.queryByRole("button", { name: "Remove Nova" })).toBeNull();
  });

  it("creates generic Tasks through the adapter and keeps failed drafts visible", async () => {
    await renderLoadedBoard();
    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "New generic task" },
    });
    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "type-research" },
    });
    fireEvent.change(screen.getByLabelText("Tags"), {
      target: { value: "NPU, npu, RL" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Maya" }));
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(supabaseState.mutationTrace).toContainEqual(
        expect.objectContaining({
          table: "tasks",
          operation: "insert",
          payload: expect.objectContaining({
            module_id: "type-research",
            title: "New generic task",
            status: "todo",
            assignees: ["Maya"],
            tags: ["NPU", "RL"],
            priority: "medium",
            due_date: null,
          }),
          outcome: "success",
        }),
      );
    });
    expect(screen.queryByRole("dialog", { name: "Create task" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "New generic task" }),
    ).toBeDefined();

    failNext("tasks", "insert", "Create failed.");
    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Retained failed task" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => {
      const messages = screen.getAllByRole("alert")
        .map((element) => element.textContent ?? "");
      expect(messages.some((message) => (
        message.includes("Could not create task. Create failed.")
      ))).toBe(true);
    });
    expect(screen.getByLabelText("Task title")).toHaveProperty(
      "value",
      "Retained failed task",
    );
  });

  it("selects the checked inserted Type id in the retained task draft", async () => {
    await renderLoadedBoard();
    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Document the verifier" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create type" }));
    fireEvent.change(screen.getByLabelText("New type name"), {
      target: { value: "Documentation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add type" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Type")).toHaveProperty(
        "value",
        "modules-100",
      );
    });
    expect(screen.getByLabelText("Task title")).toHaveProperty(
      "value",
      "Document the verifier",
    );
  });

  it("ignores an older realtime row response that resolves last", async () => {
    await renderLoadedBoard();
    const staleReload = deferred();
    supabaseState.readDelays.push(
      staleReload.promise,
      staleReload.promise,
      staleReload.promise,
    );
    const readsBefore = supabaseState.readTrace.length;
    const taskHandler = supabaseState.handlers.find(
      ({ table }) => table === "tasks",
    );
    act(() => {
      taskHandler?.callback({});
    });
    await waitFor(() => {
      expect(supabaseState.readTrace.length).toBe(readsBefore + 3);
    });

    supabaseState.tables.tasks = supabaseState.tables.tasks.map((row) => (
      row.id === "task-kernels"
        ? { ...row, title: "Newest kernel validation" }
        : row
    ));
    act(() => {
      taskHandler?.callback({});
    });
    expect(await screen.findByRole("link", {
      name: "Newest kernel validation",
    })).toBeDefined();

    await act(async () => {
      staleReload.resolve();
      await staleReload.promise;
      await Promise.resolve();
    });
    expect(screen.getByRole("link", {
      name: "Newest kernel validation",
    })).toBeDefined();
    expect(screen.queryByRole("link", {
      name: "Validate NPU kernels",
    })).toBeNull();
  });

  it("does not let an older successful reload clear a newer load error", async () => {
    await renderLoadedBoard();
    const staleReload = deferred();
    supabaseState.readDelays.push(
      staleReload.promise,
      staleReload.promise,
      staleReload.promise,
    );
    const readsBefore = supabaseState.readTrace.length;
    const taskHandler = supabaseState.handlers.find(
      ({ table }) => table === "tasks",
    );
    act(() => {
      taskHandler?.callback({});
    });
    await waitFor(() => {
      expect(supabaseState.readTrace.length).toBe(readsBefore + 3);
    });

    failNextRead("modules", "Newest reload failed.");
    act(() => {
      taskHandler?.callback({});
    });
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not load board. Newest reload failed.",
    );

    await act(async () => {
      staleReload.resolve();
      await staleReload.promise;
      await Promise.resolve();
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "Could not load board. Newest reload failed.",
    );
  });

  it("preserves three-table realtime reload and channel cleanup", async () => {
    const { unmount } = await renderLoadedBoard();
    expect(supabaseState.handlers.map(({ table }) => table)).toEqual([
      "modules",
      "tasks",
      "members",
    ]);

    supabaseState.tables.tasks = supabaseState.tables.tasks.map((row) => (
      row.id === "task-kernels"
        ? { ...row, title: "Realtime kernel validation" }
        : row
    ));
    const taskHandler = supabaseState.handlers.find(
      ({ table }) => table === "tasks",
    );
    act(() => {
      taskHandler?.callback({});
    });
    expect(await screen.findByRole("link", {
      name: "Realtime kernel validation",
    })).toBeDefined();

    unmount();
    expect(supabaseState.removeChannel).toHaveBeenCalledOnce();
  });
});
