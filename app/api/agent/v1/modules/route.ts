import { withAgent } from "@/lib/agent-api/handler";
import {
  assertNoQueryParameters,
  listModules,
} from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";

export async function GET(request: Request): Promise<Response> {
  return withAgent(request, "board:read", async (_context, requestId) => {
    assertNoQueryParameters(request);
    return successResponse(await listModules(), requestId);
  });
}
