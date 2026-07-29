import { AgentApiError } from "@/lib/agent-api/errors";
import { withAgent } from "@/lib/agent-api/handler";
import { patchTask } from "@/lib/agent-api/mutation-repository";
import { requireTaskCollaboration } from "@/lib/agent-api/permissions";
import {
  assertNoQueryParameters,
  getTask,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import {
  etagFor,
  parseIfMatch,
  successResponse,
} from "@/lib/agent-api/responses";
import {
  parseTaskPatch,
  readJsonObject,
} from "@/lib/agent-api/schemas";

export const runtime = "nodejs";

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAgent(request, "tasks:write", async (context, requestId) => {
    const { id: rawId } = await params;
    const taskId = parseResourceId(rawId, "id");
    assertNoQueryParameters(request);
    await requireTaskCollaboration(context, taskId);
    const expectedUpdatedAt = parseIfMatch(request);
    const changes = parseTaskPatch(await readJsonObject(request));
    const result = await patchTask({
      context,
      taskId,
      expectedUpdatedAt,
      changes,
      requestId,
    });
    return successResponse(result.data, requestId, {
      headers: { ETag: etagFor(result.data.updated_at) },
    });
  });
}
