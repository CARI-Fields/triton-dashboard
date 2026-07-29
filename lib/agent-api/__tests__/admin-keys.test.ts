import { describe, expect, it } from "vitest";
import { digestApiKey } from "@/lib/agent-api/auth";
import {
  createManagedKey,
  listManagedKeys,
  patchManagedKey,
  revokeManagedKey,
  rotateManagedKey,
  type ManagedKeyInput,
  type ManagedKeyRow,
  type ManagedKeyStore,
} from "@/lib/agent-api/admin-keys";

const BRUCE_ID = "20000000-0000-4000-8000-000000000001";
const ALICE_ID = "20000000-0000-4000-8000-000000000002";
const ADMIN_ID = "50000000-0000-4000-8000-000000000001";
const KEY_ID = "40000000-0000-4000-8000-000000000001";
const CREATED_AT = "2026-07-29T12:00:00.000Z";

type PersistedManagedKeyRow = ManagedKeyRow & { key_digest: string };

class MemoryManagedKeyStore implements ManagedKeyStore {
  readonly members = new Map([
    [BRUCE_ID, "Bruce"],
    [ALICE_ID, "Alice"],
  ]);
  readonly rows = new Map<string, PersistedManagedKeyRow>();
  inserted: Record<string, unknown> | null = null;
  updateCount = 0;

  async list(): Promise<ManagedKeyRow[]> {
    return [...this.rows.values()].map((row) => this.project(row));
  }

  async get(id: string): Promise<ManagedKeyRow | null> {
    const row = this.rows.get(id);
    return row ? this.project(row) : null;
  }

  async memberExists(id: string): Promise<boolean> {
    return this.members.has(id);
  }

  async insert(values: {
    name: string;
    key_prefix: string;
    key_digest: string;
    member_id: string;
    scopes: string[];
    expires_at: string | null;
    created_by: string;
  }): Promise<ManagedKeyRow> {
    this.inserted = structuredClone(values);
    const row: PersistedManagedKeyRow = {
      id: KEY_ID,
      name: values.name,
      key_prefix: values.key_prefix,
      key_digest: values.key_digest,
      member_id: values.member_id,
      member: {
        id: values.member_id,
        name: this.members.get(values.member_id)!,
      },
      scopes: values.scopes,
      expires_at: values.expires_at,
      revoked_at: null,
      last_used_at: null,
      created_at: CREATED_AT,
    };
    this.rows.set(row.id, row);
    return this.project(row);
  }

  async update(
    id: string,
    changes: Parameters<ManagedKeyStore["update"]>[1],
    options?: { onlyActive?: boolean },
  ): Promise<ManagedKeyRow | null> {
    const row = this.rows.get(id);
    if (!row || (options?.onlyActive && row.revoked_at !== null)) return null;
    this.updateCount += 1;
    const memberId = changes.member_id ?? row.member_id;
    const updated: PersistedManagedKeyRow = {
      ...row,
      ...changes,
      member: memberId === null
        ? null
        : { id: memberId, name: this.members.get(memberId)! },
    };
    this.rows.set(id, updated);
    return this.project(updated);
  }

  private project(row: PersistedManagedKeyRow): ManagedKeyRow {
    const { key_digest: _privateDigest, ...projected } = row;
    return projected;
  }
}

function input(): ManagedKeyInput {
  return {
    name: "Bruce experiments",
    member_id: BRUCE_ID,
    scopes: ["board:read", "experiments:write"],
    expires_at: null,
  };
}

describe("Admin API key lifecycle", () => {
  it("returns the raw key only from create and never persists it", async () => {
    const store = new MemoryManagedKeyStore();

    const created = await createManagedKey(store, { userId: ADMIN_ID }, input());

    expect(created.secret).toMatch(/^tb_live_/);
    expect(store.inserted).toMatchObject({
      name: "Bruce experiments",
      member_id: BRUCE_ID,
      created_by: ADMIN_ID,
    });
    expect((store.inserted as { key_digest: string }).key_digest).toHaveLength(64);
    expect(JSON.stringify(store.inserted)).not.toContain(created.secret);

    const listed = await listManagedKeys(store);
    expect(await store.get(KEY_ID)).not.toHaveProperty("key_digest");
    expect(listed).toEqual([
      {
        id: KEY_ID,
        name: "Bruce experiments",
        key_prefix: created.key_prefix,
        member: { id: BRUCE_ID, name: "Bruce" },
        scopes: ["board:read", "experiments:write"],
        expires_at: null,
        revoked_at: null,
        last_used_at: null,
        created_at: CREATED_AT,
      },
    ]);
    expect(JSON.stringify(listed)).not.toContain(created.secret);
    expect(JSON.stringify(listed)).not.toContain("key_digest");
  });

  it("rotates by replacing the digest so the old secret stops matching", async () => {
    const store = new MemoryManagedKeyStore();
    const created = await createManagedKey(store, { userId: ADMIN_ID }, input());
    const oldDigest = digestApiKey(created.secret);

    const rotated = await rotateManagedKey(store, KEY_ID);

    expect(rotated.secret).toMatch(/^tb_live_/);
    expect(rotated.secret).not.toBe(created.secret);
    expect(store.rows.get(KEY_ID)?.key_digest).toBe(digestApiKey(rotated.secret));
    expect(store.rows.get(KEY_ID)?.key_digest).not.toBe(oldDigest);
    expect(JSON.stringify(rotated)).not.toContain(oldDigest);
  });

  it("revokes idempotently and does not change the first revocation time", async () => {
    const store = new MemoryManagedKeyStore();
    await createManagedKey(store, { userId: ADMIN_ID }, input());

    const first = await revokeManagedKey(
      store,
      KEY_ID,
      "2026-07-29T13:00:00.000Z",
    );
    const second = await revokeManagedKey(
      store,
      KEY_ID,
      "2026-07-29T14:00:00.000Z",
    );

    expect(first.revoked_at).toBe("2026-07-29T13:00:00.000Z");
    expect(second.revoked_at).toBe(first.revoked_at);
    expect(store.updateCount).toBe(1);
  });

  it("rejects rotating a revoked key without generating a replacement", async () => {
    const store = new MemoryManagedKeyStore();
    await createManagedKey(store, { userId: ADMIN_ID }, input());
    await revokeManagedKey(store, KEY_ID, "2026-07-29T13:00:00.000Z");
    const digest = store.rows.get(KEY_ID)?.key_digest;

    await expect(rotateManagedKey(store, KEY_ID)).rejects.toMatchObject({
      status: 409,
      code: "API_KEY_REVOKED",
    });
    expect(store.rows.get(KEY_ID)?.key_digest).toBe(digest);
  });

  it("rejects unknown scopes before inserting or updating", async () => {
    const store = new MemoryManagedKeyStore();

    await expect(createManagedKey(
      store,
      { userId: ADMIN_ID },
      { ...input(), scopes: ["board:read", "root:all"] } as never,
    )).rejects.toMatchObject({
      status: 422,
      code: "INVALID_FIELD",
      details: { field: "scopes" },
    });
    expect(store.inserted).toBeNull();

    await createManagedKey(store, { userId: ADMIN_ID }, input());
    await expect(patchManagedKey(
      store,
      KEY_ID,
      { scopes: ["root:all"] } as never,
    )).rejects.toMatchObject({
      status: 422,
      code: "INVALID_FIELD",
      details: { field: "scopes" },
    });
  });

  it("requires a valid existing Member UUID on create and patch", async () => {
    const store = new MemoryManagedKeyStore();

    await expect(createManagedKey(
      store,
      { userId: ADMIN_ID },
      { ...input(), member_id: "not-a-uuid" },
    )).rejects.toMatchObject({
      status: 422,
      details: { field: "member_id" },
    });
    await expect(createManagedKey(
      store,
      { userId: ADMIN_ID },
      {
        ...input(),
        member_id: "20000000-0000-4000-8000-000000000099",
      },
    )).rejects.toMatchObject({
      status: 422,
      code: "MEMBER_NOT_FOUND",
      details: { field: "member_id" },
    });

    await createManagedKey(store, { userId: ADMIN_ID }, input());
    const patched = await patchManagedKey(store, KEY_ID, {
      member_id: ALICE_ID,
    });
    expect(patched.member).toEqual({ id: ALICE_ID, name: "Alice" });
  });

  it("strictly validates name, scopes, expiry, and patch fields", async () => {
    const store = new MemoryManagedKeyStore();

    for (const badInput of [
      { ...input(), name: "   " },
      { ...input(), name: "x".repeat(101) },
      { ...input(), scopes: ["board:read", "board:read"] },
      { ...input(), expires_at: "tomorrow" },
      { ...input(), expires_at: "2026-07-29" },
      { ...input(), expires_at: "2026-02-30T12:00:00Z" },
    ]) {
      await expect(createManagedKey(
        store,
        { userId: ADMIN_ID },
        badInput as never,
      )).rejects.toMatchObject({ status: 422 });
    }

    await createManagedKey(store, { userId: ADMIN_ID }, input());
    await expect(patchManagedKey(store, KEY_ID, {}))
      .rejects.toMatchObject({ status: 422, code: "EMPTY_PATCH" });
    await expect(patchManagedKey(
      store,
      KEY_ID,
      { revoked_at: null } as never,
    )).rejects.toMatchObject({
      status: 422,
      code: "FIELD_NOT_WRITABLE",
      details: { field: "revoked_at" },
    });
    await expect(patchManagedKey(
      store,
      KEY_ID,
      { secret: "recover-me" } as never,
    )).rejects.toMatchObject({
      status: 422,
      code: "UNKNOWN_FIELD",
    });
  });

  it("returns safe not-found errors for unknown UUID keys", async () => {
    const store = new MemoryManagedKeyStore();
    const missing = "40000000-0000-4000-8000-000000000099";

    for (const action of [
      () => patchManagedKey(store, missing, { name: "Updated" }),
      () => rotateManagedKey(store, missing),
      () => revokeManagedKey(store, missing),
    ]) {
      await expect(action()).rejects.toMatchObject({
        status: 404,
        code: "API_KEY_NOT_FOUND",
      });
    }
  });
});
