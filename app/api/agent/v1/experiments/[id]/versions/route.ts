import { withAgent } from "@/lib/agent-api/handler";
import { listExperimentVersions } from "@/lib/experiments/values";
import { requireTaskCollaboration } from "@/lib/agent-api/permissions";
import {
  assertNoQueryParameters,
  getExperiment,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";
import { AgentApiError } from "@/lib/agent-api/errors";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAgent(request, "board:read", async (context, requestId) => {
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
      await listExperimentVersions(experimentId),
      requestId,
    );
  });
}
