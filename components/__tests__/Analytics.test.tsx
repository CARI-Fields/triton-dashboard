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
import Analytics from "@/components/Analytics";
import type { Member, Module, Task } from "@/lib/types";

type TableName = "modules" | "tasks" | "members";
type RealtimeTableName = TableName | "task_assignees";

interface QueryError {
  message: string;
  details: string;
  hint: string;
  code: string;
}

interface QueryResult {
  data: Array<Record<string, unknown>> | null;
  error: QueryError | null;
}

interface RealtimeHandler {
  table: RealtimeTableName;
  callback: () => void;
}

const supabaseState = vi.hoisted(() => ({
  configured: true,
  queues: {
    modules: [] as Array<Promise<QueryResult>>,
    tasks: [] as Array<Promise<QueryResult>>,
    members: [] as Array<Promise<QueryResult>>,
  },
  handlers: [] as RealtimeHandler[],
  readTrace: [] as TableName[],
  channels: [] as Array<Record<string, unknown>>,
  removeChannel: vi.fn(),
}));

vi.mock("@/lib/supabase", () => {
  const client = {
    from: vi.fn((table: TableName) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.order = vi.fn(() => {
        supabaseState.readTrace.push(table);
        return supabaseState.queues[table].shift()
          ?? Promise.resolve({ data: [], error: null });
      });
      return builder;
    }),
    channel: vi.fn(() => {
      const channel = {
        on: vi.fn((
          _event: string,
          config: { table: RealtimeTableName },
          callback: () => void,
        ) => {
          supabaseState.handlers.push({
            table: config.table,
            callback,
          });
          return channel;
        }),
        subscribe: vi.fn(() => channel),
      };
      supabaseState.channels.push(channel);
      return channel;
    }),
    removeChannel: supabaseState.removeChannel,
  };

  return {
    get isSupabaseConfigured() {
      return supabaseState.configured;
    },
    supabase: client,
  };
});

const moduleRows: Module[] = [
  {
    id: "infrastructure",
    name: "Infrastructure",
    kind: "foundation",
    objective: "Shared systems",
    position: 0,
    created_at: "2026-07-27T00:00:00.000Z",
  },
  {
    id: "evaluation",
    name: "Evaluation",
    kind: "pipeline",
    objective: "Verifier work",
    position: 1,
    created_at: "2026-07-27T00:00:00.000Z",
  },
];

const taskRows: Task[] = [
  {
    id: "task-todo",
    module_id: "infrastructure",
    title: "Draft verifier plan",
    status: "todo",
    assignees: [],
    notes: "",
    tags: [],
    priority: "medium",
    due_date: null,
    position: 0,
    created_at: "2026-07-27T12:00:00.000Z",
    updated_at: "2026-07-27T12:00:00.000Z",
  },
  {
    id: "task-progress",
    module_id: "evaluation",
    title: "Run evaluation",
    status: "in_progress",
    assignees: ["Sam"],
    notes: "",
    tags: [],
    priority: "medium",
    due_date: null,
    position: 1,
    created_at: "2026-07-27T13:00:00.000Z",
    updated_at: "2026-07-27T13:00:00.000Z",
  },
  {
    id: "task-done",
    module_id: "evaluation",
    title: "Publish results",
    status: "done",
    assignees: ["Sam"],
    notes: "",
    tags: [],
    priority: "medium",
    due_date: null,
    position: 2,
    created_at: "2026-07-27T14:00:00.000Z",
    updated_at: "2026-07-27T14:00:00.000Z",
  },
  {
    id: "task-blocked",
    module_id: "infrastructure",
    title: "Recover failed NPU runner",
    status: "blocked",
    assignees: ["Legacy Owner"],
    notes: "",
    tags: [],
    priority: "urgent",
    due_date: null,
    position: 3,
    created_at: "2026-07-27T15:00:00.000Z",
    updated_at: "2026-07-27T18:00:00.000Z",
  },
];

const memberRows: Member[] = [
  {
    id: "sam",
    name: "Sam",
    initials: "SM",
    position: 0,
    created_at: "2026-07-27T00:00:00.000Z",
  },
  {
    id: "theo",
    name: "Theo",
    initials: "TK",
    position: 1,
    created_at: "2026-07-27T00:00:00.000Z",
  },
];

function queryError(message: string): QueryError {
  return {
    message,
    details: "",
    hint: "",
    code: "TEST_ERROR",
  };
}

function rows(
  value: Array<Module | Task | Member>,
): Array<Record<string, unknown>> {
  return value.map((row) => ({
    ...row,
    ...("assignees" in row ? {
      assignees: ["Stale legacy owner"],
      tags: [...row.tags],
      task_assignees: row.assignees.map((name, index) => ({
        member_id: `joined-member-${index}`,
        member: { name },
      })),
    } : {}),
  }));
}

function enqueueSnapshot({
  modules = moduleRows,
  tasks = taskRows,
  members = memberRows,
  errors = {},
}: {
  modules?: Module[];
  tasks?: Task[];
  members?: Member[];
  errors?: Partial<Record<TableName, string>>;
} = {}) {
  const values = { modules, tasks, members };
  for (const table of ["modules", "tasks", "members"] as const) {
    supabaseState.queues[table].push(Promise.resolve({
      data: errors[table] ? null : rows(values[table]),
      error: errors[table] ? queryError(errors[table]) : null,
    }));
  }
}

function enqueuePromises(
  values: Record<TableName, Promise<QueryResult>>,
) {
  for (const table of ["modules", "tasks", "members"] as const) {
    supabaseState.queues[table].push(values[table]);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function ok(value: Array<Module | Task | Member>): QueryResult {
  return { data: rows(value), error: null };
}

function fail(message: string): QueryResult {
  return { data: null, error: queryError(message) };
}

async function renderLoadedAnalytics() {
  enqueueSnapshot();
  const result = render(<Analytics />);
  await screen.findByRole("heading", { name: "Analytics" });
  await screen.findByRole("link", { name: "Recover failed NPU runner" });
  return result;
}

function realtimeHandler(table: RealtimeTableName): RealtimeHandler {
  const handler = supabaseState.handlers.find((item) => item.table === table);
  if (!handler) throw new Error(`No ${table} Realtime handler.`);
  return handler;
}

function expectMetric(label: string, value: string) {
  const term = screen.getByText(label, { selector: "dt" });
  const metric = term.closest("div");
  expect(metric?.textContent).toContain(value);
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  supabaseState.configured = true;
  supabaseState.queues.modules.length = 0;
  supabaseState.queues.tasks.length = 0;
  supabaseState.queues.members.length = 0;
  supabaseState.handlers.length = 0;
  supabaseState.readTrace.length = 0;
  supabaseState.channels.length = 0;
  supabaseState.removeChannel.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Analytics", () => {
  it("maps storage rows into the approved visible hierarchy", async () => {
    await renderLoadedAnalytics();

    expect(screen.getByText("Live snapshot")).toBeDefined();
    expect(screen.getByText(
      "Current Task progress, attention, Type coverage, and Owner workload.",
    )).toBeDefined();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDefined();
    expectMetric("Total tasks", "4");
    expectMetric("In progress", "1");
    expectMetric("Done", "1");
    expectMetric("Blocked", "1");
    expectMetric("Completion", "25%");

    expect(screen.getByRole("heading", {
      name: "Progress by status",
      level: 2,
    })).toBeDefined();
    expect(screen.getByRole("img", { name: "25% complete" })).toBeDefined();
    expect(screen.getByRole("heading", {
      name: "Needs attention",
      level: 2,
    })).toBeDefined();
    const attention = screen.getByRole("link", {
      name: "Recover failed NPU runner",
    });
    expect(attention.getAttribute("href")).toBe("/task/task-blocked");
    expect(attention.closest("li")?.textContent).toContain("Infrastructure");
    expect(attention.closest("li")?.textContent).toContain("Legacy Owner");

    const typeTable = screen.getByRole("table", {
      name: "Progress by type",
    });
    expect(within(typeTable).getByRole("columnheader", {
      name: "Type",
    })).toBeDefined();
    const infrastructureRow = within(typeTable).getByRole("row", {
      name: /Infrastructure/,
    });
    expect(infrastructureRow.textContent).toContain("50%");

    const ownerTable = screen.getByRole("table", {
      name: "Workload by owner",
    });
    expect(within(ownerTable).getByRole("row", {
      name: /Legacy Owner/,
    })).toBeDefined();
    expect(screen.getByLabelText(
      "1 done, 1 in progress, 0 to do, 0 blocked",
    )).toBeDefined();
    for (const name of [
      "Progress by type table",
      "Workload by owner table",
    ]) {
      const region = screen.getByRole("region", { name });
      const helpId = region.getAttribute("aria-describedby");
      expect(document.getElementById(helpId ?? "")?.textContent).toContain(
        "Scroll horizontally",
      );
      expect(region.tabIndex).toBe(0);
    }
    expect(document.body.textContent).not.toMatch(
      /\b(Module|Assignee|Assignees|Trend|Forecast|Significance)\b/i,
    );
  });

  it("deduplicates attention Owners independently of runtime locale casing", async () => {
    vi.spyOn(
      String.prototype,
      "toLocaleLowerCase",
    ).mockImplementation(function simulatedTurkishLocale(this: string) {
      return String(this).replaceAll("I", "ı").toLowerCase();
    });
    enqueueSnapshot({
      tasks: taskRows.map((taskRow) => (
        taskRow.id === "task-blocked"
          ? { ...taskRow, assignees: ["Ipek", "ipek"] }
          : taskRow
      )),
    });
    render(<Analytics />);

    const attentionLink = await screen.findByRole("link", {
      name: "Recover failed NPU runner",
    });
    expect(attentionLink.closest("li")?.textContent).toContain("Ipek");
    expect(attentionLink.closest("li")?.textContent).not.toContain(
      "Ipek, ipek",
    );
  });

  it.each<[TableName, string, string]>([
    ["modules", "Type", "relation public.modules does not exist"],
    ["tasks", "Task", "permission denied for public.tasks"],
    ["members", "Owner", "column members.initials is missing"],
  ])(
    "sanitizes an initial %s query error and withholds the snapshot",
    async (table, safeLabel, rawMessage) => {
      enqueueSnapshot({ errors: { [table]: rawMessage } });
      render(<Analytics />);

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(
        `Could not load analytics. ${safeLabel} data is unavailable.`,
      );
      expect(alert.textContent).not.toContain(rawMessage);
      expect(within(alert).getByRole("button", {
        name: "Retry",
      })).toBeDefined();
      expect(screen.queryByText("Total tasks", {
        selector: "dt",
      })).toBeNull();
      expect(screen.queryByRole("table", {
        name: "Progress by type",
      })).toBeNull();
      expect(screen.queryByRole("table", {
        name: "Workload by owner",
      })).toBeNull();
      expect(screen.queryByRole("img", {
        name: "0% complete",
      })).toBeNull();
      expect((screen.getByRole("button", {
        name: "Export CSV",
      }) as HTMLButtonElement).disabled).toBe(true);
    },
  );

  it("sanitizes an unknown thrown request error", async () => {
    supabaseState.queues.modules.push(new Promise<QueryResult>(
      (_resolve, reject) => {
        setTimeout(() => reject(
          new Error("Module storage adapter exploded."),
        ), 0);
      },
    ));
    supabaseState.queues.tasks.push(Promise.resolve(ok(taskRows)));
    supabaseState.queues.members.push(Promise.resolve(ok(memberRows)));
    render(<Analytics />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Could not load analytics. Try again.",
    );
    expect(alert.textContent).not.toContain(
      "Module storage adapter exploded.",
    );
    expect(document.body.textContent).not.toMatch(/\bModule\b/i);
    expect(screen.queryByText("Total tasks", {
      selector: "dt",
    })).toBeNull();
  });

  it("retains the last successful snapshot after a refresh error and retries", async () => {
    await renderLoadedAnalytics();
    const rawMessage = "permission denied for public.tasks";
    enqueueSnapshot({ errors: { tasks: rawMessage } });

    act(() => realtimeHandler("tasks").callback());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Could not load analytics. Task data is unavailable.",
    );
    expect(alert.textContent).not.toContain(rawMessage);
    expectMetric("Total tasks", "4");
    expect(screen.getByRole("table", {
      name: "Progress by type",
    })).toBeDefined();
    expect(screen.getByRole("table", {
      name: "Workload by owner",
    })).toBeDefined();
    expect((screen.getByRole("button", {
      name: "Export CSV",
    }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("link", {
      name: "Recover failed NPU runner",
    })).toBeDefined();

    const refreshedTasks = taskRows.map((taskRow) => (
      taskRow.id === "task-blocked"
        ? { ...taskRow, title: "Recovered current snapshot" }
        : taskRow
    ));
    enqueueSnapshot({ tasks: refreshedTasks });
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("link", {
      name: "Recovered current snapshot",
    })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ignores an older success after a newer request reports an error", async () => {
    await renderLoadedAnalytics();
    const staleModules = deferred<QueryResult>();
    const staleTasks = deferred<QueryResult>();
    const staleMembers = deferred<QueryResult>();
    enqueuePromises({
      modules: staleModules.promise,
      tasks: staleTasks.promise,
      members: staleMembers.promise,
    });
    const readsBefore = supabaseState.readTrace.length;
    act(() => realtimeHandler("tasks").callback());
    await waitFor(() => {
      expect(supabaseState.readTrace.length).toBe(readsBefore + 3);
    });

    enqueueSnapshot({ errors: { modules: "Newest request failed." } });
    act(() => realtimeHandler("tasks").callback());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not load analytics. Type data is unavailable.",
    );

    await act(async () => {
      staleModules.resolve(ok(moduleRows));
      staleTasks.resolve(ok(taskRows.map((taskRow) => (
        taskRow.id === "task-blocked"
          ? { ...taskRow, title: "Stale successful snapshot" }
          : taskRow
      ))));
      staleMembers.resolve(ok(memberRows));
      await Promise.all([
        staleModules.promise,
        staleTasks.promise,
        staleMembers.promise,
      ]);
    });

    expect(screen.getByRole("alert").textContent).toContain(
      "Could not load analytics. Type data is unavailable.",
    );
    expect(screen.queryByRole("link", {
      name: "Stale successful snapshot",
    })).toBeNull();
  });

  it("ignores an older error after a newer snapshot succeeds", async () => {
    await renderLoadedAnalytics();
    const staleModules = deferred<QueryResult>();
    const staleTasks = deferred<QueryResult>();
    const staleMembers = deferred<QueryResult>();
    enqueuePromises({
      modules: staleModules.promise,
      tasks: staleTasks.promise,
      members: staleMembers.promise,
    });
    act(() => realtimeHandler("members").callback());

    const newestTasks = taskRows.map((taskRow) => (
      taskRow.id === "task-blocked"
        ? { ...taskRow, title: "Newest authoritative snapshot" }
        : taskRow
    ));
    enqueueSnapshot({ tasks: newestTasks });
    act(() => realtimeHandler("members").callback());
    expect(await screen.findByRole("link", {
      name: "Newest authoritative snapshot",
    })).toBeDefined();

    await act(async () => {
      staleModules.resolve(fail("Stale request failed."));
      staleTasks.resolve(ok(taskRows));
      staleMembers.resolve(ok(memberRows));
      await Promise.all([
        staleModules.promise,
        staleTasks.promise,
        staleMembers.promise,
      ]);
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", {
      name: "Newest authoritative snapshot",
    })).toBeDefined();
  });

  it("subscribes to all snapshot tables and removes authority on unmount", async () => {
    const { unmount } = await renderLoadedAnalytics();

    expect(supabaseState.handlers.map(({ table }) => table)).toEqual([
      "modules",
      "tasks",
      "task_assignees",
      "members",
    ]);
    unmount();
    expect(supabaseState.removeChannel).toHaveBeenCalledOnce();
  });

  it("renders the unconfigured and initial loading states", async () => {
    supabaseState.configured = false;
    const unconfigured = render(<Analytics />);
    expect(screen.getByText(
      "Connect Supabase first — open the board for setup instructions.",
    )).toBeDefined();
    expect(supabaseState.readTrace).toHaveLength(0);
    unconfigured.unmount();

    supabaseState.configured = true;
    const pendingModules = deferred<QueryResult>();
    const pendingTasks = deferred<QueryResult>();
    const pendingMembers = deferred<QueryResult>();
    enqueuePromises({
      modules: pendingModules.promise,
      tasks: pendingTasks.promise,
      members: pendingMembers.promise,
    });
    const loading = render(<Analytics />);
    expect(screen.getByRole("heading", { name: "Analytics" })).toBeDefined();
    const skeleton = screen.getByRole("status", {
      name: "Loading Analytics",
    });
    expect(skeleton.classList).toContain("workspace-skeleton-analytics");
    expect(skeleton.querySelectorAll(".skeleton-analytics > i")).toHaveLength(5);
    expect(screen.queryByText("Loading analytics…")).toBeNull();
    loading.unmount();

    await act(async () => {
      pendingModules.resolve(ok(moduleRows));
      pendingTasks.resolve(ok(taskRows));
      pendingMembers.resolve(ok(memberRows));
      await Promise.all([
        pendingModules.promise,
        pendingTasks.promise,
        pendingMembers.promise,
      ]);
    });
  });

  it("renders a zero-safe empty snapshot without fabricated rows", async () => {
    enqueueSnapshot({ modules: [], tasks: [], members: [] });
    render(<Analytics />);
    await screen.findByRole("heading", { name: "Analytics" });

    expectMetric("Total tasks", "0");
    expectMetric("Completion", "0%");
    expect(screen.getByRole("img", { name: "0% complete" })).toBeDefined();
    expect(screen.getByText("No blocked Tasks.")).toBeDefined();
    expect(within(screen.getByRole("table", {
      name: "Progress by type",
    })).getAllByRole("row")).toHaveLength(1);
    expect(within(screen.getByRole("table", {
      name: "Workload by owner",
    })).getAllByRole("row")).toHaveLength(1);
  });

  it("downloads the escaped current CSV and always revokes its object URL", async () => {
    const specialModules = [{
      ...moduleRows[0],
      name: 'Infrastructure, "NPU"',
    }];
    const specialTasks = [{
      ...taskRows[3],
      module_id: "infrastructure",
      title: 'Recover "quoted", runner\nnow',
      assignees: ["Sam, Sr."],
    }];
    const specialMembers = [{
      ...memberRows[0],
      name: "Sam, Sr.",
    }];
    enqueueSnapshot({
      modules: specialModules,
      tasks: specialTasks,
      members: specialMembers,
    });

    let exportedBlob: Blob | null = null;
    const createObjectURL = vi.fn((blob: Blob) => {
      exportedBlob = blob;
      return "blob:task-analytics";
    });
    const revokeObjectURL = vi.fn();
    const createDescriptor = Object.getOwnPropertyDescriptor(
      URL,
      "createObjectURL",
    );
    const revokeDescriptor = Object.getOwnPropertyDescriptor(
      URL,
      "revokeObjectURL",
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });

    let clickedAnchor: HTMLAnchorElement | null = null;
    const anchorClick = vi.spyOn(
      HTMLAnchorElement.prototype,
      "click",
    ).mockImplementation(function captureAnchor() {
      clickedAnchor = this;
    });

    try {
      render(<Analytics />);
      await screen.findByRole("heading", { name: "Analytics" });
      fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(clickedAnchor?.download).toBe("triton-task-analytics.csv");
      expect(clickedAnchor?.href).toBe("blob:task-analytics");
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:task-analytics");
      expect(anchorClick.mock.invocationCallOrder[0]).toBeLessThan(
        revokeObjectURL.mock.invocationCallOrder[0],
      );

      const csv = await readBlob(exportedBlob as Blob);
      expect(csv).toContain('"Infrastructure, ""NPU"""');
      expect(csv).toContain('"Recover ""quoted"", runner\nnow"');
      expect(csv).toContain('"Sam, Sr."');
      expect(csv).not.toMatch(/\b(Module|Trend|Forecast|Significance)\b/i);
    } finally {
      if (createDescriptor) {
        Object.defineProperty(URL, "createObjectURL", createDescriptor);
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
      if (revokeDescriptor) {
        Object.defineProperty(URL, "revokeObjectURL", revokeDescriptor);
      } else {
        Reflect.deleteProperty(URL, "revokeObjectURL");
      }
    }
  });
});
