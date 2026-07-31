import { beforeEach, describe, expect, it, vi } from "vitest";
import { editableExperimentPatch } from "@/lib/experiments/draft";
import type {
  Attachment,
  Experiment,
  ExperimentListRow,
} from "@/lib/types";

const mocks = vi.hoisted(() => {
  type QueryResponse = {
    data: unknown;
    error: { message: string } | null;
  };
  type QueryTrace = {
    table: string;
    operation: "select" | "insert" | "update" | "delete";
    selectCalls: string[];
    eqCalls: Array<[string, unknown]>;
    inCalls: Array<[string, unknown[]]>;
    orderCalls: Array<[string, { ascending?: boolean } | undefined]>;
    insertPayload?: unknown;
    updatePayload?: unknown;
    query?: { eq: ReturnType<typeof vi.fn> };
  };

  const responses = new Map<string, QueryResponse[]>();
  const traces: QueryTrace[] = [];
  const registrations: Array<{
    event: string;
    filter: Record<string, string>;
    callback: (...args: unknown[]) => void;
  }> = [];

  function responseFor(trace: QueryTrace): QueryResponse {
    const queue = responses.get(`${trace.table}:${trace.operation}`);
    return queue?.shift() ?? { data: [], error: null };
  }

  function makeQuery(table: string) {
    const trace: QueryTrace = {
      table,
      operation: "select",
      selectCalls: [],
      eqCalls: [],
      inCalls: [],
      orderCalls: [],
    };
    traces.push(trace);
    const query = {
      select: vi.fn((columns: string) => {
        trace.selectCalls.push(columns);
        return query;
      }),
      insert: vi.fn((payload: unknown) => {
        trace.operation = "insert";
        trace.insertPayload = payload;
        return query;
      }),
      update: vi.fn((payload: unknown) => {
        trace.operation = "update";
        trace.updatePayload = payload;
        return query;
      }),
      delete: vi.fn(() => {
        trace.operation = "delete";
        return query;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        trace.eqCalls.push([column, value]);
        return query;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        trace.inCalls.push([column, values]);
        return query;
      }),
      order: vi.fn((
        column: string,
        options?: { ascending?: boolean },
      ) => {
        trace.orderCalls.push([column, options]);
        return query;
      }),
      limit: vi.fn(() => query),
      maybeSingle: vi.fn(() => Promise.resolve(responseFor(trace))),
      single: vi.fn(() => Promise.resolve(responseFor(trace))),
      then: (
        resolve: (response: QueryResponse) => unknown,
        reject: (error: unknown) => unknown,
      ) => Promise.resolve(responseFor(trace)).then(resolve, reject),
    };
    trace.query = query;
    return query;
  }

  const storage = {
    getPublicUrl: vi.fn(),
    remove: vi.fn(),
    upload: vi.fn(),
  };
  const channel = {
    on: vi.fn(
      (
        event: string,
        filter: Record<string, string>,
        callback: (...args: unknown[]) => void,
      ) => {
        registrations.push({ event, filter, callback });
        return channel;
      },
    ),
    subscribe: vi.fn(() => channel),
  };

  return {
    channel,
    channelFactory: vi.fn(() => channel),
    from: vi.fn((table: string) => makeQuery(table)),
    registrations,
    removeChannel: vi.fn(),
    responses,
    storage,
    storageFrom: vi.fn(() => storage),
    traces,
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: mocks.channelFactory,
    from: mocks.from,
    removeChannel: mocks.removeChannel,
    storage: { from: mocks.storageFrom },
  },
}));

import {
  createExperiment,
  deleteExperiment,
  deleteExperimentAttachment,
  duplicateExperiment,
  loadExperimentBundle,
  loadExperimentReferenceData,
  loadExperimentsForCompare,
  updateExperiment,
  uploadExperimentAttachment,
  watchExperiment,
  watchExperimentIndex,
} from "@/lib/experiments/repository";

const TEMPLATE_ID = "30000000-0000-4000-8000-000000000001";

const experiment = {
  id: "00000000-0000-4000-8000-000000000001",
  experiment_no: 1,
  task_id: "00000000-0000-4000-8000-000000000010",
  owner_id: "00000000-0000-4000-8000-000000000020",
  name: "Experiment one",
  status: "planned",
  baseline_experiment_id: null,
  template_id: null,
  archived_at: null,
  core_revision: 1,
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
} satisfies Experiment;

const attachment = {
  id: "00000000-0000-4000-8000-000000000100",
  task_id: experiment.task_id,
  experiment_id: experiment.id,
  url: "https://example.test/image.png",
  path: "task/experiment/image.png",
  caption: "",
  position: 0,
  template_key_id: null,
  archived_at: null,
  created_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T00:00:00.000Z",
} satisfies Attachment;

function enqueue(
  table: string,
  operation: "select" | "insert" | "update" | "delete",
  response: { data: unknown; error: { message: string } | null },
) {
  const key = `${table}:${operation}`;
  mocks.responses.set(key, [...(mocks.responses.get(key) ?? []), response]);
}

function trace(
  table: string,
  operation: "select" | "insert" | "update" | "delete",
) {
  const found = mocks.traces.find(
    (candidate) =>
      candidate.table === table && candidate.operation === operation,
  );
  if (!found) throw new Error(`Missing ${table}:${operation} trace`);
  return found;
}

function joinedRow(
  row: Experiment,
): ExperimentListRow {
  return {
    ...row,
    task: { id: row.task_id, title: "Task" },
    owner: {
      id: row.owner_id!,
      name: "Owner",
      initials: "OW",
      position: 0,
      created_at: "2026-07-24T00:00:00.000Z",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.responses.clear();
  mocks.registrations.length = 0;
  mocks.traces.length = 0;
  mocks.storage.upload.mockResolvedValue({ error: null });
  mocks.storage.getPublicUrl.mockReturnValue({
    data: { publicUrl: "https://example.test/image.png" },
  });
  mocks.storage.remove.mockResolvedValue({ error: null });
});

describe("experiment update concurrency boundary", () => {
  it("sends only editable fields even when passed a structurally wider object", async () => {
    const patch = editableExperimentPatch(experiment);
    const widerPatch = {
      ...patch,
      id: "attacker-controlled-id",
      task_id: "attacker-controlled-task",
      experiment_no: 999,
      created_at: "attacker-controlled-created-at",
      updated_at: "attacker-controlled-updated-at",
      position: 999,
    };
    enqueue("experiments", "update", { data: null, error: null });

    await updateExperiment(
      experiment.id,
      experiment.updated_at,
      widerPatch,
    );

    expect(trace("experiments", "update").updatePayload).toEqual(patch);
  });

  it("matches both the id and previously loaded updated_at", async () => {
    enqueue("experiments", "update", { data: null, error: null });

    await updateExperiment(
      experiment.id,
      experiment.updated_at,
      editableExperimentPatch(experiment),
    );

    expect(trace("experiments", "update").eqCalls).toEqual([
      ["id", experiment.id],
      ["updated_at", experiment.updated_at],
    ]);
  });

  it("throws a query error", async () => {
    enqueue("experiments", "update", {
      data: null,
      error: { message: "update failed" },
    });

    await expect(
      updateExperiment(
        experiment.id,
        experiment.updated_at,
        editableExperimentPatch(experiment),
      ),
    ).rejects.toThrow("update failed");
  });

  it("returns an explicit conflict for a successful zero-row update", async () => {
    enqueue("experiments", "update", { data: null, error: null });

    await expect(
      updateExperiment(
        experiment.id,
        experiment.updated_at,
        editableExperimentPatch(experiment),
      ),
    ).resolves.toEqual({ ok: false, conflict: true });
  });
});

describe("required experiment inputs", () => {
  it.each([
    [
      { taskId: " ", templateId: TEMPLATE_ID, name: "Experiment", ownerId: experiment.owner_id! },
      "Task is required.",
    ],
    [
      { taskId: experiment.task_id, templateId: " ", name: "Experiment", ownerId: experiment.owner_id! },
      "Template is required.",
    ],
    [
      { taskId: experiment.task_id, templateId: TEMPLATE_ID, name: " \t", ownerId: experiment.owner_id! },
      "Experiment name is required.",
    ],
    [
      { taskId: experiment.task_id, templateId: TEMPLATE_ID, name: "Experiment", ownerId: "\n" },
      "Experiment owner is required.",
    ],
  ])("rejects invalid create input before querying", async (input, message) => {
    await expect(createExperiment(input)).rejects.toThrow(message);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    [{ name: " ", ownerId: experiment.owner_id! }, "Experiment name is required."],
    [{ name: "Experiment", ownerId: "\t" }, "Experiment owner is required."],
  ])("rejects invalid duplicate input before querying", async (input, message) => {
    await expect(duplicateExperiment(experiment, input)).rejects.toThrow(message);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("trims required create values before querying and inserting", async () => {
    enqueue("experiments", "select", { data: [], error: null });
    enqueue("experiments", "insert", { data: experiment, error: null });

    await createExperiment({
      taskId: ` ${experiment.task_id} `,
      templateId: ` ${TEMPLATE_ID} `,
      name: "  Experiment one  ",
      ownerId: ` ${experiment.owner_id!} `,
    });

    expect(trace("experiments", "select").eqCalls).toContainEqual([
      "task_id",
      experiment.task_id,
    ]);
    expect(trace("experiments", "insert").insertPayload).toMatchObject({
      task_id: experiment.task_id,
      template_id: TEMPLATE_ID,
      name: "Experiment one",
      owner_id: experiment.owner_id,
    });
  });

  it("trims required duplicate values before querying and inserting", async () => {
    enqueue("experiments", "select", { data: [], error: null });
    enqueue("experiments", "insert", { data: experiment, error: null });

    await duplicateExperiment(experiment, {
      name: "  Copy  ",
      ownerId: ` ${experiment.owner_id!} `,
    });

    expect(trace("experiments", "insert").insertPayload).toMatchObject({
      task_id: experiment.task_id,
      name: "Copy",
      owner_id: experiment.owner_id,
      baseline_experiment_id: experiment.id,
    });
  });

  it.each([
    ["create", async () => createExperiment({
      taskId: experiment.task_id,
      templateId: TEMPLATE_ID,
      name: "New",
      ownerId: experiment.owner_id!,
    })],
    ["duplicate", async () => duplicateExperiment(experiment, {
      name: "Copy",
      ownerId: experiment.owner_id!,
    })],
  ])("uses deterministic tie-breaking when allocating %s position", async (
    _kind,
    operation,
  ) => {
    enqueue("experiments", "select", {
      data: [{ position: 4 }],
      error: null,
    });
    enqueue("experiments", "insert", { data: experiment, error: null });

    await operation();

    expect(trace("experiments", "select").orderCalls).toEqual([
      ["position", { ascending: false }],
      ["experiment_no", { ascending: false }],
    ]);
    expect(trace("experiments", "insert").insertPayload).toMatchObject({
      position: 5,
    });
  });
});

describe("repository query contracts", () => {
  it("normalizes Task owners from UUID relationships", async () => {
    enqueue("tasks", "select", {
      data: [{
        id: experiment.task_id,
        module_id: "00000000-0000-4000-8000-000000000011",
        title: "Task",
        status: "todo",
        assignees: ["stale name"],
        notes: "",
        tags: ["NPU"],
        priority: "high",
        due_date: "2026-08-01",
        position: 0,
        created_at: "2026-07-24T00:00:00.000Z",
        updated_at: "2026-07-24T00:00:00.000Z",
        task_assignees: [{
          member_id: experiment.owner_id,
          member: { name: "Owner" },
        }],
      }],
      error: null,
    });
    enqueue("members", "select", { data: [], error: null });

    const referenceData = await loadExperimentReferenceData();

    expect(referenceData.tasks[0].assignees).toEqual(["Owner"]);
    expect(referenceData.tasks[0]).not.toHaveProperty("task_assignees");
    expect(trace("tasks", "select").selectCalls[0]).toContain(
      "task_assignees",
    );
  });

  it("uses the PostgREST-compatible baseline column hint in the bundle select", async () => {
    enqueue("experiments", "select", { data: null, error: null });

    await expect(loadExperimentBundle(experiment.id)).resolves.toBeNull();

    const select = trace("experiments", "select").selectCalls[0];
    expect(select).toContain(
      "baseline:experiments!baseline_experiment_id(",
    );
    expect(select).not.toContain(
      "baseline:experiments!experiments_baseline_experiment_id_fkey(",
    );
  });

  it("preserves caller order when loading comparison rows", async () => {
    const second = {
      ...experiment,
      id: "00000000-0000-4000-8000-000000000002",
      experiment_no: 2,
      name: "Experiment two",
    };
    enqueue("experiments", "select", {
      data: [joinedRow(experiment), joinedRow(second)],
      error: null,
    });

    const rows = await loadExperimentsForCompare([
      second.id,
      experiment.id,
      "00000000-0000-4000-8000-000000000099",
    ]);

    expect(rows.map((row) => row.id)).toEqual([second.id, experiment.id]);
  });
});

describe("experiment attachment consistency", () => {
  it("removes an uploaded object when the attachment insert fails", async () => {
    enqueue("attachments", "insert", {
      data: null,
      error: { message: "insert failed" },
    });

    await expect(
      uploadExperimentAttachment(experiment, new File(["plot"], "plot.png"), 0),
    ).rejects.toThrow("insert failed");

    const uploadedPath = mocks.storage.upload.mock.calls[0][0] as string;
    expect(mocks.storage.remove).toHaveBeenCalledWith([uploadedPath]);
  });

  it("reports both failures when insert compensation also fails", async () => {
    enqueue("attachments", "insert", {
      data: null,
      error: { message: "insert failed" },
    });
    mocks.storage.remove.mockResolvedValue({
      error: { message: "cleanup failed" },
    });

    await expect(
      uploadExperimentAttachment(experiment, new File(["plot"], "plot.png"), 0),
    ).rejects.toThrow(
      "Attachment insert failed: insert failed; Storage cleanup failed: cleanup failed",
    );
  });

  it("deletes the database row before removing its Storage object", async () => {
    enqueue("attachments", "delete", { data: null, error: null });

    await deleteExperimentAttachment(attachment);

    const deletion = trace("attachments", "delete");
    expect(deletion.eqCalls).toContainEqual(["id", attachment.id]);
    expect(
      deletion.query!.eq.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.storage.remove.mock.invocationCallOrder[0]);
  });

  it("reports a Storage failure after the attachment row is deleted", async () => {
    enqueue("attachments", "delete", { data: null, error: null });
    mocks.storage.remove.mockResolvedValue({
      error: { message: "cleanup failed" },
    });

    await expect(deleteExperimentAttachment(attachment)).rejects.toThrow(
      "Attachment record was deleted, but Storage cleanup failed: cleanup failed",
    );
  });

  it("deletes the experiment row before removing all Storage objects", async () => {
    enqueue("attachments", "select", {
      data: [{ path: "one.png" }, { path: "two.png" }],
      error: null,
    });
    enqueue("experiments", "delete", { data: null, error: null });

    await deleteExperiment(experiment);

    const deletion = trace("experiments", "delete");
    expect(deletion.eqCalls).toContainEqual(["id", experiment.id]);
    expect(
      deletion.query!.eq.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.storage.remove.mock.invocationCallOrder[0]);
    expect(mocks.storage.remove).toHaveBeenCalledWith(["one.png", "two.png"]);
  });

  it("reports Storage failure after the experiment row is deleted", async () => {
    enqueue("attachments", "select", {
      data: [{ path: "one.png" }],
      error: null,
    });
    enqueue("experiments", "delete", { data: null, error: null });
    mocks.storage.remove.mockResolvedValue({
      error: { message: "cleanup failed" },
    });

    await expect(deleteExperiment(experiment)).rejects.toThrow(
      "Experiment was deleted, but Storage cleanup failed: cleanup failed",
    );
  });
});

describe("experiment realtime subscriptions", () => {
  it("registers related-row filters and unsubscribes its channel", () => {
    const unsubscribe = watchExperiment(experiment.id, vi.fn(), vi.fn());

    expect(mocks.registrations.map(({ filter }) => filter)).toEqual([
      { event: "*", schema: "public", table: "experiments" },
      {
        event: "*",
        schema: "public",
        table: "activity",
        filter: `experiment_id=eq.${experiment.id}`,
      },
      {
        event: "*",
        schema: "public",
        table: "attachments",
        filter: `experiment_id=eq.${experiment.id}`,
      },
    ]);

    unsubscribe();

    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel);
  });

  it("reloads Task references when UUID assignments change", () => {
    const unsubscribe = watchExperimentIndex(vi.fn());

    expect(mocks.registrations.map(({ filter }) => filter)).toEqual([
      { event: "*", schema: "public", table: "experiments" },
      { event: "*", schema: "public", table: "tasks" },
      { event: "*", schema: "public", table: "task_assignees" },
      { event: "*", schema: "public", table: "members" },
    ]);

    unsubscribe();

    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel);
  });
});
