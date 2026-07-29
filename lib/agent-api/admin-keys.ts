import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  digestApiKey,
  generateApiKey,
} from "@/lib/agent-api/auth";
import { AgentApiError } from "@/lib/agent-api/errors";
import {
  API_SCOPES,
  type ApiScope,
} from "@/lib/agent-api/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const VALID_SCOPES = new Set<string>(API_SCOPES);
const MANAGED_KEY_FIELDS = new Set([
  "name",
  "member_id",
  "scopes",
  "expires_at",
]);
const PROTECTED_PATCH_FIELDS = new Set([
  "id",
  "key_prefix",
  "key_digest",
  "revoked_at",
  "last_used_at",
  "created_by",
  "created_at",
  "updated_at",
  "member",
]);
const MANAGED_KEY_SELECT = [
  "id",
  "name",
  "key_prefix",
  "member_id",
  "scopes",
  "expires_at",
  "revoked_at",
  "last_used_at",
  "created_at",
  "member:members(id,name)",
].join(",");

export interface ManagedKeyInput {
  name: string;
  member_id: string;
  scopes: ApiScope[];
  expires_at: string | null;
}

export type ManagedKeyPatch = Partial<ManagedKeyInput>;

export interface ManagedKeyView {
  id: string;
  name: string;
  key_prefix: string;
  member: { id: string; name: string } | null;
  scopes: ApiScope[];
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface ManagedKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  member_id: string | null;
  member: { id: string; name: string } | null;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface DeletedManagedKey {
  id: string;
}

export type ManagedKeyDeleteResult =
  | { kind: "deleted"; id: string }
  | { kind: "not_deleted" }
  | { kind: "audit_conflict" };

interface ManagedKeyInsert {
  name: string;
  key_prefix: string;
  key_digest: string;
  member_id: string;
  scopes: string[];
  expires_at: string | null;
  created_by: string;
}

interface ManagedKeyChanges {
  name?: string;
  key_prefix?: string;
  key_digest?: string;
  member_id?: string | null;
  scopes?: string[];
  expires_at?: string | null;
  revoked_at?: string | null;
}

export interface ManagedKeyStore {
  list(): Promise<ManagedKeyRow[]>;
  get(id: string): Promise<ManagedKeyRow | null>;
  memberExists(id: string): Promise<boolean>;
  insert(values: ManagedKeyInsert): Promise<ManagedKeyRow>;
  update(
    id: string,
    changes: ManagedKeyChanges,
    options?: { onlyActive?: boolean },
  ): Promise<ManagedKeyRow | null>;
  deleteUnusedRevoked(id: string): Promise<ManagedKeyDeleteResult>;
}

export type ManagedKeyWithSecret = ManagedKeyView & { secret: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function invalidField(field: string): never {
  throw new AgentApiError(
    422,
    "INVALID_FIELD",
    `${field} has an invalid value.`,
    false,
    { field },
  );
}

function validateId(id: string): void {
  if (!UUID_PATTERN.test(id)) invalidField("id");
}

function validateName(value: unknown): string {
  if (typeof value !== "string") return invalidField("name");
  const name = value.trim();
  if (name.length < 1 || name.length > 100) return invalidField("name");
  return name;
}

function validateMemberId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    return invalidField("member_id");
  }
  return value;
}

function validateScopes(value: unknown): ApiScope[] {
  if (!Array.isArray(value)) return invalidField("scopes");
  const scopes: ApiScope[] = [];
  const seen = new Set<string>();
  for (const scope of value) {
    if (
      typeof scope !== "string"
      || !VALID_SCOPES.has(scope)
      || seen.has(scope)
    ) {
      return invalidField("scopes");
    }
    seen.add(scope);
    scopes.push(scope as ApiScope);
  }
  return scopes;
}

function validateExpiry(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return invalidField("expires_at");
  const match = value.match(RFC3339_PATTERN);
  if (!match || !Number.isFinite(Date.parse(value))) {
    return invalidField("expires_at");
  }
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  if (
    calendar.getUTCFullYear() !== year
    || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day
    || calendar.getUTCHours() !== hour
    || calendar.getUTCMinutes() !== minute
    || calendar.getUTCSeconds() !== second
  ) {
    return invalidField("expires_at");
  }
  return new Date(value).toISOString();
}

function validateFields(
  value: unknown,
  patch: boolean,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new AgentApiError(
      400,
      "INVALID_BODY",
      "Request body must be a JSON object.",
    );
  }
  const fields = Object.keys(value);
  if (patch && fields.length === 0) {
    throw new AgentApiError(
      422,
      "EMPTY_PATCH",
      "PATCH changes cannot be empty.",
    );
  }
  for (const field of fields) {
    if (patch && PROTECTED_PATCH_FIELDS.has(field)) {
      throw new AgentApiError(
        422,
        "FIELD_NOT_WRITABLE",
        `${field} cannot be modified.`,
        false,
        { field },
      );
    }
    if (!MANAGED_KEY_FIELDS.has(field)) {
      throw new AgentApiError(
        422,
        "UNKNOWN_FIELD",
        `${field} is not a recognized field.`,
        false,
        { field },
      );
    }
  }
  return value;
}

function validateInput(value: unknown): ManagedKeyInput {
  const input = validateFields(value, false);
  if (
    !Object.hasOwn(input, "name")
    || !Object.hasOwn(input, "member_id")
    || !Object.hasOwn(input, "scopes")
    || !Object.hasOwn(input, "expires_at")
  ) {
    throw new AgentApiError(
      400,
      "INVALID_BODY",
      "name, member_id, scopes, and expires_at are required.",
    );
  }
  return {
    name: validateName(input.name),
    member_id: validateMemberId(input.member_id),
    scopes: validateScopes(input.scopes),
    expires_at: validateExpiry(input.expires_at),
  };
}

function validatePatch(value: unknown): ManagedKeyPatch {
  const patch = validateFields(value, true);
  return {
    ...(Object.hasOwn(patch, "name")
      ? { name: validateName(patch.name) }
      : {}),
    ...(Object.hasOwn(patch, "member_id")
      ? { member_id: validateMemberId(patch.member_id) }
      : {}),
    ...(Object.hasOwn(patch, "scopes")
      ? { scopes: validateScopes(patch.scopes) }
      : {}),
    ...(Object.hasOwn(patch, "expires_at")
      ? { expires_at: validateExpiry(patch.expires_at) }
      : {}),
  };
}

function validDateOrNull(value: unknown): value is string | null {
  return value === null
    || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

function isManagedKeyRow(value: unknown): value is ManagedKeyRow {
  if (!isRecord(value)) return false;
  const member = value.member;
  return typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.key_prefix === "string"
    && (typeof value.member_id === "string" || value.member_id === null)
    && Array.isArray(value.scopes)
    && value.scopes.every(
      (scope) => typeof scope === "string" && VALID_SCOPES.has(scope),
    )
    && validDateOrNull(value.expires_at)
    && validDateOrNull(value.revoked_at)
    && validDateOrNull(value.last_used_at)
    && typeof value.created_at === "string"
    && Number.isFinite(Date.parse(value.created_at))
    && (
      member === null
      || (
        isRecord(member)
        && typeof member.id === "string"
        && typeof member.name === "string"
      )
    );
}

function checkedRow(value: unknown): ManagedKeyRow {
  if (!isManagedKeyRow(value)) {
    throw new Error("Admin API key query returned an invalid row.");
  }
  return value;
}

function toView(row: ManagedKeyRow): ManagedKeyView {
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    member: row.member,
    scopes: [...row.scopes] as ApiScope[],
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    last_used_at: row.last_used_at,
    created_at: row.created_at,
  };
}

async function requireMember(
  store: ManagedKeyStore,
  memberId: string,
): Promise<void> {
  if (!await store.memberExists(memberId)) {
    throw new AgentApiError(
      422,
      "MEMBER_NOT_FOUND",
      "member_id must identify an existing Member.",
      false,
      { field: "member_id" },
    );
  }
}

function notFound(): AgentApiError {
  return new AgentApiError(404, "API_KEY_NOT_FOUND", "API key not found.");
}

function revoked(): AgentApiError {
  return new AgentApiError(
    409,
    "API_KEY_REVOKED",
    "A revoked API key cannot be rotated.",
  );
}

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

export async function listManagedKeys(
  store: ManagedKeyStore,
): Promise<ManagedKeyView[]> {
  return (await store.list()).map((row) => toView(checkedRow(row)));
}

export async function createManagedKey(
  store: ManagedKeyStore,
  admin: { userId: string },
  value: ManagedKeyInput,
): Promise<ManagedKeyWithSecret> {
  const input = validateInput(value);
  await requireMember(store, input.member_id);
  const generated = generateApiKey();
  const row = checkedRow(await store.insert({
    ...input,
    scopes: [...input.scopes],
    key_prefix: generated.keyPrefix,
    key_digest: digestApiKey(generated.raw),
    created_by: admin.userId,
  }));
  return { ...toView(row), secret: generated.raw };
}

export async function patchManagedKey(
  store: ManagedKeyStore,
  id: string,
  value: ManagedKeyPatch,
): Promise<ManagedKeyView> {
  validateId(id);
  const patch = validatePatch(value);
  if (patch.member_id !== undefined) {
    await requireMember(store, patch.member_id);
  }
  if (!await store.get(id)) throw notFound();
  const updated = await store.update(id, patch);
  if (!updated) throw notFound();
  return toView(checkedRow(updated));
}

export async function rotateManagedKey(
  store: ManagedKeyStore,
  id: string,
): Promise<ManagedKeyWithSecret> {
  validateId(id);
  const existing = await store.get(id);
  if (!existing) throw notFound();
  if (checkedRow(existing).revoked_at !== null) throw revoked();

  const generated = generateApiKey();
  const updated = await store.update(
    id,
    {
      key_prefix: generated.keyPrefix,
      key_digest: digestApiKey(generated.raw),
    },
    { onlyActive: true },
  );
  if (!updated) {
    const current = await store.get(id);
    if (current && checkedRow(current).revoked_at !== null) throw revoked();
    if (!current) throw notFound();
    throw new Error("API key rotation failed.");
  }
  return { ...toView(checkedRow(updated)), secret: generated.raw };
}

export async function revokeManagedKey(
  store: ManagedKeyStore,
  id: string,
  revokedAt = new Date().toISOString(),
): Promise<ManagedKeyView> {
  validateId(id);
  const existing = await store.get(id);
  if (!existing) throw notFound();
  const checked = checkedRow(existing);
  if (checked.revoked_at !== null) return toView(checked);

  const updated = await store.update(
    id,
    { revoked_at: revokedAt },
    { onlyActive: true },
  );
  if (updated) return toView(checkedRow(updated));

  const current = await store.get(id);
  if (!current) throw notFound();
  const concurrent = checkedRow(current);
  if (concurrent.revoked_at !== null) return toView(concurrent);
  throw new Error("API key revocation failed.");
}

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

export function createSupabaseManagedKeyStore(
  client: SupabaseClient,
): ManagedKeyStore {
  function queryError(): Error {
    return new Error("Admin API key query failed.");
  }

  return {
    async list() {
      const { data, error } = await client
        .from("api_keys")
        .select(MANAGED_KEY_SELECT)
        .order("created_at", { ascending: false });
      if (error || !Array.isArray(data)) throw queryError();
      return data.map(checkedRow);
    },

    async get(id) {
      const { data, error } = await client
        .from("api_keys")
        .select(MANAGED_KEY_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error) throw queryError();
      return data === null ? null : checkedRow(data);
    },

    async memberExists(id) {
      const { data, error } = await client
        .from("members")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw queryError();
      return data !== null;
    },

    async insert(values) {
      const { data, error } = await client
        .from("api_keys")
        .insert(values)
        .select(MANAGED_KEY_SELECT)
        .single();
      if (error || data === null) throw queryError();
      return checkedRow(data);
    },

    async update(id, changes, options) {
      let query = client
        .from("api_keys")
        .update(changes)
        .eq("id", id);
      if (options?.onlyActive) query = query.is("revoked_at", null);
      const { data, error } = await query
        .select(MANAGED_KEY_SELECT)
        .maybeSingle();
      if (error) throw queryError();
      return data === null ? null : checkedRow(data);
    },

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
  };
}
