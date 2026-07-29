import { AgentApiError } from "@/lib/agent-api/errors";

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseCanonicalIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key");
  if (!value || !CANONICAL_UUID_PATTERN.test(value)) {
    throw new AgentApiError(
      400,
      "MISSING_IDEMPOTENCY_KEY",
      "POST requires one canonical UUID Idempotency-Key header.",
    );
  }
  return value;
}
