import { AgentApiError } from "@/lib/agent-api/errors";
import { withAgent } from "@/lib/agent-api/handler";
import {
  getTask,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import {
  etagFor,
  successResponse,
} from "@/lib/agent-api/responses";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAgent(request, "board:read", async (_context, requestId) => {
    const { id: rawId } = await params;
    const id = parseResourceId(rawId, "id");
    const task = await getTask(id);
    if (!task) {
      throw new AgentApiError(404, "TASK_NOT_FOUND", "Task not found.");
    }
    return successResponse(task, requestId, {
      headers: { ETag: etagFor(task.updated_at) },
    });
  });
}
