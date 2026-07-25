import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Experiment, Member } from "@/lib/types";
import type { ExperimentBundle } from "@/lib/experiments/repository";
import ExperimentDetail from "@/components/experiments/ExperimentDetail";
import {
  loadExperimentBundle,
  updateExperiment,
  watchExperiment,
} from "@/lib/experiments/repository";

const testState = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  experimentChanged: undefined as (() => void) | undefined,
  relatedChanged: undefined as (() => void) | undefined,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: testState.push,
    refresh: testState.refresh,
  }),
}));

vi.mock("@/lib/experiments/repository", () => ({
  deleteExperiment: vi.fn(),
  loadExperimentBundle: vi.fn(),
  updateExperiment: vi.fn(),
  watchExperiment: vi.fn((_id, onExperimentChange, onRelatedChange) => {
    testState.experimentChanged = onExperimentChange;
    testState.relatedChanged = onRelatedChange;
    return vi.fn();
  }),
}));

vi.mock("@/components/MarkdownField", () => ({
  default: ({
    onEditingChange,
  }: {
    onEditingChange?: (editing: boolean) => void;
  }) => (
    <button type="button" onClick={() => onEditingChange?.(true)}>
      Begin Note Markdown
    </button>
  ),
}));
vi.mock("@/components/experiments/AttachmentGallery", () => ({
  default: ({ onChanged }: { onChanged: () => void }) => (
    <button type="button" onClick={onChanged}>Refresh attachments</button>
  ),
}));
vi.mock("@/components/experiments/BaselinePicker", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/BaselineSummary", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/ConfigEditor", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/DataEditor", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/DecisionEditor", () => ({
  default: ({
    onEditingChange,
  }: {
    onEditingChange?: (editing: boolean) => void;
  }) => (
    <button type="button" onClick={() => onEditingChange?.(true)}>
      Begin Decision Markdown
    </button>
  ),
}));
vi.mock("@/components/experiments/DuplicateExperimentDialog", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/EnvironmentEditor", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/ExperimentSection", () => ({
  default: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  ),
}));
vi.mock("@/components/experiments/ExperimentStatusBadge", () => ({
  default: ({ status }: { status: string }) => <span>{status}</span>,
}));
vi.mock("@/components/experiments/ExperimentTimeline", () => ({
  default: ({ onChanged }: { onChanged: () => void }) => (
    <button type="button" onClick={onChanged}>Refresh timeline</button>
  ),
}));
vi.mock("@/components/experiments/ObjectEditor", () => ({
  default: () => null,
}));
vi.mock("@/components/experiments/ResultEditor", () => ({
  default: () => null,
}));

const member = {
  id: "00000000-0000-4000-8000-000000000020",
  name: "Bruce",
  initials: "BX",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
} satisfies Member;

function experiment(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    experiment_no: 9,
    task_id: "00000000-0000-4000-8000-000000000010",
    owner_id: member.id,
    name: "Source run",
    status: "planned",
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
    result_summary: "",
    decision_outcome: null,
    decision_notes: "",
    notes: "",
    position: 0,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-24T00:00:00.000Z",
    updated_at: "2026-07-24T01:00:00.000Z",
    ...overrides,
  };
}

function bundle(current: Experiment): ExperimentBundle {
  return {
    experiment: current,
    task: {
      id: current.task_id,
      title: "Optimize conv2d",
    },
    owner: current.owner_id ? member : null,
    baseline: null,
    members: [member],
    candidates: [],
    attachments: [],
    activity: [],
  };
}

describe("ExperimentDetail orchestration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    testState.experimentChanged = undefined;
    testState.relatedChanged = undefined;
  });
  afterEach(cleanup);

  it("shows a real load error and retries the bundle request", async () => {
    vi.mocked(loadExperimentBundle)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(bundle(experiment()));

    render(<ExperimentDetail id={experiment().id} />);

    expect(await screen.findByText(/Could not load the experiment.*offline/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByDisplayValue("Source run")).toBeDefined();
    expect(loadExperimentBundle).toHaveBeenCalledTimes(2);
  });

  it("requires Owner and saves against the previously loaded updated_at", async () => {
    const current = experiment({ owner_id: null });
    vi.mocked(loadExperimentBundle).mockResolvedValue(bundle(current));
    vi.mocked(updateExperiment).mockResolvedValue({
      ok: true,
      experiment: experiment({
        name: "Edited",
        updated_at: "2026-07-24T02:00:00.000Z",
      }),
    });
    render(<ExperimentDetail id={current.id} />);

    fireEvent.change(await screen.findByLabelText("Experiment Name"), {
      target: { value: "Edited" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Experiment Owner is required.")).toBeDefined();
    expect(updateExperiment).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Experiment Owner"), {
      target: { value: member.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateExperiment).toHaveBeenCalledWith(
      current.id,
      current.updated_at,
      expect.objectContaining({
        name: "Edited",
        owner_id: member.id,
      }),
    ));
  });

  it("preserves a dirty draft when realtime reports a remote change", async () => {
    const current = experiment();
    const remote = experiment({
      name: "Remote name",
      updated_at: "2026-07-24T02:00:00.000Z",
    });
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockResolvedValue(bundle(remote));
    render(<ExperimentDetail id={current.id} />);

    const name = await screen.findByLabelText("Experiment Name");
    fireEvent.change(name, { target: { value: "Local name" } });
    await act(async () => testState.experimentChanged?.());

    expect((name as HTMLInputElement).value).toBe("Local name");
    expect(screen.getByText("This experiment changed remotely.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Keep editing / refresh comparison" }))
      .toBeDefined();
  });

  it("preserves a dirty draft when the experiment is deleted remotely", async () => {
    const current = experiment();
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockResolvedValueOnce(null);
    render(<ExperimentDetail id={current.id} />);

    const name = await screen.findByLabelText("Experiment Name");
    fireEvent.change(name, { target: { value: "Local name" } });
    await act(async () => testState.experimentChanged?.());

    expect((screen.getByLabelText("Experiment Name") as HTMLInputElement).value)
      .toBe("Local name");
    expect(screen.getByText("This experiment was deleted remotely.")).toBeDefined();
  });

  it("treats active Markdown as local editing during realtime reconciliation", async () => {
    const current = experiment();
    const remote = experiment({
      name: "Remote name",
      updated_at: "2026-07-24T02:00:00.000Z",
    });
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockResolvedValue(bundle(remote));
    render(<ExperimentDetail id={current.id} />);

    await screen.findByLabelText("Experiment Name");
    fireEvent.click(screen.getByRole("button", { name: "Begin Note Markdown" }));
    await act(async () => testState.experimentChanged?.());

    expect((screen.getByLabelText("Experiment Name") as HTMLInputElement).value)
      .toBe("Source run");
    expect(screen.getByText("This experiment changed remotely.")).toBeDefined();
  });

  it("refreshes attachments without replacing an editable draft", async () => {
    const current = experiment();
    const remote = experiment({
      name: "Remote name",
      updated_at: "2026-07-24T02:00:00.000Z",
    });
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockResolvedValue(bundle(remote));
    render(<ExperimentDetail id={current.id} />);

    const name = await screen.findByLabelText("Experiment Name");
    fireEvent.change(name, { target: { value: "Local name" } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh attachments" }));

    await waitFor(() => expect(loadExperimentBundle).toHaveBeenCalledTimes(2));
    expect((name as HTMLInputElement).value).toBe("Local name");
    expect(screen.queryByText("This experiment changed remotely.")).toBeNull();
    expect(watchExperiment).toHaveBeenCalledWith(
      current.id,
      expect.any(Function),
      expect.any(Function),
    );
  });
});
