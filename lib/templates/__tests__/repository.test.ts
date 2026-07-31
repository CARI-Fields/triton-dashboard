import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadTemplateDraft,
  saveTemplate,
  type TemplateDraft,
} from "@/lib/templates/repository";

interface MockQuery {
  data: unknown;
  error: unknown;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (
    resolve: (response: unknown) => unknown,
    reject: (error: unknown) => unknown,
  ) => Promise<unknown>;
}

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const tables: Record<string, MockQuery> = {};
  function table(name: string): MockQuery {
    if (!tables[name]) {
      tables[name] = {
        data: [] as unknown,
        error: null as unknown,
        select: vi.fn(() => tables[name]),
        eq: vi.fn(() => tables[name]),
        is: vi.fn(() => tables[name]),
        order: vi.fn(() => tables[name]),
        maybeSingle: vi.fn(() => ({ data: null, error: null })),
        then: (
          resolve: (response: unknown) => unknown,
          reject: (error: unknown) => unknown,
        ) => Promise.resolve({
          data: (tables[name] as { data: unknown }).data,
          error: (tables[name] as { error: unknown }).error,
        }).then(resolve, reject),
      };
    }
    return tables[name];
  }
  return { rpc, table };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (name: string) => mocks.table(name),
    rpc: (...args: unknown[]) => mocks.rpc(...args),
  },
}));

const template = {
  id: "30000000-0000-4000-8000-000000000001",
  name: "Benchmark",
  description: "",
  schema_revision: 3,
  archived_at: null,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z",
};

const draft: TemplateDraft = {
  templateId: template.id,
  name: "Benchmark",
  description: "",
  schemaRevision: 3,
  fields: [{
    id: "f1", label: "Metrics", colorToken: "blue", position: 1, archived: false,
    keys: [{
      id: "k1", key: "pass@1", valueType: "number", required: false,
      position: 1, archived: false, options: [], valueCount: 0,
    }],
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("template repository", () => {
  it("loads a Template with ordered Fields and Keys", async () => {
    const experiments = mocks.table("experiment_templates");
    vi.mocked(experiments.select).mockReturnValue(experiments);
    vi.mocked(experiments.eq).mockReturnValue(experiments);
    vi.mocked(experiments.maybeSingle).mockResolvedValue({ data: template, error: null });
    mocks.table("experiment_template_fields").data = [{
      id: "f1", template_id: template.id, label: "Metrics",
      color_token: "blue", position: 1, archived_at: null,
    }];
    mocks.table("experiment_template_keys").data = [{
      id: "k1", template_id: template.id, field_id: "f1", key: "pass@1",
      value_type: "number", required: false, position: 1, archived_at: null,
    }];
    mocks.table("experiment_template_key_options").data = [];
    mocks.table("experiment_values").data = [];

    const loaded = await loadTemplateDraft(template.id);

    expect(loaded?.name).toBe("Benchmark");
    expect(loaded?.fields[0].keys[0].key).toBe("pass@1");
    expect(loaded?.fields[0].keys[0].valueCount).toBe(0);
  });

  it("sends the full draft to the save RPC", async () => {
    vi.mocked(mocks.rpc).mockResolvedValue({
      data: { template_id: template.id, schema_revision: 4, version_no: 2 },
      error: null,
    });

    const result = await saveTemplate(draft);

    expect(result.schema_revision).toBe(4);
    expect(mocks.rpc).toHaveBeenCalledWith("save_experiment_template", {
      p_template_id: template.id,
      p_name: "Benchmark",
      p_description: "",
      p_expected_schema_revision: 3,
      p_fields: [{
        id: "f1",
        label: "Metrics",
        color_token: "blue",
        position: 1,
        archived: false,
        keys: [{
          id: "k1",
          key: "pass@1",
          value_type: "number",
          required: false,
          position: 1,
          archived: false,
          options: [],
        }],
      }],
    });
  });
});
