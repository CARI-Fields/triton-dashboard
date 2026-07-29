import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { AgentApiError } from "@/lib/agent-api/errors";
import {
  createReadRepository,
  decodeUpdatedCursor,
  encodeUpdatedCursor,
  parseExperimentListFilters,
  parseTaskListFilters,
} from "@/lib/agent-api/read-repository";
import { parseExperimentPatch } from "@/lib/agent-api/schemas";
import type { AgentContext } from "@/lib/agent-api/types";

const TASK_ID = "30000000-0000-4000-8000-000000000001";
const OTHER_TASK_ID = "30000000-0000-4000-8000-000000000002";
const MODULE_ID = "10000000-0000-4000-8000-000000000001";
const MEMBER_ID = "20000000-0000-4000-8000-000000000001";
const EXPERIMENT_ID = "60000000-0000-4000-8000-000000000001";
const UPDATED_AT = "2026-07-29T12:00:00.000Z";
const OLDER_UPDATED_AT = "2026-07-29T11:00:00.000Z";

const context: AgentContext = {
  apiKeyId: "40000000-0000-4000-8000-000000000001",
  keyPrefix: "tb_live_AAECAwQF",
  memberId: MEMBER_ID,
  memberName: "Bruce",
  scopes: new Set(["board:read", "audit:read"]),
  expiresAt: null,
};

interface QueryDouble {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  gt: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: Promise<unknown>["then"];
}

function queryDouble(data: unknown, error: unknown = null): QueryDouble {
  const resolved = Promise.resolve({ data, error });
  const query = {} as QueryDouble;
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.gt = vi.fn(() => query);
  query.or = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data, error }));
  query.then = resolved.then.bind(resolved);
  return query;
}

function clientFor(
  rows: Record<string, { data: unknown; error?: unknown }>,
): {
  client: SupabaseClient;
  from: ReturnType<typeof vi.fn>;
  queries: Record<string, QueryDouble>;
} {
  const queries = Object.fromEntries(
    Object.entries(rows).map(([table, result]) => [
      table,
      queryDouble(result.data, result.error ?? null),
    ]),
  );
  const from = vi.fn((table: string) => {
    const query = queries[table];
    if (!query) throw new Error(`Unexpected table: ${table}`);
    return query;
  });
  return {
    client: { from } as unknown as SupabaseClient,
    from,
    queries,
  };
}

function rpcClient(
  data: unknown,
  error: unknown = null,
): {
  client: SupabaseClient;
  rpc: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
} {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const from = vi.fn(() => {
    throw new Error("Read RPC paths must not query tables directly.");
  });
  return {
    client: { rpc, from } as unknown as SupabaseClient,
    rpc,
    from,
  };
}

function taskRow(
  id = TASK_ID,
  updatedAt = UPDATED_AT,
): Record<string, unknown> {
  return {
    id,
    module_id: MODULE_ID,
    title: "Fused attention",
    status: "in_progress",
    notes: "Public notes",
    tags: ["NPU", "Verifier"],
    priority: "high",
    due_date: "2026-08-15",
    position: 2,
    created_at: "2026-07-28T12:00:00.000Z",
    updated_at: updatedAt,
    task_assignees: [
      { member_id: MEMBER_ID, member: { name: "Bruce" } },
      {
        member_id: "20000000-0000-4000-8000-000000000002",
        member: { name: "Alice" },
      },
    ],
    assignees: ["legacy-secret-name"],
    internal_column: "do-not-return",
  };
}

function experimentRow(
  id = EXPERIMENT_ID,
  updatedAt = UPDATED_AT,
): Record<string, unknown> {
  return {
    id,
    experiment_no: 42,
    task_id: TASK_ID,
    owner_id: MEMBER_ID,
    name: "Tiled kernel",
    status: "running",
    baseline_experiment_id: null,
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
      platform: "npu",
      server: "",
      devices: [],
      hardware: "",
      evaluator: "",
      revision: "",
      precision_policy: "",
    },
    config: { block: 128 },
    notes: "",
    metrics: { latency: 1.5 },
    featured_metric_keys: ["latency"],
    result_summary: "",
    decision_outcome: null,
    decision_notes: "",
    position: 0,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-28T12:00:00.000Z",
    updated_at: updatedAt,
    task: { id: TASK_ID, title: "Fused attention" },
    owner: {
      id: MEMBER_ID,
      name: "Bruce",
      initials: "B",
      position: 0,
      created_at: "2026-07-28T12:00:00.000Z",
    },
    internal_column: "do-not-return",
  };
}

describe("updated cursor", () => {
  it("round-trips opaque base64url JSON without padding", () => {
    const cursor = { updated_at: UPDATED_AT, id: TASK_ID };
    const encoded = encodeUpdatedCursor(cursor);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain("=");
    expect(decodeUpdatedCursor(encoded)).toEqual(cursor);
  });

  it.each([
    "2026-07-28T15:31:22.123456+05:30",
    "2026-07-28T15:31:22.123456789+15:59",
    "2026-07-28T15:31:22.123456789-15:59",
  ])("preserves a valid fractional timestamp with numeric offset %s", (updatedAt) => {
    const cursor = {
      updated_at: updatedAt,
      id: TASK_ID,
    };
    const encoded = encodeUpdatedCursor(cursor);

    expect(decodeUpdatedCursor(encoded)).toEqual(cursor);
  });

  it.each([
    "",
    "not+base64url",
    "e30=",
    btoa("{}"),
    Buffer.from(JSON.stringify({ updated_at: UPDATED_AT, id: TASK_ID }))
      .toString("base64url") + "A",
    Buffer.from(JSON.stringify({ updated_at: UPDATED_AT }))
      .toString("base64url"),
    Buffer.from(JSON.stringify({
      updated_at: UPDATED_AT,
      id: TASK_ID,
      extra: true,
    })).toString("base64url"),
    Buffer.from(JSON.stringify({
      updated_at: "not-a-time",
      id: TASK_ID,
    })).toString("base64url"),
    Buffer.from(JSON.stringify({
      updated_at: "2026-02-30T12:00:00.000Z",
      id: TASK_ID,
    })).toString("base64url"),
    ...[
      "2026-07-28T15:31:22+16:00",
      "2026-07-28T15:31:22-16:00",
      "2026-07-28T15:31:22+23:59",
      "2026-07-28T15:31:22-23:59",
    ].map((updated_at) => Buffer.from(JSON.stringify({
      updated_at,
      id: TASK_ID,
    })).toString("base64url")),
    Buffer.from(JSON.stringify({
      updated_at: UPDATED_AT,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".toUpperCase(),
    })).toString("base64url"),
  ])("rejects malformed or noncanonical cursor %s", (value) => {
    expect(() => decodeUpdatedCursor(value)).toThrowError(
      expect.objectContaining({
        status: 400,
        code: "INVALID_QUERY",
        details: { field: "cursor" },
      }),
    );
  });
});

describe("read filter parsing", () => {
  it("parses every documented Task filter and the maximum limit", () => {
    const cursor = encodeUpdatedCursor({
      updated_at: UPDATED_AT,
      id: TASK_ID,
    });
    const request = new Request(
      "https://board.test/api/agent/v1/tasks"
      + `?module_id=${MODULE_ID}&assignee_id=${MEMBER_ID}`
      + `&status=blocked&updated_after=${encodeURIComponent(OLDER_UPDATED_AT)}`
      + `&cursor=${cursor}&limit=100`,
    );

    expect(parseTaskListFilters(request)).toEqual({
      moduleId: MODULE_ID,
      assigneeId: MEMBER_ID,
      status: "blocked",
      updatedAfter: OLDER_UPDATED_AT,
      cursor: { updated_at: UPDATED_AT, id: TASK_ID },
      limit: 100,
    });
  });

  it("parses every documented Experiment filter", () => {
    const request = new Request(
      "https://board.test/api/agent/v1/experiments"
      + `?task_id=${TASK_ID}&owner_id=${MEMBER_ID}`
      + `&status=completed&updated_after=${encodeURIComponent(OLDER_UPDATED_AT)}`,
    );

    expect(parseExperimentListFilters(request)).toEqual({
      taskId: TASK_ID,
      ownerId: MEMBER_ID,
      status: "completed",
      updatedAfter: OLDER_UPDATED_AT,
      limit: 50,
    });
  });

  it.each([
    "2026-07-28T15:31:22.123456-04:00",
    "2026-07-28T15:31:22.123456789+15:59",
    "2026-07-28T15:31:22.123456789-15:59",
  ])("preserves valid numeric-offset updated_after %s", (updatedAfter) => {
    const request = new Request(
      "https://board.test/api/agent/v1/tasks"
      + `?updated_after=${encodeURIComponent(updatedAfter)}`,
    );

    expect(parseTaskListFilters(request)).toEqual({
      updatedAfter,
      limit: 50,
    });
  });

  it.each([
    "?unknown=x",
    "?module_id=not-a-uuid",
    "?module_id=AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    "?status=complete",
    "?updated_after=yesterday",
    "?updated_after=2026-02-30T12%3A00%3A00.000Z",
    "?updated_after=2026-07-28T15%3A31%3A22%2B16%3A00",
    "?updated_after=2026-07-28T15%3A31%3A22-16%3A00",
    "?updated_after=2026-07-28T15%3A31%3A22%2B23%3A59",
    "?updated_after=2026-07-28T15%3A31%3A22-23%3A59",
    "?limit=0",
    "?limit=101",
    "?limit=050",
    "?limit=50&limit=51",
    "?cursor=not_base64!",
  ])("strictly rejects invalid Task query %s", (query) => {
    expect(() => parseTaskListFilters(
      new Request(`https://board.test/api/agent/v1/tasks${query}`),
    )).toThrowError(expect.objectContaining({
      status: 400,
      code: "INVALID_QUERY",
    }));
  });
});

describe("read repository DTOs and queries", () => {
  it("returns capabilities with identity and fixed limits but no key secrets", () => {
    const { client } = clientFor({});
    const capabilities = createReadRepository(client).getCapabilities(context);
    const serialized = JSON.stringify(capabilities);

    expect(capabilities).toEqual({
      key_prefix: context.keyPrefix,
      member: { id: MEMBER_ID, name: "Bruce" },
      scopes: ["audit:read", "board:read"],
      expires_at: null,
      limits: {
        default_page_size: 50,
        max_page_size: 100,
        max_json_body_bytes: 262144,
        max_attachment_bytes: 10485760,
        successful_writes_per_60_seconds: 30,
      },
    });
    expect(serialized).not.toContain("apiKeyId");
    expect(serialized).not.toContain("digest");
    expect(serialized).not.toContain("secret");
  });

  it("uses the exact aggregate RPC so Board counts can exceed max_rows", async () => {
    const summary = {
      modules: 1201,
      members: 1302,
      tasks: 1403,
      experiments: 1504,
      task_statuses: {
        todo: 1101,
        in_progress: 101,
        done: 100,
        blocked: 101,
      },
      experiment_statuses: {
        planned: 1102,
        running: 102,
        analyzing: 100,
        completed: 100,
        blocked: 50,
        cancelled: 50,
      },
    };
    const { client, rpc, from } = rpcClient(summary);

    await expect(createReadRepository(client).getBoardSummary())
      .resolves.toEqual(summary);
    expect(rpc).toHaveBeenCalledWith("agent_api_board_summary");
    expect(from).not.toHaveBeenCalled();
  });

  it("turns Board summary RPC errors into the safe read error", async () => {
    const { client } = rpcClient(null, {
      message: "sb_secret_do_not_expose",
    });

    await expect(createReadRepository(client).getBoardSummary())
      .rejects.toEqual(new Error("Agent API read query failed."));
  });

  it("normalizes Task relations and allowlists DTO fields", async () => {
    const { client, queries } = clientFor({
      tasks: { data: [taskRow()] },
    });
    const result = await createReadRepository(client).listTasks({ limit: 50 });

    expect(result.items).toEqual([{
      id: TASK_ID,
      module_id: MODULE_ID,
      title: "Fused attention",
      status: "in_progress",
      assignees: ["Alice", "Bruce"],
      notes: "Public notes",
      tags: ["NPU", "Verifier"],
      priority: "high",
      due_date: "2026-08-15",
      position: 2,
      created_at: "2026-07-28T12:00:00.000Z",
      updated_at: UPDATED_AT,
    }]);
    expect(result.next_cursor).toBeNull();
    const select = queries.tasks.select.mock.calls[0][0] as string;
    expect(select).not.toContain("*");
    expect(select).not.toMatch(/(^|,)assignees([,(]|$)/);
    expect(JSON.stringify(result)).not.toContain("legacy-secret-name");
    expect(JSON.stringify(result)).not.toContain("internal_column");
  });

  it("uses both descending columns and both cursor boundaries", async () => {
    const { client, queries } = clientFor({ tasks: { data: [] } });
    await createReadRepository(client).listTasks({
      limit: 25,
      cursor: { updated_at: UPDATED_AT, id: TASK_ID },
    });

    expect(queries.tasks.order).toHaveBeenNthCalledWith(
      1,
      "updated_at",
      { ascending: false },
    );
    expect(queries.tasks.order).toHaveBeenNthCalledWith(
      2,
      "id",
      { ascending: false },
    );
    expect(queries.tasks.or).toHaveBeenCalledWith(
      `updated_at.lt.${UPDATED_AT},and(updated_at.eq.${UPDATED_AT},id.lt.${TASK_ID})`,
    );
    expect(queries.tasks.limit).toHaveBeenCalledWith(26);
  });

  it("uses limit plus one and emits a tie-safe next cursor from the last item", async () => {
    const tiedSecondId = "30000000-0000-4000-8000-000000000000";
    const { client } = clientFor({
      tasks: {
        data: [
          taskRow(TASK_ID, UPDATED_AT),
          taskRow(tiedSecondId, UPDATED_AT),
          taskRow(OTHER_TASK_ID, OLDER_UPDATED_AT),
        ],
      },
    });

    const result = await createReadRepository(client).listTasks({ limit: 2 });

    expect(result.items.map((task) => task.id)).toEqual([
      TASK_ID,
      tiedSecondId,
    ]);
    expect(decodeUpdatedCursor(result.next_cursor!)).toEqual({
      updated_at: UPDATED_AT,
      id: tiedSecondId,
    });
  });

  it("forwards only documented Task filters and preserves all assignee names", async () => {
    const { client, queries } = clientFor({
      tasks: { data: [taskRow()] },
    });
    const result = await createReadRepository(client).listTasks({
      moduleId: MODULE_ID,
      assigneeId: MEMBER_ID,
      status: "blocked",
      updatedAfter: OLDER_UPDATED_AT,
      limit: 50,
    });

    expect(queries.tasks.eq).toHaveBeenCalledWith("module_id", MODULE_ID);
    expect(queries.tasks.eq).toHaveBeenCalledWith("status", "blocked");
    expect(queries.tasks.eq).toHaveBeenCalledWith(
      "assignee_filter.member_id",
      MEMBER_ID,
    );
    expect(queries.tasks.gt).toHaveBeenCalledWith(
      "updated_at",
      OLDER_UPDATED_AT,
    );
    expect(queries.tasks.select.mock.calls[0][0]).toContain(
      "assignee_filter:task_assignees!inner(member_id)",
    );
    expect(result.items[0].assignees).toEqual(["Alice", "Bruce"]);
  });

  it("returns null for a missing Task and never forwards internal columns", async () => {
    const { client, queries } = clientFor({
      tasks: { data: null },
    });

    await expect(createReadRepository(client).getTask(TASK_ID))
      .resolves.toBeNull();
    expect(queries.tasks.eq).toHaveBeenCalledWith("id", TASK_ID);
    expect(queries.tasks.maybeSingle).toHaveBeenCalledOnce();
  });

  it("paginates Experiment DTOs with the same two-column boundary", async () => {
    const { client, queries } = clientFor({
      experiments: {
        data: [
          experimentRow(EXPERIMENT_ID, UPDATED_AT),
          experimentRow(
            "60000000-0000-4000-8000-000000000002",
            OLDER_UPDATED_AT,
          ),
        ],
      },
    });
    const result = await createReadRepository(client).listExperiments({
      taskId: TASK_ID,
      ownerId: MEMBER_ID,
      status: "running",
      updatedAfter: OLDER_UPDATED_AT,
      cursor: { updated_at: UPDATED_AT, id: EXPERIMENT_ID },
      limit: 1,
    });

    expect(queries.experiments.order).toHaveBeenNthCalledWith(
      1,
      "updated_at",
      { ascending: false },
    );
    expect(queries.experiments.order).toHaveBeenNthCalledWith(
      2,
      "id",
      { ascending: false },
    );
    expect(queries.experiments.or).toHaveBeenCalledWith(
      `updated_at.lt.${UPDATED_AT},and(updated_at.eq.${UPDATED_AT},id.lt.${EXPERIMENT_ID})`,
    );
    expect(queries.experiments.eq).toHaveBeenCalledWith("task_id", TASK_ID);
    expect(queries.experiments.eq).toHaveBeenCalledWith("owner_id", MEMBER_ID);
    expect(queries.experiments.eq).toHaveBeenCalledWith("status", "running");
    expect(queries.experiments.gt).toHaveBeenCalledWith(
      "updated_at",
      OLDER_UPDATED_AT,
    );
    expect(queries.experiments.limit).toHaveBeenCalledWith(2);
    expect(result.items).toHaveLength(1);
    expect(JSON.stringify(result.items[0])).not.toContain("internal_column");
    expect(decodeUpdatedCursor(result.next_cursor!)).toEqual({
      updated_at: UPDATED_AT,
      id: EXPERIMENT_ID,
    });
  });

  it("uses neutral list defaults when stored Experiment JSON fields are invalid", async () => {
    const row = {
      ...experimentRow(),
      data_spec: {
        datasets: [{
          role: "validation",
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
        skills: ["triton", 7],
        tools: [],
      },
      environment_spec: {
        platform: "npu",
        server: "atlas",
        devices: ["npu:0", 1],
        hardware: "910B",
        evaluator: "pytest",
        revision: "v1",
        precision_policy: "fp32",
      },
      config: { nested: { block: 128 } },
      metrics: { latency: "NaN", throughput: null },
      featured_metric_keys: ["latency", 1],
      task: {
        id: TASK_ID,
        title: "Fused attention",
        internal_task_secret: "do-not-return",
      },
      owner: {
        ...(experimentRow().owner as Record<string, unknown>),
        auth_data: "do-not-return",
      },
    };
    const { client } = clientFor({ experiments: { data: [row] } });

    const result = await createReadRepository(client).listExperiments({
      limit: 50,
    });
    const experiment = result.items[0];

    expect(experiment.task).toEqual({
      id: TASK_ID,
      title: "Fused attention",
    });
    expect(experiment.owner).toEqual({
      id: MEMBER_ID,
      name: "Bruce",
      initials: "B",
      position: 0,
      created_at: "2026-07-28T12:00:00.000Z",
    });
    expect(experiment).toMatchObject({
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
    expect(experiment.data_spec.datasets).not.toEqual([
      expect.objectContaining({ role: "training" }),
    ]);
    expect(JSON.stringify(experiment)).not.toContain("internal_task_secret");
    expect(JSON.stringify(experiment)).not.toContain("auth_data");

    expect(() => parseExperimentPatch({
      changes: {
        data_spec: experiment.data_spec,
        object_spec: experiment.object_spec,
        environment_spec: experiment.environment_spec,
        config: experiment.config,
        metrics: experiment.metrics,
        featured_metric_keys: experiment.featured_metric_keys,
      },
    })).not.toThrow();
  });

  it("preserves valid detail JSON values while stripping nested extras", async () => {
    const row = {
      ...experimentRow(),
      data_spec: {
        datasets: [
          {
            role: "evaluation",
            name: "kernelbench",
            split: "test",
            revision: "v1",
            task_count: 250,
            samples_per_task: 1,
            internal_dataset_secret: "do-not-return",
          },
          {
            role: "training",
            name: "triton-corpus",
            split: "train",
            revision: "v2",
            task_count: null,
            samples_per_task: null,
          },
        ],
        internal_data_secret: "do-not-return",
      },
      object_spec: {
        model: "Qwen",
        harness: "kernelbench",
        parent_harness: "base",
        prompt: "Optimize",
        prompt_change: "Use tiling",
        skills: ["triton"],
        tools: ["profiler"],
        internal_object_secret: "do-not-return",
      },
      environment_spec: {
        platform: "npu",
        server: "atlas",
        devices: ["npu:0"],
        hardware: "910B",
        evaluator: "pytest",
        revision: "v1",
        precision_policy: "fp32",
        internal_environment_secret: "do-not-return",
      },
      config: {
        block: 128,
        enabled: true,
        label: "fast",
        optional: null,
      },
      metrics: { latency: 1.25, throughput: 42 },
      featured_metric_keys: ["latency", 1],
      task: {
        id: TASK_ID,
        title: "Fused attention",
        notes: "do-not-return",
      },
      attachments: [],
    };
    const { client } = clientFor({ experiments: { data: row } });

    const result = await createReadRepository(client)
      .getExperiment(EXPERIMENT_ID);
    const serialized = JSON.stringify(result);

    expect(result?.task).toEqual({
      id: TASK_ID,
      title: "Fused attention",
    });
    expect(result?.data_spec).toEqual({
      datasets: [{
        role: "evaluation",
        name: "kernelbench",
        split: "test",
        revision: "v1",
        task_count: 250,
        samples_per_task: 1,
      }, {
        role: "training",
        name: "triton-corpus",
        split: "train",
        revision: "v2",
        task_count: null,
        samples_per_task: null,
      }],
    });
    expect(result?.object_spec).toEqual({
      model: "Qwen",
      harness: "kernelbench",
      parent_harness: "base",
      prompt: "Optimize",
      prompt_change: "Use tiling",
      skills: ["triton"],
      tools: ["profiler"],
    });
    expect(result?.environment_spec).toEqual({
      platform: "npu",
      server: "atlas",
      devices: ["npu:0"],
      hardware: "910B",
      evaluator: "pytest",
      revision: "v1",
      precision_policy: "fp32",
    });
    expect(result?.config).toEqual({
      block: 128,
      enabled: true,
      label: "fast",
      optional: null,
    });
    expect(result?.metrics).toEqual({ latency: 1.25, throughput: 42 });
    expect(result?.featured_metric_keys).toEqual([]);
    expect(serialized).not.toContain("internal_");
    expect(serialized).not.toContain('"notes":"do-not-return"');
    expect(() => parseExperimentPatch({
      changes: {
        data_spec: result?.data_spec,
        object_spec: result?.object_spec,
        environment_spec: result?.environment_spec,
        config: result?.config,
        metrics: result?.metrics,
        featured_metric_keys: result?.featured_metric_keys,
      },
    })).not.toThrow();
  });

  it("preserves a nullable embedded Task relation without leaking row fields", async () => {
    const { client } = clientFor({
      experiments: { data: [{ ...experimentRow(), task: null }] },
    });

    const result = await createReadRepository(client).listExperiments({
      limit: 50,
    });

    expect(result.items[0].task).toBeNull();
  });

  it("includes allowlisted Attachments with updated_at in Experiment detail", async () => {
    const row = {
      ...experimentRow(),
      attachments: [{
        id: "70000000-0000-4000-8000-000000000001",
        task_id: TASK_ID,
        experiment_id: EXPERIMENT_ID,
        url: "https://storage.test/plot.png",
        path: "task/experiment/plot.png",
        caption: "Latency",
        position: 0,
        created_at: "2026-07-28T12:00:00.000Z",
        updated_at: UPDATED_AT,
        storage_secret: "do-not-return",
      }],
    };
    const { client, queries } = clientFor({
      experiments: { data: row },
    });

    const result = await createReadRepository(client)
      .getExperiment(EXPERIMENT_ID);

    expect(result?.attachments).toEqual([{
      id: "70000000-0000-4000-8000-000000000001",
      task_id: TASK_ID,
      experiment_id: EXPERIMENT_ID,
      url: "https://storage.test/plot.png",
      path: "task/experiment/plot.png",
      caption: "Latency",
      position: 0,
      created_at: "2026-07-28T12:00:00.000Z",
      updated_at: UPDATED_AT,
    }]);
    expect(queries.experiments.select.mock.calls[0][0]).toContain(
      "attachments(id,task_id,experiment_id,url,path,caption,position,created_at,updated_at)",
    );
    expect(JSON.stringify(result)).not.toContain("storage_secret");
  });

  it("lists only public Activity fields for the requested Task", async () => {
    const { client, queries } = clientFor({
      activity: {
        data: [{
          id: "80000000-0000-4000-8000-000000000001",
          task_id: TASK_ID,
          experiment_id: EXPERIMENT_ID,
          text: "Status changed",
          kind: "status",
          created_at: UPDATED_AT,
          private_note: "do-not-return",
        }],
      },
    });

    const result = await createReadRepository(client)
      .listTaskActivity(TASK_ID, {});

    expect(result).toEqual([{
      id: "80000000-0000-4000-8000-000000000001",
      task_id: TASK_ID,
      experiment_id: EXPERIMENT_ID,
      text: "Status changed",
      kind: "status",
      created_at: UPDATED_AT,
    }]);
    expect(queries.activity.eq).toHaveBeenCalledWith("task_id", TASK_ID);
    expect(queries.activity.order).toHaveBeenCalledWith(
      "created_at",
      { ascending: false },
    );
  });

  it("filters audit by live collaboration and strips audit and snapshot secrets", async () => {
    const auditRow = {
      id: "90000000-0000-4000-8000-000000000001",
      api_key_id: context.apiKeyId,
      member_id: MEMBER_ID,
      request_id: "req_write",
      idempotency_key: "secret-idempotency",
      request_hash: "secret-hash",
      resource_type: "task",
      resource_id: TASK_ID,
      task_id: TASK_ID,
      action: "patch",
      before_state: {
        ...taskRow(),
        assignees: ["historical-legacy-owner"],
        key_digest: "secret-digest",
      },
      after_state: {
        ...taskRow(),
        assignees: ["historical-legacy-owner"],
      },
      response_status: 200,
      created_at: UPDATED_AT,
      key_prefix: context.keyPrefix,
    };
    const { client, rpc, from } = rpcClient([auditRow]);

    const result = await createReadRepository(client).listAudit(context, {});
    const serialized = JSON.stringify(result);

    expect(rpc).toHaveBeenCalledWith("agent_api_list_audit", {
      p_member_id: MEMBER_ID,
    });
    expect(from).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({
      id: auditRow.id,
      key: { id: context.apiKeyId, prefix: context.keyPrefix },
      member: { id: MEMBER_ID },
      resource_type: "task",
      resource_id: TASK_ID,
      task_id: TASK_ID,
      action: "patch",
      before_state: expect.objectContaining({
        tags: ["NPU", "Verifier"],
        priority: "high",
        due_date: "2026-08-15",
      }),
      after_state: expect.objectContaining({
        tags: ["NPU", "Verifier"],
        priority: "high",
        due_date: "2026-08-15",
      }),
      response_status: 200,
    });
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("historical-legacy-owner");
    expect(serialized).not.toContain("task_scope");
  });

  it("does not use historical audit ownership to determine audit visibility", async () => {
    const { client, rpc } = rpcClient([]);

    await createReadRepository(client).listAudit(context, {});

    expect(rpc).toHaveBeenCalledWith("agent_api_list_audit", {
      p_member_id: MEMBER_ID,
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("member_id");
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("api_key_id");
  });

  it("returns safe query failures without leaking Supabase errors", async () => {
    const { client } = clientFor({
      tasks: {
        data: null,
        error: { message: "sb_secret_do_not_expose" },
      },
    });

    await expect(createReadRepository(client).listTasks({ limit: 50 }))
      .rejects.toEqual(new Error("Agent API read query failed."));
  });
});

describe("invalid query error shape", () => {
  it("uses a stable public error type", () => {
    try {
      parseExperimentListFilters(new Request(
        "https://board.test/api/agent/v1/experiments?owner_id=nope",
      ));
      throw new Error("expected parse to fail");
    } catch (reason) {
      expect(reason).toBeInstanceOf(AgentApiError);
      expect(reason).toMatchObject({
        status: 400,
        code: "INVALID_QUERY",
        retryable: false,
        details: { field: "owner_id" },
      });
    }
  });
});
