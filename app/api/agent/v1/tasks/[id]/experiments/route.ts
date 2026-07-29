import { AgentApiError } from "@/lib/agent-api/errors";
import { withAgent } from "@/lib/agent-api/handler";
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const runtime = "nodejs";

function parseIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key");
  if (!value || !UUID_PATTERN.test(value)) {
    throw new AgentApiError(
      400,
      "MISSING_IDEMPOTENCY_KEY",
      "POST requires one canonical UUID Idempotency-Key header.",
    );
  }
  return value;
}

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
      const idempotencyKey = parseIdempotencyKey(request);
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
