import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReadRepository } from "@/lib/agent-api/read-repository";

interface QueryDouble {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: Promise<unknown>["then"];
}

const tables = new Map<string, { data: unknown; error: unknown }>();

function table(name: string): QueryDouble {
  const query = {} as QueryDouble;
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () =>
    tables.get(name) ?? { data: null, error: null });
  const resolved = Promise.resolve(tables.get(name) ?? { data: [], error: null });
  query.then = resolved.then.bind(resolved);
  return query;
}

const from = vi.fn((name: string) => table(name));
const repository = createReadRepository({ from } as never);

const TEMPLATE_ID = "30000000-0000-4000-8000-000000000001";
const KEY_ID = "50000000-0000-4000-8000-000000000001";

const templateRow = {
  id: TEMPLATE_ID,
  name: "Benchmark A",
  description: "",
  schema_revision: 2,
  archived_at: null,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z",
};

const experimentRow = {
  id: "60000000-0000-4000-8000-000000000001",
  experiment_no: 1,
  task_id: "20000000-0000-4000-8000-000000000001",
  owner_id: null,
  name: "Run one",
  status: "analyzing",
  baseline_experiment_id: null,
  template_id: TEMPLATE_ID,
  archived_at: null,
  core_revision: 3,
  data_spec: { datasets: [] },
  object_spec: { model: "", harness: "", parent_harness: "", prompt: "", prompt_change: "", skills: [], tools: [] },
  environment_spec: { platform: "", server: "", devices: [], hardware: "", evaluator: "", revision: "", precision_policy: "" },
  config: {},
  notes: "",
  metrics: {},
  featured_metric_keys: [],
  result_summary: "",
  decision_outcome: null,
  decision_notes: "",
  position: 0,
  started_at: null,
  completed_at: null,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  tables.clear();
  tables.set("experiment_templates", { data: [templateRow], error: null });
  tables.set("experiment_template_fields", { data: [], error: null });
  tables.set("experiment_template_keys", { data: [], error: null });
  tables.set("experiment_template_key_options", { data: [], error: null });
  tables.set("experiments", { data: [], error: null });
  tables.set("experiment_values", { data: [], error: null });
  tables.set("experiment_value_options", { data: [], error: null });
  tables.set("experiment_versions", { data: [], error: null });
});

describe("template agent read adapters", () => {
  it("lists Templates", async () => {
    const result = await repository.listTemplates();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(TEMPLATE_ID);
    expect(result[0].name).toBe("Benchmark A");
  });

  it("loads one Template schema with ordered Fields and Keys", async () => {
    tables.set("experiment_templates", { data: templateRow, error: null });
    tables.set("experiment_template_fields", { data: [{
      id: "40000000-0000-4000-8000-000000000001",
      template_id: TEMPLATE_ID,
      label: "Metrics",
      color_token: "blue",
      position: 1,
      archived_at: null,
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    }], error: null });
    tables.set("experiment_template_keys", { data: [{
      id: KEY_ID,
      template_id: TEMPLATE_ID,
      field_id: "40000000-0000-4000-8000-000000000001",
      key: "pass@1",
      value_type: "number",
      required: true,
      position: 1,
      archived_at: null,
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    }], error: null });
    const result = await repository.getTemplateSchema(TEMPLATE_ID);
    expect(result?.length).toBe(1);
    expect(result?.[0].keys[0].key).toBe("pass@1");
  });

  it("returns null for an unknown Template", async () => {
    tables.set("experiment_templates", { data: null, error: null });
    const result = await repository.getTemplateSchema(TEMPLATE_ID);
    expect(result).toBeNull();
  });

  it("loads Compare source rows for a Template", async () => {
    tables.set("experiments", { data: [experimentRow], error: null });
    tables.set("experiment_values", { data: [{
      experiment_id: experimentRow.id,
      template_id: TEMPLATE_ID,
      key_id: KEY_ID,
      number_value: 0.73,
      cell_revision: 1,
      text_value: null,
      boolean_value: null,
      datetime_value: null,
      option_id: null,
      template_key: { value_type: "number" },
    }], error: null });
    const result = await repository.getTemplateCompareSource(TEMPLATE_ID, false);
    expect(result.experiments).toHaveLength(1);
    expect(result.experiments[0].values[KEY_ID]).toEqual({
      value: { kind: "number", number: 0.73 },
      cell_revision: 1,
    });
  });

  it("includes template fields in an Experiment response", async () => {
    tables.set("experiment_templates", { data: templateRow, error: null });
    tables.set("experiments", { data: experimentRow, error: null });
    tables.set("experiment_values", { data: [{
      experiment_id: experimentRow.id,
      template_id: TEMPLATE_ID,
      key_id: KEY_ID,
      number_value: 0.73,
      cell_revision: 1,
      text_value: null,
      boolean_value: null,
      datetime_value: null,
      option_id: null,
      template_key: { value_type: "number" },
    }], error: null });
    const result = await repository.getExperiment(experimentRow.id);
    expect(result?.template_id).toBe(TEMPLATE_ID);
    expect(result?.values?.[KEY_ID]?.value).toEqual({ kind: "number", number: 0.73 });
    expect(result?.template?.name).toBe("Benchmark A");
  });
});
