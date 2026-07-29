import { withAgent } from "@/lib/agent-api/handler";
import {
  listExperiments,
  parseExperimentListFilters,
} from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";

export async function GET(request: Request): Promise<Response> {
  return withAgent(request, "board:read", async (_context, requestId) => (
    successResponse(
      await listExperiments(parseExperimentListFilters(request)),
      requestId,
    )
  ));
}
