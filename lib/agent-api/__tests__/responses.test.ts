import { describe, expect, it } from "vitest";
import { AgentApiError } from "@/lib/agent-api/errors";
import {
  errorResponse,
  etagFor,
  parseIfMatch,
  successResponse,
} from "@/lib/agent-api/responses";
import { API_SCOPES } from "@/lib/agent-api/types";

function countRequestIds(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((count, item) => count + countRequestIds(item), 0);
  }
  if (typeof value !== "object" || value === null) return 0;
  return Object.entries(value).reduce(
    (count, [key, item]) => count + (key === "request_id" ? 1 : 0)
      + countRequestIds(item),
    0,
  );
}

describe("Agent API response primitives", () => {
  it("defines the fixed Agent API scopes", () => {
    expect(API_SCOPES).toEqual([
      "board:read",
      "tasks:write",
      "experiments:write",
      "attachments:write",
      "activity:append",
      "audit:read",
    ]);
  });

  it("creates an AgentApiError with stable public fields", () => {
    const error = new AgentApiError(
      422,
      "INVALID_FIELD",
      "position is invalid.",
      false,
      { field: "position" },
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      status: 422,
      code: "INVALID_FIELD",
      message: "position is invalid.",
      retryable: false,
      details: { field: "position" },
    });
  });

  it("quotes updated_at values as ETags", () => {
    expect(etagFor("2026-07-28T15:31:22.123456Z"))
      .toBe('"2026-07-28T15:31:22.123456Z"');
  });

  it.each([
    "2026-07-28T15:31:22Z",
    "2026-07-28T15:31:22.1Z",
    "2026-07-28T15:31:22.123456Z",
    "2026-07-28T15:31:22.123456789+05:30",
    "2026-07-28T15:31:22-04:00",
  ])("forwards a quoted RFC 3339 If-Match value unchanged: %s", (value) => {
    const request = new Request("https://example.test", {
      headers: { "If-Match": `"${value}"` },
    });

    expect(parseIfMatch(request)).toBe(value);
  });

  it.each([
    undefined,
    "",
    "unquoted",
    '"missing-end',
    'missing-start"',
    '""',
    "*",
    'W/"2026-07-28T15:31:22Z"',
    '"2026-07-28T15:31:22Z", "2026-07-28T15:31:23Z"',
    '"not-a-timestamp"',
    '"2026-02-30T12:00:00.000Z"',
    '"2026-07-28"',
    '"2026-07-28 15:31:22Z"',
    '"2026-07-28T15:31:22"',
    '"2026-07-28T24:00:00Z"',
    '"2026-07-28T15:60:00Z"',
    '"2026-07-28T15:31:60Z"',
    '"2026-07-28T15:31:22+24:00"',
    '"2026-07-28T15:31:22+05:60"',
  ])(
    "rejects non-RFC3339 or non-singleton If-Match %s",
    (value) => {
      const headers = value === undefined ? undefined : { "If-Match": value };
      const request = new Request("https://example.test", { headers });

      expect(() => parseIfMatch(request)).toThrowError(
        expect.objectContaining({
          status: 400,
          code: "MISSING_IF_MATCH",
        }),
      );
    },
  );

  it("returns a no-store success envelope with one request id", async () => {
    const response = successResponse({ id: "resource-id" }, "req_success");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      data: { id: "resource-id" },
      meta: { request_id: "req_success" },
    });
    expect(countRequestIds(body)).toBe(1);
  });

  it("supports success status, headers, and metadata", async () => {
    const response = successResponse({ id: "resource-id" }, "req_created", {
      status: 201,
      headers: { ETag: '"revision"' },
      meta: { idempotency_replayed: false },
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("etag")).toBe('"revision"');
    expect(await response.json()).toEqual({
      data: { id: "resource-id" },
      meta: {
        request_id: "req_created",
        idempotency_replayed: false,
      },
    });
  });

  it("returns a public AgentApiError envelope with one request id", async () => {
    const response = errorResponse(
      new AgentApiError(
        422,
        "FIELD_NOT_WRITABLE",
        "owner_id cannot be modified by the Agent API.",
        false,
        { field: "owner_id" },
      ),
      "req_error",
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      error: {
        code: "FIELD_NOT_WRITABLE",
        message: "owner_id cannot be modified by the Agent API.",
        request_id: "req_error",
        retryable: false,
        details: { field: "owner_id" },
      },
    });
    expect(countRequestIds(body)).toBe(1);
  });

  it("sets Retry-After for write rate limiting", () => {
    const response = errorResponse(
      new AgentApiError(429, "WRITE_RATE_LIMITED", "Try later.", true),
      "req_limited",
    );

    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("does not expose unknown error messages, stacks, or Supabase secrets", async () => {
    const secret = "sb_secret_do_not_expose";
    const reason = new Error(`SUPABASE_SECRET_KEY=${secret}`);
    reason.stack = `Error: ${secret}\n at supabase.ts:1`;

    const response = errorResponse(reason, "req_internal");
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("SUPABASE_SECRET_KEY");
    expect(serialized).not.toContain("stack");
    expect(JSON.parse(serialized)).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred.",
        request_id: "req_internal",
        retryable: true,
      },
    });
  });
});
