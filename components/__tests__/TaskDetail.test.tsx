import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Activity,
  Attachment,
  Experiment,
  Member,
  Module,
  Task,
} from "@/lib/types";
import TaskDetail from "@/components/TaskDetail";

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
  channelName: string;
  config: {
    event: string;
    schema: string;
    table: string;
    filter?: string;
  };
  callback: (payload: RealtimePayload) => void;
}

interface RealtimePayload {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}

interface MutationCall {
  table: string;
  kind: "update" | "insert" | "delete";
  payload: unknown;
}

interface QueryTrace {
  table: string;
  operation: "select" | "update" | "insert" | "delete";
  filters: Array<["eq" | "is", string, unknown]>;
}

const routerPush = vi.hoisted(() => vi.fn());

const supabaseState = vi.hoisted(() => ({
  queues: new Map<string, Promise<QueryResult>[]>(),
  handlers: [] as RealtimeHandler[],
  fromCalls: [] as string[],
  mutations: [] as MutationCall[],
  queryTraces: [] as QueryTrace[],
  orderCalls: [] as Array<{
    table: string;
    column: string;
    options: { ascending?: boolean } | undefined;
  }>,
  removeChannel: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock("@/lib/supabase", () => {
  const client = {
    from: vi.fn((table: string) => {
      supabaseState.fromCalls.push(table);
      const response = supabaseState.queues.get(table)?.shift();
      if (!response) {
        throw new Error(`No ${table} query result was queued.`);
      }
      const trace: QueryTrace = {
        table,
        operation: "select",
        filters: [],
      };
      supabaseState.queryTraces.push(trace);
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn((column: string, value: unknown) => {
        trace.filters.push(["eq", column, value]);
        return builder;
      });
      builder.is = vi.fn((column: string, value: unknown) => {
        trace.filters.push(["is", column, value]);
        return builder;
      });
      builder.maybeSingle = vi.fn(() => builder);
      builder.single = vi.fn(() => builder);
      builder.order = vi.fn((
        column: string,
        options?: { ascending?: boolean },
      ) => {
        supabaseState.orderCalls.push({ table, column, options });
        return builder;
      });
      for (const kind of ["update", "insert", "delete"] as const) {
        builder[kind] = vi.fn((payload?: unknown) => {
          trace.operation = kind;
          supabaseState.mutations.push({ table, kind, payload });
          return builder;
        });
      }
      builder.then = response.then.bind(response);
      return builder;
    }),
    channel: vi.fn((channelName: string) => {
      const channel = {
        on: vi.fn((
          _kind: string,
          config: RealtimeHandler["config"],
          callback: RealtimeHandler["callback"],
        ) => {
          supabaseState.handlers.push({
            channelName,
            config: { ...config },
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

const taskA = {
  id: "00000000-0000-4000-8000-000000000010",
  module_id: "00000000-0000-4000-8000-000000000011",
  title: "Task A",
  status: "in_progress",
  assignees: [],
  notes: "A notes",
  tags: [],
  priority: "medium",
  due_date: null,
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T00:00:00.000Z",
} satisfies Task;

const taskB = {
  ...taskA,
  id: "00000000-0000-4000-8000-000000000030",
  title: "Task B",
} satisfies Task;

const moduleRow = {
  id: taskA.module_id,
  name: "Kernel work",
  kind: "pipeline",
  objective: "",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
} satisfies Module;

const member = {
  id: "00000000-0000-4000-8000-000000000020",
  name: "Bruce",
  initials: "BX",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
} satisfies Member;

const alice = {
  ...member,
  id: "00000000-0000-4000-8000-000000000021",
  name: "Alice",
  initials: "AL",
} satisfies Member;

const bob = {
  ...member,
  id: "00000000-0000-4000-8000-000000000022",
  name: "Bob",
  initials: "BO",
} satisfies Member;

const nova = {
  ...member,
  id: "00000000-0000-4000-8000-000000000023",
  name: "Nova",
  initials: "N",
  position: 1,
} satisfies Member;

const taskAttachment = {
  id: "attachment-task-a",
  task_id: taskA.id,
  experiment_id: null,
  url: "https://example.test/task-attachment.png",
  path: `${taskA.id}/task/task-attachment.png`,
  caption: "",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
} satisfies Attachment;

function experiment(name: string): Experiment {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    experiment_no: 1,
    task_id: taskA.id,
    owner_id: member.id,
    name,
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
    metrics: {},
    featured_metric_keys: [],
    result_summary: "",
    decision_outcome: null,
    decision_notes: "",
    notes: "",
    position: 0,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-24T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
  };
}

function activity(text: string): Activity {
  return {
    id: `activity-${text}`,
    task_id: taskA.id,
    experiment_id: null,
    text,
    kind: "comment",
    created_at: "2026-07-24T00:00:00.000Z",
  };
}

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
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function enqueue(table: string, result: QueryResult | Promise<QueryResult>) {
  const queue = supabaseState.queues.get(table) ?? [];
  queue.push(Promise.resolve(result));
  supabaseState.queues.set(table, queue);
}

function enqueueRelated(
  experiments: Experiment[] = [],
  activities: Activity[] = [],
  members: Member[] = [member],
  attachments: Attachment[] = [],
) {
  enqueue("modules", ok([moduleRow]));
  enqueue("experiments", ok(experiments));
  enqueue("members", ok(members));
  enqueue("attachments", ok(attachments));
  enqueue("activity", ok(activities));
}

function enqueueLoad(
  task: Task,
  experiments: Experiment[] = [],
  activities: Activity[] = [],
  members: Member[] = [member],
  attachments: Attachment[] = [],
) {
  enqueue("tasks", ok(task));
  enqueueRelated(experiments, activities, members, attachments);
}

function taskUpdates() {
  return supabaseState.mutations.filter(
    (call) => call.table === "tasks" && call.kind === "update",
  );
}

function activityInserts() {
  return supabaseState.mutations.filter(
    (call) => call.table === "activity" && call.kind === "insert",
  );
}

function trigger(
  channelName: string,
  table: string,
  eventType: RealtimePayload["eventType"] = "UPDATE",
  next: Record<string, unknown> = table === "tasks"
    ? { id: taskA.id }
    : { id: `${table}-row`, task_id: taskA.id },
  old: Record<string, unknown> = {},
) {
  const payload = { eventType, new: next, old };
  const handlers = supabaseState.handlers.filter((candidate) => {
    if (
      candidate.channelName !== channelName
      || candidate.config.table !== table
      || (
        candidate.config.event !== "*"
        && candidate.config.event !== eventType
      )
    ) {
      return false;
    }
    if (!candidate.config.filter) return true;
    const match = /^([^=]+)=eq\.(.*)$/.exec(candidate.config.filter);
    if (!match) throw new Error(`Unsupported filter: ${candidate.config.filter}`);
    const row = eventType === "DELETE" ? old : next;
    return String(row[match[1]]) === match[2];
  });
  if (handlers.length === 0) return;
  act(() => {
    for (const handler of handlers) handler.callback(payload);
  });
}

beforeEach(() => {
  supabaseState.queues.clear();
  supabaseState.handlers.length = 0;
  supabaseState.fromCalls.length = 0;
  supabaseState.mutations.length = 0;
  supabaseState.queryTraces.length = 0;
  supabaseState.orderCalls.length = 0;
  supabaseState.removeChannel.mockClear();
  routerPush.mockClear();
});

afterEach(cleanup);

describe("TaskDetail orchestration", () => {
  it("uses a labelled record skeleton for the initial Task load", async () => {
    const pending = deferred<QueryResult>();
    enqueue("tasks", pending.promise);
    const view = render(<TaskDetail id={taskA.id} />);

    const skeleton = screen.getByRole("status", {
      name: "Loading Task",
    });
    expect(skeleton.classList).toContain("workspace-skeleton-record");
    expect(skeleton.querySelectorAll(".skeleton-record i")).toHaveLength(13);
    expect(screen.queryByText("Loading task…")).toBeNull();

    view.unmount();
    await act(async () => pending.resolve(ok(taskA)));
  });

  it("loads and renders only Task-level attachments", async () => {
    enqueueLoad(taskA, [], [], [member], [taskAttachment]);

    render(<TaskDetail id={taskA.id} />);

    expect(await screen.findByRole("link", {
      name: "Open Task attachment",
    })).toBeDefined();
    expect(supabaseState.queryTraces).toContainEqual({
      table: "attachments",
      operation: "select",
      filters: [
        ["eq", "task_id", taskA.id],
        ["is", "experiment_id", null],
      ],
    });
  });

  it("renders a document record with a dedicated Activity rail", async () => {
    enqueueLoad(taskA);

    const { container } = render(<TaskDetail id={taskA.id} />);

    expect(await screen.findByRole("link", { name: "← Task Board" }))
      .toBeDefined();
    const recordMain = container.querySelector(".record-main");
    expect(recordMain?.tagName).toBe("DIV");
    expect(container.querySelector("main")).toBeNull();
    expect(screen.getByRole("heading", { name: "Description" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Experiments" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Attachments" })).toBeDefined();
    expect(screen.getByRole("complementary", { name: "Task activity" }))
      .toBeDefined();
    expect(screen.getByRole("heading", { name: "Activity" })).toBeDefined();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(screen.queryByText("Module")).toBeNull();
    expect(screen.queryByText(/Assignee/)).toBeNull();
  });

  it("maps domain property patches back to compatibility storage fields", async () => {
    enqueueLoad(taskA);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    enqueue("tasks", ok(null));
    enqueueLoad({ ...taskA, module_id: null });
    fireEvent.change(screen.getByLabelText("Task type"), {
      target: { value: "" },
    });
    await waitFor(() => expect(
      (screen.getByLabelText("Task type") as HTMLSelectElement).value,
    ).toBe(""));

    enqueue("tasks", ok(null));
    enqueueLoad({ ...taskA, module_id: null, tags: ["NPU"] });
    const tags = screen.getByLabelText("Task tags");
    fireEvent.change(tags, { target: { value: "NPU" } });
    fireEvent.keyDown(tags, { key: "Enter" });
    await screen.findByText("NPU");

    enqueue("tasks", ok(null));
    enqueueLoad({
      ...taskA,
      module_id: null,
      tags: ["NPU"],
      priority: "high",
    });
    fireEvent.change(screen.getByLabelText("Task priority"), {
      target: { value: "high" },
    });
    await waitFor(() => expect(
      (screen.getByLabelText("Task priority") as HTMLSelectElement).value,
    ).toBe("high"));

    enqueue("tasks", ok(null));
    enqueueLoad({
      ...taskA,
      module_id: null,
      tags: ["NPU"],
      priority: "high",
      due_date: "2026-08-15",
    });
    fireEvent.change(screen.getByLabelText("Task due date"), {
      target: { value: "2026-08-15" },
    });
    await waitFor(() => expect(
      (screen.getByLabelText("Task due date") as HTMLInputElement).value,
    ).toBe("2026-08-15"));

    expect(taskUpdates().map((call) => call.payload)).toEqual([
      { module_id: null },
      { tags: ["NPU"] },
      { priority: "high" },
      { due_date: "2026-08-15" },
    ]);
    expect(taskUpdates()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        typeId: expect.anything(),
        owners: expect.anything(),
        dueDate: expect.anything(),
      }),
    ]));
  });

  it("orders equal-position Task experiments by stable Experiment identity", async () => {
    const first = experiment("First stable");
    const second = {
      ...experiment("Second stable"),
      id: "00000000-0000-4000-8000-000000000002",
      experiment_no: 2,
    };
    enqueueLoad(taskA, [second, first]);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByText("First stable");

    expect(supabaseState.orderCalls.filter(({ table }) => table === "experiments"))
      .toEqual([
        { table: "experiments", column: "position", options: undefined },
        {
          table: "experiments",
          column: "experiment_no",
          options: { ascending: true },
        },
      ]);
  });

  it("recovers a missing Task when that exact UUID is inserted later", async () => {
    enqueue("tasks", ok(null));
    render(<TaskDetail id={taskA.id} />);
    expect(await screen.findByText(/Task not found/)).toBeDefined();

    enqueueLoad(taskA, [experiment("Inserted recovery")]);
    trigger(
      `task-${taskA.id}`,
      "tasks",
      "INSERT",
      { id: taskA.id },
    );

    expect(await screen.findByText("Inserted recovery")).toBeDefined();
    expect(screen.queryByText(/Task not found/)).toBeNull();
  });

  it("ignores unrelated Task inserts and stale recovery loads after navigation", async () => {
    enqueue("tasks", ok(null));
    const view = render(<TaskDetail id={taskA.id} />);
    expect(await screen.findByText(/Task not found/)).toBeDefined();
    const taskQueryCount = supabaseState.fromCalls.filter(
      (table) => table === "tasks",
    ).length;
    trigger(
      `task-${taskA.id}`,
      "tasks",
      "INSERT",
      { id: taskB.id },
    );
    expect(supabaseState.fromCalls.filter((table) => table === "tasks"))
      .toHaveLength(taskQueryCount);

    const staleRecovery = deferred<QueryResult>();
    enqueue("tasks", staleRecovery.promise);
    trigger(
      `task-${taskA.id}`,
      "tasks",
      "INSERT",
      { id: taskA.id },
    );
    enqueueLoad(taskB);
    view.rerender(<TaskDetail id={taskB.id} />);
    expect(await screen.findByRole("button", { name: "Task B" })).toBeDefined();

    await act(async () => staleRecovery.resolve(ok(taskA)));
    expect(screen.getByRole("button", { name: "Task B" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Task A" })).toBeNull();
  });

  it("distinguishes a query failure from not-found and performs one visible retry", async () => {
    enqueue("tasks", failure("Database offline."));
    render(<TaskDetail id={taskA.id} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load task.");
    expect(alert.textContent).toContain("Database offline.");
    expect(screen.queryByText(/Task not found/)).toBeNull();

    const retryTask = deferred<QueryResult>();
    enqueue("tasks", retryTask.promise);
    enqueueRelated([experiment("Recovered run")], [activity("Recovered activity")]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    const retrying = screen.getByRole("button", { name: "Retrying…" });
    expect((retrying as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(retrying);
    expect(supabaseState.fromCalls.filter((table) => table === "tasks")).toHaveLength(2);

    await act(async () => retryTask.resolve(ok(taskA)));
    expect(await screen.findByText("Recovered run")).toBeDefined();
    expect(screen.getByText("Recovered activity")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the newest Realtime snapshot when an older success or error settles later", async () => {
    enqueueLoad(taskA, [experiment("Initial run")], [activity("Initial activity")]);
    render(<TaskDetail id={taskA.id} />);
    expect(await screen.findByText("Initial run")).toBeDefined();

    const olderSuccess = deferred<QueryResult>();
    enqueue("tasks", olderSuccess.promise);
    trigger(`task-${taskA.id}`, "experiments");

    enqueueLoad(
      { ...taskA, title: "Newest Task A" },
      [experiment("Newest run")],
      [activity("Newest activity")],
    );
    trigger(`task-${taskA.id}`, "activity");
    expect(await screen.findByText("Newest run")).toBeDefined();

    await act(async () => olderSuccess.resolve(ok({
      ...taskA,
      title: "Stale Task A",
    })));
    expect(screen.getByText("Newest run")).toBeDefined();
    expect(screen.getByText("Newest activity")).toBeDefined();
    expect(screen.queryByText("Stale Task A")).toBeNull();

    const olderError = deferred<QueryResult>();
    enqueue("tasks", olderError.promise);
    trigger(`task-${taskA.id}`, "experiments");
    enqueueLoad(
      { ...taskA, title: "Newest again" },
      [experiment("Newest again run")],
    );
    trigger(`task-${taskA.id}`, "activity");
    expect(await screen.findByText("Newest again run")).toBeDefined();

    await act(async () => olderError.resolve(failure("Stale refresh failed.")));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Newest again run")).toBeDefined();
  });

  it("preserves the last-good Task when the latest refresh fails and can retry it", async () => {
    enqueueLoad(taskA, [experiment("Last-good run")]);
    render(<TaskDetail id={taskA.id} />);
    expect(await screen.findByText("Last-good run")).toBeDefined();

    enqueue("tasks", failure("Realtime database offline."));
    trigger(`task-${taskA.id}`, "experiments");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not refresh task.");
    expect(alert.textContent).toContain("Realtime database offline.");
    expect(screen.getByText("Last-good run")).toBeDefined();

    enqueueLoad(
      { ...taskA, title: "Refreshed Task A" },
      [experiment("Refreshed run")],
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Refreshed run")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("re-enables Retry when a newer Realtime refresh supersedes a pending retry", async () => {
    enqueueLoad(taskA, [experiment("Last-good run")]);
    render(<TaskDetail id={taskA.id} />);
    expect(await screen.findByText("Last-good run")).toBeDefined();

    enqueue("tasks", failure("First refresh failed."));
    trigger(`task-${taskA.id}`, "experiments");
    await screen.findByRole("button", { name: "Retry" });

    const staleRetry = deferred<QueryResult>();
    enqueue("tasks", staleRetry.promise);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("button", { name: "Retrying…" })).toBeDefined();

    enqueue("tasks", failure("Newer refresh failed."));
    trigger(`task-${taskA.id}`, "activity");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Newer refresh failed.");
    const retry = screen.getByRole("button", { name: "Retry" });
    expect((retry as HTMLButtonElement).disabled).toBe(false);

    await act(async () => staleRetry.resolve(ok(taskA)));
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
    expect(screen.getByText("Last-good run")).toBeDefined();
  });

  it("uses visit identity across A to B to A and ignores prior-visit completion", async () => {
    const oldA = deferred<QueryResult>();
    const pendingB = deferred<QueryResult>();
    enqueue("tasks", oldA.promise);
    const view = render(<TaskDetail id={taskA.id} />);

    enqueue("tasks", pendingB.promise);
    view.rerender(<TaskDetail id={taskB.id} />);

    enqueueLoad(
      { ...taskA, title: "Current Task A" },
      [experiment("Current A run")],
    );
    view.rerender(<TaskDetail id={taskA.id} />);
    expect(await screen.findByText("Current A run")).toBeDefined();

    await act(async () => {
      oldA.resolve(ok({ ...taskA, title: "Old Task A" }));
      pendingB.resolve(failure("Old B failed."));
    });
    expect(screen.getByText("Current A run")).toBeDefined();
    expect(screen.queryByText("Old Task A")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(supabaseState.removeChannel).toHaveBeenCalledTimes(2);
  });

  it("surfaces Task mutation errors and ignores mutation completion from an old visit", async () => {
    enqueueLoad(taskA);
    const view = render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    enqueue("tasks", failure("Task update denied."));
    fireEvent.change(screen.getByLabelText("Task status"), {
      target: { value: "done" },
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not update task.");
    expect(alert.textContent).toContain("Task update denied.");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();

    const staleMutation = deferred<QueryResult>();
    enqueue("tasks", staleMutation.promise);
    fireEvent.change(screen.getByLabelText("Task status"), {
      target: { value: "blocked" },
    });
    enqueueLoad(taskB);
    view.rerender(<TaskDetail id={taskB.id} />);
    expect(await screen.findByRole("button", { name: "Task B" })).toBeDefined();

    await act(async () => staleMutation.resolve(ok(taskA)));
    expect(screen.getByRole("button", { name: "Task B" })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("deletes the current Task after the exact confirmation and navigates home", async () => {
    enqueueLoad(taskA);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    try {
      enqueue("tasks", ok(null));
      fireEvent.click(screen.getByLabelText("More task actions"));
      fireEvent.click(screen.getByRole("button", { name: "Delete task" }));

      await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/"));
      expect(confirm).toHaveBeenCalledWith(
        "Delete task “Task A”? This cannot be undone.",
      );
      expect(supabaseState.mutations).toContainEqual({
        table: "tasks",
        kind: "delete",
        payload: undefined,
      });
    } finally {
      confirm.mockRestore();
    }
  });

  it("surfaces Task delete failures without stale navigation", async () => {
    enqueueLoad(taskA);
    const view = render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    try {
      enqueue("tasks", failure("Delete denied."));
      fireEvent.click(screen.getByLabelText("More task actions"));
      fireEvent.click(screen.getByRole("button", { name: "Delete task" }));
      expect((await screen.findByRole("alert")).textContent).toContain(
        "Could not delete task. Delete denied.",
      );
      expect(routerPush).not.toHaveBeenCalled();

      const staleDelete = deferred<QueryResult>();
      enqueue("tasks", staleDelete.promise);
      fireEvent.click(screen.getByRole("button", { name: "Delete task" }));
      enqueueLoad(taskB);
      view.rerender(<TaskDetail id={taskB.id} />);
      await screen.findByRole("button", { name: "Task B" });
      await act(async () => staleDelete.resolve(ok(null)));

      expect(routerPush).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).toBeNull();
    } finally {
      confirm.mockRestore();
    }
  });

  it("does not suppress overlapping independent Task writes, audits, or reconciliation", async () => {
    enqueueLoad(taskA);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    const titleWrite = deferred<QueryResult>();
    const statusWrite = deferred<QueryResult>();
    enqueue("tasks", titleWrite.promise);
    enqueue("tasks", statusWrite.promise);

    fireEvent.click(screen.getByRole("button", { name: "Task A" }));
    const titleInput = screen.getByLabelText("Task title");
    fireEvent.change(titleInput, { target: { value: "Edited Task A" } });
    fireEvent.blur(titleInput);
    fireEvent.change(screen.getByLabelText("Task status"), {
      target: { value: "done" },
    });

    enqueue("activity", ok(null));
    enqueue("activity", ok(null));
    enqueueLoad({ ...taskA, title: "Edited Task A", status: "done" });
    enqueueLoad({ ...taskA, title: "Edited Task A", status: "done" });
    await act(async () => {
      titleWrite.resolve(ok(null));
      statusWrite.resolve(ok(null));
    });

    await waitFor(() => expect(activityInserts()).toHaveLength(2));
    expect(activityInserts().map((call) => (
      call.payload as { text: string }
    ).text)).toEqual([
      "Renamed to “Edited Task A”",
      "Status set to Done",
    ]);
    expect(
      (screen.getByLabelText("Task status") as HTMLSelectElement).value,
    ).toBe("done");

  });

  it("keeps one field's failure visible when another field succeeds and reconciles", async () => {
    enqueueLoad(taskA);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    const titleWrite = deferred<QueryResult>();
    const statusWrite = deferred<QueryResult>();
    enqueue("tasks", titleWrite.promise);
    enqueue("tasks", statusWrite.promise);

    fireEvent.click(screen.getByRole("button", { name: "Task A" }));
    const titleInput = screen.getByLabelText("Task title");
    fireEvent.change(titleInput, { target: { value: "Rejected title" } });
    fireEvent.blur(titleInput);
    fireEvent.change(screen.getByLabelText("Task status"), {
      target: { value: "done" },
    });

    enqueue("activity", ok(null));
    enqueueLoad({ ...taskA, status: "done" });
    await act(async () => {
      titleWrite.resolve(failure("Title update denied."));
      statusWrite.resolve(ok(null));
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not update task.");
    expect(alert.textContent).toContain("Title update denied.");
    expect(
      (screen.getByLabelText("Task status") as HTMLSelectElement).value,
    ).toBe("done");

    enqueue("tasks", failure("Concurrent refresh denied."));
    trigger(`task-${taskA.id}`, "experiments", "UPDATE");
    await screen.findByRole("button", { name: "Retry" });
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(2);
    expect(alerts.map((item) => item.textContent).join(" ")).toContain(
      "Title update denied.",
    );
    expect(alerts.map((item) => item.textContent).join(" ")).toContain(
      "Concurrent refresh denied.",
    );
  });

  it("preserves rapid assignee intent in invocation order", async () => {
    enqueueLoad(taskA, [], [], [member, alice, bob]);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    const firstWrite = deferred<QueryResult>();
    const secondWrite = deferred<QueryResult>();
    enqueue("tasks", firstWrite.promise);
    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Alice" }));
    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Bob" }));

    expect(taskUpdates().map((call) => call.payload)).toEqual([
      { assignees: ["Alice"] },
    ]);

    enqueue("activity", ok(null));
    enqueueLoad({ ...taskA, assignees: ["Alice"] }, [], [], [
      member,
      alice,
      bob,
    ]);
    enqueue("tasks", secondWrite.promise);
    enqueue("activity", ok(null));
    enqueueLoad({ ...taskA, assignees: ["Alice", "Bob"] }, [], [], [
      member,
      alice,
      bob,
    ]);
    await act(async () => firstWrite.resolve(ok(null)));

    await waitFor(() => expect(taskUpdates().map((call) => call.payload)).toEqual([
      { assignees: ["Alice"] },
      { assignees: ["Alice", "Bob"] },
    ]));
    await act(async () => secondWrite.resolve(ok(null)));
  });

  it("creates a Team member before assigning it as an Owner", async () => {
    enqueueLoad(taskA);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    enqueue("members", ok(nova));
    enqueue("tasks", ok(null));
    enqueue("activity", ok(null));
    enqueueLoad(
      { ...taskA, assignees: ["Nova"] },
      [],
      [],
      [member, nova],
    );

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.change(screen.getByLabelText("New owner name"), {
      target: { value: "Nova" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create owner" }));

    await waitFor(() => expect(taskUpdates()).toContainEqual(
      expect.objectContaining({
        payload: { assignees: ["Nova"] },
      }),
    ));
    expect(supabaseState.mutations).toContainEqual({
      table: "members",
      kind: "insert",
      payload: expect.objectContaining({
        name: "Nova",
        initials: "N",
      }),
    });
    expect(screen.getByRole("button", { name: "Remove Nova" })).toBeDefined();
  });

  it("keeps the Owner create draft and selection when member creation fails", async () => {
    enqueueLoad(taskA);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    enqueue("members", failure("Owner insert failed."));
    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.change(screen.getByLabelText("New owner name"), {
      target: { value: "Nova" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create owner" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Could not add owner. Owner insert failed.",
    );
    expect(taskUpdates()).toHaveLength(0);
    expect(screen.getByLabelText("New owner name")).toHaveProperty(
      "value",
      "Nova",
    );
    expect(screen.getByText("No owners yet.")).toBeDefined();
  });

  it("does not assign a created Owner after navigation to another Task", async () => {
    enqueueLoad(taskA);
    const view = render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    const memberInsert = deferred<QueryResult>();
    enqueue("members", memberInsert.promise);
    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.change(screen.getByLabelText("New owner name"), {
      target: { value: "Nova" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create owner" }));

    enqueueLoad(taskB);
    view.rerender(<TaskDetail id={taskB.id} />);
    await screen.findByRole("button", { name: "Task B" });
    enqueue("tasks", failure("Stale Owner patch escaped."));

    await act(async () => memberInsert.resolve(ok(nova)));

    expect(taskUpdates()).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not assign a created Owner after an A to B to A revisit", async () => {
    enqueueLoad(taskA);
    const view = render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    const memberInsert = deferred<QueryResult>();
    enqueue("members", memberInsert.promise);
    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.change(screen.getByLabelText("New owner name"), {
      target: { value: "Nova" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create owner" }));

    enqueueLoad(taskB);
    view.rerender(<TaskDetail id={taskB.id} />);
    await screen.findByRole("button", { name: "Task B" });
    enqueueLoad(taskA);
    view.rerender(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });
    enqueue("tasks", failure("Stale Owner patch escaped."));

    await act(async () => memberInsert.resolve(ok(nova)));

    expect(taskUpdates()).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("rolls back one optimistic Owner toggle when its write is rejected", async () => {
    enqueueLoad(taskA, [], [], [member, alice]);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    const ownerWrite = deferred<QueryResult>();
    enqueue("tasks", ownerWrite.promise);
    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Alice" }));
    expect(screen.getByRole("button", { name: "Remove Alice" })).toBeDefined();

    await act(async () => ownerWrite.resolve(failure("Owner update denied.")));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Owner update denied.",
    );
    await waitFor(() => expect(
      screen.queryByRole("button", { name: "Remove Alice" }),
    ).toBeNull());
  });

  it("serializes rapid Tag intent without losing the cumulative draft", async () => {
    enqueueLoad(taskA);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    const firstWrite = deferred<QueryResult>();
    const secondWrite = deferred<QueryResult>();
    enqueue("tasks", firstWrite.promise);
    const input = screen.getByLabelText("Task tags");
    fireEvent.change(input, { target: { value: "NPU" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "Verifier" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(taskUpdates().map((call) => call.payload)).toEqual([
      { tags: ["NPU"] },
    ]);

    enqueueLoad({ ...taskA, tags: ["NPU"] });
    enqueue("tasks", secondWrite.promise);
    enqueueLoad({ ...taskA, tags: ["NPU", "Verifier"] });
    await act(async () => firstWrite.resolve(ok(null)));

    await waitFor(() => expect(
      taskUpdates().map((call) => call.payload),
    ).toEqual([
      { tags: ["NPU"] },
      { tags: ["NPU", "Verifier"] },
    ]));
    expect(screen.getByText("NPU")).toBeDefined();
    expect(screen.getByText("Verifier")).toBeDefined();

    await act(async () => secondWrite.resolve(ok(null)));
    await waitFor(() => expect(screen.getByText("Verifier")).toBeDefined());
  });

  it("rolls back one optimistic Tag addition when its write is rejected", async () => {
    enqueueLoad(taskA);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    const tagWrite = deferred<QueryResult>();
    enqueue("tasks", tagWrite.promise);
    const input = screen.getByLabelText("Task tags");

    fireEvent.change(input, { target: { value: "NPU" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Remove NPU" })).toBeDefined();

    await act(async () => tagWrite.resolve(failure("Tag update denied.")));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Tag update denied.",
    );
    await waitFor(() => expect(
      screen.queryByRole("button", { name: "Remove NPU" }),
    ).toBeNull());
  });

  it("rebases a queued assignee change after an earlier assignee write fails", async () => {
    enqueueLoad(taskA, [], [], [member, alice, bob]);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    const aliceWrite = deferred<QueryResult>();
    const bobWrite = deferred<QueryResult>();
    enqueue("tasks", aliceWrite.promise);
    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Alice" }));
    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Bob" }));
    expect(taskUpdates().map((call) => call.payload)).toEqual([
      { assignees: ["Alice"] },
    ]);

    enqueue("tasks", bobWrite.promise);
    enqueue("activity", ok(null));
    enqueueLoad({ ...taskA, assignees: ["Bob"] }, [], [], [
      member,
      alice,
      bob,
    ]);
    await act(async () => aliceWrite.resolve(failure("Alice update denied.")));

    await waitFor(() => expect(taskUpdates().map((call) => call.payload)).toEqual([
      { assignees: ["Alice"] },
      { assignees: ["Bob"] },
    ]));
    await act(async () => bobWrite.resolve(ok(null)));

    expect(
      await screen.findByRole("button", { name: "Remove Bob" }),
    ).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Remove Alice" }),
    ).toBeNull();
    expect(activityInserts().map((call) => call.payload)).toEqual([
      expect.objectContaining({
        task_id: taskA.id,
        text: "Assigned Bob",
        kind: "assign",
      }),
    ]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("skips a queued unassign that becomes a no-op after assign fails", async () => {
    enqueueLoad(taskA, [], [], [member, alice]);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    const assignWrite = deferred<QueryResult>();
    enqueue("tasks", assignWrite.promise);
    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Alice" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Alice" }));

    enqueue("tasks", ok(null));
    enqueue("activity", ok(null));
    enqueueLoad(taskA, [], [], [member, alice]);
    await act(async () => assignWrite.resolve(failure("Assign denied.")));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(taskUpdates().map((call) => call.payload)).toEqual([
      { assignees: ["Alice"] },
    ]);
    expect(activityInserts()).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: "Remove Alice" }),
    ).toBeNull();
  });

  it("skips a queued assign that becomes a no-op after unassign fails", async () => {
    const assignedTask = { ...taskA, assignees: ["Alice"] };
    enqueueLoad(assignedTask, [], [], [member, alice]);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Remove Alice" });

    const unassignWrite = deferred<QueryResult>();
    enqueue("tasks", unassignWrite.promise);
    fireEvent.click(screen.getByRole("button", { name: "Remove Alice" }));
    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Alice" }));

    enqueue("tasks", ok(null));
    enqueue("activity", ok(null));
    enqueueLoad(assignedTask, [], [], [member, alice]);
    await act(async () => unassignWrite.resolve(failure("Unassign denied.")));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(taskUpdates().map((call) => call.payload)).toEqual([
      { assignees: [] },
    ]);
    expect(activityInserts()).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Remove Alice" }),
    ).toBeDefined();
  });

  it("reports partial Task success truthfully and reconciles after activity failure", async () => {
    enqueueLoad(taskA);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    enqueue("tasks", ok(null));
    enqueue("activity", failure("Activity insert denied."));
    enqueueLoad({ ...taskA, status: "done" });
    fireEvent.change(screen.getByLabelText("Task status"), {
      target: { value: "done" },
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Task updated, but activity could not be recorded.",
    );
    expect(alert.textContent).toContain("Activity insert denied.");
    expect(alert.textContent).not.toContain("Could not update task.");
    expect(
      (screen.getByLabelText("Task status") as HTMLSelectElement).value,
    ).toBe("done");
  });

  it("audits a confirmed write to its captured Task after navigation without leaking UI", async () => {
    enqueueLoad(taskA);
    const view = render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    const committedWrite = deferred<QueryResult>();
    enqueue("tasks", committedWrite.promise);
    fireEvent.click(screen.getByRole("button", { name: "Task A" }));
    const titleInput = screen.getByLabelText("Task title");
    fireEvent.change(titleInput, { target: { value: "Committed A title" } });
    fireEvent.blur(titleInput);

    enqueueLoad(taskB);
    view.rerender(<TaskDetail id={taskB.id} />);
    await screen.findByRole("button", { name: "Task B" });
    enqueue("activity", ok(null));
    await act(async () => committedWrite.resolve(ok(null)));

    await waitFor(() => expect(activityInserts()).toHaveLength(1));
    expect(activityInserts()[0].payload).toMatchObject({
      task_id: taskA.id,
      text: "Renamed to “Committed A title”",
    });
    expect(screen.getByRole("button", { name: "Task B" })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("submits a timeline note exactly once and exposes truthful pending UI", async () => {
    enqueueLoad(taskA);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    const pendingInsert = deferred<QueryResult>();
    enqueue("activity", pendingInsert.promise);
    enqueue("activity", pendingInsert.promise);
    const input = screen.getByLabelText("Add a note to the timeline");
    fireEvent.change(input, { target: { value: "One note" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /Add note|Adding…/ }));

    expect(activityInserts()).toHaveLength(1);
    const pendingButton = screen.getByRole("button", { name: "Adding…" });
    expect((pendingButton as HTMLButtonElement).disabled).toBe(true);
    expect((input as HTMLInputElement).value).toBe("One note");
  });

  it("keeps a timeline note draft and surfaces its insert error", async () => {
    enqueueLoad(taskA);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    enqueue("activity", failure("Timeline insert denied."));
    fireEvent.change(screen.getByLabelText("Add a note to the timeline"), {
      target: { value: "Keep this draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not add the timeline note.");
    expect(alert.textContent).toContain("Timeline insert denied.");
    expect(
      (screen.getByLabelText("Add a note to the timeline") as HTMLInputElement)
        .value,
    ).toBe("Keep this draft");
  });

  it("registers scoped Realtime handlers and ignores unrelated update traffic", async () => {
    enqueueLoad(taskA, [experiment("Scoped run")], [activity("Scoped activity")]);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByText("Scoped run");

    expect(supabaseState.handlers.map(({ config }) => config)).toEqual([
      {
        event: "INSERT",
        schema: "public",
        table: "tasks",
        filter: `id=eq.${taskA.id}`,
      },
      {
        event: "UPDATE",
        schema: "public",
        table: "tasks",
        filter: `id=eq.${taskA.id}`,
      },
      { event: "DELETE", schema: "public", table: "tasks" },
      {
        event: "INSERT",
        schema: "public",
        table: "experiments",
        filter: `task_id=eq.${taskA.id}`,
      },
      {
        event: "UPDATE",
        schema: "public",
        table: "experiments",
        filter: `task_id=eq.${taskA.id}`,
      },
      { event: "DELETE", schema: "public", table: "experiments" },
      {
        event: "INSERT",
        schema: "public",
        table: "attachments",
        filter: `task_id=eq.${taskA.id}`,
      },
      {
        event: "UPDATE",
        schema: "public",
        table: "attachments",
        filter: `task_id=eq.${taskA.id}`,
      },
      { event: "DELETE", schema: "public", table: "attachments" },
      {
        event: "INSERT",
        schema: "public",
        table: "activity",
        filter: `task_id=eq.${taskA.id}`,
      },
      {
        event: "UPDATE",
        schema: "public",
        table: "activity",
        filter: `task_id=eq.${taskA.id}`,
      },
      { event: "DELETE", schema: "public", table: "activity" },
    ]);

    const taskQueries = supabaseState.fromCalls.filter(
      (table) => table === "tasks",
    ).length;
    trigger(
      `task-${taskA.id}`,
      "tasks",
      "UPDATE",
      { id: taskB.id },
    );
    expect(supabaseState.fromCalls.filter(
      (table) => table === "tasks",
    )).toHaveLength(taskQueries);
  });

  it("refreshes only Task-level attachment traffic and clears IDs on visits", async () => {
    enqueueLoad(taskA, [], [], [member], [taskAttachment]);
    const view = render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("link", { name: "Open Task attachment" });
    const taskQueries = () => supabaseState.fromCalls.filter(
      (table) => table === "tasks",
    ).length;
    const initialQueries = taskQueries();

    trigger(
      `task-${taskA.id}`,
      "attachments",
      "UPDATE",
      {
        id: "experiment-attachment",
        task_id: taskA.id,
        experiment_id: "experiment-a",
      },
    );
    expect(taskQueries()).toBe(initialQueries);

    enqueueLoad(taskA, [], [], [member], [taskAttachment]);
    trigger(
      `task-${taskA.id}`,
      "attachments",
      "UPDATE",
      {
        id: taskAttachment.id,
        task_id: taskA.id,
        experiment_id: "corrupted-but-known",
      },
    );
    await waitFor(() => expect(taskQueries()).toBe(initialQueries + 1));

    enqueueLoad(taskB);
    view.rerender(<TaskDetail id={taskB.id} />);
    await screen.findByRole("button", { name: "Task B" });
    const taskBQueries = taskQueries();
    trigger(
      `task-${taskB.id}`,
      "attachments",
      "DELETE",
      { id: taskAttachment.id },
      {},
    );
    expect(taskQueries()).toBe(taskBQueries);
  });

  it("ignores unrelated DELETE payloads but detects current Task and Experiment deletion", async () => {
    const currentExperiment = experiment("Delete-aware run");
    const currentActivity = activity("Delete-aware activity");
    enqueueLoad(taskA, [currentExperiment], [currentActivity]);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByText("Delete-aware run");

    const taskQueries = () => supabaseState.fromCalls.filter(
      (table) => table === "tasks",
    ).length;
    const initialQueries = taskQueries();
    trigger(
      `task-${taskA.id}`,
      "experiments",
      "DELETE",
      {},
      { id: "00000000-0000-4000-8000-000000000099" },
    );
    expect(taskQueries()).toBe(initialQueries);

    trigger(
      `task-${taskA.id}`,
      "activity",
      "DELETE",
      {},
      { id: "unrelated-activity" },
    );
    expect(taskQueries()).toBe(initialQueries);

    enqueueLoad(taskA, [], [currentActivity]);
    trigger(
      `task-${taskA.id}`,
      "experiments",
      "DELETE",
      {},
      { id: currentExperiment.id },
    );
    await waitFor(() => {
      expect(screen.queryByText("Delete-aware run")).toBeNull();
    });

    enqueueLoad(taskA, []);
    trigger(
      `task-${taskA.id}`,
      "activity",
      "DELETE",
      {},
      { id: currentActivity.id },
    );
    await waitFor(() => {
      expect(screen.queryByText("Delete-aware activity")).toBeNull();
    });

    enqueue("tasks", ok(null));
    trigger(
      `task-${taskA.id}`,
      "tasks",
      "DELETE",
      {},
      { id: taskA.id },
    );
    expect(await screen.findByText(/Task not found/)).toBeDefined();
  });

  it("recognizes an Experiment DELETE while its INSERT refresh is still pending", async () => {
    const inserted = experiment("Transient experiment");
    enqueueLoad(taskA);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    const oldModule = deferred<QueryResult>();
    enqueue("tasks", ok(taskA));
    enqueue("modules", oldModule.promise);
    enqueue("experiments", ok([inserted]));
    enqueue("members", ok([member]));
    enqueue("attachments", ok([]));
    enqueue("activity", ok([]));
    trigger(
      `task-${taskA.id}`,
      "experiments",
      "INSERT",
      { id: inserted.id, task_id: taskA.id },
    );
    await waitFor(() => expect(supabaseState.fromCalls.filter(
      (table) => table === "experiments",
    )).toHaveLength(2));

    enqueueLoad(taskA);
    trigger(
      `task-${taskA.id}`,
      "experiments",
      "DELETE",
      {},
      { id: inserted.id },
    );
    await waitFor(() => expect(supabaseState.fromCalls.filter(
      (table) => table === "tasks",
    )).toHaveLength(3));

    await act(async () => oldModule.resolve(ok([moduleRow])));
    expect(screen.queryByText("Transient experiment")).toBeNull();
  });

  it("recognizes an Activity DELETE while its INSERT refresh is still pending", async () => {
    const inserted = activity("Transient activity");
    enqueueLoad(taskA);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    const oldModule = deferred<QueryResult>();
    enqueue("tasks", ok(taskA));
    enqueue("modules", oldModule.promise);
    enqueue("experiments", ok([]));
    enqueue("members", ok([member]));
    enqueue("attachments", ok([]));
    enqueue("activity", ok([inserted]));
    trigger(
      `task-${taskA.id}`,
      "activity",
      "INSERT",
      { id: inserted.id, task_id: taskA.id },
    );
    await waitFor(() => expect(supabaseState.fromCalls.filter(
      (table) => table === "activity",
    )).toHaveLength(2));

    enqueueLoad(taskA);
    trigger(
      `task-${taskA.id}`,
      "activity",
      "DELETE",
      {},
      { id: inserted.id },
    );
    await waitFor(() => expect(supabaseState.fromCalls.filter(
      (table) => table === "tasks",
    )).toHaveLength(3));

    await act(async () => oldModule.resolve(ok([moduleRow])));
    expect(screen.queryByText("Transient activity")).toBeNull();
  });

  it("invalidates an initial request before unmount cleanup completes", async () => {
    const pending = deferred<QueryResult>();
    enqueue("tasks", pending.promise);
    const view = render(<TaskDetail id={taskA.id} />);
    view.unmount();

    await act(async () => pending.resolve(ok(taskA)));
    expect(supabaseState.fromCalls).toEqual(["tasks"]);
    expect(supabaseState.removeChannel).toHaveBeenCalledTimes(1);
  });
});
