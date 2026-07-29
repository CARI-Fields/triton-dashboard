import { randomUUID } from "node:crypto";
import { authenticateAgent } from "@/lib/agent-api/auth";
import { requireScope } from "@/lib/agent-api/permissions";
import { errorResponse } from "@/lib/agent-api/responses";
import type {
  AgentContext,
  ApiScope,
} from "@/lib/agent-api/types";

export async function withAuthenticatedAgent(
  request: Request,
  handler: (
    context: AgentContext,
    requestId: string,
  ) => Promise<Response>,
): Promise<Response> {
  const requestId = `req_${randomUUID()}`;
  try {
    const context = await authenticateAgent(request);
    return await handler(context, requestId);
  } catch (reason) {
    return errorResponse(reason, requestId);
  }
}

export async function withAgent(
  request: Request,
  scope: ApiScope,
  handler: (
    context: AgentContext,
    requestId: string,
  ) => Promise<Response>,
): Promise<Response> {
  return withAuthenticatedAgent(request, async (context, requestId) => {
    requireScope(context, scope);
    return handler(context, requestId);
  });
}
