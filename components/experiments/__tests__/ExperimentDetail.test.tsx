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
import type {
  ExperimentBundle,
  ExperimentUpdateResult,
} from "@/lib/experiments/repository";
import ExperimentDetail from "@/components/experiments/ExperimentDetail";
import {
  deleteExperiment,
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

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
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

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

  it("preserves edits made while save is pending and advances the server snapshot", async () => {
    const current = experiment();
    const firstSaved = experiment({
      name: "First",
      updated_at: "2026-07-24T02:00:00.000Z",
    });
    const secondSaved = experiment({
      name: "Second",
      updated_at: "2026-07-24T03:00:00.000Z",
    });
    const firstSave = deferred<ExperimentUpdateResult>();
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockResolvedValueOnce(bundle(firstSaved))
      .mockResolvedValue(bundle(secondSaved));
    vi.mocked(updateExperiment)
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValueOnce({
        ok: true,
        experiment: secondSaved,
      });
    render(<ExperimentDetail id={current.id} />);

    const name = await screen.findByLabelText("Experiment Name");
    fireEvent.change(name, { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateExperiment).toHaveBeenCalledTimes(1));
    fireEvent.change(name, { target: { value: "Second" } });

    await act(async () => {
      firstSave.resolve({
        ok: true,
        experiment: firstSaved,
      });
    });

    expect((screen.getByLabelText("Experiment Name") as HTMLInputElement).value)
      .toBe("Second");
    expect(screen.getByText("Unsaved changes")).toBeDefined();
    expect(screen.queryByText("This experiment changed remotely.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateExperiment).toHaveBeenNthCalledWith(
      2,
      current.id,
      "2026-07-24T02:00:00.000Z",
      expect.objectContaining({ name: "Second" }),
    ));
  });

  it("retries failed post-save authority without conflicting on the committed revision", async () => {
    const current = experiment();
    const firstSaved = experiment({
      name: "First",
      updated_at: "2026-07-24T02:00:00.000Z",
    });
    const secondSaved = experiment({
      name: "Second",
      updated_at: "2026-07-24T03:00:00.000Z",
    });
    const firstSave = deferred<ExperimentUpdateResult>();
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockRejectedValueOnce(new Error("authority unavailable"))
      .mockResolvedValueOnce(bundle(firstSaved))
      .mockResolvedValue(bundle(secondSaved));
    vi.mocked(updateExperiment)
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValueOnce({ ok: true, experiment: secondSaved });
    render(<ExperimentDetail id={current.id} />);

    const name = await screen.findByLabelText("Experiment Name");
    fireEvent.change(name, { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateExperiment).toHaveBeenCalledTimes(1));
    fireEvent.change(name, { target: { value: "Second" } });
    await act(async () => {
      firstSave.resolve({ ok: true, experiment: firstSaved });
    });

    expect(await screen.findByText(/authority unavailable/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(loadExperimentBundle).toHaveBeenCalledTimes(3));
    expect((screen.getByLabelText("Experiment Name") as HTMLInputElement).value)
      .toBe("Second");
    expect(screen.queryByText("This experiment changed remotely.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateExperiment).toHaveBeenNthCalledWith(
      2,
      current.id,
      firstSaved.updated_at,
      expect.objectContaining({ name: "Second" }),
    ));
  });

  it("does not conflict when generic realtime overtakes post-save authority with the committed revision", async () => {
    const current = experiment();
    const firstSaved = experiment({
      name: "First",
      updated_at: "2026-07-24T02:00:00.000Z",
    });
    const secondSaved = experiment({
      name: "Second",
      updated_at: "2026-07-24T03:00:00.000Z",
    });
    const firstSave = deferred<ExperimentUpdateResult>();
    const postSaveAuthority = deferred<ExperimentBundle | null>();
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockReturnValueOnce(postSaveAuthority.promise)
      .mockResolvedValueOnce(bundle(firstSaved))
      .mockResolvedValue(bundle(secondSaved));
    vi.mocked(updateExperiment)
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValueOnce({ ok: true, experiment: secondSaved });
    render(<ExperimentDetail id={current.id} />);

    const name = await screen.findByLabelText("Experiment Name");
    fireEvent.change(name, { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateExperiment).toHaveBeenCalledTimes(1));
    fireEvent.change(name, { target: { value: "Second" } });
    await act(async () => {
      firstSave.resolve({ ok: true, experiment: firstSaved });
    });
    await waitFor(() => expect(loadExperimentBundle).toHaveBeenCalledTimes(2));
    await act(async () => testState.experimentChanged?.());

    expect((screen.getByLabelText("Experiment Name") as HTMLInputElement).value)
      .toBe("Second");
    expect(screen.queryByText("This experiment changed remotely.")).toBeNull();
    await act(async () => postSaveAuthority.resolve(bundle(firstSaved)));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateExperiment).toHaveBeenNthCalledWith(
      2,
      current.id,
      firstSaved.updated_at,
      expect.objectContaining({ name: "Second" }),
    ));
  });

  it("lets a newer realtime snapshot establish state before initial load resolves", async () => {
    const initial = deferred<ExperimentBundle | null>();
    const realtime = deferred<ExperimentBundle | null>();
    vi.mocked(loadExperimentBundle)
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(realtime.promise);
    render(<ExperimentDetail id={experiment().id} />);

    act(() => testState.experimentChanged?.());
    await act(async () => {
      realtime.resolve(bundle(experiment({
        name: "Realtime newer",
        updated_at: "2026-07-24T02:00:00.000Z",
      })));
    });
    expect(await screen.findByDisplayValue("Realtime newer")).toBeDefined();

    await act(async () => {
      initial.resolve(bundle(experiment({ name: "Initial older" })));
    });
    expect((screen.getByLabelText("Experiment Name") as HTMLInputElement).value)
      .toBe("Realtime newer");
  });

  it("does not regress a newer conflict snapshot with an older realtime response", async () => {
    const current = experiment();
    const olderRealtime = deferred<ExperimentBundle | null>();
    const newerConflict = deferred<ExperimentBundle | null>();
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockResolvedValueOnce(bundle(experiment({
        name: "First conflict",
        updated_at: "2026-07-24T02:00:00.000Z",
      })))
      .mockReturnValueOnce(olderRealtime.promise)
      .mockReturnValueOnce(newerConflict.promise);
    render(<ExperimentDetail id={current.id} />);

    fireEvent.change(await screen.findByLabelText("Experiment Name"), {
      target: { value: "Local" },
    });
    act(() => testState.experimentChanged?.());
    expect(await screen.findByText(/Remote: First conflict/)).toBeDefined();
    act(() => testState.experimentChanged?.());
    fireEvent.click(screen.getByRole("button", {
      name: "Keep editing / refresh comparison",
    }));
    await act(async () => {
      newerConflict.resolve(bundle(experiment({
        name: "Newer conflict",
        updated_at: "2026-07-24T04:00:00.000Z",
      })));
    });
    expect(await screen.findByText(/Remote: Newer conflict/)).toBeDefined();

    await act(async () => {
      olderRealtime.resolve(bundle(experiment({
        name: "Older realtime",
        updated_at: "2026-07-24T03:00:00.000Z",
      })));
    });
    expect(screen.getByText(/Remote: Newer conflict/)).toBeDefined();
    expect(screen.queryByText(/Remote: Older realtime/)).toBeNull();
  });

  it("ignores a stale initial error after realtime accepted a snapshot", async () => {
    const initial = deferred<ExperimentBundle | null>();
    vi.mocked(loadExperimentBundle)
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce(bundle(experiment({
        name: "Realtime accepted",
        updated_at: "2026-07-24T02:00:00.000Z",
      })));
    render(<ExperimentDetail id={experiment().id} />);

    act(() => testState.experimentChanged?.());
    expect(await screen.findByDisplayValue("Realtime accepted")).toBeDefined();
    await act(async () => {
      initial.reject(new Error("stale initial failure"));
    });

    expect(screen.queryByText(/stale initial failure/)).toBeNull();
    expect(screen.getByDisplayValue("Realtime accepted")).toBeDefined();
  });

  it("accepts an older pending initial success after a newer realtime read fails", async () => {
    const initial = deferred<ExperimentBundle | null>();
    const realtime = deferred<ExperimentBundle | null>();
    vi.mocked(loadExperimentBundle)
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(realtime.promise);
    render(<ExperimentDetail id={experiment().id} />);

    act(() => testState.experimentChanged?.());
    await act(async () => {
      realtime.reject(new Error("newer realtime failure"));
    });
    await act(async () => {
      initial.resolve(bundle(experiment({ name: "Initial usable" })));
    });

    expect(await screen.findByDisplayValue("Initial usable")).toBeDefined();
    expect(screen.queryByText(/newer realtime failure/)).toBeNull();
  });

  it("invalidates a pre-save realtime read after save succeeds", async () => {
    const current = experiment();
    const saved = experiment({
      name: "Saved",
      updated_at: "2026-07-24T03:00:00.000Z",
    });
    const staleRealtime = deferred<ExperimentBundle | null>();
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockReturnValueOnce(staleRealtime.promise)
      .mockResolvedValue(bundle(saved));
    vi.mocked(updateExperiment).mockResolvedValue({
      ok: true,
      experiment: saved,
    });
    render(<ExperimentDetail id={current.id} />);

    fireEvent.change(await screen.findByLabelText("Experiment Name"), {
      target: { value: "Saved" },
    });
    act(() => testState.experimentChanged?.());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/Saved · updated/)).toBeDefined();

    await act(async () => {
      staleRealtime.resolve(bundle(experiment({
        name: "Pre-save remote",
        updated_at: "2026-07-24T02:00:00.000Z",
      })));
    });
    expect((screen.getByLabelText("Experiment Name") as HTMLInputElement).value)
      .toBe("Saved");
    expect(screen.queryByText("This experiment changed remotely.")).toBeNull();
  });

  it("keeps an observed remote deletion visible until post-save authority resolves", async () => {
    const current = experiment();
    const saved = experiment({
      name: "Saved",
      updated_at: "2026-07-24T02:00:00.000Z",
    });
    const saveRequest = deferred<ExperimentUpdateResult>();
    const postSaveAuthority = deferred<ExperimentBundle | null>();
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockResolvedValueOnce(null)
      .mockReturnValueOnce(postSaveAuthority.promise);
    vi.mocked(updateExperiment).mockReturnValue(saveRequest.promise);
    render(<ExperimentDetail id={current.id} />);

    fireEvent.change(await screen.findByLabelText("Experiment Name"), {
      target: { value: "Saved" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateExperiment).toHaveBeenCalledTimes(1));
    await act(async () => testState.experimentChanged?.());
    expect(screen.getByText("This experiment was deleted remotely.")).toBeDefined();

    await act(async () => {
      saveRequest.resolve({ ok: true, experiment: saved });
    });
    await waitFor(() => expect(loadExperimentBundle).toHaveBeenCalledTimes(3));
    const deletionStayedVisible = Boolean(screen.queryByText(
      "This experiment was deleted remotely.",
    ));
    await act(async () => postSaveAuthority.resolve(null));

    expect(deletionStayedVisible).toBe(true);
    expect(await screen.findByText(
      "Experiment not found. It may have been deleted.",
    )).toBeDefined();
  });

  it("preserves a later edit and reports newer post-save authority as a conflict", async () => {
    const current = experiment();
    const saved = experiment({
      name: "Submitted",
      updated_at: "2026-07-24T02:00:00.000Z",
    });
    const newer = experiment({
      name: "Remote v3",
      updated_at: "2026-07-24T03:00:00.000Z",
    });
    const saveRequest = deferred<ExperimentUpdateResult>();
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockResolvedValueOnce(bundle(newer));
    vi.mocked(updateExperiment).mockReturnValue(saveRequest.promise);
    render(<ExperimentDetail id={current.id} />);

    const name = await screen.findByLabelText("Experiment Name");
    fireEvent.change(name, { target: { value: "Submitted" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateExperiment).toHaveBeenCalledTimes(1));
    fireEvent.change(name, { target: { value: "Later local edit" } });
    await act(async () => {
      saveRequest.resolve({ ok: true, experiment: saved });
    });

    expect((screen.getByLabelText("Experiment Name") as HTMLInputElement).value)
      .toBe("Later local edit");
    expect(screen.getByText("Unsaved changes")).toBeDefined();
    expect(await screen.findByText(/Remote: Remote v3/)).toBeDefined();
  });

  it("preserves a later edit when post-save authority reports deletion", async () => {
    const current = experiment();
    const saved = experiment({
      name: "Submitted",
      updated_at: "2026-07-24T02:00:00.000Z",
    });
    const saveRequest = deferred<ExperimentUpdateResult>();
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockResolvedValueOnce(null);
    vi.mocked(updateExperiment).mockReturnValue(saveRequest.promise);
    render(<ExperimentDetail id={current.id} />);

    const name = await screen.findByLabelText("Experiment Name");
    fireEvent.change(name, { target: { value: "Submitted" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateExperiment).toHaveBeenCalledTimes(1));
    fireEvent.change(name, { target: { value: "Later local edit" } });
    await act(async () => {
      saveRequest.resolve({ ok: true, experiment: saved });
    });

    expect((screen.getByLabelText("Experiment Name") as HTMLInputElement).value)
      .toBe("Later local edit");
    expect(screen.getByText("Unsaved changes")).toBeDefined();
    expect(screen.getByText("This experiment was deleted remotely.")).toBeDefined();
  });

  it("adopts a newer remote snapshot observed before the save response", async () => {
    const current = experiment();
    const saved = experiment({
      name: "Saved response",
      updated_at: "2026-07-24T02:00:00.000Z",
    });
    const newer = experiment({
      name: "Remote v3",
      updated_at: "2026-07-24T03:00:00.000Z",
    });
    const saveRequest = deferred<ExperimentUpdateResult>();
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockResolvedValueOnce(bundle(newer))
      .mockResolvedValueOnce(bundle(newer));
    vi.mocked(updateExperiment).mockReturnValue(saveRequest.promise);
    render(<ExperimentDetail id={current.id} />);

    fireEvent.change(await screen.findByLabelText("Experiment Name"), {
      target: { value: "Saved response" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateExperiment).toHaveBeenCalledTimes(1));
    await act(async () => testState.experimentChanged?.());
    await act(async () => {
      saveRequest.resolve({ ok: true, experiment: saved });
    });

    expect(await screen.findByDisplayValue("Remote v3")).toBeDefined();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("reconciles a deletion whose pre-save read resolves after the save response", async () => {
    const current = experiment();
    const saved = experiment({
      name: "Saved response",
      updated_at: "2026-07-24T02:00:00.000Z",
    });
    const pendingPreSave = deferred<ExperimentBundle | null>();
    const saveRequest = deferred<ExperimentUpdateResult>();
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockReturnValueOnce(pendingPreSave.promise)
      .mockResolvedValueOnce(null);
    vi.mocked(updateExperiment).mockReturnValue(saveRequest.promise);
    render(<ExperimentDetail id={current.id} />);

    fireEvent.change(await screen.findByLabelText("Experiment Name"), {
      target: { value: "Saved response" },
    });
    act(() => testState.experimentChanged?.());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await act(async () => {
      saveRequest.resolve({ ok: true, experiment: saved });
    });
    await waitFor(() => expect(loadExperimentBundle).toHaveBeenCalledTimes(3));
    await act(async () => pendingPreSave.resolve(null));

    expect(await screen.findByText(
      "Experiment not found. It may have been deleted.",
    )).toBeDefined();
  });

  it("reconciles a newer snapshot whose pre-save read resolves after the save response", async () => {
    const current = experiment();
    const saved = experiment({
      name: "Saved response",
      updated_at: "2026-07-24T02:00:00.000Z",
    });
    const newer = experiment({
      name: "Remote v3",
      updated_at: "2026-07-24T03:00:00.000Z",
    });
    const pendingPreSave = deferred<ExperimentBundle | null>();
    const saveRequest = deferred<ExperimentUpdateResult>();
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockReturnValueOnce(pendingPreSave.promise)
      .mockResolvedValueOnce(bundle(newer));
    vi.mocked(updateExperiment).mockReturnValue(saveRequest.promise);
    render(<ExperimentDetail id={current.id} />);

    fireEvent.change(await screen.findByLabelText("Experiment Name"), {
      target: { value: "Saved response" },
    });
    act(() => testState.experimentChanged?.());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await act(async () => {
      saveRequest.resolve({ ok: true, experiment: saved });
    });
    await waitFor(() => expect(loadExperimentBundle).toHaveBeenCalledTimes(3));
    await act(async () => pendingPreSave.resolve(bundle(newer)));

    expect(await screen.findByDisplayValue("Remote v3")).toBeDefined();
    expect(screen.queryByText("This experiment changed remotely.")).toBeNull();
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

  it("loads fresh authority when accepting a conflict and sees a pending deletion", async () => {
    const current = experiment();
    const displayedConflict = experiment({
      name: "Displayed conflict",
      updated_at: "2026-07-24T02:00:00.000Z",
    });
    const pendingDeletion = deferred<ExperimentBundle | null>();
    const freshAuthority = deferred<ExperimentBundle | null>();
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockResolvedValueOnce(bundle(displayedConflict))
      .mockReturnValueOnce(pendingDeletion.promise)
      .mockReturnValueOnce(freshAuthority.promise);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ExperimentDetail id={current.id} />);

    fireEvent.change(await screen.findByLabelText("Experiment Name"), {
      target: { value: "Local draft" },
    });
    await act(async () => testState.experimentChanged?.());
    expect(await screen.findByText(/Remote: Displayed conflict/)).toBeDefined();
    act(() => testState.experimentChanged?.());
    fireEvent.click(screen.getByRole("button", { name: "Load latest" }));
    await waitFor(() => expect(loadExperimentBundle).toHaveBeenCalledTimes(4));
    expect(screen.getByRole("link", { name: "Compare" })
      .getAttribute("aria-disabled")).toBe("true");
    await act(async () => freshAuthority.resolve(null));
    await act(async () => pendingDeletion.resolve(null));

    expect(await screen.findByText(
      "Experiment not found. It may have been deleted.",
    )).toBeDefined();
  });

  it("preserves an edit during Load latest when authority confirms the displayed revision", async () => {
    const current = experiment();
    const displayedConflict = experiment({
      name: "Displayed conflict",
      updated_at: "2026-07-24T02:00:00.000Z",
    });
    const savedEdit = experiment({
      name: "Edit during reload",
      updated_at: "2026-07-24T03:00:00.000Z",
    });
    const freshAuthority = deferred<ExperimentBundle | null>();
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(current))
      .mockResolvedValueOnce(bundle(displayedConflict))
      .mockReturnValueOnce(freshAuthority.promise)
      .mockResolvedValue(bundle(savedEdit));
    vi.mocked(updateExperiment).mockResolvedValue({
      ok: true,
      experiment: savedEdit,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ExperimentDetail id={current.id} />);

    const name = await screen.findByLabelText("Experiment Name");
    fireEvent.change(name, { target: { value: "Original local draft" } });
    await act(async () => testState.experimentChanged?.());
    fireEvent.click(screen.getByRole("button", { name: "Load latest" }));
    await waitFor(() => expect(loadExperimentBundle).toHaveBeenCalledTimes(3));
    fireEvent.change(name, { target: { value: "Edit during reload" } });
    await act(async () => freshAuthority.resolve(bundle(displayedConflict)));

    expect((screen.getByLabelText("Experiment Name") as HTMLInputElement).value)
      .toBe("Edit during reload");
    expect(screen.getByText("Unsaved changes")).toBeDefined();
    expect(screen.queryByText("This experiment changed remotely.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateExperiment).toHaveBeenCalledWith(
      current.id,
      displayedConflict.updated_at,
      expect.objectContaining({ name: "Edit during reload" }),
    ));
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

  it("does not start delete while save is pending", async () => {
    const saveRequest = deferred<ExperimentUpdateResult>();
    vi.mocked(loadExperimentBundle).mockResolvedValue(bundle(experiment()));
    vi.mocked(updateExperiment).mockReturnValue(saveRequest.promise);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ExperimentDetail id={experiment().id} />);

    fireEvent.change(await screen.findByLabelText("Experiment Name"), {
      target: { value: "Saving" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateExperiment).toHaveBeenCalledTimes(1));
    const deleteButton = screen.getByRole("button", { name: "Delete" });
    expect((deleteButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(deleteButton);
    expect(deleteExperiment).not.toHaveBeenCalled();

    await act(async () => {
      saveRequest.resolve({
        ok: true,
        experiment: experiment({
          name: "Saving",
          updated_at: "2026-07-24T02:00:00.000Z",
        }),
      });
    });
  });

  it("does not start save while delete is pending", async () => {
    const deleteRequest = deferred<void>();
    vi.mocked(loadExperimentBundle).mockResolvedValue(bundle(experiment()));
    vi.mocked(deleteExperiment).mockReturnValue(deleteRequest.promise);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ExperimentDetail id={experiment().id} />);

    fireEvent.change(await screen.findByLabelText("Experiment Name"), {
      target: { value: "Dirty before delete" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteExperiment).toHaveBeenCalledTimes(1));
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(saveButton);
    expect(updateExperiment).not.toHaveBeenCalled();

    await act(async () => deleteRequest.resolve());
  });

  it("shows a Storage cleanup error after realtime switches to not-found", async () => {
    const deleteRequest = deferred<void>();
    vi.mocked(loadExperimentBundle)
      .mockResolvedValueOnce(bundle(experiment()))
      .mockResolvedValueOnce(null);
    vi.mocked(deleteExperiment).mockReturnValue(deleteRequest.promise);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ExperimentDetail id={experiment().id} />);

    await screen.findByLabelText("Experiment Name");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    act(() => testState.experimentChanged?.());
    expect(await screen.findByText("Experiment not found. It may have been deleted."))
      .toBeDefined();
    await act(async () => {
      deleteRequest.reject(new Error(
        "Experiment was deleted, but Storage cleanup failed: denied",
      ));
    });

    expect(await screen.findByText(
      /Experiment was deleted, but Storage cleanup failed: denied/,
    )).toBeDefined();
  });
});
