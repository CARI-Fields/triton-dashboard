# Revoked API Key Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated administrator permanently delete an API Key record only when it is revoked, has never been used, and has no audit history.

**Architecture:** Extend the existing Admin API Key item route with `DELETE`, keep policy decisions in `deleteManagedKey`, and make the Supabase store issue one conditionally filtered delete. Preserve the existing audit-log foreign key as the authoritative history guard, expose only the minimum `service_role` database grant, and reuse the Admin client’s response validation and mutation guard to remove a successfully deleted card.

**Tech Stack:** Next.js 16.2.10 App Router Route Handlers, React 19.2.4, TypeScript, Supabase JS/CLI 2.110.0, PostgreSQL 17 with pgTAP, Vitest 4.1.10, React Testing Library 16.3.2

## Global Constraints

- Before editing code, read these current-version guides as required by `AGENTS.md`:
  - `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`
- Follow the approved design in `docs/superpowers/specs/2026-07-29-revoked-api-key-deletion-design.md`.
- Add only `DELETE /api/admin/v1/api-keys/:id`; do not add a collection DELETE or change the Agent API, OpenAPI document, or Triton Board API Skill.
- A record is eligible only when `revoked_at is not null`, `last_used_at is null`, and no `agent_api_audit_log` row references it.
- Keep all policy checks on the server. The browser’s disabled state is guidance, not authorization.
- Keep `agent_api_audit_log.api_key_id` non-null and retain its current non-cascading foreign key.
- Grant DELETE only to `service_role`; never grant it to `anon` or `authenticated`.
- Never select, return, log, or serialize `key_digest` during deletion.
- Keep all Admin responses in the existing safe, `Cache-Control: no-store` envelope with a request ID.
- Map only PostgreSQL error code `23503` to the audit-history conflict. All other database failures remain safe internal errors.
- Generate the migration with `npx supabase migration new allow_revoked_api_key_deletion`. The timestamped filename is deliberately created by the CLI at implementation time; do not hand-invent it.
- Use the existing mutation generation/in-flight guard, pending state, session handling, and unmount checks. Do not add a second client mutation framework or an audit preflight request.
- Use the existing `.muted` and `.api-key-actions` styles for the visible deletion reason; do not add CSS unless implementation proves those existing styles insufficient.

---

### Task 1: Lock down the database permission and audit-history invariant

**Files:**
- Create: `supabase/tests/0014_api_key_deletion.sql`
- Create via Supabase CLI: `supabase/migrations/*_allow_revoked_api_key_deletion.sql`
- Test: `supabase/tests/0014_api_key_deletion.sql`

- [ ] **Step 1: Add a focused pgTAP regression test**

Create `supabase/tests/0014_api_key_deletion.sql` with two revoked, never-used fixtures. One fixture has an audit row and one does not:

```sql
begin;
select plan(8);

select ok(
  has_table_privilege('service_role', 'public.api_keys', 'delete'),
  'service_role can delete API Key records'
);
select ok(
  not has_table_privilege('anon', 'public.api_keys', 'delete'),
  'anon cannot delete API Key records'
);
select ok(
  not has_table_privilege('authenticated', 'public.api_keys', 'delete'),
  'authenticated cannot delete API Key records'
);

insert into public.api_keys (
  id,
  name,
  key_prefix,
  key_digest,
  scopes,
  revoked_at,
  created_by
) values
  (
    '40000000-0000-4000-8000-000000000014',
    'Audited revoked key',
    'tb_live_AUDITED1',
    repeat('a', 64),
    '{}',
    '2026-07-29T15:00:00Z',
    '50000000-0000-4000-8000-000000000014'
  ),
  (
    '40000000-0000-4000-8000-000000000015',
    'Unused revoked key',
    'tb_live_UNUSED01',
    repeat('b', 64),
    '{}',
    '2026-07-29T15:00:00Z',
    '50000000-0000-4000-8000-000000000014'
  );

insert into public.agent_api_audit_log (
  api_key_id,
  member_id,
  request_id,
  resource_type,
  resource_id,
  action,
  response_status
) values (
  '40000000-0000-4000-8000-000000000014',
  '20000000-0000-4000-8000-000000000014',
  'api_key_delete_audit_fixture',
  'task',
  '30000000-0000-4000-8000-000000000014',
  'patch',
  200
);

set local role service_role;

select throws_ok(
  $$delete from public.api_keys
    where id = '40000000-0000-4000-8000-000000000014'$$,
  '23503',
  'update or delete on table "api_keys" violates foreign key constraint "agent_api_audit_log_api_key_id_fkey" on table "agent_api_audit_log"',
  'the audit foreign key blocks deletion of a referenced Key'
);
select ok(
  exists (
    select 1
    from public.api_keys
    where id = '40000000-0000-4000-8000-000000000014'
  ),
  'the referenced Key remains after the rejected delete'
);
select ok(
  exists (
    select 1
    from public.agent_api_audit_log
    where api_key_id = '40000000-0000-4000-8000-000000000014'
  ),
  'the audit row remains after the rejected delete'
);
select lives_ok(
  $$delete from public.api_keys
    where id = '40000000-0000-4000-8000-000000000015'
      and revoked_at is not null
      and last_used_at is null$$,
  'service_role can delete an unreferenced revoked, never-used Key'
);
select ok(
  not exists (
    select 1
    from public.api_keys
    where id = '40000000-0000-4000-8000-000000000015'
  ),
  'the eligible unreferenced Key is removed'
);

select * from finish();
rollback;
```

Keep the explicit FK error assertion. It proves the existing relationship stays restrictive instead of silently becoming `CASCADE` or `SET NULL`.

- [ ] **Step 2: Run the new database test before adding the grant**

Rebuild the local database from the existing migrations, then run only the new test:

```bash
npx supabase db reset --local
npx supabase test db --local supabase/tests/0014_api_key_deletion.sql
```

Expected: the focused test fails because `service_role` lacks DELETE and its delete attempts receive an insufficient-privilege error. The `anon` and `authenticated` assertions should already pass.

- [ ] **Step 3: Generate the migration through the project CLI**

Run:

```bash
npx supabase migration new allow_revoked_api_key_deletion
```

Expected: Supabase prints the newly created path under `supabase/migrations/`. Use that exact CLI-generated file for the next step.

- [ ] **Step 4: Add the minimum database change**

Replace the generated migration’s empty contents with exactly:

```sql
grant delete on table public.api_keys to service_role;
```

Do not add an RPC, trigger, policy, cascade, audit rewrite, retention job, or browser-role grant.

- [ ] **Step 5: Rebuild and rerun the focused database test**

Run:

```bash
npx supabase db reset --local
npx supabase test db --local supabase/tests/0014_api_key_deletion.sql
```

Expected: all 8 pgTAP assertions pass. The referenced Key and audit row remain, while the unreferenced fixture is deleted.

- [ ] **Step 6: Inspect and commit the database slice**

Run:

```bash
git diff --check
git diff -- supabase/tests/0014_api_key_deletion.sql supabase/migrations
git status --short
```

Then stage only the suffix-matched CLI-generated migration and the test:

```bash
git add supabase/tests/0014_api_key_deletion.sql supabase/migrations/*_allow_revoked_api_key_deletion.sql
git commit -m "feat: authorize guarded API key cleanup"
```

Expected: the commit contains one one-line permission migration and one pgTAP file.

---

### Task 2: Implement deletion policy and the narrow Supabase store operation

**Files:**
- Modify: `lib/agent-api/admin-keys.ts`
- Modify: `lib/agent-api/__tests__/admin-keys.test.ts`
- Modify: `lib/agent-api/__tests__/admin-key-store.test.ts`
- Test: `lib/agent-api/__tests__/admin-keys.test.ts`
- Test: `lib/agent-api/__tests__/admin-key-store.test.ts`

- [ ] **Step 1: Extend the in-memory test store with the delete contract**

In `lib/agent-api/__tests__/admin-keys.test.ts`, import `deleteManagedKey` and `ManagedKeyDeleteResult`. Extend `MemoryManagedKeyStore` with controllable delete behavior:

```ts
deleteResult: ManagedKeyDeleteResult | null = null;
beforeDelete: (() => void) | null = null;

async deleteUnusedRevoked(id: string): Promise<ManagedKeyDeleteResult> {
  this.beforeDelete?.();
  if (this.deleteResult !== null) return this.deleteResult;
  const row = this.rows.get(id);
  if (
    !row
    || row.revoked_at === null
    || row.last_used_at !== null
  ) {
    return { kind: "not_deleted" };
  }
  this.rows.delete(id);
  return { kind: "deleted", id };
}
```

This test double mirrors the production conditional delete without simulating Supabase itself.

- [ ] **Step 2: Add service tests for all eligibility decisions**

Add focused tests in the existing `"Admin API key lifecycle"` suite:

```ts
it("deletes a revoked never-used key and returns only its id", async () => {
  const store = new MemoryManagedKeyStore();
  await createManagedKey(store, { userId: ADMIN_ID }, input());
  await revokeManagedKey(store, KEY_ID, "2026-07-29T13:00:00.000Z");

  const deleted = await deleteManagedKey(store, KEY_ID);

  expect(deleted).toEqual({ id: KEY_ID });
  expect(Object.keys(deleted)).toEqual(["id"]);
  expect(store.rows.has(KEY_ID)).toBe(false);
  expect(JSON.stringify(deleted)).not.toContain("key_digest");
});

it("rejects deleting active, expired-only, and previously used keys", async () => {
  const active = new MemoryManagedKeyStore();
  await createManagedKey(active, { userId: ADMIN_ID }, input());
  await expect(deleteManagedKey(active, KEY_ID)).rejects.toMatchObject({
    status: 409,
    code: "API_KEY_NOT_REVOKED",
  });

  active.rows.get(KEY_ID)!.expires_at = "2026-07-28T12:00:00.000Z";
  await expect(deleteManagedKey(active, KEY_ID)).rejects.toMatchObject({
    status: 409,
    code: "API_KEY_NOT_REVOKED",
  });

  active.rows.get(KEY_ID)!.revoked_at = "2026-07-29T13:00:00.000Z";
  active.rows.get(KEY_ID)!.last_used_at = "2026-07-29T12:30:00.000Z";
  await expect(deleteManagedKey(active, KEY_ID)).rejects.toMatchObject({
    status: 409,
    code: "API_KEY_WAS_USED",
  });
  expect(active.rows.has(KEY_ID)).toBe(true);
});

it("returns safe validation and not-found errors before deletion", async () => {
  const store = new MemoryManagedKeyStore();

  await expect(deleteManagedKey(store, "not-a-uuid"))
    .rejects.toMatchObject({
      status: 422,
      code: "INVALID_FIELD",
      details: { field: "id" },
    });
  await expect(deleteManagedKey(
    store,
    "40000000-0000-4000-8000-000000000099",
  )).rejects.toMatchObject({
    status: 404,
    code: "API_KEY_NOT_FOUND",
  });
});

it("maps an audit foreign-key conflict to a safe domain conflict", async () => {
  const store = new MemoryManagedKeyStore();
  await createManagedKey(store, { userId: ADMIN_ID }, input());
  await revokeManagedKey(store, KEY_ID, "2026-07-29T13:00:00.000Z");
  store.deleteResult = { kind: "audit_conflict" };

  await expect(deleteManagedKey(store, KEY_ID)).rejects.toMatchObject({
    status: 409,
    code: "API_KEY_HAS_AUDIT_HISTORY",
    message: "API keys with audit history cannot be deleted.",
  });
  expect(store.rows.has(KEY_ID)).toBe(true);
});
```

- [ ] **Step 3: Add concurrent zero-row classification tests**

Use `beforeDelete` to model state changes between the initial read and the conditional delete:

```ts
it("reclassifies a concurrent eligibility change after a zero-row delete", async () => {
  const store = new MemoryManagedKeyStore();
  await createManagedKey(store, { userId: ADMIN_ID }, input());
  await revokeManagedKey(store, KEY_ID, "2026-07-29T13:00:00.000Z");
  store.beforeDelete = () => {
    store.rows.get(KEY_ID)!.last_used_at =
      "2026-07-29T13:30:00.000Z";
  };

  await expect(deleteManagedKey(store, KEY_ID)).rejects.toMatchObject({
    status: 409,
    code: "API_KEY_WAS_USED",
  });
});

it("returns not found when another request deletes the key first", async () => {
  const store = new MemoryManagedKeyStore();
  await createManagedKey(store, { userId: ADMIN_ID }, input());
  await revokeManagedKey(store, KEY_ID, "2026-07-29T13:00:00.000Z");
  store.beforeDelete = () => {
    store.rows.delete(KEY_ID);
  };

  await expect(deleteManagedKey(store, KEY_ID)).rejects.toMatchObject({
    status: 404,
    code: "API_KEY_NOT_FOUND",
  });
});
```

- [ ] **Step 4: Add store query and error-classification tests**

In `lib/agent-api/__tests__/admin-key-store.test.ts`, add a success test that mirrors the full Supabase builder chain:

```ts
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
```

Add a table-independent test for the three non-success outcomes:

```ts
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
```

- [ ] **Step 5: Run the focused service/store tests and confirm RED**

Run:

```bash
npm test -- lib/agent-api/__tests__/admin-keys.test.ts lib/agent-api/__tests__/admin-key-store.test.ts
```

Expected: TypeScript/test collection fails because `deleteManagedKey`, `ManagedKeyDeleteResult`, and `deleteUnusedRevoked` do not exist. Do not weaken the eligibility or error-code assertions.

- [ ] **Step 6: Define the narrow delete contract**

In `lib/agent-api/admin-keys.ts`, add these exported types near the other managed-key interfaces:

```ts
export interface DeletedManagedKey {
  id: string;
}

export type ManagedKeyDeleteResult =
  | { kind: "deleted"; id: string }
  | { kind: "not_deleted" }
  | { kind: "audit_conflict" };
```

Extend `ManagedKeyStore`:

```ts
deleteUnusedRevoked(id: string): Promise<ManagedKeyDeleteResult>;
```

The result deliberately carries no Supabase error object and no key row.

- [ ] **Step 7: Add explicit domain conflicts and the deletion service**

Add helpers beside `notFound()` and `revoked()`:

```ts
function notRevokedForDeletion(): AgentApiError {
  return new AgentApiError(
    409,
    "API_KEY_NOT_REVOKED",
    "Only revoked API keys can be deleted.",
  );
}

function wasUsed(): AgentApiError {
  return new AgentApiError(
    409,
    "API_KEY_WAS_USED",
    "Previously used API keys cannot be deleted.",
  );
}

function hasAuditHistory(): AgentApiError {
  return new AgentApiError(
    409,
    "API_KEY_HAS_AUDIT_HISTORY",
    "API keys with audit history cannot be deleted.",
  );
}

function assertDeleteEligible(row: ManagedKeyRow): void {
  if (row.revoked_at === null) throw notRevokedForDeletion();
  if (row.last_used_at !== null) throw wasUsed();
}
```

Add `deleteManagedKey` beside the other lifecycle functions:

```ts
export async function deleteManagedKey(
  store: ManagedKeyStore,
  id: string,
): Promise<DeletedManagedKey> {
  validateId(id);
  const existing = await store.get(id);
  if (!existing) throw notFound();
  assertDeleteEligible(checkedRow(existing));

  const result = await store.deleteUnusedRevoked(id);
  if (result.kind === "deleted") return { id: result.id };
  if (result.kind === "audit_conflict") throw hasAuditHistory();

  const current = await store.get(id);
  if (!current) throw notFound();
  assertDeleteEligible(checkedRow(current));
  throw new Error("API key deletion failed.");
}
```

This second read is only for a zero-row conditional delete. It classifies concurrent deletion or eligibility changes while treating an unexplained eligible row as an internal failure.

- [ ] **Step 8: Implement the filtered Supabase delete**

In `createSupabaseManagedKeyStore`, add:

```ts
async deleteUnusedRevoked(id) {
  const { data, error } = await client
    .from("api_keys")
    .delete()
    .eq("id", id)
    .not("revoked_at", "is", null)
    .is("last_used_at", null)
    .select("id")
    .maybeSingle();
  if (error?.code === "23503") return { kind: "audit_conflict" };
  if (error) throw queryError();
  if (data === null) return { kind: "not_deleted" };
  if (
    !isRecord(data)
    || Object.keys(data).length !== 1
    || data.id !== id
  ) {
    throw queryError();
  }
  return { kind: "deleted", id };
},
```

Do not use `MANAGED_KEY_SELECT` here. Selecting only `id` makes secret leakage structurally impossible.

- [ ] **Step 9: Run focused tests and commit the service/store slice**

Run:

```bash
npm test -- lib/agent-api/__tests__/admin-keys.test.ts lib/agent-api/__tests__/admin-key-store.test.ts
git diff --check
```

Expected: both focused files pass, including `23503` mapping and zero-row rereads.

Then commit:

```bash
git add lib/agent-api/admin-keys.ts lib/agent-api/__tests__/admin-keys.test.ts lib/agent-api/__tests__/admin-key-store.test.ts
git commit -m "feat: enforce API key deletion rules"
```

---

### Task 3: Expose the Admin DELETE route with a strict response DTO

**Files:**
- Modify: `lib/agent-api/admin-key-dto.ts`
- Modify: `lib/agent-api/__tests__/admin-key-dto.test.ts`
- Modify: `app/api/admin/v1/api-keys/[id]/route.ts`
- Modify: `app/api/admin/v1/api-keys/__tests__/routes.test.ts`
- Test: `lib/agent-api/__tests__/admin-key-dto.test.ts`
- Test: `app/api/admin/v1/api-keys/__tests__/routes.test.ts`

- [ ] **Step 1: Add strict deleted-ID DTO tests**

Import `isDeletedManagedKey` in `lib/agent-api/__tests__/admin-key-dto.test.ts` and add:

```ts
it("accepts only the exact deleted-key id response", () => {
  expect(isDeletedManagedKey({ id: VIEW.id })).toBe(true);
  for (const value of [
    null,
    {},
    { id: "not-a-uuid" },
    { id: VIEW.id, key_digest: "digest-leak-marker" },
    { id: VIEW.id, secret: SECRET },
  ]) {
    expect(isDeletedManagedKey(value)).toBe(false);
  }
});
```

- [ ] **Step 2: Update route mocks and method-shape expectations**

In `app/api/admin/v1/api-keys/__tests__/routes.test.ts`:

1. Add `deleteManagedKey: vi.fn()` to the hoisted mock object.
2. Export that mock from the `admin-keys` module mock.
3. Default it to `{ id: KEY_ID }` in `beforeEach`.
4. Change the item method assertion to:

```ts
expect(Object.keys(itemRoute).sort()).toEqual(["DELETE", "PATCH"]);
```

Keep the collection route limited to `GET` and `POST`, and continue asserting it has no DELETE handler.

- [ ] **Step 3: Add DELETE to the authenticated route matrix**

Add this call to the existing `responses` array:

```ts
itemRoute.DELETE(request("DELETE"), params()),
```

Update the Admin authentication count from 5 to 6 and add:

```ts
expect(mocks.deleteManagedKey).toHaveBeenCalledWith(STORE, KEY_ID);
```

Parse each body once before the existing response assertions:

```ts
const bodies = await Promise.all(
  responses.map((response) => response.json()),
);
expect(bodies[3]).toMatchObject({
  data: { id: KEY_ID },
  meta: { request_id: expect.stringMatching(/^req_/) },
});
```

Adjust the rotate/revoke response indexes after inserting the DELETE call. In the response loop, check `bodies[index].meta.request_id` instead of calling `response.json()` a second time, and keep the `no-store` assertion for every response.

- [ ] **Step 4: Prove domain and internal failures use safe envelopes**

Import `AgentApiError` in the route test and add:

```ts
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
```

- [ ] **Step 5: Run the focused DTO/route tests and confirm RED**

Run:

```bash
npm test -- lib/agent-api/__tests__/admin-key-dto.test.ts app/api/admin/v1/api-keys/__tests__/routes.test.ts
```

Expected: tests fail because the validator and DELETE export do not exist.

- [ ] **Step 6: Add the exact deleted-ID validator**

In `lib/agent-api/admin-key-dto.ts`, import the `DeletedManagedKey` type, add an exact key list, and export:

```ts
const DELETED_KEY_KEYS = ["id"] as const;

export function isDeletedManagedKey(
  value: unknown,
): value is DeletedManagedKey {
  return isPlainObject(value)
    && hasExactKeys(value, DELETED_KEY_KEYS)
    && typeof value.id === "string"
    && UUID_PATTERN.test(value.id);
}
```

Do not accept extra fields. This keeps a malformed or secret-bearing success envelope from mutating UI state.

- [ ] **Step 7: Add DELETE to the existing dynamic item Route Handler**

In `app/api/admin/v1/api-keys/[id]/route.ts`, import `deleteManagedKey` and add:

```ts
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = `req_${randomUUID()}`;
  try {
    await authenticateAdmin(request);
    const { id } = await params;
    const store = createSupabaseManagedKeyStore(getServerSupabase());
    return successResponse(await deleteManagedKey(store, id), requestId);
  } catch (reason) {
    return errorResponse(reason, requestId);
  }
}
```

Use HTTP 200 through the default `successResponse`; do not return 204 because the client validates `{ id }`.

- [ ] **Step 8: Run focused tests and commit the route/DTO slice**

Run:

```bash
npm test -- lib/agent-api/__tests__/admin-key-dto.test.ts app/api/admin/v1/api-keys/__tests__/routes.test.ts
git diff --check
```

Expected: both focused files pass; PATCH remains exported and DELETE is Admin-authenticated.

Then commit:

```bash
git add lib/agent-api/admin-key-dto.ts lib/agent-api/__tests__/admin-key-dto.test.ts app/api/admin/v1/api-keys/[id]/route.ts app/api/admin/v1/api-keys/__tests__/routes.test.ts
git commit -m "feat: expose Admin API key deletion"
```

---

### Task 4: Add the guarded Delete action to the Admin UI

**Files:**
- Modify: `components/admin/ApiKeyAdmin.tsx`
- Modify: `components/admin/__tests__/ApiKeyAdmin.test.tsx`
- Test: `components/admin/__tests__/ApiKeyAdmin.test.tsx`

- [ ] **Step 1: Teach the component fetch fixture to delete one row**

In `installFetch` inside `components/admin/__tests__/ApiKeyAdmin.test.tsx`, add this branch before the generic POST/PATCH handling:

```ts
if (method === "DELETE") {
  const id = decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
  rows = rows.filter((row) => row.id !== id);
  return envelope({ id });
}
```

Add reusable revoked fixtures:

```ts
const REVOKED_VIEW: ManagedKeyView = {
  ...VIEW,
  revoked_at: "2026-07-29T14:00:00.000Z",
};

const USED_REVOKED_VIEW: ManagedKeyView = {
  ...REVOKED_VIEW,
  id: "40000000-0000-4000-8000-000000000002",
  name: "Previously used revoked key",
  last_used_at: "2026-07-29T13:00:00.000Z",
};
```

- [ ] **Step 2: Test visibility, disabled behavior, and accessible explanation**

Add:

```ts
it("shows Delete only for revoked keys and explains used-key ineligibility", async () => {
  installFetch([VIEW, USED_REVOKED_VIEW]);
  render(<ApiKeyAdmin />);

  const active = await screen.findByRole("article", {
    name: "Bruce experiments",
  });
  expect(within(active).queryByRole("button", {
    name: "Delete Bruce experiments",
  })).toBeNull();

  const used = screen.getByRole("article", {
    name: "Previously used revoked key",
  });
  const button = within(used).getByRole("button", {
    name: "Delete Previously used revoked key",
  }) as HTMLButtonElement;
  const reason = within(used).getByText(
    "Previously used keys cannot be deleted.",
  );
  expect(button.disabled).toBe(true);
  expect(button.getAttribute("aria-describedby")).toBe(reason.id);
  fireEvent.click(button);
  expect(window.confirm).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Test exact confirmation, cancellation, DELETE, and local removal**

Add:

```ts
it("cancels then permanently deletes an eligible revoked key", async () => {
  const confirm = vi.mocked(window.confirm);
  confirm.mockReturnValueOnce(false).mockReturnValueOnce(true);
  const fetchMock = installFetch([REVOKED_VIEW]);
  render(<ApiKeyAdmin />);
  const card = await screen.findByRole("article", {
    name: "Bruce experiments",
  });
  const button = within(card).getByRole("button", {
    name: "Delete Bruce experiments",
  });

  fireEvent.click(button);
  expect(confirm).toHaveBeenNthCalledWith(
    1,
    "Delete revoked API key “Bruce experiments”? "
      + "This permanently removes the record and cannot be undone.",
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("article", {
    name: "Bruce experiments",
  })).toBeDefined();

  fireEvent.click(button);
  expect(await screen.findByText("No API keys yet.")).toBeDefined();
  const deleteCall = fetchMock.mock.calls.find(([, init]) => (
    init?.method === "DELETE"
  ));
  expect(String(deleteCall?.[0])).toBe(
    `/api/admin/v1/api-keys/${KEY_ID}`,
  );
  expect(deleteCall?.[1]?.body).toBeUndefined();
});
```

- [ ] **Step 4: Test audit-history conflict recovery**

Add:

```ts
it("keeps the card when audit history blocks deletion", async () => {
  const fetchMock = installFetch([REVOKED_VIEW]);
  fetchMock
    .mockImplementationOnce(async () => envelope([REVOKED_VIEW]))
    .mockImplementationOnce(async () => errorEnvelope(
      409,
      "API_KEY_HAS_AUDIT_HISTORY",
      "API keys with audit history cannot be deleted.",
    ));
  render(<ApiKeyAdmin />);
  const card = await screen.findByRole("article", {
    name: "Bruce experiments",
  });

  fireEvent.click(within(card).getByRole("button", {
    name: "Delete Bruce experiments",
  }));

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(
    "API keys with audit history cannot be deleted.",
  );
  expect(screen.getByRole("article", {
    name: "Bruce experiments",
  })).toBeDefined();
});
```

- [ ] **Step 5: Prove duplicate and unmount guards cover deletion**

Add one focused deferred-response test:

```ts
it("atomically guards duplicate deletes and ignores completion after unmount", async () => {
  const deletion = deferred<Response>();
  const confirm = vi.mocked(window.confirm);
  const fetchMock = installFetch([REVOKED_VIEW]);
  fetchMock
    .mockImplementationOnce(async () => envelope([REVOKED_VIEW]))
    .mockImplementationOnce(() => deletion.promise);
  const { unmount } = render(<ApiKeyAdmin />);
  const button = await screen.findByRole("button", {
    name: "Delete Bruce experiments",
  });

  act(() => {
    fireEvent.click(button);
    fireEvent.click(button);
  });

  expect(confirm).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  unmount();
  await act(async () => deletion.resolve(envelope({ id: KEY_ID })));
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 6: Run the focused component test and confirm RED**

Run:

```bash
npm test -- components/admin/__tests__/ApiKeyAdmin.test.tsx
```

Expected: the new tests fail because no Delete control or client request exists.

- [ ] **Step 7: Import the strict delete response contract**

In `components/admin/ApiKeyAdmin.tsx`, import:

```ts
import {
  isDeletedManagedKey,
  isManagedKeyView,
  isManagedKeyViewArray,
  isManagedKeyWithSecret,
} from "@/lib/agent-api/admin-key-dto";
import type {
  DeletedManagedKey,
  ManagedKeyInput,
  ManagedKeyView,
  ManagedKeyWithSecret,
} from "@/lib/agent-api/admin-keys";
```

- [ ] **Step 8: Add the guarded delete mutation**

Place `deleteKey` beside `revokeKey`:

```ts
async function deleteKey(key: ManagedKeyView) {
  if (
    creating
    || loading
    || sessionInvalid.current
    || rotationUncertain
    || pendingId !== null
    || key.revoked_at === null
    || key.last_used_at !== null
  ) {
    return;
  }
  const operation = beginMutationOperation();
  if (!operation) return;
  if (!window.confirm(
    `Delete revoked API key “${key.name}”? `
      + "This permanently removes the record and cannot be undone.",
  )) {
    operation.finish();
    return;
  }
  setPendingId(key.id);
  setError(null);
  try {
    const deleted = await adminRequest<DeletedManagedKey>(
      `/api/admin/v1/api-keys/${key.id}`,
      { method: "DELETE" },
      "Could not delete the API key.",
      operation,
      isDeletedManagedKey,
    );
    if (!operation.isCurrent()) return;
    setKeys((current) => current.filter(
      (candidate) => candidate.id !== deleted.id,
    ));
  } catch (reason) {
    await handleRequestFailure(
      reason,
      "Could not delete the API key.",
      operation,
    );
  } finally {
    operation.finish();
    if (operation.isCurrent()) setPendingId(null);
  }
}
```

This intentionally has no uncertain-delete state. A lost success response leaves the card visible until the next reload.

- [ ] **Step 9: Render enabled or explained-disabled Delete controls**

Inside the `keys.map` callback, immediately after the existing `status`
declaration and before `return`, derive a stable helper ID:

```ts
const deleteReasonId = `api-key-delete-reason-${key.id}`;
```

After the existing non-revoked Rotate/Revoke controls, add:

```tsx
{status === "revoked" && (
  <>
    <button
      className="btn api-key-revoke"
      type="button"
      disabled={controlsBusy || key.last_used_at !== null}
      aria-label={`Delete ${key.name}`}
      aria-describedby={
        key.last_used_at !== null ? deleteReasonId : undefined
      }
      onClick={() => void deleteKey(key)}
    >
      {busy ? "Working…" : "Delete"}
    </button>
    {key.last_used_at !== null && (
      <span className="muted" id={deleteReasonId}>
        Previously used keys cannot be deleted.
      </span>
    )}
  </>
)}
```

Do not render Delete for active or expired-only Keys. Do not query the audit table from the browser.

- [ ] **Step 10: Run the component tests and commit the UI slice**

Run:

```bash
npm test -- components/admin/__tests__/ApiKeyAdmin.test.tsx
git diff --check
```

Expected: the complete component suite passes, including existing session, secret, rotation, reload, race, and unmount tests.

Then commit:

```bash
git add components/admin/ApiKeyAdmin.tsx components/admin/__tests__/ApiKeyAdmin.test.tsx
git commit -m "feat: delete eligible revoked API keys"
```

---

### Task 5: Verify the end-to-end contract and patch scope

**Files:**
- Verify: `supabase/migrations/*_allow_revoked_api_key_deletion.sql`
- Verify: `supabase/tests/0014_api_key_deletion.sql`
- Verify: `lib/agent-api/admin-keys.ts`
- Verify: `lib/agent-api/admin-key-dto.ts`
- Verify: `app/api/admin/v1/api-keys/[id]/route.ts`
- Verify: `components/admin/ApiKeyAdmin.tsx`
- Verify: all modified tests

- [ ] **Step 1: Run all focused application tests together**

Run:

```bash
npm test -- lib/agent-api/__tests__/admin-keys.test.ts lib/agent-api/__tests__/admin-key-store.test.ts lib/agent-api/__tests__/admin-key-dto.test.ts app/api/admin/v1/api-keys/__tests__/routes.test.ts components/admin/__tests__/ApiKeyAdmin.test.tsx
```

Expected: all focused service, store, DTO, route, and component tests pass in one process.

- [ ] **Step 2: Rebuild the local database and run the complete pgTAP suite**

Run:

```bash
npx supabase db reset --local
npx supabase test db --local supabase/tests
```

Expected: every SQL test passes, including existing mutation/read/security coverage and `0014_api_key_deletion.sql`.

- [ ] **Step 3: Run the full Vitest suite**

Run:

```bash
npm test
```

Expected: the full application test suite passes.

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: Next.js production compilation and type checking succeed.

- [ ] **Step 5: Audit security and non-goal boundaries**

Run:

```bash
rg -n "grant delete on table public\\.api_keys|on delete cascade" supabase/migrations supabase/tests
rg -n "deleteManagedKey|API_KEY_NOT_REVOKED|API_KEY_WAS_USED|API_KEY_HAS_AUDIT_HISTORY" lib app components
git diff --name-only dashboard/feat/triton-board-agent-api...HEAD
```

Expected:

- The new migration contains the only new `api_keys` DELETE grant, and it names only `service_role`.
- No new cascade appears on `agent_api_audit_log.api_key_id`.
- The four deletion outcomes are implemented and tested.
- No Agent API route, OpenAPI file, or generated Skill file changed for this feature.

- [ ] **Step 6: Check repository hygiene and final history**

Run:

```bash
git diff --check
git status --short
git log --oneline -6
```

Expected: no whitespace errors, no uncommitted implementation files, and separate reviewable commits for database authorization, service/store policy, Admin route/DTO, and UI behavior.
