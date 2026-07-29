import { withAgent } from "@/lib/agent-api/handler";
import {
  listTasks,
  parseTaskListFilters,
} from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";

export async function GET(request: Request): Promise<Response> {
  return withAgent(request, "board:read", async (_context, requestId) => (
    successResponse(
      await listTasks(parseTaskListFilters(request)),
      requestId,
    )
  ));
}
