import { withAgent } from "@/lib/agent-api/handler";
import { patchAttachment } from "@/lib/agent-api/mutation-repository";
import { requireAttachmentCollaboration } from "@/lib/agent-api/permissions";
import {
  assertNoQueryParameters,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import {
  etagFor,
  parseIfMatch,
  successResponse,
} from "@/lib/agent-api/responses";
import {
  parseAttachmentPatch,
  readJsonObject,
} from "@/lib/agent-api/schemas";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAgent(
    request,
    "attachments:write",
    async (context, requestId) => {
      const { id: rawId } = await params;
      const attachmentId = parseResourceId(rawId, "id");
      assertNoQueryParameters(request);
      await requireAttachmentCollaboration(context, attachmentId);
      const expectedUpdatedAt = parseIfMatch(request);
      const changes = parseAttachmentPatch(await readJsonObject(request));
      const result = await patchAttachment({
        context,
        attachmentId,
        expectedUpdatedAt,
        caption: changes.caption,
        requestId,
      });
      return successResponse(result.data, requestId, {
        headers: { ETag: etagFor(result.data.updated_at) },
      });
    },
  );
}
