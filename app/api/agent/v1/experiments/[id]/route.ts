import { AgentApiError } from "@/lib/agent-api/errors";
import { withAgent } from "@/lib/agent-api/handler";
import {
  getExperiment,
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
    const experiment = await getExperiment(id);
    if (!experiment) {
      throw new AgentApiError(
        404,
        "EXPERIMENT_NOT_FOUND",
        "Experiment not found.",
      );
    }
    return successResponse(experiment, requestId, {
      headers: { ETag: etagFor(experiment.updated_at) },
    });
  });
}
