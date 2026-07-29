import { createHash, randomUUID } from "node:crypto";
import { AgentApiError } from "@/lib/agent-api/errors";
import { withAgent } from "@/lib/agent-api/handler";
import { parseCanonicalIdempotencyKey } from "@/lib/agent-api/headers";
import {
  attachmentRequestHash,
  createAttachment,
  MutationRpcRejectedError,
  type MutationResult,
  type AttachmentMutationDto,
} from "@/lib/agent-api/mutation-repository";
import { requireExperimentCollaboration } from "@/lib/agent-api/permissions";
import {
  assertNoQueryParameters,
  parseResourceId,
} from "@/lib/agent-api/read-repository";
import {
  etagFor,
  successResponse,
} from "@/lib/agent-api/responses";
import { parseAttachmentFormData } from "@/lib/agent-api/schemas";
import { getServerSupabase } from "@/lib/agent-api/server";

export const runtime = "nodejs";

async function bestEffortRemove(
  path: string,
  protectedPath?: string,
): Promise<void> {
  if (path === protectedPath) return;
  try {
    await getServerSupabase().storage.from("task-images").remove([path]);
  } catch {
    // Cleanup cannot change the public mutation result.
  }
}

async function callAttachmentRpc(
  input: Parameters<typeof createAttachment>[0],
  uploadedPath: string,
): Promise<MutationResult<AttachmentMutationDto>> {
  try {
    return await createAttachment(input);
  } catch (reason) {
    if (
      reason instanceof AgentApiError
      || reason instanceof MutationRpcRejectedError
    ) {
      await bestEffortRemove(uploadedPath);
      throw reason;
    }
  }

  try {
    return await createAttachment(input);
  } catch {
    throw new Error("Agent API attachment mutation could not be confirmed.");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAgent(
    request,
    "attachments:write",
    async (context, requestId) => {
      const { id: rawId } = await params;
      const experimentId = parseResourceId(rawId, "id");
      assertNoQueryParameters(request);
      const taskId = await requireExperimentCollaboration(
        context,
        experimentId,
      );
      const idempotencyKey = parseCanonicalIdempotencyKey(request);

      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        throw new AgentApiError(
          400,
          "INVALID_MULTIPART",
          "Request body is not valid multipart form data.",
        );
      }
      const input = parseAttachmentFormData(form);
      const bytes = await input.file.arrayBuffer();
      const fileDigest = createHash("sha256")
        .update(Buffer.from(bytes))
        .digest("hex");
      const path =
        `${taskId}/${experimentId}/${randomUUID()}.${input.extension}`;
      const storage = getServerSupabase().storage.from("task-images");
      const upload = await storage.upload(path, bytes, {
        contentType: input.mime,
        upsert: false,
      });
      if (upload.error) {
        throw new Error("Attachment upload failed.");
      }

      const publicUrlResult = storage.getPublicUrl(path);
      const publicUrl = publicUrlResult.data?.publicUrl;
      if (typeof publicUrl !== "string" || publicUrl.length === 0) {
        await bestEffortRemove(path);
        throw new Error("Attachment public URL generation failed.");
      }

      const result = await callAttachmentRpc({
        context,
        experimentId,
        path,
        url: publicUrl,
        caption: input.caption,
        idempotencyKey,
        requestHash: attachmentRequestHash(
          "POST",
          new URL(request.url).pathname,
          {
            caption: input.caption,
            mime: input.mime,
            fileDigest,
          },
        ),
        requestId,
      }, path);
      if (result.idempotencyReplayed) {
        await bestEffortRemove(path, result.data.path);
      }

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
