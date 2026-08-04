import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentApiError } from "@/lib/agent-api/errors";
import type { AgentContext, ApiScope } from "@/lib/agent-api/types";
import type {
  TaskMutationDto,
} from "@/lib/agent-api/mutation-repository";
import type { ExperimentDetailDto } from "@/lib/agent-api/read-repository";

const API_KEY_ID = "40000000-0000-4000-8000-000000000001";
const MEMBER_ID = "20000000-0000-4000-8000-000000000001";
const ALICE_ID = "20000000-0000-4000-8000-000000000002";
const MODULE_ID = "10000000-0000-4000-8000-000000000001";
const TASK_ID = "30000000-0000-4000-8000-000000000001";
const OTHER_TASK_ID = "30000000-0000-4000-8000-000000000002";
const EXPERIMENT_ID = "60000000-0000-4000-8000-000000000001";
const REQUEST_ID = "req_write_route";
const OLD_ETAG = "2026-07-29T11:00:00.000Z";
const UPDATED_AT = "2026-07-29T12:00:00.000Z";
const CREATE_HASH =
  "541f2fb8c5f7ed61a3c370decb029c5c69871c5accda1ca2aa266fe7850e1ef6";

const context: AgentContext = {
  apiKeyId: API_KEY_ID,
  keyPrefix: "tb_live_AAECAwQF",
  memberId: MEMBER_ID,
  memberName: "Bruce",
  scopes: new Set(["tasks:write", "experiments:write"]),
  expiresAt: null,
};

vi.mock("@/lib/agent-api/handler", () => ({
  withAgent: vi.fn(async (
    _request: Request,
    _scope: ApiScope,
    handler: (agent: AgentContext, requestId: string) => Promise<Response>,
  ) => {
    try {
      return await handler(context, REQUEST_ID);
    } catch (reason) {
      const error = reason instanceof AgentApiError
        ? reason
        : new AgentApiError(
          500,
          "INTERNAL_ERROR",
          "An internal error occurred.",
          true,
        );
      const headers = new Headers({ "Cache-Control": "no-store" });
      if (error.code === "WRITE_RATE_LIMITED") {
        headers.set("Retry-After", "60");
      }
      return Response.json({
        error: {
          code: error.code,
          message: error.message,
          request_id: REQUEST_ID,
          retryable: error.retryable,
          ...(error.details === undefined
            ? {}
            : { details: error.details }),
        },
      }, { status: error.status, headers });
    }
  }),
}));

vi.mock("@/lib/agent-api/permissions", () => ({
  requireTaskCollaboration: vi.fn(),
}));

vi.mock("@/lib/agent-api/read-repository", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/agent-api/read-repository")
  >();
  return {
    ...actual,
    getTask: vi.fn(),
    getExperiment: vi.fn(),
  };
});

vi.mock("@/lib/agent-api/mutation-repository", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/agent-api/mutation-repository")
  >();
  return {
    ...actual,
    patchTask: vi.fn(),
    createExperiment: vi.fn(),
    patchExperiment: vi.fn(),
  };
});

import { withAgent } from "@/lib/agent-api/handler";
import { requireTaskCollaboration } from "@/lib/agent-api/permissions";
import {
  patchTask,
} from "@/lib/agent-api/mutation-repository";
import {
  getExperiment,
  getTask,
} from "@/lib/agent-api/read-repository";
import * as taskRoute from "@/app/api/agent/v1/tasks/[id]/route";

function task(): TaskMutationDto {
  return {
    id: TASK_ID,
    module_id: MODULE_ID,
    title: "Tune matmul",
    status: "blocked",
    notes: "Profile.",
    tags: ["NPU", "Verifier"],
    priority: "urgent",
    due_date: "2026-08-15",
    position: 2,
    created_at: "2026-07-28T10:00:00.000Z",
    updated_at: UPDATED_AT,
  };
}

function jsonRequest(
  method: "PATCH" | "POST",
  path: string,
  body: unknown,
  headers: HeadersInit = {},
): Request {
  return new Request(`https://board.test/api/agent/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function patchHeaders(ifMatch = OLD_ETAG): HeadersInit {
  return { "If-Match": `"${ifMatch}"` };
}

function taskParams(id = TASK_ID) {
  return { params: Promise.resolve({ id }) };
}

async function responseBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("Task PATCH route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(patchTask).mockResolvedValue({
      data: task(),
      idempotencyReplayed: false,
    });
  });

  it("uses tasks:write without requiring board:read and forwards only parsed fields", async () => {
    const request = jsonRequest("PATCH", `/tasks/${TASK_ID}`, {
      changes: {
        title: "Tune matmul",
        status: "blocked",
        notes: "Profile.",
        tags: ["NPU", "Verifier"],
        priority: "urgent",
        due_date: "2026-08-15",
        position: 2,
      },
    }, patchHeaders());

    const response = await taskRoute.PATCH(request, taskParams());

    expect(withAgent).toHaveBeenCalledWith(
      request,
      "tasks:write",
      expect.any(Function),
    );
    expect(requireTaskCollaboration).toHaveBeenCalledWith(context, TASK_ID);
    expect(patchTask).toHaveBeenCalledWith({
      context,
      taskId: TASK_ID,
      expectedUpdatedAt: OLD_ETAG,
      changes: {
        title: "Tune matmul",
        status: "blocked",
        notes: "Profile.",
        tags: ["NPU", "Verifier"],
        priority: "urgent",
        due_date: "2026-08-15",
        position: 2,
      },
      requestId: REQUEST_ID,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe(`"${UPDATED_AT}"`);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await responseBody(response)).toEqual({
      data: task(),
      meta: { request_id: REQUEST_ID },
    });
  });

  it.each(["module_id", "assignees", "task_assignees", "id", "updated_at"])(
    "rejects protected Task field %s without calling the RPC",
    async (field) => {
      const response = await taskRoute.PATCH(
        jsonRequest("PATCH", `/tasks/${TASK_ID}`, {
          changes: { [field]: "forbidden" },
        }, patchHeaders()),
        taskParams(),
      );

      expect(response.status).toBe(422);
      expect(await responseBody(response)).toMatchObject({
        error: { code: "FIELD_NOT_WRITABLE", details: { field } },
      });
      expect(patchTask).not.toHaveBeenCalled();
    },
  );

  it.each([
    [undefined, "MISSING_IF_MATCH"],
    ["", "MISSING_IF_MATCH"],
    ["unquoted", "MISSING_IF_MATCH"],
    ['""', "MISSING_IF_MATCH"],
    [`"${OLD_ETAG}", "${UPDATED_AT}"`, "MISSING_IF_MATCH"],
    ['"not-a-timestamp"', "MISSING_IF_MATCH"],
    ['"2026-02-30T12:00:00.000Z"', "MISSING_IF_MATCH"],
    ['"2026-07-29T11:00:00+16:00"', "MISSING_IF_MATCH"],
    ['"2026-07-29T11:00:00-16:00"', "MISSING_IF_MATCH"],
    ['"2026-07-29T11:00:00+23:59"', "MISSING_IF_MATCH"],
    ['"2026-07-29T11:00:00-23:59"', "MISSING_IF_MATCH"],
  ])("rejects invalid If-Match %s before reading JSON", async (value, code) => {
    const headers: Record<string, string> = value === undefined
      ? {}
      : { "If-Match": value };
    const request = jsonRequest(
      "PATCH",
      `/tasks/${TASK_ID}`,
      { changes: { notes: "No write" } },
      headers,
    );
    const text = vi.spyOn(request, "text");

    const response = await taskRoute.PATCH(request, taskParams());

    expect(response.status).toBe(400);
    expect(await responseBody(response)).toMatchObject({ error: { code } });
    expect(text).not.toHaveBeenCalled();
    expect(patchTask).not.toHaveBeenCalled();
  });

  it.each([
    "2026-07-29T11:00:00Z",
    "2026-07-29T11:00:00.123456Z",
    "2026-07-29T11:00:00+00:00",
    "2026-07-29T11:00:00.123456789+15:59",
    "2026-07-29T11:00:00.123456789-15:59",
    "2026-07-29T11:00:00.123456-04:00",
  ])("forwards valid If-Match %s unchanged to Task RPC", async (ifMatch) => {
    const response = await taskRoute.PATCH(
      jsonRequest(
        "PATCH",
        `/tasks/${TASK_ID}`,
        { changes: { notes: "Valid revision" } },
        patchHeaders(ifMatch),
      ),
      taskParams(),
    );

    expect(response.status).toBe(200);
    expect(patchTask).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUpdatedAt: ifMatch }),
    );
  });

  it("reads JSON exactly once and returns the new quoted ETag", async () => {
    const request = jsonRequest(
      "PATCH",
      `/tasks/${TASK_ID}`,
      { changes: { notes: "Once" } },
      patchHeaders(),
    );
    const text = vi.spyOn(request, "text");

    const response = await taskRoute.PATCH(request, taskParams());

    expect(text).toHaveBeenCalledOnce();
    expect(response.headers.get("etag")).toBe(`"${UPDATED_AT}"`);
  });

  it("returns a stale RPC race as 412 with no ETag", async () => {
    vi.mocked(patchTask).mockRejectedValue(
      new AgentApiError(
        412,
        "VERSION_CONFLICT",
        "The resource changed since it was read.",
      ),
    );

    const response = await taskRoute.PATCH(
      jsonRequest(
        "PATCH",
        `/tasks/${TASK_ID}`,
        { changes: { notes: "Stale" } },
        patchHeaders(),
      ),
      taskParams(),
    );

    expect(response.status).toBe(412);
    expect(response.headers.get("etag")).toBeNull();
    expect(await responseBody(response)).toMatchObject({
      error: { code: "VERSION_CONFLICT", request_id: REQUEST_ID },
    });
  });

  it("surfaces a scope or assignment revocation from the authoritative RPC", async () => {
    vi.mocked(patchTask).mockRejectedValue(
      new AgentApiError(
        403,
        "TASK_SCOPE_FORBIDDEN",
        "The Agent no longer has access to this Task.",
      ),
    );

    const response = await taskRoute.PATCH(
      jsonRequest(
        "PATCH",
        `/tasks/${TASK_ID}`,
        { changes: { notes: "Race" } },
        patchHeaders(),
      ),
      taskParams(),
    );

    expect(requireTaskCollaboration).toHaveBeenCalledOnce();
    expect(response.status).toBe(403);
    expect(await responseBody(response)).toMatchObject({
      error: { code: "TASK_SCOPE_FORBIDDEN" },
    });
  });

  it.each([
    [`/tasks/${TASK_ID}?debug=1`, TASK_ID],
    [`/tasks/${TASK_ID}?debug=1&debug=2`, TASK_ID],
    ["/tasks/30000000-0000-4000-8000-00000000000A", "30000000-0000-4000-8000-00000000000A"],
  ])("rejects unsupported query or noncanonical resource %s", async (path, id) => {
    const response = await taskRoute.PATCH(
      jsonRequest(
        "PATCH",
        path,
        { changes: { notes: "No write" } },
        patchHeaders(),
      ),
      taskParams(id),
    );

    expect(response.status).toBe(400);
    expect(requireTaskCollaboration).not.toHaveBeenCalled();
    expect(patchTask).not.toHaveBeenCalled();
  });
});
