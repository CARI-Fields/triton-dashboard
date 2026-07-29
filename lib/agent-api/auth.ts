import { createHash, randomBytes } from "node:crypto";
import { AgentApiError } from "@/lib/agent-api/errors";
import { getServerSupabase } from "@/lib/agent-api/server";
import {
  API_SCOPES,
  type AgentContext,
  type ApiScope,
} from "@/lib/agent-api/types";

const API_KEY_SELECT = [
  "id",
  "key_prefix",
  "member_id",
  "scopes",
  "expires_at",
  "revoked_at",
  "member:members(id,name)",
].join(",");
const API_KEY_PATTERN =
  /^tb_live_([A-Za-z0-9_-]{8})_([A-Za-z0-9_-]{43})$/;
const VALID_SCOPES = new Set<string>(API_SCOPES);
const LAST_USED_INTERVAL_MS = 5 * 60 * 1000;

interface ApiKeyRow {
  id: string;
  key_prefix: string;
  member_id: string | null;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
  member: { id: string; name: string } | null;
}

type ActiveApiKeyRow = ApiKeyRow & {
  member_id: string;
  member: { id: string; name: string };
};

export interface GeneratedApiKey {
  raw: string;
  keyPrefix: string;
  secretBytes: number;
}

export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(32);
  const encoded = secret.toString("base64url");
  const keyPrefix = `tb_live_${encoded.slice(0, 8)}`;
  return {
    raw: `${keyPrefix}_${encoded}`,
    keyPrefix,
    secretBytes: secret.byteLength,
  };
}

export function digestApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  return match?.[1] ?? null;
}

function isValidApiKey(raw: string): boolean {
  const match = raw.match(API_KEY_PATTERN);
  return match !== null && match[1] === match[2].slice(0, 8);
}

function invalidApiKey(): AgentApiError {
  return new AgentApiError(401, "INVALID_API_KEY", "Invalid API key.");
}

class ServerConfigurationError extends Error {
  readonly code = "SERVER_MISCONFIGURED";

  constructor() {
    super("Server authentication configuration is missing.");
    this.name = "ServerConfigurationError";
  }
}

function invalidAdminSession(): AgentApiError {
  return new AgentApiError(
    401,
    "INVALID_ADMIN_SESSION",
    "Invalid Admin session.",
  );
}

function isApiKeyRow(value: unknown): value is ApiKeyRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Partial<ApiKeyRow>;
  const member = row.member;
  return typeof row.id === "string"
    && typeof row.key_prefix === "string"
    && (typeof row.member_id === "string" || row.member_id === null)
    && Array.isArray(row.scopes)
    && row.scopes.every(
      (scope) => typeof scope === "string" && VALID_SCOPES.has(scope),
    )
    && (typeof row.expires_at === "string" || row.expires_at === null)
    && (typeof row.revoked_at === "string" || row.revoked_at === null)
    && (
      member === null
      || (
        typeof member === "object"
        && typeof member.id === "string"
        && typeof member.name === "string"
      )
    );
}

function isActiveKey(
  row: ApiKeyRow,
  now: number,
): row is ActiveApiKeyRow {
  if (row.revoked_at !== null || row.member_id === null || row.member === null) {
    return false;
  }
  if (row.member.id !== row.member_id) return false;
  if (row.expires_at === null) return true;
  const expiresAt = Date.parse(row.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

async function recordLastUsed(apiKeyId: string, now: number): Promise<void> {
  const timestamp = new Date(now).toISOString();
  const threshold = new Date(now - LAST_USED_INTERVAL_MS).toISOString();
  try {
    await getServerSupabase()
      .from("api_keys")
      .update({ last_used_at: timestamp })
      .eq("id", apiKeyId)
      .or(`last_used_at.is.null,last_used_at.lt.${threshold}`);
  } catch {
    // Usage tracking must not turn a valid credential into an outage.
  }
}

export async function authenticateAgent(
  request: Request,
): Promise<AgentContext> {
  const raw = readBearerToken(request);
  if (raw === null || !isValidApiKey(raw)) {
    throw invalidApiKey();
  }

  const { data, error } = await getServerSupabase()
    .from("api_keys")
    .select(API_KEY_SELECT)
    .eq("key_digest", digestApiKey(raw))
    .maybeSingle();
  if (error) {
    throw new Error("Agent credential lookup failed.");
  }

  const now = Date.now();
  if (!isApiKeyRow(data) || !isActiveKey(data, now)) {
    throw invalidApiKey();
  }

  await recordLastUsed(data.id, now);
  return {
    apiKeyId: data.id,
    keyPrefix: data.key_prefix,
    memberId: data.member_id,
    memberName: data.member.name,
    scopes: new Set(data.scopes as ApiScope[]),
    expiresAt: data.expires_at,
  };
}

export async function authenticateAdmin(
  request: Request,
): Promise<{ userId: string }> {
  const adminUserId = process.env.TRITON_BOARD_ADMIN_USER_ID;
  if (!adminUserId?.trim()) throw new ServerConfigurationError();

  const token = readBearerToken(request);
  if (token === null) throw invalidAdminSession();

  const { data, error } = await getServerSupabase().auth.getUser(token);
  if (error || !data.user) throw invalidAdminSession();
  if (data.user.id !== adminUserId) {
    throw new AgentApiError(
      403,
      "ADMIN_FORBIDDEN",
      "Admin access is required.",
    );
  }
  return { userId: data.user.id };
}
