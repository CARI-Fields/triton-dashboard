import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  createManagedKey: vi.fn(),
  createStore: vi.fn(),
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
    mocks.rotateManagedKey.mockResolvedValue({
      ...VIEW,
      secret: "tb_live_AAECAwQF_rotated-secret",
    });
    mocks.revokeManagedKey.mockResolvedValue({
      ...VIEW,
      revoked_at: "2026-07-29T13:00:00.000Z",
    });
  });

  it("exports only the designed methods and no DELETE handler", () => {
    expect(Object.keys(collectionRoute).sort()).toEqual(["GET", "POST"]);
    expect(Object.keys(itemRoute)).toEqual(["PATCH"]);
    expect(Object.keys(rotateRoute)).toEqual(["POST"]);
    expect(Object.keys(revokeRoute)).toEqual(["POST"]);
    expect("DELETE" in collectionRoute).toBe(false);
    expect("DELETE" in itemRoute).toBe(false);
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
      rotateRoute.POST(request("POST"), params()),
      revokeRoute.POST(request("POST"), params()),
    ]);

    expect(mocks.authenticateAdmin).toHaveBeenCalledTimes(5);
    expect(mocks.authenticateAdmin.mock.calls.map(([value]) => (
      (value as Request).headers.get("authorization")
    ))).toEqual(Array(5).fill("Bearer admin-session"));
    expect(mocks.createManagedKey).toHaveBeenCalledWith(STORE, ADMIN, body);
    expect(mocks.patchManagedKey).toHaveBeenCalledWith(
      STORE,
      KEY_ID,
      { name: "Renamed" },
    );
    expect(mocks.rotateManagedKey).toHaveBeenCalledWith(STORE, KEY_ID);
    expect(mocks.revokeManagedKey).toHaveBeenCalledWith(STORE, KEY_ID);
    for (const response of responses) {
      expect(response.ok).toBe(true);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect((await response.json()).meta.request_id).toMatch(/^req_/);
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
});
