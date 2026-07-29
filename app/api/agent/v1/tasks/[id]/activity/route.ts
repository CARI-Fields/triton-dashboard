import { AgentApiError } from "@/lib/agent-api/errors";
import { withAgent } from "@/lib/agent-api/handler";
import { parseCanonicalIdempotencyKey } from "@/lib/agent-api/headers";
import {
  createActivity,
  requestHash,
} from "@/lib/agent-api/mutation-repository";
import { requireTaskCollaboration } from "@/lib/agent-api/permissions";
import {
  assertNoQueryParameters,
  getTask,
  listTaskActivity,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";
import {
  parseActivityCreate,
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
    assertNoQueryParameters(request);
    if (!await getTask(id)) {
      throw new AgentApiError(404, "TASK_NOT_FOUND", "Task not found.");
    }
    return successResponse(
      await listTaskActivity(id, {}),
      requestId,
    );
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAgent(request, "activity:append", async (context, requestId) => {
    const { id: rawId } = await params;
    const taskId = parseResourceId(rawId, "id");
    assertNoQueryParameters(request);
    await requireTaskCollaboration(context, taskId);
    const idempotencyKey = parseCanonicalIdempotencyKey(request);
    const input = parseActivityCreate(await readJsonObject(request));
    const result = await createActivity({
      context,
      taskId,
      text: input.text,
      idempotencyKey,
      requestHash: requestHash(
        "POST",
        new URL(request.url).pathname,
        input,
      ),
      requestId,
    });
    return successResponse(result.data, requestId, {
      status: result.idempotencyReplayed ? 200 : 201,
      meta: {
        idempotency_replayed: result.idempotencyReplayed,
      },
    });
  });
}
