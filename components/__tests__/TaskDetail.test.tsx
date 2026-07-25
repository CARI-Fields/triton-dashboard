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
  table: string;
  callback: () => void;
}

const supabaseState = vi.hoisted(() => ({
  queues: new Map<string, Promise<QueryResult>[]>(),
  handlers: [] as RealtimeHandler[],
  fromCalls: [] as string[],
  removeChannel: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/supabase", () => {
  const client = {
    from: vi.fn((table: string) => {
      supabaseState.fromCalls.push(table);
      const response = supabaseState.queues.get(table)?.shift();
      if (!response) {
        throw new Error(`No ${table} query result was queued.`);
      }
      const builder: Record<string, unknown> = {};
      for (const method of [
        "select",
        "eq",
        "order",
        "maybeSingle",
        "update",
        "insert",
        "delete",
      ]) {
        builder[method] = vi.fn(() => builder);
      }
      builder.then = response.then.bind(response);
      return builder;
    }),
    channel: vi.fn((channelName: string) => {
      const channel = {
        on: vi.fn((
          _kind: string,
          filter: { table: string },
          callback: () => void,
        ) => {
          supabaseState.handlers.push({
            channelName,
            table: filter.table,
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
) {
  enqueue("modules", ok(moduleRow));
  enqueue("experiments", ok(experiments));
  enqueue("members", ok([member]));
  enqueue("activity", ok(activities));
}

function enqueueLoad(
  task: Task,
  experiments: Experiment[] = [],
  activities: Activity[] = [],
) {
  enqueue("tasks", ok(task));
  enqueueRelated(experiments, activities);
}

function trigger(channelName: string, table: string) {
  const handler = [...supabaseState.handlers].reverse().find(
    (candidate) => (
      candidate.channelName === channelName && candidate.table === table
    ),
  );
  if (!handler) throw new Error(`No ${channelName}/${table} handler.`);
  act(() => handler.callback());
}

beforeEach(() => {
  supabaseState.queues.clear();
  supabaseState.handlers.length = 0;
  supabaseState.fromCalls.length = 0;
  supabaseState.removeChannel.mockClear();
});

afterEach(cleanup);

describe("TaskDetail orchestration", () => {
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
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "done" },
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not update task.");
    expect(alert.textContent).toContain("Task update denied.");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();

    const staleMutation = deferred<QueryResult>();
    enqueue("tasks", staleMutation.promise);
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "blocked" },
    });
    enqueueLoad(taskB);
    view.rerender(<TaskDetail id={taskB.id} />);
    expect(await screen.findByRole("button", { name: "Task B" })).toBeDefined();

    await act(async () => staleMutation.resolve(ok(taskA)));
    expect(screen.getByRole("button", { name: "Task B" })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
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
