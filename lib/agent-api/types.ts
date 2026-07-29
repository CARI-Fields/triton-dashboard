export const API_SCOPES = [
  "board:read",
  "tasks:write",
  "experiments:write",
  "attachments:write",
  "activity:append",
  "audit:read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export interface AgentContext {
  apiKeyId: string;
  keyPrefix: string;
  memberId: string;
  memberName: string;
  scopes: ReadonlySet<ApiScope>;
  expiresAt: string | null;
}

export interface ApiSuccess<T> {
  data: T;
  meta: {
    request_id: string;
    idempotency_replayed?: boolean;
  };
}

export interface ApiFailure {
  error: {
    code: string;
    message: string;
    request_id: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}
