// archive/route.ts
import { AgentApiError } from "@/lib/agent-api/errors";
import { withAgent } from "@/lib/agent-api/handler";
import { unarchiveExperiment } from "@/lib/agent-api/mutation-repository";
import { requireTaskCollaboration } from "@/lib/agent-api/permissions";
import {
  assertNoQueryParameters,
  getExperiment,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";

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
      const experimentId = parseResourceId(rawId, "id");
      assertNoQueryParameters(request);
      const current = await getExperiment(experimentId);
      if (!current) {
        throw new AgentApiError(
          404,
          "EXPERIMENT_NOT_FOUND",
          "Experiment not found.",
        );
      }
      await requireTaskCollaboration(context, current.task_id);
      return successResponse(
        await unarchiveExperiment(experimentId),
        requestId,
      );
    },
  );
}
