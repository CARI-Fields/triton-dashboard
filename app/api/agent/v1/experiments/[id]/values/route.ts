import { AgentApiError } from "@/lib/agent-api/errors";
import { withAgent } from "@/lib/agent-api/handler";
import {
  patchExperimentValue,
} from "@/lib/agent-api/mutation-repository";
import { requireTaskCollaboration } from "@/lib/agent-api/permissions";
import {
  assertNoQueryParameters,
  getExperiment,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";
import {
  parseValuePatch,
  readJsonObject,
} from "@/lib/agent-api/schemas";

export const runtime = "nodejs";

export async function PATCH(
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
      if (!current.template_id) {
        throw new AgentApiError(
          422,
          "TEMPLATE_REQUIRED",
          "Value patches require a Template Experiment.",
        );
      }
      await requireTaskCollaboration(context, current.task_id);
      const patch = parseValuePatch(await readJsonObject(request));
      const result = await patchExperimentValue({
        experimentId,
        keyId: patch.key_id,
        expectedCellRevision: patch.expected_cell_revision,
        value: patch.value,
        editSessionId: "00000000-0000-4000-8000-000000000001",
      });
      if (result.status === "conflict") {
        throw new AgentApiError(
          409,
          "CELL_REVISION_CONFLICT",
          "The cell changed since it was read.",
          false,
          { remote: result.remote, remote_cell_revision: result.remote_cell_revision },
        );
      }
      return successResponse(result, requestId);
    },
  );
}
