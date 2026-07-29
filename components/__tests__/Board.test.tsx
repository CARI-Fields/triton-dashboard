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
import type { Member, Module, Task } from "@/lib/types";
import Board from "@/components/Board";

interface QueryError {
  message: string;
  details: string;
  hint: string;
  code: string;
}

interface QueryResult<T = unknown> {
  data: T;
  error: QueryError | null;
}

interface RealtimeHandler {
  table: string;
  callback: (payload: {
    eventType: "INSERT" | "UPDATE" | "DELETE";
    new: Record<string, unknown>;
    old: Record<string, unknown>;
  }) => void;
}

const supabaseState = vi.hoisted(() => ({
  queues: new Map<string, Promise<QueryResult>[]>(),
  activityResponses: [] as Promise<string | null>[],
  fromCalls: [] as string[],
  handlers: [] as RealtimeHandler[],
  removeChannel: vi.fn(),
}));

vi.mock("@/lib/activity", () => ({
  logActivity: vi.fn(() => (
    supabaseState.activityResponses.shift() ?? Promise.resolve(null)
  )),
}));

vi.mock("@/lib/supabase", () => {
  const client = {
    from: vi.fn((table: string) => {
      supabaseState.fromCalls.push(table);
      const response = supabaseState.queues.get(table)?.shift();
      if (!response) throw new Error(`No ${table} query result was queued.`);
      const builder: Record<string, unknown> = {};
      for (const method of [
        "select",
        "order",
        "eq",
        "single",
        "insert",
        "update",
        "delete",
      ]) {
        builder[method] = vi.fn(() => builder);
      }
      builder.then = response.then.bind(response);
      return builder;
    }),
    channel: vi.fn(() => {
      const channel = {
        on: vi.fn((
          _kind: string,
          config: { table: string },
          callback: RealtimeHandler["callback"],
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
  return { isSupabaseConfigured: true, supabase: client };
});

const moduleRow = {
  id: "00000000-0000-4000-8000-000000000011",
  name: "Kernel work",
  kind: "pipeline",
  objective: "",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
} satisfies Module;

const alice = {
  id: "00000000-0000-4000-8000-000000000021",
  name: "Alice",
  initials: "AL",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
} satisfies Member;

const task = {
  id: "00000000-0000-4000-8000-000000000010",
  module_id: moduleRow.id,
  title: "Task A",
  status: "todo",
  assignees: [],
  notes: "",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T00:00:00.000Z",
} satisfies Task;

function ok<T>(data: T): QueryResult<T> {
  return { data, error: null };
}

function failure(message: string): QueryResult<null> {
  return {
    data: null,
    error: { message, details: "", hint: "", code: "TEST_ERROR" },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function enqueue(table: string, result: QueryResult | Promise<QueryResult>) {
  const queue = supabaseState.queues.get(table) ?? [];
  queue.push(Promise.resolve(result));
  supabaseState.queues.set(table, queue);
}

function taskRow(nextTask: Task, members: Member[]) {
  return {
    ...nextTask,
    task_assignees: nextTask.assignees.map((name) => {
      const assigned = members.find((candidate) => candidate.name === name);
      if (!assigned) throw new Error(`Missing Member fixture for ${name}.`);
      return {
        member_id: assigned.id,
        member: { name: assigned.name },
      };
    }),
  };
}

function enqueueBoardLoad(
  nextTask: Task = task,
  members: Member[] = [alice],
) {
  enqueue("modules", ok([moduleRow]));
  enqueue("tasks", ok([taskRow(nextTask, members)]));
  enqueue("members", ok(members));
}

function triggerRealtime(
  table: string,
  eventType: "INSERT" | "UPDATE" | "DELETE",
  next: Record<string, unknown>,
  old: Record<string, unknown> = {},
) {
  const handler = supabaseState.handlers.find(
    (candidate) => candidate.table === table,
  );
  if (!handler) throw new Error(`No ${table} realtime handler registered.`);
  act(() => {
    handler.callback({ eventType, new: next, old });
  });
}

async function openAssigneePicker() {
  await screen.findByText("Task A");
  fireEvent.click(screen.getByRole("button", { name: "Assign people" }));
}

beforeEach(() => {
  supabaseState.queues.clear();
  supabaseState.activityResponses.length = 0;
  supabaseState.fromCalls.length = 0;
  supabaseState.handlers.length = 0;
  supabaseState.removeChannel.mockClear();
});

afterEach(cleanup);

describe("Board UUID assignment errors", () => {
  it.each([
    {
      name: "assign",
      initialTask: task,
      action: async () => {
        await openAssigneePicker();
        fireEvent.click(
          within(screen.getByRole("menu"))
            .getByRole("button", { name: /Alice$/ }),
        );
      },
    },
    {
      name: "unassign",
      initialTask: { ...task, assignees: ["Alice"] },
      action: async () => {
        await screen.findByRole("button", { name: "Unassign Alice" });
        fireEvent.click(screen.getByRole("button", { name: "Unassign Alice" }));
      },
    },
  ])("captures a failed $name without starting a reload", async ({
    initialTask,
    action,
  }) => {
    enqueueBoardLoad(initialTask);
    enqueue("task_assignees", failure("assignment denied"));
    render(<Board />);

    await action();

    expect(await screen.findByText(/assignment denied/)).toBeDefined();
    expect(supabaseState.fromCalls.filter((table) => table === "tasks"))
      .toHaveLength(1);
  });

  it("captures add-teammate assignment failure", async () => {
    const cara = {
      ...alice,
      id: "00000000-0000-4000-8000-000000000022",
      name: "Cara",
      initials: "CA",
    };
    enqueueBoardLoad(task, []);
    enqueue("members", ok(cara));
    enqueue("task_assignees", failure("new teammate assignment denied"));
    render(<Board />);
    await openAssigneePicker();

    const menu = screen.getByRole("menu");
    fireEvent.change(within(menu).getByPlaceholderText("Add teammate…"), {
      target: { value: "Cara" },
    });
    fireEvent.click(within(menu).getByRole("button", { name: "Add" }));

    expect(await screen.findByText(/new teammate assignment denied/))
      .toBeDefined();
    expect(supabaseState.fromCalls.filter((table) => table === "tasks"))
      .toHaveLength(1);
  });

  it("keeps an add-and-assign error visible after an earlier realtime reload finishes", async () => {
    const cara = {
      ...alice,
      id: "00000000-0000-4000-8000-000000000022",
      name: "Cara",
      initials: "CA",
    };
    const assignment = deferred<QueryResult>();
    const backgroundModules = deferred<QueryResult<Module[]>>();
    enqueueBoardLoad(task, []);
    enqueue("members", ok(cara));
    enqueue("task_assignees", assignment.promise);
    enqueue("modules", backgroundModules.promise);
    enqueue("tasks", ok([taskRow(task, [cara])]));
    enqueue("members", ok([cara]));
    render(<Board />);
    await openAssigneePicker();

    const menu = screen.getByRole("menu");
    fireEvent.change(within(menu).getByPlaceholderText("Add teammate…"), {
      target: { value: "Cara" },
    });
    fireEvent.click(within(menu).getByRole("button", { name: "Add" }));
    await waitFor(() => {
      expect(supabaseState.fromCalls.filter(
        (table) => table === "task_assignees",
      )).toHaveLength(1);
    });

    triggerRealtime("members", "INSERT", cara);
    await waitFor(() => {
      expect(supabaseState.fromCalls.filter((table) => table === "modules"))
        .toHaveLength(2);
    });

    act(() => {
      assignment.resolve(failure("new teammate assignment denied"));
    });
    expect(await screen.findByText(/new teammate assignment denied/))
      .toBeDefined();

    act(() => {
      backgroundModules.resolve(ok([moduleRow]));
    });
    expect(await within(screen.getByRole("menu")).findByRole(
      "button",
      { name: /Cara$/ },
    )).toBeDefined();
    expect(screen.getByText(/new teammate assignment denied/)).toBeDefined();
  });

  it("ignores an older reload failure after a newer assignment error", async () => {
    const oldModules = deferred<QueryResult>();
    enqueueBoardLoad();
    render(<Board />);
    await openAssigneePicker();

    enqueue("modules", oldModules.promise);
    enqueue("tasks", ok([taskRow(task, [alice])]));
    enqueue("members", ok([alice]));
    triggerRealtime("members", "UPDATE", alice);

    enqueue("task_assignees", failure("newer assignment denied"));
    fireEvent.click(
      within(screen.getByRole("menu"))
        .getByRole("button", { name: /Alice$/ }),
    );
    expect(await screen.findByText(/newer assignment denied/)).toBeDefined();

    await act(async () => {
      oldModules.resolve(failure("older reload denied"));
      await oldModules.promise;
    });

    expect(screen.getByText(/newer assignment denied/)).toBeDefined();
    expect(screen.queryByText(/older reload denied/)).toBeNull();
  });

  it("ignores stale reload data and success after a newer reload fails", async () => {
    const oldModules = deferred<QueryResult<Module[]>>();
    const staleTask = { ...task, title: "Stale Task from reload A" };
    enqueueBoardLoad();
    render(<Board />);
    await screen.findByText("Task A");

    enqueue("modules", oldModules.promise);
    enqueue("tasks", ok([taskRow(staleTask, [alice])]));
    enqueue("members", ok([alice]));
    triggerRealtime("members", "UPDATE", alice);

    enqueue("modules", failure("reload B denied"));
    enqueue("tasks", ok([taskRow(task, [alice])]));
    enqueue("members", ok([alice]));
    triggerRealtime("tasks", "UPDATE", task);
    expect(await screen.findByText(/reload B denied/)).toBeDefined();

    await act(async () => {
      oldModules.resolve(ok([moduleRow]));
      await oldModules.promise;
    });

    expect(screen.getByText(/reload B denied/)).toBeDefined();
    expect(screen.queryByText("Stale Task from reload A")).toBeNull();
    expect(screen.getByText("Task A")).toBeDefined();
  });

  it("does not let an old activity failure overwrite a newer action error", async () => {
    const oldActivity = deferred<string | null>();
    enqueueBoardLoad();
    supabaseState.activityResponses.push(oldActivity.promise);
    render(<Board />);
    await screen.findByText("Task A");

    enqueue("tasks", ok(null));
    enqueueBoardLoad({ ...task, status: "done" });
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "done" },
    });
    await waitFor(() => {
      expect(
        (screen.getByRole("combobox", { name: "Status" }) as HTMLSelectElement)
          .value,
      ).toBe("done");
    });

    enqueue("task_assignees", failure("newer assignment denied"));
    await openAssigneePicker();
    fireEvent.click(
      within(screen.getByRole("menu"))
        .getByRole("button", { name: /Alice$/ }),
    );
    expect(await screen.findByText(/newer assignment denied/)).toBeDefined();

    await act(async () => {
      oldActivity.resolve("older status activity denied");
      await oldActivity.promise;
    });

    expect(screen.getByText(/newer assignment denied/)).toBeDefined();
    expect(screen.queryByText(/older status activity denied/)).toBeNull();
  });

  it("does not revive an old activity failure after a newer action succeeds", async () => {
    const oldActivity = deferred<string | null>();
    enqueueBoardLoad();
    supabaseState.activityResponses.push(oldActivity.promise);
    render(<Board />);
    await screen.findByText("Task A");

    enqueue("tasks", ok(null));
    enqueueBoardLoad({ ...task, status: "done" });
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "done" },
    });
    await waitFor(() => {
      expect(
        (screen.getByRole("combobox", { name: "Status" }) as HTMLSelectElement)
          .value,
      ).toBe("done");
    });

    supabaseState.activityResponses.push(Promise.resolve(null));
    enqueue("task_assignees", ok(null));
    enqueueBoardLoad({ ...task, status: "done", assignees: ["Alice"] });
    await openAssigneePicker();
    fireEvent.click(
      within(screen.getByRole("menu"))
        .getByRole("button", { name: /Alice$/ }),
    );
    expect(await screen.findByRole("button", { name: "Unassign Alice" }))
      .toBeDefined();

    await act(async () => {
      oldActivity.resolve("older status activity denied");
      await oldActivity.promise;
    });

    expect(screen.queryByText(/older status activity denied/)).toBeNull();
    expect(document.querySelector(".error-banner")).toBeNull();
  });

  it("keeps an unassign error when adding the already assigned teammate is a no-op", async () => {
    const assignedTask = { ...task, assignees: ["Alice"] };
    enqueueBoardLoad(assignedTask);
    enqueue("task_assignees", failure("unassignment denied"));
    render(<Board />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Unassign Alice" }),
    );
    expect(await screen.findByText(/unassignment denied/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Assign people" }));
    const menu = screen.getByRole("menu");
    fireEvent.change(within(menu).getByPlaceholderText("Add teammate…"), {
      target: { value: "Alice" },
    });
    const callsBeforeNoOp = [...supabaseState.fromCalls];
    enqueueBoardLoad(assignedTask);
    await act(async () => {
      fireEvent.click(within(menu).getByRole("button", { name: "Add" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/unassignment denied/)).toBeDefined();
    expect(supabaseState.fromCalls).toEqual(callsBeforeNoOp);
  });

  it("clears a load error after a later successful realtime reload", async () => {
    enqueue("modules", failure("board load denied"));
    enqueue("tasks", ok([taskRow(task, [alice])]));
    enqueue("members", ok([alice]));
    render(<Board />);

    expect(await screen.findByText(/board load denied/)).toBeDefined();

    enqueueBoardLoad();
    triggerRealtime("members", "UPDATE", alice);

    await screen.findByText("Task A");
    await waitFor(() => {
      expect(screen.queryByText(/board load denied/)).toBeNull();
    });
  });

  it("clears an old assignment error when the next assignment succeeds", async () => {
    enqueueBoardLoad();
    enqueue("task_assignees", failure("first assignment denied"));
    render(<Board />);
    await openAssigneePicker();

    fireEvent.click(
      within(screen.getByRole("menu"))
        .getByRole("button", { name: /Alice$/ }),
    );
    expect(await screen.findByText(/first assignment denied/)).toBeDefined();

    enqueue("task_assignees", ok(null));
    enqueueBoardLoad({ ...task, assignees: ["Alice"] });
    fireEvent.click(
      within(screen.getByRole("menu"))
        .getByRole("button", { name: /Alice$/ }),
    );

    expect(await screen.findByRole("button", { name: "Unassign Alice" }))
      .toBeDefined();
    expect(screen.queryByText(/first assignment denied/)).toBeNull();
  });

  it("clears an old action error when a status mutation succeeds", async () => {
    enqueueBoardLoad();
    enqueue("task_assignees", failure("assignment denied before status change"));
    render(<Board />);
    await openAssigneePicker();

    fireEvent.click(
      within(screen.getByRole("menu"))
        .getByRole("button", { name: /Alice$/ }),
    );
    expect(await screen.findByText(/assignment denied before status change/))
      .toBeDefined();

    enqueue("tasks", ok(null));
    enqueueBoardLoad({ ...task, status: "done" });
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "done" },
    });

    await waitFor(() => {
      expect(
        (screen.getByRole("combobox", { name: "Status" }) as HTMLSelectElement)
          .value,
      ).toBe("done");
    });
    expect(screen.queryByText(/assignment denied before status change/))
      .toBeNull();
  });

  it("shows a newer load failure instead of an older action error", async () => {
    enqueueBoardLoad();
    enqueue("task_assignees", failure("older assignment denied"));
    render(<Board />);
    await openAssigneePicker();

    fireEvent.click(
      within(screen.getByRole("menu"))
        .getByRole("button", { name: /Alice$/ }),
    );
    expect(await screen.findByText(/older assignment denied/)).toBeDefined();

    enqueue("modules", failure("newer board reload denied"));
    enqueue("tasks", ok([taskRow(task, [alice])]));
    enqueue("members", ok([alice]));
    triggerRealtime("members", "UPDATE", alice);

    expect(await screen.findByText(/newer board reload denied/)).toBeDefined();
    expect(screen.queryByText(/older assignment denied/)).toBeNull();
  });

  it("reloads after a successful UUID assignment", async () => {
    enqueueBoardLoad();
    enqueue("task_assignees", ok(null));
    enqueueBoardLoad({ ...task, assignees: ["Alice"] });
    render(<Board />);
    await openAssigneePicker();

    fireEvent.click(
      within(screen.getByRole("menu"))
        .getByRole("button", { name: /Alice$/ }),
    );

    expect(await screen.findByRole("button", { name: "Unassign Alice" }))
      .toBeDefined();
    await waitFor(() => {
      expect(supabaseState.fromCalls.filter((table) => table === "tasks"))
        .toHaveLength(2);
    });
  });
});
