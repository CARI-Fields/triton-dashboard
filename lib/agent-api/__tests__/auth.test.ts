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
import { getServerSupabase } from "@/lib/agent-api/server";

const RAW_KEY = "tb_live_abcdefgh_abcdefghijklmnopqrstuvwxyz0123456789ABCDE";
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
    key_prefix: "tb_live_abcdefgh",
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

    expect(generated.raw)
      .toMatch(/^tb_live_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]+$/);
    expect(generated.keyPrefix).toMatch(/^tb_live_[A-Za-z0-9_-]{8}$/);
    expect(generated.raw.startsWith(`${generated.keyPrefix}_`)).toBe(true);
    expect(generated.secretBytes).toBe(32);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digestApiKey(RAW_KEY)).toBe(
      "7d315737e8890e063a3b778c652c3c2845044710df077e5db8a251f9a338efae",
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
      label: "unknown digest",
      result: { data: null, error: null },
    },
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

  it("selects only public identity fields and returns scopes as a Set", async () => {
    const { client, from, readQuery, updateQuery } = keyClient({
      data: validKeyRow(),
      error: null,
    });
    vi.mocked(getServerSupabase).mockReturnValue(client);

    const context = await authenticateAgent(request(`Bearer ${RAW_KEY}`));

    expect(context).toEqual({
      apiKeyId: KEY_ID,
      keyPrefix: "tb_live_abcdefgh",
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
});
