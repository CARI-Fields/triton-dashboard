import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent-api/auth", () => ({
  authenticateAgent: vi.fn(),
}));
vi.mock("@/lib/agent-api/server", () => ({
  getServerSupabase: vi.fn(),
}));

import { authenticateAgent } from "@/lib/agent-api/auth";
import { AgentApiError } from "@/lib/agent-api/errors";
import {
  withAgent,
  withAuthenticatedAgent,
} from "@/lib/agent-api/handler";
import type { AgentContext } from "@/lib/agent-api/types";

const RAW_KEY =
  "tb_live_AAECAwQF_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const SUPABASE_SECRET = "sb_secret_do_not_expose";

const context: AgentContext = {
  apiKeyId: "40000000-0000-4000-8000-000000000001",
  keyPrefix: "tb_live_AAECAwQF",
  memberId: "20000000-0000-4000-8000-000000000001",
  memberName: "Bruce",
  scopes: new Set(["board:read"]),
  expiresAt: null,
};

function request(): Request {
  return new Request("https://board.test/api/agent/v1/board", {
    headers: { authorization: `Bearer ${RAW_KEY}` },
  });
}

describe("Agent Route Handler wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authenticates directly and gives the handler one request UUID", async () => {
    vi.mocked(authenticateAgent).mockResolvedValue(context);
    const callback = vi.fn(async (_context, requestId: string) => (
      Response.json({ request_id: requestId })
    ));

    const response = await withAuthenticatedAgent(request(), callback);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(authenticateAgent).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      context,
      expect.stringMatching(
        /^req_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
    );
    expect(body.request_id).toBe(callback.mock.calls[0][1]);
    expect(JSON.stringify(body)).not.toContain(RAW_KEY);
    expect(JSON.stringify(body)).not.toContain(SUPABASE_SECRET);
  });

  it("returns the same safe invalid-key envelope for authentication failures", async () => {
    vi.mocked(authenticateAgent).mockRejectedValue(
      new AgentApiError(401, "INVALID_API_KEY", "Invalid API key."),
    );
    const callback = vi.fn();

    const response = await withAuthenticatedAgent(request(), callback);
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(serialized)).toMatchObject({
      error: {
        code: "INVALID_API_KEY",
        message: "Invalid API key.",
        request_id: expect.stringMatching(/^req_/),
        retryable: false,
      },
    });
    expect(serialized).not.toContain(RAW_KEY);
    expect(serialized).not.toContain(SUPABASE_SECRET);
    expect(callback).not.toHaveBeenCalled();
  });

  it("sanitizes unknown handler errors containing raw credentials", async () => {
    vi.mocked(authenticateAgent).mockResolvedValue(context);

    const response = await withAuthenticatedAgent(request(), async () => {
      throw new Error(
        `raw=${RAW_KEY} SUPABASE_SECRET_KEY=${SUPABASE_SECRET}`,
      );
    });
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(JSON.parse(serialized)).toMatchObject({
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred.",
        request_id: expect.stringMatching(/^req_/),
        retryable: true,
      },
    });
    expect(serialized).not.toContain(RAW_KEY);
    expect(serialized).not.toContain(SUPABASE_SECRET);
    expect(serialized).not.toContain("SUPABASE_SECRET_KEY");
  });

  it("enforces the requested scope after authentication", async () => {
    vi.mocked(authenticateAgent).mockResolvedValue(context);
    const callback = vi.fn();

    const response = await withAgent(request(), "tasks:write", callback);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      error: {
        code: "SCOPE_FORBIDDEN",
        message: "Missing scope: tasks:write",
        request_id: expect.stringMatching(/^req_/),
      },
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it("runs a scoped handler when the authenticated context has that scope", async () => {
    vi.mocked(authenticateAgent).mockResolvedValue(context);

    const response = await withAgent(
      request(),
      "board:read",
      async (_context, requestId) => (
        Response.json({ ok: true, request_id: requestId })
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      request_id: expect.stringMatching(/^req_/),
    });
  });
});
