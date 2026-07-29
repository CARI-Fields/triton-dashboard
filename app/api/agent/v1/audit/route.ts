import { withAgent } from "@/lib/agent-api/handler";
import {
  assertNoQueryParameters,
  listAudit,
} from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";

export async function GET(request: Request): Promise<Response> {
  return withAgent(request, "audit:read", async (context, requestId) => {
    assertNoQueryParameters(request);
    return successResponse(await listAudit(context, {}), requestId);
  });
}
