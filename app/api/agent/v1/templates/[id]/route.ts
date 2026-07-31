import { AgentApiError } from "@/lib/agent-api/errors";
import { withAgent } from "@/lib/agent-api/handler";
import {
  assertNoQueryParameters,
  getTemplateSchema,
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
    const schema = await getTemplateSchema(id);
    if (!schema) {
      throw new AgentApiError(
        404,
        "TEMPLATE_NOT_FOUND",
        "Template not found.",
      );
    }
    return successResponse(schema, requestId);
  });
}
