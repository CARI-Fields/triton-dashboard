import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

const URL = "https://server-client.test";
const SECRET = "sb_secret_server_only_test_value";
const ANON = "sb_publishable_browser_test_value";

describe("server-only Supabase client", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON;
    process.env.SUPABASE_SECRET_KEY = SECRET;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it("creates one client with the server secret and disabled session state", async () => {
    const expectedClient = { kind: "server-client" };
    mocks.createClient.mockReturnValue(expectedClient);
    const { getServerSupabase } = await import("@/lib/agent-api/server");

    expect(getServerSupabase()).toBe(expectedClient);
    expect(getServerSupabase()).toBe(expectedClient);
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).toHaveBeenCalledWith(URL, SECRET, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    expect(mocks.createClient).not.toHaveBeenCalledWith(
      URL,
      ANON,
      expect.anything(),
    );
  });

  it.each(["url", "secret"] as const)(
    "fails safely when the server %s is missing",
    async (missing) => {
      if (missing === "url") {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      } else {
        delete process.env.SUPABASE_SECRET_KEY;
      }
      const { getServerSupabase } = await import("@/lib/agent-api/server");

      let reason: unknown;
      try {
        getServerSupabase();
      } catch (caught) {
        reason = caught;
      }
      const serialized = String(reason);
      expect(reason).toEqual(
        new Error("Server Supabase configuration is missing."),
      );
      expect(serialized).not.toContain(URL);
      expect(serialized).not.toContain(SECRET);
      expect(serialized).not.toContain(ANON);
      expect(mocks.createClient).not.toHaveBeenCalled();
    },
  );
});
