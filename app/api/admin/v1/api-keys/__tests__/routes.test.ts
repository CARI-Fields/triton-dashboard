import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentApiError } from "@/lib/agent-api/errors";

const mocks = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  createManagedKey: vi.fn(),
  createStore: vi.fn(),
  deleteManagedKey: vi.fn(),
  getServerSupabase: vi.fn(),
  listManagedKeys: vi.fn(),
  patchManagedKey: vi.fn(),
  revokeManagedKey: vi.fn(),
  rotateManagedKey: vi.fn(),
}));

vi.mock("@/lib/agent-api/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/agent-api/auth")>(),
  authenticateAdmin: mocks.authenticateAdmin,
}));
vi.mock("@/lib/agent-api/server", () => ({
  getServerSupabase: mocks.getServerSupabase,
}));
vi.mock("@/lib/agent-api/admin-keys", () => ({
  createManagedKey: mocks.createManagedKey,
  createSupabaseManagedKeyStore: mocks.createStore,
  deleteManagedKey: mocks.deleteManagedKey,
  listManagedKeys: mocks.listManagedKeys,
  patchManagedKey: mocks.patchManagedKey,
  revokeManagedKey: mocks.revokeManagedKey,
  rotateManagedKey: mocks.rotateManagedKey,
}));

import * as collectionRoute from "@/app/api/admin/v1/api-keys/route";
import * as itemRoute from "@/app/api/admin/v1/api-keys/[id]/route";
import * as revokeRoute from "@/app/api/admin/v1/api-keys/[id]/revoke/route";
import * as rotateRoute from "@/app/api/admin/v1/api-keys/[id]/rotate/route";

const ADMIN = { userId: "50000000-0000-4000-8000-000000000001" };
const KEY_ID = "40000000-0000-4000-8000-000000000001";
const STORE = { kind: "store" };
const VIEW = {
  id: KEY_ID,
  name: "Bruce experiments",
  key_prefix: "tb_live_AAECAwQF",
  member: {
    id: "20000000-0000-4000-8000-000000000001",
    name: "Bruce",
  },
  scopes: ["board:read", "experiments:write"],
  expires_at: null,
  revoked_at: null,
  last_used_at: null,
  created_at: "2026-07-29T12:00:00.000Z",
};

function request(method: string, body?: unknown): Request {
  return new Request("https://board.test/api/admin/v1/api-keys", {
    method,
    headers: {
      authorization: "Bearer admin-session",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ id: KEY_ID }) };
}

describe("Admin API key Route Handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateAdmin.mockResolvedValue(ADMIN);
    mocks.getServerSupabase.mockReturnValue({ kind: "client" });
    mocks.createStore.mockReturnValue(STORE);
    mocks.listManagedKeys.mockResolvedValue([VIEW]);
    mocks.createManagedKey.mockResolvedValue({
      ...VIEW,
      secret: "tb_live_AAECAwQF_one-time-secret",
    });
    mocks.patchManagedKey.mockResolvedValue(VIEW);
    mocks.deleteManagedKey.mockResolvedValue({ id: KEY_ID });
    mocks.rotateManagedKey.mockResolvedValue({
      ...VIEW,
      secret: "tb_live_AAECAwQF_rotated-secret",
    });
    mocks.revokeManagedKey.mockResolvedValue({
      ...VIEW,
      revoked_at: "2026-07-29T13:00:00.000Z",
    });
  });

  it("exports only the designed methods", () => {
    expect(Object.keys(collectionRoute).sort()).toEqual(["GET", "POST"]);
    expect(Object.keys(itemRoute).sort()).toEqual(["DELETE", "PATCH"]);
    expect(Object.keys(rotateRoute)).toEqual(["POST"]);
    expect(Object.keys(revokeRoute)).toEqual(["POST"]);
    expect("DELETE" in collectionRoute).toBe(false);
  });

  it("authenticates every handler and awaits dynamic ids", async () => {
    const body = {
      name: "Bruce experiments",
      member_id: VIEW.member.id,
      scopes: ["board:read"],
      expires_at: null,
    };
    const responses = await Promise.all([
      collectionRoute.GET(request("GET")),
      collectionRoute.POST(request("POST", body)),
      itemRoute.PATCH(request("PATCH", { name: "Renamed" }), params()),
      itemRoute.DELETE(request("DELETE"), params()),
      rotateRoute.POST(request("POST"), params()),
      revokeRoute.POST(request("POST"), params()),
    ]);
    const bodies = await Promise.all(
      responses.map((response) => response.json()),
    );

    expect(mocks.authenticateAdmin).toHaveBeenCalledTimes(6);
    expect(mocks.authenticateAdmin.mock.calls.map(([value]) => (
      (value as Request).headers.get("authorization")
    ))).toEqual(Array(6).fill("Bearer admin-session"));
    expect(mocks.createManagedKey).toHaveBeenCalledWith(STORE, ADMIN, body);
    expect(mocks.patchManagedKey).toHaveBeenCalledWith(
      STORE,
      KEY_ID,
      { name: "Renamed" },
    );
    expect(mocks.deleteManagedKey).toHaveBeenCalledWith(STORE, KEY_ID);
    expect(mocks.rotateManagedKey).toHaveBeenCalledWith(STORE, KEY_ID);
    expect(mocks.revokeManagedKey).toHaveBeenCalledWith(STORE, KEY_ID);
    expect(bodies[3]).toMatchObject({
      data: { id: KEY_ID },
      meta: { request_id: expect.stringMatching(/^req_/) },
    });
    for (const [index, response] of responses.entries()) {
      expect(response.ok).toBe(true);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(bodies[index].meta.request_id).toMatch(/^req_/);
    }
    expect(responses[1].status).toBe(201);
  });

  it("converts malformed JSON and internal failures to safe no-store errors", async () => {
    const malformed = new Request(
      "https://board.test/api/admin/v1/api-keys",
      {
        method: "POST",
        headers: { authorization: "Bearer admin-session" },
        body: "{",
      },
    );
    const badBody = await collectionRoute.POST(malformed);
    expect(badBody.status).toBe(400);
    expect(badBody.headers.get("cache-control")).toBe("no-store");

    mocks.rotateManagedKey.mockRejectedValueOnce(
      new Error("SUPABASE_SECRET_KEY=sb_secret_do_not_expose"),
    );
    const failed = await rotateRoute.POST(request("POST"), params());
    const serialized = JSON.stringify(await failed.json());
    expect(failed.status).toBe(500);
    expect(failed.headers.get("cache-control")).toBe("no-store");
    expect(serialized).not.toContain("sb_secret_do_not_expose");
    expect(serialized).not.toContain("SUPABASE_SECRET_KEY");
  });

  it("serializes delete conflicts and hides internal database details", async () => {
    mocks.deleteManagedKey.mockRejectedValueOnce(new AgentApiError(
      409,
      "API_KEY_HAS_AUDIT_HISTORY",
      "API keys with audit history cannot be deleted.",
    ));
    const conflict = await itemRoute.DELETE(request("DELETE"), params());
    expect(conflict.status).toBe(409);
    expect(conflict.headers.get("cache-control")).toBe("no-store");
    expect(await conflict.json()).toMatchObject({
      error: {
        code: "API_KEY_HAS_AUDIT_HISTORY",
        message: "API keys with audit history cannot be deleted.",
        request_id: expect.stringMatching(/^req_/),
      },
    });

    mocks.deleteManagedKey.mockRejectedValueOnce(
      new Error("private database detail"),
    );
    const failed = await itemRoute.DELETE(request("DELETE"), params());
    const serialized = JSON.stringify(await failed.json());
    expect(failed.status).toBe(500);
    expect(serialized).not.toContain("private database detail");
  });
});
