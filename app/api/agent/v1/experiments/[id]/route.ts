import { AgentApiError } from "@/lib/agent-api/errors";
import { withAgent } from "@/lib/agent-api/handler";
import { patchExperiment } from "@/lib/agent-api/mutation-repository";
import { requireTaskCollaboration } from "@/lib/agent-api/permissions";
import {
  assertNoQueryParameters,
  getExperiment,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import {
  etagFor,
  parseIfMatch,
  successResponse,
} from "@/lib/agent-api/responses";
import {
  parseExperimentPatch,
  readJsonObject,
} from "@/lib/agent-api/schemas";
import {
  validateBaseline,
  validateForStatus,
  type ValidationIssue,
} from "@/lib/experiments/policy";

export const runtime = "nodejs";

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

function workflowInvalid(issues: ValidationIssue[]): never {
  throw new AgentApiError(
    422,
    "WORKFLOW_INVALID",
    "Experiment workflow validation failed.",
    false,
    { issues },
  );
}

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
      await requireTaskCollaboration(context, current.task_id);
      const expectedUpdatedAt = parseIfMatch(request);
      const changes = parseExperimentPatch(await readJsonObject(request));
      const candidate = {
        ...current,
        ...structuredClone(changes),
      };
      const issues: ValidationIssue[] = [];

      if (changes.status !== undefined && changes.status !== current.status) {
        issues.push(...validateForStatus(
          { ...candidate, status: current.status },
          changes.status,
        ));
      }

      const baselineId = changes.baseline_experiment_id;
      if (
        Object.hasOwn(changes, "baseline_experiment_id")
        && typeof baselineId === "string"
        && baselineId !== current.baseline_experiment_id
      ) {
        const selfIssues = validateBaseline(experimentId, baselineId);
        if (selfIssues.length > 0) {
          issues.push(...selfIssues);
        } else {
          const baseline = await getExperiment(baselineId);
          if (!baseline) {
            issues.push({
              field: "baseline_experiment_id",
              message: "Baseline Experiment was not found.",
            });
          } else if (baseline.task_id !== current.task_id) {
            issues.push({
              field: "baseline_experiment_id",
              message: "Baseline must belong to the same Task.",
            });
          }
        }
      }

      if (issues.length > 0) workflowInvalid(issues);

      const result = await patchExperiment({
        context,
        experimentId,
        expectedUpdatedAt,
        changes,
        requestId,
      });
      return successResponse(result.data, requestId, {
        headers: { ETag: etagFor(result.data.updated_at) },
      });
    },
  );
}
