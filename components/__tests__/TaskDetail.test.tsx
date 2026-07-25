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

const supabaseState = vi.hoisted(() => ({
  queues: new Map<string, Promise<QueryResult>[]>(),
  handlers: [] as RealtimeHandler[],
  fromCalls: [] as string[],
  mutations: [] as MutationCall[],
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
      for (const method of ["select", "eq", "order", "maybeSingle"]) {
        builder[method] = vi.fn(() => builder);
      }
      for (const kind of ["update", "insert", "delete"] as const) {
        builder[kind] = vi.fn((payload?: unknown) => {
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
) {
  enqueue("modules", ok(moduleRow));
  enqueue("experiments", ok(experiments));
  enqueue("members", ok(members));
  enqueue("activity", ok(activities));
}

function enqueueLoad(
  task: Task,
  experiments: Experiment[] = [],
  activities: Activity[] = [],
  members: Member[] = [member],
) {
  enqueue("tasks", ok(task));
  enqueueRelated(experiments, activities, members);
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
    fireEvent.change(screen.getByLabelText("Status"), {
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
      (screen.getByLabelText("Status") as HTMLSelectElement).value,
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
    fireEvent.change(screen.getByLabelText("Status"), {
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
      (screen.getByLabelText("Status") as HTMLSelectElement).value,
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
    fireEvent.click(screen.getByRole("button", { name: "Assign people" }));
    fireEvent.click(screen.getByRole("button", { name: /Alice/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bob/ }));

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

  it("rebases a queued assignee change after an earlier assignee write fails", async () => {
    enqueueLoad(taskA, [], [], [member, alice, bob]);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    const aliceWrite = deferred<QueryResult>();
    const bobWrite = deferred<QueryResult>();
    enqueue("tasks", aliceWrite.promise);
    fireEvent.click(screen.getByRole("button", { name: "Assign people" }));
    fireEvent.click(screen.getByRole("button", { name: /Alice/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bob/ }));
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

    expect(await screen.findByRole("button", { name: "Unassign Bob" }))
      .toBeDefined();
    expect(screen.queryByRole("button", { name: "Unassign Alice" })).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "Assign people" }));
    fireEvent.click(screen.getByRole("button", { name: /Alice/ }));
    fireEvent.click(screen.getByRole("button", { name: /Alice/ }));

    enqueue("tasks", ok(null));
    enqueue("activity", ok(null));
    enqueueLoad(taskA, [], [], [member, alice]);
    await act(async () => assignWrite.resolve(failure("Assign denied.")));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(taskUpdates().map((call) => call.payload)).toEqual([
      { assignees: ["Alice"] },
    ]);
    expect(activityInserts()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Unassign Alice" })).toBeNull();
  });

  it("skips a queued assign that becomes a no-op after unassign fails", async () => {
    const assignedTask = { ...taskA, assignees: ["Alice"] };
    enqueueLoad(assignedTask, [], [], [member, alice]);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Unassign Alice" });

    const unassignWrite = deferred<QueryResult>();
    enqueue("tasks", unassignWrite.promise);
    fireEvent.click(screen.getByRole("button", { name: "Unassign Alice" }));
    fireEvent.click(screen.getByRole("button", { name: "Unassign Alice" }));

    enqueue("tasks", ok(null));
    enqueue("activity", ok(null));
    enqueueLoad(assignedTask, [], [], [member, alice]);
    await act(async () => unassignWrite.resolve(failure("Unassign denied.")));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(taskUpdates().map((call) => call.payload)).toEqual([
      { assignees: [] },
    ]);
    expect(activityInserts()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Unassign Alice" })).toBeDefined();
  });

  it("reports partial Task success truthfully and reconciles after activity failure", async () => {
    enqueueLoad(taskA);
    render(<TaskDetail id={taskA.id} />);
    await screen.findByRole("button", { name: "Task A" });

    enqueue("tasks", ok(null));
    enqueue("activity", failure("Activity insert denied."));
    enqueueLoad({ ...taskA, status: "done" });
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "done" },
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Task updated, but activity could not be recorded.",
    );
    expect(alert.textContent).toContain("Activity insert denied.");
    expect(alert.textContent).not.toContain("Could not update task.");
    expect(
      (screen.getByLabelText("Status") as HTMLSelectElement).value,
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

    await act(async () => oldModule.resolve(ok(moduleRow)));
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

    await act(async () => oldModule.resolve(ok(moduleRow)));
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
