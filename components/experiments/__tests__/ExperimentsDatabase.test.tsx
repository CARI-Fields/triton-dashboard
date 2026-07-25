import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Experiment, ExperimentListRow, Member, Task } from "@/lib/types";
import ExperimentsDatabase from "@/components/experiments/ExperimentsDatabase";
import {
  createExperiment,
  listExperimentRows,
  loadExperimentReferenceData,
  watchExperimentIndex,
} from "@/lib/experiments/repository";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock("@/lib/experiments/repository", () => ({
  createExperiment: vi.fn(),
  listExperimentRows: vi.fn(),
  loadExperimentReferenceData: vi.fn(),
  watchExperimentIndex: vi.fn(),
}));

const task = {
  id: "00000000-0000-4000-8000-000000000010",
  module_id: "00000000-0000-4000-8000-000000000011",
  title: "Optimize conv2d",
  status: "in_progress",
  assignees: [],
  notes: "",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T00:00:00.000Z",
} satisfies Task;

const member = {
  id: "00000000-0000-4000-8000-000000000020",
  name: "Bruce",
  initials: "BX",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
} satisfies Member;

function row(id: string, experimentNo: number, name: string): ExperimentListRow {
  return {
    id,
    experiment_no: experimentNo,
    task_id: task.id,
    owner_id: member.id,
    name,
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
    position: experimentNo,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-24T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
    task: { id: task.id, title: task.title },
    owner: member,
  };
}

const first = row("00000000-0000-4000-8000-000000000001", 1, "Guardrail run");
const second = row("00000000-0000-4000-8000-000000000002", 2, "Baseline run");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

describe("ExperimentsDatabase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listExperimentRows).mockResolvedValue([first, second]);
    vi.mocked(loadExperimentReferenceData).mockResolvedValue({
      tasks: [task],
      members: [member],
    });
  });

  afterEach(cleanup);

  it("loads repository rows, refreshes from Realtime, and unsubscribes", async () => {
    let refresh: () => void = () => undefined;
    const unsubscribe = vi.fn();
    vi.mocked(watchExperimentIndex).mockImplementation((onChange) => {
      refresh = onChange;
      return unsubscribe;
    });

    const { unmount } = render(<ExperimentsDatabase />);

    expect(screen.getByText("Loading experiments…")).toBeDefined();
    expect(await screen.findByRole("link", { name: "Guardrail run" })).toBeDefined();
    expect(listExperimentRows).toHaveBeenCalledTimes(1);
    expect(loadExperimentReferenceData).toHaveBeenCalledTimes(1);

    act(() => refresh());
    await waitFor(() => expect(listExperimentRows).toHaveBeenCalledTimes(2));
    expect(loadExperimentReferenceData).toHaveBeenCalledTimes(2);

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("ignores an older reload that resolves after a newer Realtime refresh", async () => {
    const olderRows = deferred<ExperimentListRow[]>();
    const olderReferences = deferred<{ tasks: Task[]; members: Member[] }>();
    let refresh: () => void = () => undefined;
    vi.mocked(listExperimentRows)
      .mockImplementationOnce(() => olderRows.promise)
      .mockResolvedValueOnce([second]);
    vi.mocked(loadExperimentReferenceData)
      .mockImplementationOnce(() => olderReferences.promise)
      .mockResolvedValueOnce({ tasks: [task], members: [member] });
    vi.mocked(watchExperimentIndex).mockImplementation((onChange) => {
      refresh = onChange;
      return () => undefined;
    });

    render(<ExperimentsDatabase />);
    act(() => refresh());
    expect(await screen.findByRole("link", { name: "Baseline run" })).toBeDefined();

    await act(async () => {
      olderRows.resolve([first]);
      olderReferences.resolve({ tasks: [task], members: [member] });
      await olderRows.promise;
    });

    expect(screen.queryByRole("link", { name: "Guardrail run" })).toBeNull();
    expect(screen.getByRole("link", { name: "Baseline run" })).toBeDefined();
  });

  it("ignores an older load error after a newer Realtime refresh succeeds", async () => {
    const olderRows = deferred<ExperimentListRow[]>();
    let refresh: () => void = () => undefined;
    vi.mocked(listExperimentRows)
      .mockImplementationOnce(() => olderRows.promise)
      .mockResolvedValueOnce([second]);
    vi.mocked(watchExperimentIndex).mockImplementation((onChange) => {
      refresh = onChange;
      return () => undefined;
    });

    render(<ExperimentsDatabase />);
    act(() => refresh());
    expect(await screen.findByRole("link", { name: "Baseline run" })).toBeDefined();
    await act(async () => {
      olderRows.reject(new Error("Stale load failed."));
      await Promise.resolve();
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "Baseline run" })).toBeDefined();
  });

  it("retries both loaders after a failure and recovers the database view", async () => {
    const retryRows = deferred<ExperimentListRow[]>();
    vi.mocked(listExperimentRows)
      .mockRejectedValueOnce(new Error("Database offline."))
      .mockImplementationOnce(() => retryRows.promise);
    vi.mocked(watchExperimentIndex).mockReturnValue(() => undefined);
    render(<ExperimentsDatabase />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load experiments.");
    expect(alert.textContent).toContain("Database offline.");
    const retry = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retry);
    expect((screen.getByRole("button", { name: "Retrying…" }) as HTMLButtonElement).disabled)
      .toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Retrying…" }));
    expect(listExperimentRows).toHaveBeenCalledTimes(2);
    expect(loadExperimentReferenceData).toHaveBeenCalledTimes(2);

    await act(async () => retryRows.resolve([first]));
    expect(await screen.findByRole("link", { name: "Guardrail run" })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("removes deleted experiments from the selected comparison set", async () => {
    let refresh: () => void = () => undefined;
    vi.mocked(watchExperimentIndex).mockImplementation((onChange) => {
      refresh = onChange;
      return () => undefined;
    });
    render(<ExperimentsDatabase />);
    await screen.findByRole("link", { name: "Guardrail run" });

    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0001" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0002" }));
    expect(screen.getByRole("link", { name: "Compare selected (2)" })).toBeDefined();

    vi.mocked(listExperimentRows).mockResolvedValueOnce([first]);
    act(() => refresh());
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "Baseline run" })).toBeNull();
    });

    const compare = screen.getByRole("link", { name: "Compare selected (1)" });
    expect(compare.getAttribute("aria-disabled")).toBe("true");
  });

  it("keeps Compare inert until two rows produce a canonical selection URL", async () => {
    vi.mocked(watchExperimentIndex).mockReturnValue(() => undefined);
    render(<ExperimentsDatabase />);
    await screen.findByRole("link", { name: "Guardrail run" });

    const compare = screen.getByRole("link", { name: "Compare selected (0)" });
    expect(compare.getAttribute("aria-disabled")).toBe("true");
    expect(compare.getAttribute("href")).toBe("/experiments");
    expect(fireEvent.click(compare)).toBe(false);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0001" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0002" }));

    const enabled = screen.getByRole("link", { name: "Compare selected (2)" });
    expect(enabled.getAttribute("aria-disabled")).toBe("false");
    expect(enabled.getAttribute("href")).toBe(
      `/experiments/compare?ids=${first.id}%2C${second.id}`,
    );
  });

  it("navigates to the real created experiment route", async () => {
    vi.mocked(watchExperimentIndex).mockReturnValue(() => undefined);
    vi.mocked(createExperiment).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000099",
    } as Experiment);
    render(<ExperimentsDatabase />);
    await screen.findByRole("link", { name: "Guardrail run" });

    fireEvent.click(screen.getByRole("button", { name: "New experiment" }));
    const dialog = within(screen.getByRole("dialog", { name: "Create experiment" }));
    fireEvent.change(dialog.getByLabelText("Experiment name"), {
      target: { value: "NPU guardrail run" },
    });
    fireEvent.change(dialog.getByLabelText("Task"), { target: { value: task.id } });
    fireEvent.change(dialog.getByLabelText("Owner"), { target: { value: member.id } });
    fireEvent.click(dialog.getByRole("button", { name: "Create experiment" }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith(
      "/experiments/00000000-0000-4000-8000-000000000099",
    ));
  });
});
