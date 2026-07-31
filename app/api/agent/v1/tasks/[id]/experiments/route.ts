import { withAgent } from "@/lib/agent-api/handler";
import { AgentApiError } from "@/lib/agent-api/errors";
import { parseCanonicalIdempotencyKey } from "@/lib/agent-api/headers";
import {
  createExperiment,
  createTemplateExperiment,
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
      const body = await readJsonObject(request);
      const record = body as Record<string, unknown>;
      if (typeof record.template_id === "string") {
        const name = typeof record.name === "string" ? record.name : "";
        if (!name.trim()) {
          throw new AgentApiError(
            422,
            "INVALID_FIELD",
            "name has an invalid value.",
            false,
            { field: "name" },
          );
        }
        const created = await createTemplateExperiment({
          task_id: taskId,
          template_id: record.template_id,
          name,
          owner_id: typeof record.owner_id === "string" ? record.owner_id : null,
          values:
            record.values && typeof record.values === "object"
              ? record.values as Record<string, unknown>
              : undefined,
        });
        return successResponse(created, requestId, { status: 201 });
      }
      const input = parseExperimentCreate(body);
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
