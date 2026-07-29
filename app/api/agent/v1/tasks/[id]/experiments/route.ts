import { withAgent } from "@/lib/agent-api/handler";
import { parseCanonicalIdempotencyKey } from "@/lib/agent-api/headers";
import {
  createExperiment,
  requestHash,
} from "@/lib/agent-api/mutation-repository";
import { requireTaskCollaboration } from "@/lib/agent-api/permissions";
import {
  assertNoQueryParameters,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import {
  etagFor,
  successResponse,
} from "@/lib/agent-api/responses";
import {
  parseExperimentCreate,
  readJsonObject,
} from "@/lib/agent-api/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAgent(
    request,
    "experiments:write",
    async (context, requestId) => {
      const { id: rawId } = await params;
      const taskId = parseResourceId(rawId, "id");
      assertNoQueryParameters(request);
      await requireTaskCollaboration(context, taskId);
      const idempotencyKey = parseCanonicalIdempotencyKey(request);
      const input = parseExperimentCreate(await readJsonObject(request));
      const result = await createExperiment({
        context,
        taskId,
        name: input.name,
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
        headers: { ETag: etagFor(result.data.updated_at) },
        meta: {
          idempotency_replayed: result.idempotencyReplayed,
        },
      });
    },
  );
}
