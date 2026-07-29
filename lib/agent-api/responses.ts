import { AgentApiError } from "@/lib/agent-api/errors";
import { isRfc3339Timestamp } from "@/lib/agent-api/timestamps";
import type { ApiFailure, ApiSuccess } from "@/lib/agent-api/types";

export interface SuccessResponseInit extends ResponseInit {
  meta?: Record<string, unknown>;
}

function responseHeaders(headersInit?: HeadersInit): Headers {
  const headers = new Headers(headersInit);
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "no-store");
  }
  return headers;
}

export function successResponse<T>(
  data: T,
  requestId: string,
  init: SuccessResponseInit = {},
): Response {
  const { headers: headersInit, meta = {}, ...responseInit } = init;
  const { request_id: _discardedRequestId, ...publicMeta } = meta;
  const body: ApiSuccess<T> = {
    data,
    meta: {
      ...publicMeta,
      request_id: requestId,
    },
  };
  return Response.json(body, {
    ...responseInit,
    headers: responseHeaders(headersInit),
  });
}

export function errorResponse(reason: unknown, requestId: string): Response {
  const error = reason instanceof AgentApiError
    ? reason
    : new AgentApiError(
      500,
      "INTERNAL_ERROR",
      "An internal error occurred.",
      true,
    );
  const body: ApiFailure = {
    error: {
      code: error.code,
      message: error.message,
      request_id: requestId,
      retryable: error.retryable,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
  const headers = responseHeaders();
  if (error.code === "WRITE_RATE_LIMITED") {
    headers.set("Retry-After", "60");
  }
  return Response.json(body, {
    status: error.status,
    headers,
  });
}

export function etagFor(updatedAt: string): string {
  return `"${updatedAt}"`;
}

export function parseIfMatch(request: Request): string {
  const value = request.headers.get("if-match");
  const match = value?.match(/^"([^",]+)"$/);
  if (!match || !isRfc3339Timestamp(match[1])) {
    throw new AgentApiError(
      400,
      "MISSING_IF_MATCH",
      "PATCH requires a quoted If-Match value.",
    );
  }
  return match[1];
}
