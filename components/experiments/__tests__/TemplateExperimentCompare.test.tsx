import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TemplateExperimentCompare from "@/components/experiments/TemplateExperimentCompare";
import type { CompareRow } from "@/lib/templates/compare";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  loadDraft: vi.fn(),
  loadRows: vi.fn(),
}));

vi.mock("@/lib/templates/repository", () => ({
  listTemplateSummaries: mocks.list,
  loadTemplateDraft: mocks.loadDraft,
}));
vi.mock("@/lib/templates/compare-data", () => ({
  loadTemplateCompareRows: mocks.loadRows,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const TEMPLATE_ID = "30000000-0000-4000-8000-000000000001";
const KEY_ID = "50000000-0000-4000-8000-000000000001";

const summary = {
  template: {
    id: TEMPLATE_ID,
    name: "Benchmark A",
    description: "",
    schema_revision: 2,
    archived_at: null,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
  },
  fieldCount: 1,
  keyCount: 1,
  experimentCount: 2,
};

const draft = {
  templateId: TEMPLATE_ID,
  name: "Benchmark A",
  description: "",
  schemaRevision: 2,
  fields: [{
    id: "f1",
    label: "Metrics",
    colorToken: "blue",
    position: 1,
    archived: false,
    keys: [{
      id: KEY_ID,
      key: "pass@1",
      valueType: "number",
      required: false,
      position: 1,
      archived: false,
      options: [],
      valueCount: 0,
    }],
  }],
};

function row(id: string, number: number | null, archived = false): CompareRow {
  return {
    experimentId: id,
    experimentNo: Number(id.slice(-1)),
    name: `run-${id.slice(-1)}`,
    taskTitle: "Optimize conv2d",
    ownerName: null,
    status: "analyzing",
    archivedAt: archived ? "2026-07-31T00:00:00.000Z" : null,
    values: new Map([[KEY_ID, {
      value: number === null ? null : { kind: "number", number },
      cellRevision: 1,
    }]]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([summary]);
  mocks.loadDraft.mockResolvedValue(draft);
  mocks.loadRows.mockResolvedValue([
    row("60000000-0000-4000-8000-000000000001", 0.8),
    row("60000000-0000-4000-8000-000000000002", 0.9),
  ]);
});

afterEach(cleanup);

describe("TemplateExperimentCompare", () => {
  it("renders a two-level header and typed cells for a selected Template", async () => {
    render(<TemplateExperimentCompare initialState={null} />);
    await screen.findByText("Benchmark A");
    fireEvent.change(screen.getByLabelText("Template"), {
      target: { value: TEMPLATE_ID },
    });
    await screen.findByText("pass@1");
    expect(screen.getByText("Metrics")).not.toBeNull();
    expect(screen.getByText("0.8")).not.toBeNull();
  });

  it("pins a Baseline and highlights differing cells with a neutral Delta", async () => {
    render(<TemplateExperimentCompare initialState={null} />);
    await screen.findByText("Benchmark A");
    fireEvent.change(screen.getByLabelText("Template"), {
      target: { value: TEMPLATE_ID },
    });
    await screen.findByText("pass@1");
    fireEvent.change(screen.getByLabelText("Baseline"), {
      target: { value: "60000000-0000-4000-8000-000000000001" },
    });
    expect(await screen.findByText("Baseline: run-1")).not.toBeNull();
    expect(screen.getByText("+0.1")).not.toBeNull();
  });
});
