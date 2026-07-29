import {
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

const supabaseState = vi.hoisted(() => ({
  queues: new Map<string, Promise<QueryResult>[]>(),
  fromCalls: [] as string[],
  removeChannel: vi.fn(),
}));

vi.mock("@/lib/activity", () => ({
  logActivity: vi.fn().mockResolvedValue(null),
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
        on: vi.fn(() => channel),
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

async function openAssigneePicker() {
  await screen.findByText("Task A");
  fireEvent.click(screen.getByRole("button", { name: "Assign people" }));
}

beforeEach(() => {
  supabaseState.queues.clear();
  supabaseState.fromCalls.length = 0;
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
