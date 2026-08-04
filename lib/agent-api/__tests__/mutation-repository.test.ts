import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentContext } from "@/lib/agent-api/types";
import {
  createMutationRepository,
  requestHash,
} from "@/lib/agent-api/mutation-repository";

const API_KEY_ID = "40000000-0000-4000-8000-000000000001";
const MEMBER_ID = "20000000-0000-4000-8000-000000000001";
const MODULE_ID = "10000000-0000-4000-8000-000000000001";
const TASK_ID = "30000000-0000-4000-8000-000000000001";
const EXPERIMENT_ID = "60000000-0000-4000-8000-000000000001";
const BASELINE_ID = "60000000-0000-4000-8000-000000000002";
const IDEMPOTENCY_KEY = "70000000-0000-4000-8000-000000000001";
const REQUEST_ID = "req_mutation";
const UPDATED_AT = "2026-07-29T12:00:00.000Z";
const REQUEST_HASH = "a".repeat(64);

const context: AgentContext = {
  apiKeyId: API_KEY_ID,
  keyPrefix: "tb_live_AAECAwQF",
  memberId: MEMBER_ID,
  memberName: "Bruce",
  scopes: new Set(["tasks:write", "experiments:write"]),
  expiresAt: null,
};

function taskRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: TASK_ID,
    module_id: MODULE_ID,
    title: "Tune matmul",
    status: "blocked",
    assignees: ["Legacy Bruce"],
    notes: "Profile the fused path.",
    tags: ["NPU", "Verifier"],
    priority: "urgent",
    due_date: "2026-08-15",
    position: 2,
    created_at: "2026-07-28T10:00:00.000Z",
    updated_at: UPDATED_AT,
    internal_task_secret: "never-return",
    ...overrides,
  };
}


function rpcClient() {
  const rpc = vi.fn();
  return {
    rpc,
    repository: createMutationRepository(
      { rpc } as unknown as SupabaseClient,
    ),
  };
}

describe("canonical Agent API request hashing", () => {
  it("recursively sorts object keys without changing array order", () => {
    const first = {
      z: 3,
      nested: { beta: 2, alpha: 1 },
      list: [{ y: 2, x: 1 }, "second"],
    };
    const reordered = {
      list: [{ x: 1, y: 2 }, "second"],
      nested: { alpha: 1, beta: 2 },
      z: 3,
    };
    const arrayReordered = {
      list: ["second", { x: 1, y: 2 }],
      nested: { alpha: 1, beta: 2 },
      z: 3,
    };

    expect(requestHash("POST", "/api/agent/v1/tasks/1/experiments", first))
      .toBe(requestHash(
        "POST",
        "/api/agent/v1/tasks/1/experiments",
        reordered,
      ));
    expect(requestHash("POST", "/api/agent/v1/tasks/1/experiments", first))
      .not.toBe(requestHash(
        "POST",
        "/api/agent/v1/tasks/1/experiments",
        arrayReordered,
      ));
  });

  it("separates method and path in the hashed request tuple", () => {
    const body = { name: "Agent experiment" };
    const expected = createHash("sha256")
      .update(JSON.stringify([
        "POST",
        "/api/agent/v1/tasks/1/experiments",
        body,
      ]))
      .digest("hex");

    expect(requestHash(
      "POST",
      "/api/agent/v1/tasks/1/experiments",
      body,
    )).toBe(expected);
    expect(requestHash("POST", "/different", body)).not.toBe(expected);
    expect(requestHash(
      "PATCH",
      "/api/agent/v1/tasks/1/experiments",
      body,
    )).not.toBe(expected);
  });
});

describe("Agent API mutation RPC repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls Task PATCH with exact RPC arguments and projects a safe DTO", async () => {
    const { rpc, repository } = rpcClient();
    rpc.mockResolvedValue({
      data: { data: taskRow(), idempotency_replayed: false },
      error: null,
    });

    const result = await repository.patchTask({
      context,
      taskId: TASK_ID,
      expectedUpdatedAt: UPDATED_AT,
      changes: { status: "blocked" },
      requestId: REQUEST_ID,
    });

    expect(rpc).toHaveBeenCalledWith("agent_api_patch_task", {
      p_api_key_id: API_KEY_ID,
      p_member_id: MEMBER_ID,
      p_task_id: TASK_ID,
      p_expected_updated_at: UPDATED_AT,
      p_changes: { status: "blocked" },
      p_request_id: REQUEST_ID,
    });
    expect(result).toEqual({
      data: {
        id: TASK_ID,
        module_id: MODULE_ID,
        title: "Tune matmul",
        status: "blocked",
        notes: "Profile the fused path.",
        tags: ["NPU", "Verifier"],
        priority: "urgent",
        due_date: "2026-08-15",
        position: 2,
        created_at: "2026-07-28T10:00:00.000Z",
        updated_at: UPDATED_AT,
      },
      idempotencyReplayed: false,
    });
    expect(JSON.stringify(result)).not.toContain("assignees");
    expect(JSON.stringify(result)).not.toContain("internal_task_secret");
  });

  it("accepts an untyped Task mutation response", async () => {
    const { rpc, repository } = rpcClient();
    rpc.mockResolvedValue({
      data: {
        data: taskRow({ module_id: null, due_date: null }),
        idempotency_replayed: false,
      },
      error: null,
    });

    const result = await repository.patchTask({
      context,
      taskId: TASK_ID,
      expectedUpdatedAt: UPDATED_AT,
      changes: { notes: "Keep this Task untyped." },
      requestId: REQUEST_ID,
    });

    expect(result.data.module_id).toBeNull();
    expect(result.data.due_date).toBeNull();
  });

});
