import { randomUUID } from "node:crypto";
import {
  createSupabaseManagedKeyStore,
  rotateManagedKey,
} from "@/lib/agent-api/admin-keys";
import { authenticateAdmin } from "@/lib/agent-api/auth";
import {
  errorResponse,
  successResponse,
} from "@/lib/agent-api/responses";
import { getServerSupabase } from "@/lib/agent-api/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = `req_${randomUUID()}`;
  try {
    await authenticateAdmin(request);
    const { id } = await params;
    const store = createSupabaseManagedKeyStore(getServerSupabase());
    return successResponse(await rotateManagedKey(store, id), requestId);
  } catch (reason) {
    return errorResponse(reason, requestId);
  }
}
