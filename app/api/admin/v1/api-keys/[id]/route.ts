import { randomUUID } from "node:crypto";
import {
  createSupabaseManagedKeyStore,
  deleteManagedKey,
  patchManagedKey,
  type ManagedKeyPatch,
} from "@/lib/agent-api/admin-keys";
import { authenticateAdmin } from "@/lib/agent-api/auth";
import {
  errorResponse,
  successResponse,
} from "@/lib/agent-api/responses";
import { readJsonObject } from "@/lib/agent-api/schemas";
import { getServerSupabase } from "@/lib/agent-api/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = `req_${randomUUID()}`;
  try {
    await authenticateAdmin(request);
    const { id } = await params;
    const changes = await readJsonObject(request) as unknown as ManagedKeyPatch;
    const store = createSupabaseManagedKeyStore(getServerSupabase());
    return successResponse(
      await patchManagedKey(store, id, changes),
      requestId,
    );
  } catch (reason) {
    return errorResponse(reason, requestId);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = `req_${randomUUID()}`;
  try {
    await authenticateAdmin(request);
    const { id } = await params;
    const store = createSupabaseManagedKeyStore(getServerSupabase());
    return successResponse(await deleteManagedKey(store, id), requestId);
  } catch (reason) {
    return errorResponse(reason, requestId);
  }
}
