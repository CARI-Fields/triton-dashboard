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

function taskRow(): Record<string, unknown> {
  return {
    id: TASK_ID,
    module_id: MODULE_ID,
    title: "Tune matmul",
    status: "blocked",
    assignees: ["Legacy Bruce"],
    notes: "Profile the fused path.",
    position: 2,
    created_at: "2026-07-28T10:00:00.000Z",
    updated_at: UPDATED_AT,
    internal_task_secret: "never-return",
  };
}

function experimentRow(): Record<string, unknown> {
  return {
    id: EXPERIMENT_ID,
    experiment_no: 7,
    task_id: TASK_ID,
    owner_id: MEMBER_ID,
    name: "Agent experiment",
    status: "planned",
    baseline_experiment_id: BASELINE_ID,
    data_spec: {
      datasets: [{
        role: "evaluation",
        name: "kernelbench",
        split: "test",
        revision: "v1",
        task_count: 250,
        samples_per_task: 1,
        internal_dataset_secret: "never-return",
      }],
      internal_data_secret: "never-return",
    },
    object_spec: {
      model: "Qwen",
      harness: "kernelbench",
      parent_harness: "",
      prompt: "Optimize",
      prompt_change: "",
      skills: ["triton"],
      tools: ["profiler"],
      internal_object_secret: "never-return",
    },
    environment_spec: {
      platform: "npu",
      server: "atlas",
      devices: ["npu:0"],
      hardware: "910B",
      evaluator: "pytest",
      revision: "v1",
      precision_policy: "fp32",
      internal_environment_secret: "never-return",
    },
    config: { block: 128 },
    notes: "Try a larger block.",
    metrics: { latency_ms: 1.25 },
    featured_metric_keys: ["latency_ms"],
    result_summary: "",
    decision_outcome: null,
    decision_notes: "",
    position: 1,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-28T10:00:00.000Z",
    updated_at: UPDATED_AT,
    request_hash: "never-return",
    idempotency_key: "never-return",
    before_state: { secret: true },
    arbitrary_rpc_extra: "never-return",
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
        position: 2,
        created_at: "2026-07-28T10:00:00.000Z",
        updated_at: UPDATED_AT,
      },
      idempotencyReplayed: false,
    });
    expect(JSON.stringify(result)).not.toContain("assignees");
    expect(JSON.stringify(result)).not.toContain("internal_task_secret");
  });

  it("calls Experiment create with exact RPC arguments and forwards replay state", async () => {
    const { rpc, repository } = rpcClient();
    rpc.mockResolvedValue({
      data: { data: experimentRow(), idempotency_replayed: true },
      error: null,
    });

    const result = await repository.createExperiment({
      context,
      taskId: TASK_ID,
      name: "Agent experiment",
      idempotencyKey: IDEMPOTENCY_KEY,
      requestHash: REQUEST_HASH,
      requestId: REQUEST_ID,
    });

    expect(rpc).toHaveBeenCalledWith("agent_api_create_experiment", {
      p_api_key_id: API_KEY_ID,
      p_member_id: MEMBER_ID,
      p_task_id: TASK_ID,
      p_name: "Agent experiment",
      p_idempotency_key: IDEMPOTENCY_KEY,
      p_request_hash: REQUEST_HASH,
      p_request_id: REQUEST_ID,
    });
    expect(result.idempotencyReplayed).toBe(true);
    expect(result.data).toEqual({
      id: EXPERIMENT_ID,
      experiment_no: 7,
      task_id: TASK_ID,
      owner_id: MEMBER_ID,
      name: "Agent experiment",
      status: "planned",
      baseline_experiment_id: BASELINE_ID,
      data_spec: {
        datasets: [{
          role: "evaluation",
          name: "kernelbench",
          split: "test",
          revision: "v1",
          task_count: 250,
          samples_per_task: 1,
        }],
      },
      object_spec: {
        model: "Qwen",
        harness: "kernelbench",
        parent_harness: "",
        prompt: "Optimize",
        prompt_change: "",
        skills: ["triton"],
        tools: ["profiler"],
      },
      environment_spec: {
        platform: "npu",
        server: "atlas",
        devices: ["npu:0"],
        hardware: "910B",
        evaluator: "pytest",
        revision: "v1",
        precision_policy: "fp32",
      },
      config: { block: 128 },
      notes: "Try a larger block.",
      metrics: { latency_ms: 1.25 },
      featured_metric_keys: ["latency_ms"],
      result_summary: "",
      decision_outcome: null,
      decision_notes: "",
      position: 1,
      started_at: null,
      completed_at: null,
      created_at: "2026-07-28T10:00:00.000Z",
      updated_at: UPDATED_AT,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("internal_");
    expect(serialized).not.toContain("request_hash");
    expect(serialized).not.toContain("idempotency_key");
    expect(serialized).not.toContain("before_state");
    expect(serialized).not.toContain("arbitrary_rpc_extra");
  });

  it("calls Experiment PATCH with exact RPC arguments", async () => {
    const { rpc, repository } = rpcClient();
    rpc.mockResolvedValue({
      data: { data: experimentRow(), idempotency_replayed: false },
      error: null,
    });

    await repository.patchExperiment({
      context,
      experimentId: EXPERIMENT_ID,
      expectedUpdatedAt: UPDATED_AT,
      changes: { notes: "Updated" },
      requestId: REQUEST_ID,
    });

    expect(rpc).toHaveBeenCalledWith("agent_api_patch_experiment", {
      p_api_key_id: API_KEY_ID,
      p_member_id: MEMBER_ID,
      p_experiment_id: EXPERIMENT_ID,
      p_expected_updated_at: UPDATED_AT,
      p_changes: { notes: "Updated" },
      p_request_id: REQUEST_ID,
    });
  });

  it("normalizes real database Experiment defaults into a PATCH-compatible DTO", async () => {
    const { rpc, repository } = rpcClient();
    rpc.mockResolvedValue({
      data: {
        data: {
          ...experimentRow(),
          baseline_experiment_id: null,
          data_spec: {},
          object_spec: {},
          environment_spec: {},
          config: null,
          metrics: null,
          featured_metric_keys: null,
        },
        idempotency_replayed: false,
      },
      error: null,
    });

    const result = await repository.createExperiment({
      context,
      taskId: TASK_ID,
      name: "Agent experiment",
      idempotencyKey: IDEMPOTENCY_KEY,
      requestHash: REQUEST_HASH,
      requestId: REQUEST_ID,
    });

    expect(result.data).toMatchObject({
      data_spec: { datasets: [] },
      object_spec: {
        model: "",
        harness: "",
        parent_harness: "",
        prompt: "",
        prompt_change: "",
        skills: [],
        tools: [],
      },
      environment_spec: {
        platform: "",
        server: "",
        devices: [],
        hardware: "",
        evaluator: "",
        revision: "",
        precision_policy: "",
      },
      config: {},
      metrics: {},
      featured_metric_keys: [],
    });
  });

  it.each([
    ["VERSION_CONFLICT", 412, "VERSION_CONFLICT", false],
    ["TASK_SCOPE_FORBIDDEN", 403, "TASK_SCOPE_FORBIDDEN", false],
    ["WRITE_RATE_LIMITED", 429, "WRITE_RATE_LIMITED", true],
    ["IDEMPOTENCY_KEY_REUSED", 409, "IDEMPOTENCY_KEY_REUSED", false],
    ["IDEMPOTENCY_INPUT_REQUIRED", 400, "IDEMPOTENCY_INPUT_REQUIRED", false],
    ["INVALID_EXPERIMENT_NAME", 422, "INVALID_EXPERIMENT_NAME", false],
  ])(
    "maps SQL domain error %s",
    async (message, status, code, retryable) => {
      const { rpc, repository } = rpcClient();
      rpc.mockResolvedValue({
        data: null,
        error: {
          message,
          code: "P0001",
          details: `SUPABASE_SECRET_KEY=sb_secret_${message}`,
          hint: "internal",
        },
      });

      await expect(repository.patchTask({
        context,
        taskId: TASK_ID,
        expectedUpdatedAt: UPDATED_AT,
        changes: { notes: "No write" },
        requestId: REQUEST_ID,
      })).rejects.toMatchObject({ status, code, retryable });
    },
  );

  it("does not treat a near-match database message as a public domain error", async () => {
    const { rpc, repository } = rpcClient();
    rpc.mockResolvedValue({
      data: null,
      error: {
        message: "VERSION_CONFLICT: leaked database detail",
        code: "P0001",
      },
    });

    await expect(repository.patchTask({
      context,
      taskId: TASK_ID,
      expectedUpdatedAt: UPDATED_AT,
      changes: { notes: "No write" },
      requestId: REQUEST_ID,
    })).rejects.toEqual(new Error("Agent API mutation RPC failed."));
  });

  it.each([
    null,
    {},
    [],
    { data: null, idempotency_replayed: false },
    { data: taskRow(), idempotency_replayed: "false" },
    {
      data: { ...taskRow(), updated_at: null },
      idempotency_replayed: false,
    },
  ])("rejects malformed Task RPC response %#", async (rpcData) => {
    const { rpc, repository } = rpcClient();
    rpc.mockResolvedValue({ data: rpcData, error: null });

    await expect(repository.patchTask({
      context,
      taskId: TASK_ID,
      expectedUpdatedAt: UPDATED_AT,
      changes: { notes: "No write" },
      requestId: REQUEST_ID,
    })).rejects.toEqual(new Error("Agent API mutation RPC returned invalid data."));
  });

  it.each([
    null,
    {},
    [],
    { data: null, idempotency_replayed: false },
    { data: experimentRow(), idempotency_replayed: null },
    {
      data: { ...experimentRow(), owner_id: 123 },
      idempotency_replayed: false,
    },
  ])("rejects malformed Experiment RPC response %#", async (rpcData) => {
    const { rpc, repository } = rpcClient();
    rpc.mockResolvedValue({ data: rpcData, error: null });

    await expect(repository.patchExperiment({
      context,
      experimentId: EXPERIMENT_ID,
      expectedUpdatedAt: UPDATED_AT,
      changes: { notes: "No write" },
      requestId: REQUEST_ID,
    })).rejects.toEqual(new Error("Agent API mutation RPC returned invalid data."));
  });
});
