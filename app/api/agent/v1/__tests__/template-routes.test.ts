import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listTemplates: vi.fn(),
  getTemplateSchema: vi.fn(),
  getTemplateCompareSource: vi.fn(),
  getExperiment: vi.fn(),
  patchValue: vi.fn(),
  archive: vi.fn(),
  unarchive: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("@/lib/agent-api/read-repository", () => ({
  listTemplates: mocks.listTemplates,
  getTemplateSchema: mocks.getTemplateSchema,
  getTemplateCompareSource: mocks.getTemplateCompareSource,
  getExperiment: mocks.getExperiment,
  parseResourceId: (raw: string) => raw,
  assertNoQueryParameters: vi.fn(),
}));
vi.mock("@/lib/agent-api/mutation-repository", () => ({
  patchExperimentValue: mocks.patchValue,
  archiveExperiment: mocks.archive,
  unarchiveExperiment: mocks.unarchive,
  restoreExperimentVersion: mocks.restore,
}));
vi.mock("@/lib/agent-api/permissions", () => ({
  requireTaskCollaboration: async () => undefined,
}));

vi.mock("@/lib/agent-api/handler", () => ({
  withAgent: async (
    _request: Request,
    _permission: string,
    handler: (context: unknown, requestId: string) => Promise<Response>,
  ) => {
    const { errorResponse } = await import("@/lib/agent-api/responses");
    try {
      return await handler({ apiKeyId: "key-1", memberId: "member-1" }, "req-1");
    } catch (reason) {
      return errorResponse(reason, "req-1");
    }
  },
}));

const TEMPLATE_ID = "30000000-0000-4000-8000-000000000001";
const EXPERIMENT_ID = "60000000-0000-4000-8000-000000000001";
const KEY_ID = "50000000-0000-4000-8000-000000000001";

async function get(path: string, route: (request: Request, params?: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return route(new Request(`http://localhost${path}`), { params: Promise.resolve({}) });
}

beforeEach(() => vi.clearAllMocks());

describe("template agent routes", () => {
  it("lists Templates", async () => {
    mocks.listTemplates.mockResolvedValue([{ id: TEMPLATE_ID, name: "Benchmark A" }]);
    const { GET } = await import("../templates/route");
    const response = await get("/api/agent/v1/templates", GET);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[0].name).toBe("Benchmark A");
  });

  it("patches a Value by key_id with a conflict surfaced as 409", async () => {
    const { PATCH } = await import("../experiments/[id]/values/route");
    mocks.getExperiment.mockResolvedValue({
      id: EXPERIMENT_ID,
      task_id: "20000000-0000-4000-8000-000000000001",
      template_id: TEMPLATE_ID,
    });
    mocks.patchValue.mockResolvedValue({
      status: "conflict",
      remote: 0.9,
      remote_cell_revision: 2,
    });
    const request = new Request(`http://localhost/api/agent/v1/experiments/${EXPERIMENT_ID}/values`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key_id: KEY_ID,
        expected_cell_revision: 1,
        value: { kind: "number", number: 0.5 },
      }),
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ id: EXPERIMENT_ID }),
    });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("CELL_REVISION_CONFLICT");
  });
});
