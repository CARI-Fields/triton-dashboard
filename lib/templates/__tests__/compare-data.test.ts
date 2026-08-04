import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadTemplateCompareRows } from "@/lib/templates/compare-data";

interface MockQuery {
  data: unknown;
  error: unknown;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  then: (
    resolve: (response: unknown) => unknown,
    reject: (error: unknown) => unknown,
  ) => Promise<unknown>;
}

const mocks = vi.hoisted(() => {
  const tables: Record<string, MockQuery> = {};
  function table(name: string): MockQuery {
    if (!tables[name]) {
      tables[name] = {
        data: [] as unknown,
        error: null as unknown,
        select: vi.fn(() => tables[name]),
        eq: vi.fn(() => tables[name]),
        in: vi.fn(() => tables[name]),
        not: vi.fn(() => tables[name]),
        is: vi.fn((column: string, value: unknown) => {
          const rows = (tables[name] as { data: unknown[] }).data as Array<Record<string, unknown>>;
          (tables[name] as { data: unknown }).data = value === null
            ? rows.filter((row) => row[column] == null)
            : rows.filter((row) => row[column] === value);
          return tables[name];
        }),
        order: vi.fn(() => tables[name]),
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
  return { table };
});

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (name: string) => mocks.table(name) },
}));

const TEMPLATE_ID = "30000000-0000-4000-8000-000000000001";
const KEY_ID = "50000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.table("experiments").data = [{
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
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
  }];
  mocks.table("experiment_values").data = [{
    experiment_id: "60000000-0000-4000-8000-000000000001",
    template_id: TEMPLATE_ID,
    key_id: KEY_ID,
    number_value: 0.73,
    cell_revision: 1,
    text_value: null,
    boolean_value: null,
    datetime_value: null,
    option_id: null,
    template_key: { value_type: "number" },
  }];
  mocks.table("experiment_value_options").data = [];
  mocks.table("attachments").data = [];
  mocks.table("tasks").data = [{
    id: "20000000-0000-4000-8000-000000000001",
    title: "Optimize conv2d",
  }];
  mocks.table("members").data = [];
});

describe("loadTemplateCompareRows", () => {
  it("loads typed Values keyed by Key id", async () => {
    const rows = await loadTemplateCompareRows(TEMPLATE_ID, false);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Run one");
    expect(rows[0].taskTitle).toBe("Optimize conv2d");
    const entry = rows[0].values.get(KEY_ID);
    expect(entry?.value).toEqual({ kind: "number", number: 0.73 });
  });

  it("filters archived rows unless requested", async () => {
    const rows = mocks.table("experiments").data as unknown[];
    const archivedRow = {
      id: "60000000-0000-4000-8000-000000000002",
      experiment_no: 2,
      task_id: "20000000-0000-4000-8000-000000000001",
      owner_id: null,
      name: "Run two",
      status: "completed",
      baseline_experiment_id: null,
      template_id: TEMPLATE_ID,
      archived_at: "2026-07-31T00:00:00.000Z",
      core_revision: 1,
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    };
    mocks.table("experiments").data = [...rows, archivedRow];
    const withoutArchived = await loadTemplateCompareRows(TEMPLATE_ID, false);
    expect(withoutArchived).toHaveLength(1);
    mocks.table("experiments").data = [...rows, archivedRow];
    const withArchived = await loadTemplateCompareRows(TEMPLATE_ID, true);
    expect(withArchived).toHaveLength(2);
    expect(withArchived[1].archivedAt).not.toBeNull();
  });
});
