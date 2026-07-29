import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createSupabaseManagedKeyStore,
  type ManagedKeyRow,
} from "@/lib/agent-api/admin-keys";

const KEY_ID = "40000000-0000-4000-8000-000000000001";
const MEMBER_ID = "20000000-0000-4000-8000-000000000001";
const ROW: ManagedKeyRow = {
  id: KEY_ID,
  name: "Bruce experiments",
  key_prefix: "tb_live_AAECAwQF",
  member_id: MEMBER_ID,
  member: { id: MEMBER_ID, name: "Bruce" },
  scopes: ["board:read", "experiments:write"],
  expires_at: null,
  revoked_at: null,
  last_used_at: null,
  created_at: "2026-07-29T12:00:00.000Z",
};

describe("Supabase managed key store", () => {
  it("lists only the non-secret projection and never selects a digest", async () => {
    const order = vi.fn().mockResolvedValue({ data: [ROW], error: null });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    const store = createSupabaseManagedKeyStore({
      from,
    } as unknown as SupabaseClient);

    const rows = await store.list();

    expect(rows).toEqual([ROW]);
    expect(select).toHaveBeenCalledOnce();
    expect(select.mock.calls[0][0]).not.toContain("key_digest");
    expect(JSON.stringify(rows)).not.toContain("key_digest");
  });

  it("writes a create digest but returns the non-secret projection", async () => {
    const single = vi.fn().mockResolvedValue({ data: ROW, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const store = createSupabaseManagedKeyStore({
      from,
    } as unknown as SupabaseClient);
    const values = {
      name: ROW.name,
      key_prefix: ROW.key_prefix,
      key_digest: "a".repeat(64),
      member_id: MEMBER_ID,
      scopes: [...ROW.scopes],
      expires_at: null,
      created_by: "50000000-0000-4000-8000-000000000001",
    };

    const inserted = await store.insert(values);

    expect(insert).toHaveBeenCalledWith(values);
    expect(select.mock.calls[0][0]).not.toContain("key_digest");
    expect(inserted).toEqual(ROW);
    expect(JSON.stringify(inserted)).not.toContain("key_digest");
  });

  it("writes a rotation digest only while active and returns no digest", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: ROW, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const is = vi.fn().mockReturnValue({ select });
    const eq = vi.fn().mockReturnValue({ is, select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const store = createSupabaseManagedKeyStore({
      from,
    } as unknown as SupabaseClient);
    const changes = {
      key_prefix: "tb_live_BBBBBBBB",
      key_digest: "b".repeat(64),
    };

    const updated = await store.update(KEY_ID, changes, { onlyActive: true });

    expect(update).toHaveBeenCalledWith(changes);
    expect(eq).toHaveBeenCalledWith("id", KEY_ID);
    expect(is).toHaveBeenCalledWith("revoked_at", null);
    expect(select.mock.calls[0][0]).not.toContain("key_digest");
    expect(updated).toEqual(ROW);
    expect(JSON.stringify(updated)).not.toContain("key_digest");
  });

  it("classifies maybeSingle nulls without turning them into query errors", async () => {
    const keyMaybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const keySelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: keyMaybeSingle }),
    });
    const memberMaybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const memberSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: memberMaybeSingle }),
    });
    const updateMaybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const updateSelect = vi.fn().mockReturnValue({
      maybeSingle: updateMaybeSingle,
    });
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ select: updateSelect }),
    });
    const from = vi.fn((table: string) => {
      if (table === "members") return { select: memberSelect };
      return { select: keySelect, update };
    });
    const store = createSupabaseManagedKeyStore({
      from,
    } as unknown as SupabaseClient);

    await expect(store.get(KEY_ID)).resolves.toBeNull();
    await expect(store.memberExists(MEMBER_ID)).resolves.toBe(false);
    await expect(store.update(KEY_ID, { name: "Renamed" }))
      .resolves.toBeNull();
  });

  it("turns Supabase errors into one safe internal query error", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "sb_secret_do_not_expose" },
    });
    const select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle }),
    });
    const store = createSupabaseManagedKeyStore({
      from: vi.fn().mockReturnValue({ select }),
    } as unknown as SupabaseClient);

    await expect(store.get(KEY_ID)).rejects.toEqual(
      new Error("Admin API key query failed."),
    );
  });

  it("conditionally deletes only a revoked never-used key and returns its id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: KEY_ID },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const is = vi.fn().mockReturnValue({ select });
    const not = vi.fn().mockReturnValue({ is });
    const eq = vi.fn().mockReturnValue({ not });
    const remove = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ delete: remove });
    const store = createSupabaseManagedKeyStore({
      from,
    } as unknown as SupabaseClient);

    await expect(store.deleteUnusedRevoked(KEY_ID)).resolves.toEqual({
      kind: "deleted",
      id: KEY_ID,
    });
    expect(from).toHaveBeenCalledWith("api_keys");
    expect(remove).toHaveBeenCalledWith();
    expect(eq).toHaveBeenCalledWith("id", KEY_ID);
    expect(not).toHaveBeenCalledWith("revoked_at", "is", null);
    expect(is).toHaveBeenCalledWith("last_used_at", null);
    expect(select).toHaveBeenCalledWith("id");
  });

  it("distinguishes no match, audit conflict, and safe internal failure", async () => {
    function storeFor(result: {
      data: { id: string } | null;
      error: { code: string; message: string } | null;
    }) {
      const maybeSingle = vi.fn().mockResolvedValue(result);
      const select = vi.fn().mockReturnValue({ maybeSingle });
      const is = vi.fn().mockReturnValue({ select });
      const not = vi.fn().mockReturnValue({ is });
      const eq = vi.fn().mockReturnValue({ not });
      const remove = vi.fn().mockReturnValue({ eq });
      return createSupabaseManagedKeyStore({
        from: vi.fn().mockReturnValue({ delete: remove }),
      } as unknown as SupabaseClient);
    }

    await expect(storeFor({ data: null, error: null })
      .deleteUnusedRevoked(KEY_ID))
      .resolves.toEqual({ kind: "not_deleted" });
    await expect(storeFor({
      data: null,
      error: { code: "23503", message: "private FK detail" },
    }).deleteUnusedRevoked(KEY_ID))
      .resolves.toEqual({ kind: "audit_conflict" });
    await expect(storeFor({
      data: null,
      error: { code: "XX000", message: "private database detail" },
    }).deleteUnusedRevoked(KEY_ID))
      .rejects.toEqual(new Error("Admin API key query failed."));
  });
});
