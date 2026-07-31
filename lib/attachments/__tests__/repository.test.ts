import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attachment } from "@/lib/types";

const mocks = vi.hoisted(() => {
  type QueryResponse = {
    data: unknown;
    error: { message: string } | null;
  };
  type QueryTrace = {
    table: string;
    operation: "insert" | "update" | "delete";
    payload?: unknown;
    eqCalls: Array<[string, unknown]>;
    query?: { eq: ReturnType<typeof vi.fn> };
  };

  const responses = new Map<string, QueryResponse[]>();
  const traces: QueryTrace[] = [];

  function responseFor(trace: QueryTrace): QueryResponse {
    return responses.get(`${trace.table}:${trace.operation}`)?.shift()
      ?? { data: null, error: null };
  }

  function makeQuery(table: string) {
    const trace: QueryTrace = {
      table,
      operation: "insert",
      eqCalls: [],
    };
    traces.push(trace);
    const query = {
      insert: vi.fn((payload: unknown) => {
        trace.operation = "insert";
        trace.payload = payload;
        return query;
      }),
      update: vi.fn((payload: unknown) => {
        trace.operation = "update";
        trace.payload = payload;
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

  return {
    from: vi.fn((table: string) => makeQuery(table)),
    responses,
    storage,
    storageFrom: vi.fn(() => storage),
    traces,
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  },
}));

import {
  deleteAttachment,
  updateAttachmentCaption,
  uploadAttachment,
} from "@/lib/attachments/repository";

const attachment = {
  id: "attachment-a",
  task_id: "task-a",
  experiment_id: null,
  url: "https://storage.test/task-a/task/plot.png",
  path: "task-a/task/object-plot.png",
  caption: "Latency plot",
  position: 0,
  template_key_id: null,
  archived_at: null,
  created_at: "2026-07-27T00:00:00.000Z",
  updated_at: "2026-07-27T00:00:00.000Z",
} satisfies Attachment;

function enqueue(
  table: string,
  operation: QueryTraceOperation,
  response: { data: unknown; error: { message: string } | null },
) {
  const key = `${table}:${operation}`;
  mocks.responses.set(key, [...(mocks.responses.get(key) ?? []), response]);
}

type QueryTraceOperation = "insert" | "update" | "delete";

function trace(table: string, operation: QueryTraceOperation) {
  const found = mocks.traces.find(
    (candidate) => (
      candidate.table === table && candidate.operation === operation
    ),
  );
  if (!found) throw new Error(`Missing ${table}:${operation} trace`);
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.responses.clear();
  mocks.traces.length = 0;
  mocks.storage.upload.mockResolvedValue({ error: null });
  mocks.storage.getPublicUrl.mockReturnValue({
    data: { publicUrl: attachment.url },
  });
  mocks.storage.remove.mockResolvedValue({ error: null });
});

describe("attachment repository", () => {
  it("uploads a Task-level attachment in the Task scope", async () => {
    enqueue("attachments", "insert", { data: null, error: null });
    const file = new File(["plot"], "plot image.png", { type: "image/png" });

    await uploadAttachment(
      { taskId: "task-a", experimentId: null },
      file,
      0,
    );

    expect(mocks.storageFrom).toHaveBeenCalledWith("task-images");
    const uploadedPath = mocks.storage.upload.mock.calls[0][0] as string;
    expect(uploadedPath).toMatch(
      /^task-a\/task\/[0-9a-f-]+-plot_image\.png$/,
    );
    expect(mocks.storage.upload).toHaveBeenCalledWith(
      uploadedPath,
      file,
      { upsert: false },
    );
    expect(trace("attachments", "insert").payload).toEqual({
      task_id: "task-a",
      experiment_id: null,
      url: attachment.url,
      path: uploadedPath,
      caption: "",
      position: 0,
    });
  });

  it("keeps the Experiment UUID in an Experiment attachment path", async () => {
    enqueue("attachments", "insert", { data: null, error: null });

    await uploadAttachment(
      { taskId: "task-a", experimentId: "experiment-a" },
      new File(["plot"], "plot.png"),
      3,
    );

    expect(mocks.storage.upload.mock.calls[0][0]).toMatch(
      /^task-a\/experiment-a\/[0-9a-f-]+-plot\.png$/,
    );
    expect(trace("attachments", "insert").payload).toMatchObject({
      task_id: "task-a",
      experiment_id: "experiment-a",
      position: 3,
    });
  });

  it("removes the uploaded object when its attachment row insert fails", async () => {
    enqueue("attachments", "insert", {
      data: null,
      error: { message: "insert failed" },
    });

    await expect(uploadAttachment(
      { taskId: "task-a", experimentId: null },
      new File(["plot"], "plot.png"),
      0,
    )).rejects.toThrow("insert failed");

    const uploadedPath = mocks.storage.upload.mock.calls[0][0] as string;
    expect(mocks.storage.remove).toHaveBeenCalledWith([uploadedPath]);
  });

  it("reports insert and compensation failures together", async () => {
    enqueue("attachments", "insert", {
      data: null,
      error: { message: "insert failed" },
    });
    mocks.storage.remove.mockResolvedValue({
      error: { message: "cleanup failed" },
    });

    await expect(uploadAttachment(
      { taskId: "task-a", experimentId: null },
      new File(["plot"], "plot.png"),
      0,
    )).rejects.toThrow(
      "Attachment insert failed: insert failed; Storage cleanup failed: cleanup failed",
    );
  });

  it("updates only the requested attachment caption", async () => {
    enqueue("attachments", "update", { data: null, error: null });

    await updateAttachmentCaption(attachment.id, "Updated plot");

    expect(trace("attachments", "update").payload).toEqual({
      caption: "Updated plot",
    });
    expect(trace("attachments", "update").eqCalls).toEqual([
      ["id", attachment.id],
    ]);
  });

  it("deletes the row before its Storage object", async () => {
    enqueue("attachments", "delete", { data: null, error: null });

    await deleteAttachment(attachment);

    const deletion = trace("attachments", "delete");
    expect(deletion.eqCalls).toEqual([["id", attachment.id]]);
    expect(deletion.query!.eq.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.storage.remove.mock.invocationCallOrder[0]);
    expect(mocks.storage.remove).toHaveBeenCalledWith([attachment.path]);
  });

  it("reports Storage cleanup failure after the row is deleted", async () => {
    enqueue("attachments", "delete", { data: null, error: null });
    mocks.storage.remove.mockResolvedValue({
      error: { message: "cleanup failed" },
    });

    await expect(deleteAttachment(attachment)).rejects.toThrow(
      "Attachment record was deleted, but Storage cleanup failed: cleanup failed",
    );
  });
});
