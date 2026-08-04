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
import { listTemplateSummaries } from "@/lib/templates/repository";

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

vi.mock("@/lib/templates/repository", () => ({
  listTemplateSummaries: vi.fn(),
}));

const TEMPLATE_ID = "30000000-0000-4000-8000-000000000001";

const templateSummary = {
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
  keyCount: 2,
  experimentCount: 24,
};

const task = {
  id: "00000000-0000-4000-8000-000000000010",
  module_id: "00000000-0000-4000-8000-000000000011",
  title: "Optimize conv2d",
  status: "in_progress",
  assignees: [],
  notes: "",
  tags: [],
  priority: "medium",
  due_date: null,
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
    template_id: null,
    archived_at: null,
    core_revision: 1,
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
    vi.mocked(watchExperimentIndex).mockReturnValue(() => undefined);
    vi.mocked(listTemplateSummaries).mockResolvedValue([templateSummary]);
  });

  afterEach(cleanup);

  it("renders the database PageHeader, exact saved views, and existing table columns", async () => {
    render(<ExperimentsDatabase />);

    const heading = await screen.findByRole("heading", { name: "Experiments" });
    expect(heading.closest(".page-header")).not.toBeNull();
    expect(screen.getByText("Research database")).toBeDefined();

    const savedViews = within(
      screen.getByLabelText("Experiment saved views"),
    ).getAllByRole("button");
    expect(savedViews.map((view) => view.textContent)).toEqual([
      "All",
      "Running",
      "Blocked",
    ]);
    expect(screen.getByRole("button", { name: "All" })
      .getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Archived" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Status" }))
      .toBeDefined();
    const region = screen.getByRole("region", {
      name: "Experiments table",
    });
    expect(region.tabIndex).toBe(0);
    const helpId = region.getAttribute("aria-describedby");
    expect(document.getElementById(helpId ?? "")?.textContent).toContain(
      "Scroll horizontally",
    );
  });

  it("shows the filtered result count in the compact toolbar", async () => {
    render(<ExperimentsDatabase />);
    await screen.findByRole("link", { name: "Guardrail run" });

    expect(screen.getByText("2 experiments")).toBeDefined();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search experiments" }),
      { target: { value: "Guardrail" } },
    );
    expect(screen.getByText("1 experiments")).toBeDefined();
  });

  it("loads repository rows, refreshes from Realtime, and unsubscribes", async () => {
    let refresh: () => void = () => undefined;
    const unsubscribe = vi.fn();
    vi.mocked(watchExperimentIndex).mockImplementation((onChange) => {
      refresh = onChange;
      return unsubscribe;
    });

    const { unmount } = render(<ExperimentsDatabase />);

    const skeleton = screen.getByRole("status", {
      name: "Loading Experiments",
    });
    expect(skeleton.classList).toContain("workspace-skeleton-table");
    expect(skeleton.querySelectorAll(".skeleton-table > i")).toHaveLength(7);
    expect(screen.queryByText("Loading experiments…")).toBeNull();
    expect(await screen.findByRole("link", { name: "Guardrail run" })).toBeDefined();
    expect(listExperimentRows).toHaveBeenCalledTimes(1);
    expect(loadExperimentReferenceData).toHaveBeenCalledTimes(1);

    act(() => refresh());
    await waitFor(() => expect(listExperimentRows).toHaveBeenCalledTimes(2));
    expect(loadExperimentReferenceData).toHaveBeenCalledTimes(2);

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("keeps the last successful table visible during a background refresh", async () => {
    const refreshRows = deferred<ExperimentListRow[]>();
    const refreshReferences = deferred<{ tasks: Task[]; members: Member[] }>();
    let refresh: () => void = () => undefined;
    vi.mocked(listExperimentRows)
      .mockResolvedValueOnce([first, second])
      .mockReturnValueOnce(refreshRows.promise);
    vi.mocked(loadExperimentReferenceData)
      .mockResolvedValueOnce({ tasks: [task], members: [member] })
      .mockReturnValueOnce(refreshReferences.promise);
    vi.mocked(watchExperimentIndex).mockImplementation((onChange) => {
      refresh = onChange;
      return () => undefined;
    });

    render(<ExperimentsDatabase />);
    await screen.findByRole("link", { name: "Guardrail run" });

    act(() => refresh());
    await waitFor(() => expect(listExperimentRows).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("link", { name: "Guardrail run" })).toBeDefined();
    expect(screen.queryByRole("status", {
      name: "Loading Experiments",
    })).toBeNull();

    await act(async () => {
      refreshRows.resolve([second]);
      refreshReferences.resolve({ tasks: [task], members: [member] });
      await Promise.all([refreshRows.promise, refreshReferences.promise]);
    });
    expect(screen.queryByRole("link", { name: "Guardrail run" })).toBeNull();
    expect(screen.getByRole("link", { name: "Baseline run" })).toBeDefined();
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

  it("navigates to the real created experiment route", async () => {
    vi.mocked(watchExperimentIndex).mockReturnValue(() => undefined);
    vi.mocked(createExperiment).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000099",
    } as Experiment);
    render(<ExperimentsDatabase />);
    await screen.findByRole("link", { name: "Guardrail run" });

    fireEvent.click(screen.getByRole("button", { name: "New experiment" }));
    const dialog = within(screen.getByRole("dialog", { name: "Create experiment" }));
    await screen.findByRole("option", { name: /Benchmark A/ });
    fireEvent.change(dialog.getByLabelText("Experiment template"), {
      target: { value: TEMPLATE_ID },
    });
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
