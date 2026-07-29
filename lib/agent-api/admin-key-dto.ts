import { API_SCOPES, type ApiScope } from "@/lib/agent-api/types";
import type {
  ManagedKeyView,
  ManagedKeyWithSecret,
} from "@/lib/agent-api/admin-keys";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_PREFIX_PATTERN = /^tb_live_[A-Za-z0-9_-]{8}$/;
const RAW_SECRET_PATTERN =
  /^tb_live_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{43}$/;
const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const VALID_SCOPES = new Set<string>(API_SCOPES);
const VIEW_KEYS = [
  "id",
  "name",
  "key_prefix",
  "member",
  "scopes",
  "expires_at",
  "revoked_at",
  "last_used_at",
  "created_at",
] as const;
const VIEW_WITH_SECRET_KEYS = [...VIEW_KEYS, "secret"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length
    && keys.every((key) => expected.includes(key));
}

function isDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(RFC3339_PATTERN);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  return calendar.getUTCFullYear() === year
    && calendar.getUTCMonth() === month - 1
    && calendar.getUTCDate() === day
    && calendar.getUTCHours() === hour
    && calendar.getUTCMinutes() === minute
    && calendar.getUTCSeconds() === second;
}

function isNullableDateTime(value: unknown): value is string | null {
  return value === null || isDateTime(value);
}

function isMember(
  value: unknown,
): value is ManagedKeyView["member"] {
  if (value === null) return true;
  return isPlainObject(value)
    && hasExactKeys(value, ["id", "name"])
    && typeof value.id === "string"
    && UUID_PATTERN.test(value.id)
    && typeof value.name === "string"
    && value.name.length > 0;
}

function isScopes(value: unknown): value is ApiScope[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const scope of value) {
    if (
      typeof scope !== "string"
      || !VALID_SCOPES.has(scope)
      || seen.has(scope)
    ) {
      return false;
    }
    seen.add(scope);
  }
  return true;
}

function hasValidViewFields(value: Record<string, unknown>): boolean {
  return typeof value.id === "string"
    && UUID_PATTERN.test(value.id)
    && typeof value.name === "string"
    && value.name.length > 0
    && value.name.length <= 100
    && typeof value.key_prefix === "string"
    && KEY_PREFIX_PATTERN.test(value.key_prefix)
    && isMember(value.member)
    && isScopes(value.scopes)
    && isNullableDateTime(value.expires_at)
    && isNullableDateTime(value.revoked_at)
    && isNullableDateTime(value.last_used_at)
    && isDateTime(value.created_at);
}

export function isManagedKeyView(value: unknown): value is ManagedKeyView {
  return isPlainObject(value)
    && hasExactKeys(value, VIEW_KEYS)
    && hasValidViewFields(value);
}

export function isManagedKeyWithSecret(
  value: unknown,
): value is ManagedKeyWithSecret {
  return isPlainObject(value)
    && hasExactKeys(value, VIEW_WITH_SECRET_KEYS)
    && hasValidViewFields(value)
    && typeof value.secret === "string"
    && RAW_SECRET_PATTERN.test(value.secret);
}

export function isManagedKeyViewArray(
  value: unknown,
): value is ManagedKeyView[] {
  return Array.isArray(value) && value.every(isManagedKeyView);
}
