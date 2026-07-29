import { withAuthenticatedAgent } from "@/lib/agent-api/handler";
import {
  assertNoQueryParameters,
  getCapabilities,
} from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";

export async function GET(request: Request): Promise<Response> {
  return withAuthenticatedAgent(request, async (context, requestId) => {
    assertNoQueryParameters(request);
    return successResponse(getCapabilities(context), requestId);
  });
}
