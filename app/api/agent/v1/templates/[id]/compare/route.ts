import { AgentApiError } from "@/lib/agent-api/errors";
import { withAgent } from "@/lib/agent-api/handler";
import {
  assertNoQueryParameters,
  getTemplateCompareSource,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import { successResponse } from "@/lib/agent-api/responses";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAgent(request, "board:read", async (_context, requestId) => {
    const { id: rawId } = await params;
    const id = parseResourceId(rawId, "id");
    assertNoQueryParameters(request);
    const includeArchived = new URL(request.url).searchParams.get("archived") === "true";
    const source = await getTemplateCompareSource(id, includeArchived);
    if (!source.template) {
      throw new AgentApiError(
        404,
        "TEMPLATE_NOT_FOUND",
        "Template not found.",
      );
    }
    return successResponse(source, requestId);
  });
}
