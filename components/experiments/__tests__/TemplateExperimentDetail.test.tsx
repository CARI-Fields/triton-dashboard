import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TemplateExperimentDetail from "@/components/experiments/TemplateExperimentDetail";

const mocks = vi.hoisted(() => ({
  loadBundle: vi.fn(),
  loadTemplateDraft: vi.fn(),
  loadValues: vi.fn(),
  saveValue: vi.fn(),
  saveCore: vi.fn(),
  archive: vi.fn(),
}));

vi.mock("@/lib/experiments/repository", () => ({
  loadExperimentBundle: mocks.loadBundle,
}));
vi.mock("@/lib/templates/repository", () => ({
  loadTemplateDraft: mocks.loadTemplateDraft,
}));
vi.mock("@/lib/experiments/values", () => ({
  loadExperimentValues: mocks.loadValues,
  saveValue: mocks.saveValue,
  saveExperimentCore: mocks.saveCore,
  archiveExperiment: mocks.archive,
  unarchiveExperiment: vi.fn(),
  createEditSessionId: () => "session-1",
  touchEditSession: (session: { id: string; lastMutationAt: number }) => session.id,
}));

const experiment = {
  id: "exp-1",
  experiment_no: 1,
  task_id: "task-1",
  owner_id: null,
  name: "Run one",
  status: "planned",
  baseline_experiment_id: null,
  template_id: "tpl-1",
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

const templateDraft = {
  templateId: "tpl-1",
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
      id: "k1",
      key: "pass@1",
      valueType: "number",
      required: true,
      position: 1,
      archived: false,
      options: [],
      valueCount: 0,
    }],
  }],
};

const bundle = {
  experiment,
  task: { id: "task-1", title: "Optimize conv2d" },
  owner: null,
  baseline: null,
  members: [],
  candidates: [],
  attachments: [],
  activity: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadBundle.mockResolvedValue(bundle);
  mocks.loadTemplateDraft.mockResolvedValue(templateDraft);
  mocks.loadValues.mockResolvedValue(new Map());
});

afterEach(cleanup);

describe("TemplateExperimentDetail", () => {
  it("renders the locked Template name and one Field Table per Field Label", async () => {
    render(<TemplateExperimentDetail id="exp-1" />);
    await screen.findByDisplayValue("Run one");
    expect(screen.getByText("Benchmark A")).not.toBeNull();
    expect(screen.getByText("Metrics")).not.toBeNull();
    expect(screen.getByText("pass@1")).not.toBeNull();
  });

  it("commits a Number Value on Enter and shows saved state", async () => {
    mocks.saveValue.mockResolvedValue({ status: "ok", cell_revision: 1, version_no: 2 });
    render(<TemplateExperimentDetail id="exp-1" />);
    await screen.findByText("pass@1");
    fireEvent.click(screen.getByLabelText("Value for pass@1"));
    fireEvent.change(screen.getByLabelText("Value for pass@1"), {
      target: { value: "0.73" },
    });
    fireEvent.keyDown(screen.getByLabelText("Value for pass@1"), { key: "Enter" });
    await waitFor(() => expect(mocks.saveValue).toHaveBeenCalled());
    expect((await screen.findAllByText("Saved just now")).length).toBeGreaterThan(0);
  });
});
