import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentApiError } from "@/lib/agent-api/errors";
import type { AgentContext, ApiScope } from "@/lib/agent-api/types";
import type {
  ExperimentMutationDto,
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
const BASELINE_ID = "60000000-0000-4000-8000-000000000002";
const IDEMPOTENCY_KEY = "70000000-0000-4000-8000-000000000001";
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
  createExperiment,
  patchExperiment,
  patchTask,
} from "@/lib/agent-api/mutation-repository";
import {
  getExperiment,
  getTask,
} from "@/lib/agent-api/read-repository";
import * as taskRoute from "@/app/api/agent/v1/tasks/[id]/route";
import * as createExperimentRoute from "@/app/api/agent/v1/tasks/[id]/experiments/route";
import * as experimentRoute from "@/app/api/agent/v1/experiments/[id]/route";

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

function experiment(
  overrides: Partial<ExperimentDetailDto> = {},
): ExperimentDetailDto {
  return {
    id: EXPERIMENT_ID,
    experiment_no: 7,
    task_id: TASK_ID,
    owner_id: ALICE_ID,
    name: "Alice experiment",
    status: "planned",
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
    notes: "",
    metrics: {},
    featured_metric_keys: [],
    result_summary: "",
    decision_outcome: null,
    decision_notes: "",
    position: 1,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-28T10:00:00.000Z",
    updated_at: OLD_ETAG,
    task: { id: TASK_ID, title: "Tune matmul" },
    owner: null,
    attachments: [],
    ...overrides,
  };
}

function experimentMutation(
  overrides: Partial<ExperimentMutationDto> = {},
): ExperimentMutationDto {
  const { task: _task, owner: _owner, attachments: _attachments, ...row } =
    experiment(overrides);
  return { ...row, updated_at: UPDATED_AT };
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

function experimentParams(id = EXPERIMENT_ID) {
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

describe("nested Experiment POST route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createExperiment).mockResolvedValue({
      data: experimentMutation({
        owner_id: MEMBER_ID,
        name: "Agent experiment",
      }),
      idempotencyReplayed: false,
    });
  });

  it("creates from exactly a trimmed name and server-derived Task/Member", async () => {
    const request = jsonRequest(
      "POST",
      `/tasks/${TASK_ID}/experiments`,
      { name: "  Agent experiment  " },
      { "Idempotency-Key": IDEMPOTENCY_KEY },
    );

    const response = await createExperimentRoute.POST(request, taskParams());

    expect(withAgent).toHaveBeenCalledWith(
      request,
      "experiments:write",
      expect.any(Function),
    );
    expect(requireTaskCollaboration).toHaveBeenCalledWith(context, TASK_ID);
    expect(createExperiment).toHaveBeenCalledWith({
      context,
      taskId: TASK_ID,
      name: "Agent experiment",
      idempotencyKey: IDEMPOTENCY_KEY,
      requestHash: CREATE_HASH,
      requestId: REQUEST_ID,
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("etag")).toBe(`"${UPDATED_AT}"`);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await responseBody(response)).toEqual({
      data: experimentMutation({
        owner_id: MEMBER_ID,
        name: "Agent experiment",
      }),
      meta: {
        request_id: REQUEST_ID,
        idempotency_replayed: false,
      },
    });
  });

  it("returns 200 and exact replay metadata for an idempotent replay", async () => {
    vi.mocked(createExperiment).mockResolvedValue({
      data: experimentMutation({
        owner_id: MEMBER_ID,
        name: "Agent experiment",
      }),
      idempotencyReplayed: true,
    });

    const response = await createExperimentRoute.POST(
      jsonRequest(
        "POST",
        `/tasks/${TASK_ID}/experiments`,
        { name: "Agent experiment" },
        { "Idempotency-Key": IDEMPOTENCY_KEY },
      ),
      taskParams(),
    );

    expect(response.status).toBe(200);
    expect(await responseBody(response)).toMatchObject({
      meta: {
        request_id: REQUEST_ID,
        idempotency_replayed: true,
      },
    });
  });

  it.each([
    undefined,
    "",
    "not-a-uuid",
    "70000000-0000-4000-8000-00000000000A",
    `${IDEMPOTENCY_KEY}, 70000000-0000-4000-8000-000000000002`,
  ])("rejects absent or noncanonical Idempotency-Key %s", async (value) => {
    const headers: Record<string, string> = value === undefined
      ? {}
      : { "Idempotency-Key": value };
    const request = jsonRequest(
      "POST",
      `/tasks/${TASK_ID}/experiments`,
      { name: "Agent experiment" },
      headers,
    );
    const text = vi.spyOn(request, "text");

    const response = await createExperimentRoute.POST(request, taskParams());

    expect(response.status).toBe(400);
    expect(await responseBody(response)).toMatchObject({
      error: { code: "MISSING_IDEMPOTENCY_KEY" },
    });
    expect(text).not.toHaveBeenCalled();
    expect(createExperiment).not.toHaveBeenCalled();
  });

  it.each([
    "status",
    "config",
    "owner_id",
    "task_id",
    "experiment_no",
    "created_at",
  ])("rejects Experiment create field %s without RPC", async (field) => {
    const response = await createExperimentRoute.POST(
      jsonRequest(
        "POST",
        `/tasks/${TASK_ID}/experiments`,
        { name: "Agent experiment", [field]: "forbidden" },
        { "Idempotency-Key": IDEMPOTENCY_KEY },
      ),
      taskParams(),
    );

    expect(response.status).toBe(422);
    expect(createExperiment).not.toHaveBeenCalled();
  });

  it("reads POST JSON exactly once", async () => {
    const request = jsonRequest(
      "POST",
      `/tasks/${TASK_ID}/experiments`,
      { name: "Agent experiment" },
      { "Idempotency-Key": IDEMPOTENCY_KEY },
    );
    const text = vi.spyOn(request, "text");

    await createExperimentRoute.POST(request, taskParams());

    expect(text).toHaveBeenCalledOnce();
  });

  it.each([
    [`/tasks/${TASK_ID}/experiments?debug=1`, TASK_ID],
    [
      "/tasks/30000000-0000-4000-8000-00000000000A/experiments",
      "30000000-0000-4000-8000-00000000000A",
    ],
  ])("rejects unsupported query or noncanonical Task %s", async (path, id) => {
    const response = await createExperimentRoute.POST(
      jsonRequest(
        "POST",
        path,
        { name: "Agent experiment" },
        { "Idempotency-Key": IDEMPOTENCY_KEY },
      ),
      taskParams(id),
    );

    expect(response.status).toBe(400);
    expect(requireTaskCollaboration).not.toHaveBeenCalled();
    expect(createExperiment).not.toHaveBeenCalled();
  });

  it("surfaces an idempotency request mismatch as 409", async () => {
    vi.mocked(createExperiment).mockRejectedValue(
      new AgentApiError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "Idempotency-Key was already used for a different request.",
      ),
    );

    const response = await createExperimentRoute.POST(
      jsonRequest(
        "POST",
        `/tasks/${TASK_ID}/experiments`,
        { name: "Agent experiment" },
        { "Idempotency-Key": IDEMPOTENCY_KEY },
      ),
      taskParams(),
    );

    expect(response.status).toBe(409);
    expect(await responseBody(response)).toMatchObject({
      error: { code: "IDEMPOTENCY_KEY_REUSED" },
    });
  });
});

describe("Experiment PATCH route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getExperiment).mockResolvedValue(experiment());
    vi.mocked(patchExperiment).mockResolvedValue({
      data: experimentMutation({ notes: "Updated" }),
      idempotencyReplayed: false,
    });
  });

  it("uses experiments:write and lets Bruce patch Alice's Experiment on their shared Task", async () => {
    const request = jsonRequest(
      "PATCH",
      `/experiments/${EXPERIMENT_ID}`,
      { changes: { notes: "Updated" } },
      patchHeaders(),
    );

    const response = await experimentRoute.PATCH(
      request,
      experimentParams(),
    );

    expect(withAgent).toHaveBeenCalledWith(
      request,
      "experiments:write",
      expect.any(Function),
    );
    expect(getExperiment).toHaveBeenCalledWith(EXPERIMENT_ID);
    expect(requireTaskCollaboration).toHaveBeenCalledWith(context, TASK_ID);
    expect(patchExperiment).toHaveBeenCalledWith({
      context,
      experimentId: EXPERIMENT_ID,
      expectedUpdatedAt: OLD_ETAG,
      changes: { notes: "Updated" },
      requestId: REQUEST_ID,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe(`"${UPDATED_AT}"`);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it.each([
    "owner_id",
    "task_id",
    "experiment_no",
    "started_at",
    "completed_at",
    "updated_at",
  ])("rejects protected Experiment field %s without RPC", async (field) => {
    const response = await experimentRoute.PATCH(
      jsonRequest(
        "PATCH",
        `/experiments/${EXPERIMENT_ID}`,
        { changes: { [field]: "forbidden" } },
        patchHeaders(),
      ),
      experimentParams(),
    );

    expect(response.status).toBe(422);
    expect(patchExperiment).not.toHaveBeenCalled();
  });

  it("returns 404 before collaboration when the current Experiment is missing", async () => {
    vi.mocked(getExperiment).mockResolvedValue(null);

    const response = await experimentRoute.PATCH(
      jsonRequest(
        "PATCH",
        `/experiments/${EXPERIMENT_ID}`,
        { changes: { notes: "Missing" } },
        patchHeaders(),
      ),
      experimentParams(),
    );

    expect(response.status).toBe(404);
    expect(await responseBody(response)).toMatchObject({
      error: { code: "EXPERIMENT_NOT_FOUND" },
    });
    expect(requireTaskCollaboration).not.toHaveBeenCalled();
    expect(patchExperiment).not.toHaveBeenCalled();
  });

  it("validates the original-to-target transition, not target-to-itself", async () => {
    const response = await experimentRoute.PATCH(
      jsonRequest(
        "PATCH",
        `/experiments/${EXPERIMENT_ID}`,
        { changes: { status: "completed" } },
        patchHeaders(),
      ),
      experimentParams(),
    );

    expect(response.status).toBe(422);
    expect(await responseBody(response)).toEqual({
      error: {
        code: "WORKFLOW_INVALID",
        message: "Experiment workflow validation failed.",
        request_id: REQUEST_ID,
        retryable: false,
        details: {
          issues: [{
            field: "status",
            message: "Cannot move from Planned to Completed.",
          }],
        },
      },
    });
    expect(patchExperiment).not.toHaveBeenCalled();
  });

  it("validates runnable requirements against the merged candidate", async () => {
    const changes = {
      status: "running" as const,
      data_spec: {
        datasets: [{
          role: "evaluation" as const,
          name: "kernelbench",
          split: "test",
          revision: "v1",
          task_count: 250,
          samples_per_task: 1,
        }],
      },
      object_spec: {
        model: "Qwen",
        harness: "",
        parent_harness: "",
        prompt: "",
        prompt_change: "",
        skills: [],
        tools: [],
      },
      environment_spec: {
        platform: "npu" as const,
        server: "atlas",
        devices: [],
        hardware: "910B",
        evaluator: "",
        revision: "",
        precision_policy: "",
      },
      config: { profile: "defaults" },
    };

    const response = await experimentRoute.PATCH(
      jsonRequest(
        "PATCH",
        `/experiments/${EXPERIMENT_ID}`,
        { changes },
        patchHeaders(),
      ),
      experimentParams(),
    );

    expect(response.status).toBe(200);
    expect(patchExperiment).toHaveBeenCalledWith(
      expect.objectContaining({ changes }),
    );
  });

  it("reports merged-field workflow issues with stable field details", async () => {
    vi.mocked(getExperiment).mockResolvedValue(experiment({
      data_spec: {
        datasets: [{
          role: "evaluation",
          name: "kernelbench",
          split: "test",
          revision: "v1",
          task_count: 250,
          samples_per_task: 1,
        }],
      },
      object_spec: {
        model: "Qwen",
        harness: "",
        parent_harness: "",
        prompt: "",
        prompt_change: "",
        skills: [],
        tools: [],
      },
      environment_spec: {
        platform: "npu",
        server: "atlas",
        devices: [],
        hardware: "",
        evaluator: "",
        revision: "",
        precision_policy: "",
      },
      config: { profile: "defaults" },
    }));

    const response = await experimentRoute.PATCH(
      jsonRequest(
        "PATCH",
        `/experiments/${EXPERIMENT_ID}`,
        {
          changes: {
            status: "running",
            object_spec: {
              model: "",
              harness: "",
              parent_harness: "",
              prompt: "",
              prompt_change: "",
              skills: [],
              tools: [],
            },
          },
        },
        patchHeaders(),
      ),
      experimentParams(),
    );

    expect(response.status).toBe(422);
    expect(await responseBody(response)).toMatchObject({
      error: {
        code: "WORKFLOW_INVALID",
        details: {
          issues: [{
            field: "object_spec.model",
            message: "Add a Model before running.",
          }],
        },
      },
    });
    expect(patchExperiment).not.toHaveBeenCalled();
  });

  it("rejects a self Baseline without querying another Experiment", async () => {
    const response = await experimentRoute.PATCH(
      jsonRequest(
        "PATCH",
        `/experiments/${EXPERIMENT_ID}`,
        { changes: { baseline_experiment_id: EXPERIMENT_ID } },
        patchHeaders(),
      ),
      experimentParams(),
    );

    expect(response.status).toBe(422);
    expect(await responseBody(response)).toMatchObject({
      error: {
        code: "WORKFLOW_INVALID",
        details: {
          issues: [{
            field: "baseline_experiment_id",
            message: "An experiment cannot use itself as Baseline.",
          }],
        },
      },
    });
    expect(getExperiment).toHaveBeenCalledOnce();
    expect(patchExperiment).not.toHaveBeenCalled();
  });

  it("rejects a missing changed Baseline", async () => {
    vi.mocked(getExperiment)
      .mockResolvedValueOnce(experiment())
      .mockResolvedValueOnce(null);

    const response = await experimentRoute.PATCH(
      jsonRequest(
        "PATCH",
        `/experiments/${EXPERIMENT_ID}`,
        { changes: { baseline_experiment_id: BASELINE_ID } },
        patchHeaders(),
      ),
      experimentParams(),
    );

    expect(response.status).toBe(422);
    expect(await responseBody(response)).toMatchObject({
      error: {
        code: "WORKFLOW_INVALID",
        details: {
          issues: [{
            field: "baseline_experiment_id",
            message: "Baseline Experiment was not found.",
          }],
        },
      },
    });
  });

  it("rejects a changed Baseline under another Task", async () => {
    vi.mocked(getExperiment)
      .mockResolvedValueOnce(experiment())
      .mockResolvedValueOnce(experiment({
        id: BASELINE_ID,
        task_id: OTHER_TASK_ID,
      }));

    const response = await experimentRoute.PATCH(
      jsonRequest(
        "PATCH",
        `/experiments/${EXPERIMENT_ID}`,
        { changes: { baseline_experiment_id: BASELINE_ID } },
        patchHeaders(),
      ),
      experimentParams(),
    );

    expect(response.status).toBe(422);
    expect(await responseBody(response)).toMatchObject({
      error: {
        code: "WORKFLOW_INVALID",
        details: {
          issues: [{
            field: "baseline_experiment_id",
            message: "Baseline must belong to the same Task.",
          }],
        },
      },
    });
  });

  it("accepts a changed Baseline under the same Task", async () => {
    vi.mocked(getExperiment)
      .mockResolvedValueOnce(experiment())
      .mockResolvedValueOnce(experiment({ id: BASELINE_ID }));

    const response = await experimentRoute.PATCH(
      jsonRequest(
        "PATCH",
        `/experiments/${EXPERIMENT_ID}`,
        { changes: { baseline_experiment_id: BASELINE_ID } },
        patchHeaders(),
      ),
      experimentParams(),
    );

    expect(response.status).toBe(200);
    expect(patchExperiment).toHaveBeenCalledOnce();
  });

  it.each([
    [{ notes: "Unchanged baseline" }, BASELINE_ID],
    [{ baseline_experiment_id: BASELINE_ID }, BASELINE_ID],
    [{ baseline_experiment_id: null }, BASELINE_ID],
  ])(
    "does not look up an unchanged or null Baseline",
    async (changes, currentBaseline) => {
      vi.mocked(getExperiment).mockResolvedValue(experiment({
        baseline_experiment_id: currentBaseline,
      }));

      const response = await experimentRoute.PATCH(
        jsonRequest(
          "PATCH",
          `/experiments/${EXPERIMENT_ID}`,
          { changes },
          patchHeaders(),
        ),
        experimentParams(),
      );

      expect(response.status).toBe(200);
      expect(getExperiment).toHaveBeenCalledOnce();
      expect(patchExperiment).toHaveBeenCalledOnce();
    },
  );

  it.each([
    [`/experiments/${EXPERIMENT_ID}?debug=1`, EXPERIMENT_ID],
    [
      "/experiments/60000000-0000-4000-8000-00000000000A",
      "60000000-0000-4000-8000-00000000000A",
    ],
  ])("rejects unsupported query or noncanonical Experiment %s", async (path, id) => {
    const response = await experimentRoute.PATCH(
      jsonRequest(
        "PATCH",
        path,
        { changes: { notes: "No write" } },
        patchHeaders(),
      ),
      experimentParams(id),
    );

    expect(response.status).toBe(400);
    expect(getExperiment).not.toHaveBeenCalled();
    expect(patchExperiment).not.toHaveBeenCalled();
  });

  it("does not read JSON or call RPC when If-Match is missing", async () => {
    const request = jsonRequest(
      "PATCH",
      `/experiments/${EXPERIMENT_ID}`,
      { changes: { notes: "No write" } },
    );
    const text = vi.spyOn(request, "text");

    const response = await experimentRoute.PATCH(
      request,
      experimentParams(),
    );

    expect(response.status).toBe(400);
    expect(text).not.toHaveBeenCalled();
    expect(patchExperiment).not.toHaveBeenCalled();
  });

  it.each([
    '"not-a-timestamp"',
    '"2026-02-30T12:00:00.000Z"',
    '"2026-07-29T11:00:00+16:00"',
    '"2026-07-29T11:00:00-16:00"',
    '"2026-07-29T11:00:00+23:59"',
    '"2026-07-29T11:00:00-23:59"',
  ])(
    "rejects invalid Experiment If-Match %s without RPC",
    async (ifMatch) => {
      const request = jsonRequest(
        "PATCH",
        `/experiments/${EXPERIMENT_ID}`,
        { changes: { notes: "No write" } },
        { "If-Match": ifMatch },
      );
      const text = vi.spyOn(request, "text");

      const response = await experimentRoute.PATCH(
        request,
        experimentParams(),
      );

      expect(response.status).toBe(400);
      expect(await responseBody(response)).toMatchObject({
        error: { code: "MISSING_IF_MATCH" },
      });
      expect(text).not.toHaveBeenCalled();
      expect(patchExperiment).not.toHaveBeenCalled();
    },
  );

  it.each([
    "2026-07-29T11:00:00Z",
    "2026-07-29T11:00:00.123456Z",
    "2026-07-29T11:00:00+00:00",
    "2026-07-29T11:00:00.123456789+15:59",
    "2026-07-29T11:00:00.123456789-15:59",
    "2026-07-29T11:00:00.123456+05:30",
  ])(
    "forwards valid If-Match %s unchanged to Experiment RPC",
    async (ifMatch) => {
      const response = await experimentRoute.PATCH(
        jsonRequest(
          "PATCH",
          `/experiments/${EXPERIMENT_ID}`,
          { changes: { notes: "Valid revision" } },
          patchHeaders(ifMatch),
        ),
        experimentParams(),
      );

      expect(response.status).toBe(200);
      expect(patchExperiment).toHaveBeenCalledWith(
        expect.objectContaining({ expectedUpdatedAt: ifMatch }),
      );
    },
  );

  it("keeps a valid stale Experiment timestamp mapped to 412", async () => {
    vi.mocked(patchExperiment).mockRejectedValue(
      new AgentApiError(
        412,
        "VERSION_CONFLICT",
        "The resource changed since it was read.",
      ),
    );

    const response = await experimentRoute.PATCH(
      jsonRequest(
        "PATCH",
        `/experiments/${EXPERIMENT_ID}`,
        { changes: { notes: "Stale" } },
        patchHeaders("2026-07-29T10:00:00.123456+00:00"),
      ),
      experimentParams(),
    );

    expect(response.status).toBe(412);
    expect(await responseBody(response)).toMatchObject({
      error: { code: "VERSION_CONFLICT" },
    });
  });

  it("reads Experiment PATCH JSON exactly once", async () => {
    const request = jsonRequest(
      "PATCH",
      `/experiments/${EXPERIMENT_ID}`,
      { changes: { notes: "Once" } },
      patchHeaders(),
    );
    const text = vi.spyOn(request, "text");

    await experimentRoute.PATCH(request, experimentParams());

    expect(text).toHaveBeenCalledOnce();
  });
});

describe("write route method and runtime surface", () => {
  it("exports Node runtime handlers but no Task/Experiment DELETE", () => {
    expect(taskRoute.runtime).toBe("nodejs");
    expect(createExperimentRoute.runtime).toBe("nodejs");
    expect(experimentRoute.runtime).toBe("nodejs");
    expect("DELETE" in taskRoute).toBe(false);
    expect("DELETE" in createExperimentRoute).toBe(false);
    expect("DELETE" in experimentRoute).toBe(false);
  });
});
