import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContext, ApiScope } from "@/lib/agent-api/types";

const TASK_ID = "30000000-0000-4000-8000-000000000001";
const EXPERIMENT_ID = "60000000-0000-4000-8000-000000000001";
const UPDATED_AT = "2026-07-29T12:00:00.000Z";
const REQUEST_ID = "req_read_route";

const context: AgentContext = {
  apiKeyId: "40000000-0000-4000-8000-000000000001",
  keyPrefix: "tb_live_AAECAwQF",
  memberId: "20000000-0000-4000-8000-000000000001",
  memberName: "Bruce",
  scopes: new Set(),
  expiresAt: null,
};

vi.mock("@/lib/agent-api/handler", () => ({
  withAgent: vi.fn(async (
    _request: Request,
    _scope: ApiScope,
    handler: (agent: AgentContext, requestId: string) => Promise<Response>,
  ) => {
    try {
      return await handler({
        apiKeyId: "40000000-0000-4000-8000-000000000001",
        keyPrefix: "tb_live_AAECAwQF",
        memberId: "20000000-0000-4000-8000-000000000001",
        memberName: "Bruce",
        scopes: new Set(),
        expiresAt: null,
      }, "req_read_route");
    } catch (reason) {
      const error = reason as {
        status: number;
        code: string;
        message: string;
        retryable?: boolean;
      };
      return Response.json({
        error: {
          code: error.code,
          message: error.message,
          request_id: "req_read_route",
          retryable: error.retryable ?? false,
        },
      }, { status: error.status });
    }
  }),
  withAuthenticatedAgent: vi.fn(async (
    _request: Request,
    handler: (agent: AgentContext, requestId: string) => Promise<Response>,
  ) => handler({
    apiKeyId: "40000000-0000-4000-8000-000000000001",
    keyPrefix: "tb_live_AAECAwQF",
    memberId: "20000000-0000-4000-8000-000000000001",
    memberName: "Bruce",
    scopes: new Set(),
    expiresAt: null,
  }, "req_read_route")),
}));

vi.mock("@/lib/agent-api/read-repository", () => ({
  assertNoQueryParameters: vi.fn(),
  getCapabilities: vi.fn(),
  getBoardSummary: vi.fn(),
  listModules: vi.fn(),
  listMembers: vi.fn(),
  parseResourceId: vi.fn((value: string) => value),
  parseTaskListFilters: vi.fn(() => ({ limit: 50 })),
  parseExperimentListFilters: vi.fn(() => ({ limit: 50 })),
  listTasks: vi.fn(),
  getTask: vi.fn(),
  listTaskActivity: vi.fn(),
  listExperiments: vi.fn(),
  getExperiment: vi.fn(),
  listAudit: vi.fn(),
}));

import {
  assertNoQueryParameters,
  getBoardSummary,
  getCapabilities,
  getExperiment,
  getTask,
  listAudit,
  listExperiments,
  listMembers,
  listModules,
  listTaskActivity,
  listTasks,
  parseExperimentListFilters,
  parseResourceId,
  parseTaskListFilters,
} from "@/lib/agent-api/read-repository";
import {
  withAgent,
  withAuthenticatedAgent,
} from "@/lib/agent-api/handler";
import { GET as getCapabilitiesRoute } from "@/app/api/agent/v1/capabilities/route";
import { GET as getBoardRoute } from "@/app/api/agent/v1/board/route";
import { GET as getModulesRoute } from "@/app/api/agent/v1/modules/route";
import { GET as getMembersRoute } from "@/app/api/agent/v1/members/route";
import { GET as getTasksRoute } from "@/app/api/agent/v1/tasks/route";
import { GET as getTaskRoute } from "@/app/api/agent/v1/tasks/[id]/route";
import { GET as getTaskActivityRoute } from "@/app/api/agent/v1/tasks/[id]/activity/route";
import { GET as getExperimentsRoute } from "@/app/api/agent/v1/experiments/route";
import { GET as getExperimentRoute } from "@/app/api/agent/v1/experiments/[id]/route";
import { GET as getAuditRoute } from "@/app/api/agent/v1/audit/route";

function request(path: string): Request {
  return new Request(`https://board.test/api/agent/v1${path}`);
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("Agent API read routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCapabilities).mockReturnValue({
      key_prefix: context.keyPrefix,
      member: { id: context.memberId, name: context.memberName },
      scopes: [],
      expires_at: null,
      limits: {
        default_page_size: 50,
        max_page_size: 100,
        max_json_body_bytes: 262144,
        max_attachment_bytes: 10485760,
        successful_writes_per_60_seconds: 30,
      },
    });
    vi.mocked(getBoardSummary).mockResolvedValue({
      modules: 1,
      members: 1,
      tasks: 1,
      experiments: 1,
      task_statuses: { todo: 1, in_progress: 0, done: 0, blocked: 0 },
      experiment_statuses: {
        planned: 1,
        running: 0,
        analyzing: 0,
        completed: 0,
        blocked: 0,
        cancelled: 0,
      },
    });
    vi.mocked(listModules).mockResolvedValue([]);
    vi.mocked(listMembers).mockResolvedValue([]);
    vi.mocked(listTasks).mockResolvedValue({
      items: [],
      next_cursor: null,
    });
    vi.mocked(listExperiments).mockResolvedValue({
      items: [],
      next_cursor: null,
    });
    vi.mocked(listTaskActivity).mockResolvedValue([]);
    vi.mocked(listAudit).mockResolvedValue([]);
  });

  it("uses authenticated-only capabilities even for an empty scope set", async () => {
    const response = await getCapabilitiesRoute(request("/capabilities"));

    expect(withAuthenticatedAgent).toHaveBeenCalledOnce();
    expect(withAgent).not.toHaveBeenCalled();
    expect(getCapabilities).toHaveBeenCalledWith(context);
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({
      data: expect.objectContaining({ key_prefix: context.keyPrefix }),
      meta: { request_id: REQUEST_ID },
    });
  });

  it.each([
    ["board", () => getBoardRoute(request("/board"))],
    ["modules", () => getModulesRoute(request("/modules"))],
    ["members", () => getMembersRoute(request("/members"))],
    ["tasks", () => getTasksRoute(request("/tasks"))],
    ["task detail", () => getTaskRoute(request(`/tasks/${TASK_ID}`), {
      params: Promise.resolve({ id: TASK_ID }),
    })],
    ["activity", () => getTaskActivityRoute(
      request(`/tasks/${TASK_ID}/activity`),
      { params: Promise.resolve({ id: TASK_ID }) },
    )],
    ["experiments", () => getExperimentsRoute(request("/experiments"))],
    ["experiment detail", () => getExperimentRoute(
      request(`/experiments/${EXPERIMENT_ID}`),
      { params: Promise.resolve({ id: EXPERIMENT_ID }) },
    )],
  ])("requires board:read for %s", async (_name, invoke) => {
    vi.mocked(getTask).mockResolvedValue({
      id: TASK_ID,
      updated_at: UPDATED_AT,
    } as Awaited<ReturnType<typeof getTask>>);
    vi.mocked(getExperiment).mockResolvedValue({
      id: EXPERIMENT_ID,
      updated_at: UPDATED_AT,
      attachments: [],
    } as unknown as Awaited<ReturnType<typeof getExperiment>>);

    await invoke();

    expect(withAgent).toHaveBeenCalledWith(
      expect.any(Request),
      "board:read",
      expect.any(Function),
    );
  });

  it("requires audit:read and forwards the authenticated collaboration context", async () => {
    await getAuditRoute(request("/audit"));

    expect(withAgent).toHaveBeenCalledWith(
      expect.any(Request),
      "audit:read",
      expect.any(Function),
    );
    expect(listAudit).toHaveBeenCalledWith(context, {});
  });

  it("forwards strict parsed filters to Task and Experiment lists", async () => {
    const taskFilters = {
      moduleId: "10000000-0000-4000-8000-000000000001",
      limit: 25,
    };
    const experimentFilters = { status: "running" as const, limit: 10 };
    vi.mocked(parseTaskListFilters).mockReturnValue(taskFilters);
    vi.mocked(parseExperimentListFilters).mockReturnValue(experimentFilters);
    const taskRequest = request("/tasks?limit=25");
    const experimentRequest = request("/experiments?status=running");

    await getTasksRoute(taskRequest);
    await getExperimentsRoute(experimentRequest);

    expect(parseTaskListFilters).toHaveBeenCalledWith(taskRequest);
    expect(listTasks).toHaveBeenCalledWith(taskFilters);
    expect(parseExperimentListFilters).toHaveBeenCalledWith(experimentRequest);
    expect(listExperiments).toHaveBeenCalledWith(experimentFilters);
  });

  it("awaits Task params before validating and reading the resource", async () => {
    let resolveParams!: (value: { id: string }) => void;
    const params = new Promise<{ id: string }>((resolve) => {
      resolveParams = resolve;
    });
    vi.mocked(getTask).mockResolvedValue({
      id: TASK_ID,
      updated_at: UPDATED_AT,
    } as Awaited<ReturnType<typeof getTask>>);

    const pending = getTaskRoute(request(`/tasks/${TASK_ID}`), { params });
    await Promise.resolve();
    expect(parseResourceId).not.toHaveBeenCalled();
    resolveParams({ id: TASK_ID });
    await pending;

    expect(parseResourceId).toHaveBeenCalledWith(TASK_ID, "id");
    expect(getTask).toHaveBeenCalledWith(TASK_ID);
  });

  it("awaits Experiment params and returns an exact quoted ETag", async () => {
    vi.mocked(getExperiment).mockResolvedValue({
      id: EXPERIMENT_ID,
      updated_at: UPDATED_AT,
      attachments: [{
        id: "70000000-0000-4000-8000-000000000001",
        updated_at: UPDATED_AT,
      }],
    } as Awaited<ReturnType<typeof getExperiment>>);

    const response = await getExperimentRoute(
      request(`/experiments/${EXPERIMENT_ID}`),
      { params: Promise.resolve({ id: EXPERIMENT_ID }) },
    );
    const responseBody = await body(response);

    expect(parseResourceId).toHaveBeenCalledWith(EXPERIMENT_ID, "id");
    expect(response.headers.get("etag")).toBe(`"${UPDATED_AT}"`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(responseBody).toMatchObject({
      data: {
        id: EXPERIMENT_ID,
        attachments: [{ updated_at: UPDATED_AT }],
      },
      meta: { request_id: REQUEST_ID },
    });
  });

  it("returns an exact quoted ETag for Task detail", async () => {
    vi.mocked(getTask).mockResolvedValue({
      id: TASK_ID,
      updated_at: UPDATED_AT,
    } as Awaited<ReturnType<typeof getTask>>);

    const response = await getTaskRoute(request(`/tasks/${TASK_ID}`), {
      params: Promise.resolve({ id: TASK_ID }),
    });

    expect(response.headers.get("etag")).toBe(`"${UPDATED_AT}"`);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["Task", () => getTaskRoute(request(`/tasks/${TASK_ID}`), {
      params: Promise.resolve({ id: TASK_ID }),
    }), getTask, "TASK_NOT_FOUND"],
    ["Experiment", () => getExperimentRoute(
      request(`/experiments/${EXPERIMENT_ID}`),
      { params: Promise.resolve({ id: EXPERIMENT_ID }) },
    ), getExperiment, "EXPERIMENT_NOT_FOUND"],
  ])("returns the stable 404 envelope for a missing %s", async (
    _name,
    invoke,
    repositoryFunction,
    code,
  ) => {
    vi.mocked(repositoryFunction).mockResolvedValue(null);

    const response = await invoke();

    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      error: {
        code,
        message: `${_name} not found.`,
        request_id: REQUEST_ID,
        retryable: false,
      },
    });
  });

  it("validates Activity Task IDs and rejects undocumented filters", async () => {
    const activityRequest = request(`/tasks/${TASK_ID}/activity`);
    vi.mocked(getTask).mockResolvedValue({
      id: TASK_ID,
      updated_at: UPDATED_AT,
    } as Awaited<ReturnType<typeof getTask>>);

    await getTaskActivityRoute(activityRequest, {
      params: Promise.resolve({ id: TASK_ID }),
    });

    expect(parseResourceId).toHaveBeenCalledWith(TASK_ID, "id");
    expect(assertNoQueryParameters).toHaveBeenCalledWith(activityRequest);
    expect(listTaskActivity).toHaveBeenCalledWith(TASK_ID, {});
  });

  it("returns Task not found instead of an empty timeline for a missing Task", async () => {
    vi.mocked(getTask).mockResolvedValue(null);

    const response = await getTaskActivityRoute(
      request(`/tasks/${TASK_ID}/activity`),
      { params: Promise.resolve({ id: TASK_ID }) },
    );

    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      error: {
        code: "TASK_NOT_FOUND",
        message: "Task not found.",
        request_id: REQUEST_ID,
        retryable: false,
      },
    });
    expect(listTaskActivity).not.toHaveBeenCalled();
  });

  it("rejects undocumented query filters on non-filtering routes", async () => {
    await getBoardRoute(request("/board?secret=true"));
    await getModulesRoute(request("/modules?status=todo"));
    await getMembersRoute(request("/members?auth=true"));
    await getAuditRoute(request("/audit?member_id=historical"));

    expect(assertNoQueryParameters).toHaveBeenCalledTimes(4);
  });

  it("sets no permissive CORS headers on any GET response", async () => {
    const responses = await Promise.all([
      getCapabilitiesRoute(request("/capabilities")),
      getBoardRoute(request("/board")),
      getModulesRoute(request("/modules")),
      getMembersRoute(request("/members")),
      getTasksRoute(request("/tasks")),
      getExperimentsRoute(request("/experiments")),
      getAuditRoute(request("/audit")),
    ]);

    for (const response of responses) {
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      expect(response.headers.get("access-control-allow-headers")).toBeNull();
      expect(response.headers.get("access-control-allow-methods")).toBeNull();
    }
  });
});
