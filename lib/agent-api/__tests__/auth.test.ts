import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent-api/server", () => ({
  getServerSupabase: vi.fn(),
}));

import {
  authenticateAdmin,
  authenticateAgent,
  digestApiKey,
  generateApiKey,
} from "@/lib/agent-api/auth";
import { withAuthenticatedAgent } from "@/lib/agent-api/handler";
import { getServerSupabase } from "@/lib/agent-api/server";

const RAW_KEY =
  "tb_live_AAECAwQF_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const RAW_KEY_SUFFIX =
  "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const KEY_ID = "40000000-0000-4000-8000-000000000001";
const MEMBER_ID = "20000000-0000-4000-8000-000000000001";
const ADMIN_ID = "50000000-0000-4000-8000-000000000001";
const API_KEY_SELECT = [
  "id",
  "key_prefix",
  "member_id",
  "scopes",
  "expires_at",
  "revoked_at",
  "member:members(id,name)",
].join(",");

interface KeyRow {
  id: string;
  key_prefix: string;
  member_id: string | null;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
  member: { id: string; name: string } | null;
}

function validKeyRow(overrides: Partial<KeyRow> = {}): KeyRow {
  return {
    id: KEY_ID,
    key_prefix: "tb_live_AAECAwQF",
    member_id: MEMBER_ID,
    scopes: ["board:read", "experiments:write"],
    expires_at: "2099-01-01T00:00:00.000Z",
    revoked_at: null,
    member: { id: MEMBER_ID, name: "Bruce" },
    ...overrides,
  };
}

function keyClient(
  result: { data: KeyRow | null; error: { message: string } | null },
) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const readQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle,
  };
  readQuery.select.mockReturnValue(readQuery);
  readQuery.eq.mockReturnValue(readQuery);

  const updateResult = Promise.resolve({ error: null });
  const updateQuery = {
    update: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    then: updateResult.then.bind(updateResult),
  };
  updateQuery.update.mockReturnValue(updateQuery);
  updateQuery.eq.mockReturnValue(updateQuery);
  updateQuery.or.mockReturnValue(updateQuery);

  const from = vi.fn()
    .mockImplementationOnce(() => readQuery)
    .mockImplementationOnce(() => updateQuery);
  return {
    client: { from } as unknown as SupabaseClient,
    from,
    readQuery,
    updateQuery,
  };
}

function request(authorization?: string): Request {
  return new Request("https://board.test/api/agent/v1/capabilities", {
    headers: authorization === undefined ? undefined : { authorization },
  });
}

function expectInvalidApiKey(reason: unknown): void {
  expect(reason).toMatchObject({
    status: 401,
    code: "INVALID_API_KEY",
    message: "Invalid API key.",
  });
  expect(JSON.stringify(reason)).not.toContain(RAW_KEY);
  expect(JSON.stringify(reason)).not.toContain("SUPABASE_SECRET_KEY");
}

describe("Agent API key authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a prefixed 256-bit key and hashes the complete raw key", () => {
    const generated = generateApiKey();
    const digest = digestApiKey(generated.raw);
    const match = generated.raw.match(
      /^tb_live_([A-Za-z0-9_-]{8})_([A-Za-z0-9_-]{43})$/,
    );

    expect(match).not.toBeNull();
    expect(match?.[1]).toBe(match?.[2].slice(0, 8));
    expect(generated.keyPrefix).toMatch(/^tb_live_[A-Za-z0-9_-]{8}$/);
    expect(generated.raw.startsWith(`${generated.keyPrefix}_`)).toBe(true);
    expect(generated.secretBytes).toBe(32);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digestApiKey(RAW_KEY)).toBe(
      "adf90f36dbc93e711ddc755ef6888a75fda4ea424a3d98ebc366dc35f2282ed5",
    );
    expect(generated.raw).not.toContain(digest);
  });

  it.each([
    undefined,
    "",
    "Basic credentials",
    "Bearer",
    `Bearer  ${RAW_KEY}`,
    `Bearer ${RAW_KEY} trailing`,
    `Bearer\t${RAW_KEY}`,
    `Bearer tb_live_AAECAwQF_${RAW_KEY_SUFFIX.slice(0, 42)}`,
    `Bearer tb_live_AAECAwQF_${RAW_KEY_SUFFIX}A`,
    `Bearer tb_live_ZAECAwQF_${RAW_KEY_SUFFIX}`,
    `Bearer tb_live_AAECAwQF_${RAW_KEY_SUFFIX.slice(0, 42)}*`,
  ])("rejects missing or malformed Bearer credentials %#", async (header) => {
    const getClient = vi.mocked(getServerSupabase);

    await authenticateAgent(request(header)).then(
      () => {
        throw new Error("Expected authentication to fail.");
      },
      expectInvalidApiKey,
    );
    expect(getClient).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "revoked key",
      result: {
        data: validKeyRow({ revoked_at: "2026-07-28T12:00:00.000Z" }),
        error: null,
      },
    },
    {
      label: "expired key",
      result: {
        data: validKeyRow({ expires_at: "2000-01-01T00:00:00.000Z" }),
        error: null,
      },
    },
    {
      label: "key with a null member id",
      result: {
        data: validKeyRow({ member_id: null, member: null }),
        error: null,
      },
    },
    {
      label: "key whose member was deleted",
      result: {
        data: validKeyRow({ member: null }),
        error: null,
      },
    },
  ])("converges $label on the same safe 401", async ({ result }) => {
    const { client } = keyClient(result);
    vi.mocked(getServerSupabase).mockReturnValue(client);

    await authenticateAgent(request(`Bearer ${RAW_KEY}`)).then(
      () => {
        throw new Error("Expected authentication to fail.");
      },
      expectInvalidApiKey,
    );
  });

  it("queries an unknown well-formed Key before returning the safe 401", async () => {
    const { client, readQuery } = keyClient({ data: null, error: null });
    vi.mocked(getServerSupabase).mockReturnValue(client);

    await authenticateAgent(request(`Bearer ${RAW_KEY}`)).then(
      () => {
        throw new Error("Expected authentication to fail.");
      },
      expectInvalidApiKey,
    );
    expect(readQuery.eq).toHaveBeenCalledWith(
      "key_digest",
      digestApiKey(RAW_KEY),
    );
  });

  it("selects only public identity fields and returns scopes as a Set", async () => {
    const { client, from, readQuery, updateQuery } = keyClient({
      data: validKeyRow(),
      error: null,
    });
    vi.mocked(getServerSupabase).mockReturnValue(client);

    const context = await authenticateAgent(request(`Bearer ${RAW_KEY}`));

    expect(context).toEqual({
      apiKeyId: KEY_ID,
      keyPrefix: "tb_live_AAECAwQF",
      memberId: MEMBER_ID,
      memberName: "Bruce",
      scopes: new Set(["board:read", "experiments:write"]),
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    expect(context.scopes).toBeInstanceOf(Set);
    expect(from).toHaveBeenNthCalledWith(1, "api_keys");
    expect(readQuery.select).toHaveBeenCalledWith(API_KEY_SELECT);
    expect(readQuery.eq).toHaveBeenCalledWith(
      "key_digest",
      digestApiKey(RAW_KEY),
    );
    expect(updateQuery.update).toHaveBeenCalledWith({
      last_used_at: expect.stringMatching(/^20/),
    });
    expect(updateQuery.eq).toHaveBeenCalledWith("id", KEY_ID);
    expect(updateQuery.or).toHaveBeenCalledWith(
      expect.stringMatching(
        /^last_used_at\.is\.null,last_used_at\.lt\..+$/,
      ),
    );
    expect(JSON.stringify(context)).not.toContain(RAW_KEY);
  });

  it("does not fail authentication when last-used tracking fails", async () => {
    const { client, updateQuery } = keyClient({
      data: validKeyRow(),
      error: null,
    });
    updateQuery.or.mockRejectedValueOnce(
      new Error("SUPABASE_SECRET_KEY=sb_secret_do_not_expose"),
    );
    vi.mocked(getServerSupabase).mockReturnValue(client);

    await expect(authenticateAgent(request(`Bearer ${RAW_KEY}`)))
      .resolves.toMatchObject({ apiKeyId: KEY_ID });
  });
});

describe("Admin authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TRITON_BOARD_ADMIN_USER_ID = ADMIN_ID;
  });

  it("returns 401 for an invalid Supabase session", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT sb_secret_do_not_expose" },
    });
    vi.mocked(getServerSupabase).mockReturnValue({
      auth: { getUser },
    } as unknown as SupabaseClient);

    await expect(authenticateAdmin(request("Bearer session-token")))
      .rejects.toMatchObject({
        status: 401,
        code: "INVALID_ADMIN_SESSION",
      });
    expect(getUser).toHaveBeenCalledWith("session-token");
  });

  it("returns 403 for a valid non-Admin user UUID", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: { id: "50000000-0000-4000-8000-000000000099" },
      },
      error: null,
    });
    vi.mocked(getServerSupabase).mockReturnValue({
      auth: { getUser },
    } as unknown as SupabaseClient);

    await expect(authenticateAdmin(request("Bearer session-token")))
      .rejects.toMatchObject({
        status: 403,
        code: "ADMIN_FORBIDDEN",
      });
  });

  it("returns the authenticated Admin user UUID", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    vi.mocked(getServerSupabase).mockReturnValue({
      auth: { getUser },
    } as unknown as SupabaseClient);

    await expect(authenticateAdmin(request("Bearer session-token")))
      .resolves.toEqual({ userId: ADMIN_ID });
  });

  it.each([undefined, ""])(
    "treats missing Admin UUID configuration %s as a server error",
    async (configuredAdminId) => {
      if (configuredAdminId === undefined) {
        delete process.env.TRITON_BOARD_ADMIN_USER_ID;
      } else {
        process.env.TRITON_BOARD_ADMIN_USER_ID = configuredAdminId;
      }
      const getUser = vi.fn().mockResolvedValue({
        data: { user: { id: ADMIN_ID } },
        error: null,
      });
      vi.mocked(getServerSupabase).mockReturnValue({
        auth: { getUser },
      } as unknown as SupabaseClient);

      await expect(authenticateAdmin(request("Bearer session-token")))
        .rejects.toMatchObject({
          name: "ServerConfigurationError",
          code: "SERVER_MISCONFIGURED",
        });
      expect(getUser).not.toHaveBeenCalled();
    },
  );

  it("turns missing Admin configuration into a generic safe handler 500", async () => {
    delete process.env.TRITON_BOARD_ADMIN_USER_ID;
    const { client } = keyClient({
      data: validKeyRow(),
      error: null,
    });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    Object.assign(client, { auth: { getUser } });
    vi.mocked(getServerSupabase).mockReturnValue(client);

    const response = await withAuthenticatedAgent(
      request(`Bearer ${RAW_KEY}`),
      async () => {
        await authenticateAdmin(request("Bearer private-admin-token"));
        return new Response(null, { status: 204 });
      },
    );
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(JSON.parse(serialized)).toMatchObject({
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred.",
      },
    });
    expect(serialized).not.toContain("private-admin-token");
    expect(serialized).not.toContain("TRITON_BOARD_ADMIN_USER_ID");
    expect(serialized).not.toContain(RAW_KEY);
    expect(getUser).not.toHaveBeenCalled();
  });
});
