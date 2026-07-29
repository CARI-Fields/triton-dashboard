import { randomUUID } from "node:crypto";
import {
  createManagedKey,
  createSupabaseManagedKeyStore,
  listManagedKeys,
  type ManagedKeyInput,
} from "@/lib/agent-api/admin-keys";
import { authenticateAdmin } from "@/lib/agent-api/auth";
import {
  errorResponse,
  successResponse,
} from "@/lib/agent-api/responses";
import { readJsonObject } from "@/lib/agent-api/schemas";
import { getServerSupabase } from "@/lib/agent-api/server";

export async function GET(request: Request): Promise<Response> {
  const requestId = `req_${randomUUID()}`;
  try {
    await authenticateAdmin(request);
    const store = createSupabaseManagedKeyStore(getServerSupabase());
    return successResponse(await listManagedKeys(store), requestId);
  } catch (reason) {
    return errorResponse(reason, requestId);
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = `req_${randomUUID()}`;
  try {
    const admin = await authenticateAdmin(request);
    const input = await readJsonObject(request) as unknown as ManagedKeyInput;
    const store = createSupabaseManagedKeyStore(getServerSupabase());
    return successResponse(
      await createManagedKey(store, admin, input),
      requestId,
      { status: 201 },
    );
  } catch (reason) {
    return errorResponse(reason, requestId);
  }
}
