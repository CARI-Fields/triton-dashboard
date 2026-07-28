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
import type { ExperimentListRow } from "@/lib/types";
import ExperimentCompare from "@/components/experiments/ExperimentCompare";
import {
  listExperimentRows,
  watchExperimentIndex,
} from "@/lib/experiments/repository";

const routerReplace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

vi.mock("@/lib/experiments/repository", () => ({
  listExperimentRows: vi.fn(),
  watchExperimentIndex: vi.fn(),
}));

const taskId = "00000000-0000-4000-8000-000000000010";

function id(no: number): string {
  return `00000000-0000-4000-8000-${String(no).padStart(12, "0")}`;
}

function row(
  no: number,
  options: {
    decisionOutcome?: ExperimentListRow["decision_outcome"];
    device?: string;
    metrics?: Record<string, number>;
    model?: string;
    name?: string;
    resultSummary?: string;
  } = {},
): ExperimentListRow {
  return {
    id: id(no),
    experiment_no: no,
    task_id: taskId,
    owner_id: null,
    name: options.name ?? `run-${no}`,
    status: "analyzing",
    baseline_experiment_id: null,
    data_spec: {
      datasets: [{
        role: "evaluation",
        name: "dr-kernel-rl",
        split: "tier1",
        revision: "r1",
        task_count: 20,
        samples_per_task: 1,
      }],
    },
    object_spec: {
      model: options.model ?? "Qwen",
      harness: "candidate",
      parent_harness: "seed",
      prompt: "prompt.md",
      prompt_change: "",
      skills: [],
      tools: [],
    },
    environment_spec: {
      platform: "npu",
      server: "worker",
      devices: [options.device ?? "npu:0"],
      hardware: "Ascend910",
      evaluator: "grader",
      revision: "r1",
      precision_policy: "fp32",
    },
    config: { temperature: 0.1 },
    metrics: options.metrics ?? { "pass@1": no / 100 },
    featured_metric_keys: ["pass@1"],
    result_summary: options.resultSummary ?? "",
    decision_outcome: options.decisionOutcome ?? null,
    decision_notes: "",
    notes: "",
    position: no,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-24T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
    task: { id: taskId, title: "Optimize conv2d" },
    owner: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function selectedIdsFromLastNavigation(): string[] {
  const href = routerReplace.mock.lastCall?.[0] as string;
  const query = href.split("?")[1] ?? "";
  return (new URLSearchParams(query).get("ids") ?? "").split(",").filter(Boolean);
}

describe("ExperimentCompare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(watchExperimentIndex).mockReturnValue(() => undefined);
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });

  it("keeps experiments as rows, pins the Baseline first, and exposes the scrollable schema table", async () => {
    const current = row(2, { metrics: { "pass@1": 0.25 } });
    const baseline = row(1, { metrics: { "pass@1": 0.1 } });
    vi.mocked(listExperimentRows).mockResolvedValue([current, baseline]);

    render(
      <ExperimentCompare
        initialSelection={{
          ids: [current.id, baseline.id],
          baselineId: baseline.id,
        }}
      />,
    );

    const deltaHeader = await screen.findByRole("columnheader", { name: /Δ pass@1/ });
    expect(deltaHeader.classList.contains("neutral-delta")).toBe(true);
    const tableRows = screen.getAllByRole("row");
    expect(within(tableRows[1]).getByText("EXP-0001")).toBeDefined();
    expect(within(tableRows[2]).getByText("EXP-0002")).toBeDefined();
    expect(within(tableRows[1]).getByText("Baseline")).toBeDefined();
    expect(within(tableRows[2]).getByText("+0.15")).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /Dataset 1 Name/ }))
      .toBeDefined();
    expect(screen.queryByRole("rowheader", { name: /Dataset 1 Name/ }))
      .toBeNull();
    const experimentHeader = screen.getByRole("columnheader", {
      name: /Experiment/,
    });
    expect(experimentHeader.classList).toContain("compare-identity");
    expect(experimentHeader.classList).toContain("compare-experiment-column");
    expect(screen.getByRole("columnheader", { name: "Task" }).classList)
      .toContain("compare-task-column");
    expect(screen.getByRole("columnheader", { name: "Status" }).classList)
      .toContain("compare-status-column");
    const baselineIdentity = within(tableRows[1]).getByRole("rowheader");
    expect(baselineIdentity.getAttribute("scope")).toBe("row");
    expect(baselineIdentity.classList).toContain("compare-identity");
    expect(baselineIdentity.classList)
      .toContain("compare-experiment-column");
    expect(tableRows[1].children[1].classList).toContain("compare-task-column");
    expect(tableRows[1].children[2].classList).toContain("compare-status-column");
    expect(screen.getAllByRole("columnheader").every(
      (header) => header.getAttribute("scope") === "col",
    )).toBe(true);

    const scrollRegion = screen.getByRole("region", {
      name: "Experiment comparison table",
    });
    expect(scrollRegion.getAttribute("tabindex")).toBe("0");
    expect(scrollRegion.getAttribute("aria-describedby")).toBe("compare-table-help");
    const help = document.getElementById("compare-table-help");
    expect(help?.textContent).toBe(
      "Missing values are shown as —. Context fields are flattened from the Experiment schema; numeric Result deltas are current minus baseline.",
    );
  });

  it("renders the baseline-ordered selected strip as the only Remove control", async () => {
    const current = row(2);
    const baseline = row(1);
    vi.mocked(listExperimentRows).mockResolvedValue([current, baseline]);

    render(
      <ExperimentCompare
        initialSelection={{
          ids: [current.id, baseline.id],
          baselineId: baseline.id,
        }}
      />,
    );

    const selection = await screen.findByLabelText("Selected experiments");
    expect(within(selection).getByText("2 selected")).toBeDefined();
    const selectedItems = within(selection).getAllByRole("listitem");
    expect(selectedItems).toHaveLength(2);
    expect(within(selectedItems[0]).getByText(/EXP-0001 · run-1 · Baseline/))
      .toBeDefined();
    expect(within(selectedItems[1]).getByText(/EXP-0002 · run-2/)).toBeDefined();
    const removeButtons = screen.getAllByRole("button", { name: /Remove EXP-/ });
    expect(removeButtons).toHaveLength(2);
    expect(removeButtons.every((button) => selection.contains(button))).toBe(true);
  });

  it("uses a native field-group disclosure with an accessible group count", async () => {
    vi.mocked(listExperimentRows).mockResolvedValue([row(1)]);

    render(
      <ExperimentCompare
        initialSelection={{ ids: [id(1)], baselineId: null }}
      />,
    );

    await screen.findByText("EXP-0001");
    const summary = screen.getByText("Fields · 6 groups");
    expect(summary.tagName).toBe("SUMMARY");
    const disclosure = summary.parentElement;
    expect(disclosure?.tagName).toBe("DETAILS");
    expect(disclosure?.classList).toContain("field-groups");
    expect(disclosure?.querySelectorAll('input[type="checkbox"]')).toHaveLength(6);
  });

  it("copies the current Share URL, blocks duplicate copies, and resets after selection changes", async () => {
    const baseline = row(1);
    const current = row(2);
    const copy = deferred<void>();
    const writeText = vi.fn(() => copy.promise);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const href = `/experiments/compare?ids=${encodeURIComponent(
      `${baseline.id},${current.id}`,
    )}&baseline=${baseline.id}`;
    window.history.replaceState(null, "", href);
    vi.mocked(listExperimentRows).mockResolvedValue([baseline, current]);

    render(
      <ExperimentCompare
        initialSelection={{
          ids: [baseline.id, current.id],
          baselineId: baseline.id,
        }}
      />,
    );

    await screen.findByText("EXP-0001");
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    const copying = screen.getByRole("button", { name: "Copying…" });
    expect((copying as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(copying);
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(window.location.href);

    await act(async () => copy.resolve());
    expect(await screen.findByRole("button", { name: "Copied" })).toBeDefined();

    fireEvent.change(screen.getByRole("combobox", { name: "Compare Baseline" }), {
      target: { value: "" },
    });
    expect(await screen.findByRole("button", { name: "Share" })).toBeDefined();
  });

  it("ignores an old Share resolution after the Baseline changes", async () => {
    const baseline = row(1);
    const current = row(2);
    const copy = deferred<void>();
    const writeText = vi.fn(() => copy.promise);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(listExperimentRows).mockResolvedValue([baseline, current]);

    render(
      <ExperimentCompare
        initialSelection={{
          ids: [baseline.id, current.id],
          baselineId: baseline.id,
        }}
      />,
    );

    await screen.findByText("EXP-0001");
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(screen.getByRole("button", { name: "Copying…" })).toBeDefined();

    fireEvent.change(screen.getByRole("combobox", { name: "Compare Baseline" }), {
      target: { value: "" },
    });
    expect(await screen.findByRole("button", { name: "Share" })).toBeDefined();

    await act(async () => copy.resolve());
    expect(screen.getByRole("button", { name: "Share" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ignores an old Share rejection after the selected experiments change", async () => {
    const baseline = row(1);
    const current = row(2);
    const copy = deferred<void>();
    const writeText = vi.fn(() => copy.promise);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(listExperimentRows).mockResolvedValue([baseline, current]);

    render(
      <ExperimentCompare
        initialSelection={{
          ids: [baseline.id, current.id],
          baselineId: baseline.id,
        }}
      />,
    );

    const selection = await screen.findByLabelText("Selected experiments");
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove EXP-0002" }));
    expect(await screen.findByRole("button", { name: "Share" })).toBeDefined();
    expect(within(selection).getAllByRole("listitem")).toHaveLength(1);

    await act(async () => copy.reject(new Error("Old permission failure.")));
    expect(screen.getByRole("button", { name: "Share" })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps a newer Share request authoritative when an old request settles first", async () => {
    const baseline = row(1);
    const current = row(2);
    const oldCopy = deferred<void>();
    const newCopy = deferred<void>();
    const writeText = vi.fn()
      .mockImplementationOnce(() => oldCopy.promise)
      .mockImplementationOnce(() => newCopy.promise);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(listExperimentRows).mockResolvedValue([baseline, current]);

    render(
      <ExperimentCompare
        initialSelection={{
          ids: [baseline.id, current.id],
          baselineId: baseline.id,
        }}
      />,
    );

    await screen.findByText("EXP-0001");
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Compare Baseline" }), {
      target: { value: "" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    expect(writeText).toHaveBeenCalledTimes(2);

    await act(async () => oldCopy.resolve());
    const copying = screen.getByRole("button", { name: "Copying…" });
    expect((copying as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => newCopy.resolve());
    expect(await screen.findByRole("button", { name: "Copied" })).toBeDefined();
  });

  it("settles a pending Share request safely after unmount", async () => {
    const experiment = row(1);
    const copy = deferred<void>();
    const writeText = vi.fn(() => copy.promise);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(listExperimentRows).mockResolvedValue([experiment]);

    const { unmount } = render(
      <ExperimentCompare
        initialSelection={{ ids: [experiment.id], baselineId: null }}
      />,
    );

    await screen.findByText("EXP-0001");
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(writeText).toHaveBeenCalledOnce();
    unmount();

    await act(async () => copy.resolve());
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports clipboard failure without changing the selection or its URL state", async () => {
    const baseline = row(1);
    const current = row(2);
    const writeText = vi.fn().mockRejectedValue(new Error("Permission denied."));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const href = `/experiments/compare?ids=${encodeURIComponent(
      `${baseline.id},${current.id}`,
    )}&baseline=${baseline.id}`;
    window.history.replaceState(null, "", href);
    const initialHref = window.location.href;
    vi.mocked(listExperimentRows).mockResolvedValue([baseline, current]);

    render(
      <ExperimentCompare
        initialSelection={{
          ids: [baseline.id, current.id],
          baselineId: baseline.id,
        }}
      />,
    );

    const selection = await screen.findByLabelText("Selected experiments");
    routerReplace.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not copy link",
    );
    expect(writeText).toHaveBeenCalledWith(initialHref);
    expect(window.location.href).toBe(initialHref);
    expect(routerReplace).not.toHaveBeenCalled();
    expect(within(selection).getAllByRole("listitem")).toHaveLength(2);
    expect(within(selection).getByText(/EXP-0001 · run-1 · Baseline/))
      .toBeDefined();
    expect((screen.getByRole("combobox", {
      name: "Compare Baseline",
    }) as HTMLSelectElement).value).toBe(baseline.id);
  });

  it("removes every Delta column when Baseline is off", async () => {
    const first = row(1, { metrics: { "pass@1": 0.1 } });
    const second = row(2, { metrics: { "pass@1": 0.25 } });
    vi.mocked(listExperimentRows).mockResolvedValue([first, second]);

    render(
      <ExperimentCompare
        initialSelection={{ ids: [first.id, second.id], baselineId: null }}
      />,
    );

    expect(await screen.findByRole("columnheader", { name: "pass@1Result" }))
      .toBeDefined();
    expect(screen.queryByRole("columnheader", { name: /Δ/ })).toBeNull();
    expect(document.querySelector(".baseline-chip")).toBeNull();
  });

  it("renders unique value and Delta columns for foo and foo.delta metrics", async () => {
    const baseline = row(1, { metrics: { foo: 1, "foo.delta": 10 } });
    const current = row(2, { metrics: { foo: 3, "foo.delta": 16 } });
    vi.mocked(listExperimentRows).mockResolvedValue([baseline, current]);
    const reactError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <ExperimentCompare
        initialSelection={{
          ids: [baseline.id, current.id],
          baselineId: baseline.id,
        }}
      />,
    );

    const headers = await screen.findAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual(
      expect.arrayContaining([
        "fooResult",
        "Δ fooResult",
        "foo.deltaResult",
        "Δ foo.deltaResult",
      ]),
    );
    expect(reactError.mock.calls.flat().join(" ")).not.toContain(
      "Encountered two children with the same key",
    );
    reactError.mockRestore();
  });

  it("adds and removes arbitrary candidates through canonical replace URLs", async () => {
    const first = row(1);
    const second = row(2);
    vi.mocked(listExperimentRows).mockResolvedValue([first, second]);

    render(
      <ExperimentCompare
        initialSelection={{ ids: [first.id], baselineId: first.id }}
      />,
    );
    await screen.findByText("EXP-0001");

    const picker = screen.getByRole("combobox", { name: "Add experiment" });
    expect(within(picker).queryByRole("option", { name: /EXP-0001/ })).toBeNull();
    fireEvent.change(picker, { target: { value: second.id } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(routerReplace).toHaveBeenLastCalledWith(
      `/experiments/compare?ids=${encodeURIComponent(`${first.id},${second.id}`)}&baseline=${first.id}`,
    );
    expect(await screen.findByText("EXP-0002")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Remove EXP-0001" }));
    expect(routerReplace).toHaveBeenLastCalledWith(
      `/experiments/compare?ids=${second.id}`,
    );
    expect(document.querySelector(".baseline-chip")).toBeNull();
    expect((screen.getByRole("combobox", { name: "Compare Baseline" }) as HTMLSelectElement).value)
      .toBe("");
  });

  it("matches uppercase URL identities to lowercase rows and writes lowercase URLs", async () => {
    const baseline = {
      ...row(1, { metrics: { "pass@1": 0.1 } }),
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1",
    };
    const current = {
      ...row(2, { metrics: { "pass@1": 0.25 } }),
      id: "ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbb2",
    };
    vi.mocked(listExperimentRows).mockResolvedValue([current, baseline]);

    render(
      <ExperimentCompare
        initialSelection={{
          ids: [current.id.toUpperCase(), baseline.id.toUpperCase()],
          baselineId: baseline.id.toUpperCase(),
        }}
      />,
    );

    const tableRows = await screen.findAllByRole("row");
    expect(within(tableRows[1]).getByText("EXP-0001")).toBeDefined();
    expect(within(tableRows[1]).getByText("Baseline")).toBeDefined();
    fireEvent.change(screen.getByRole("combobox", { name: "Compare Baseline" }), {
      target: { value: "" },
    });
    expect(routerReplace).toHaveBeenLastCalledWith(
      `/experiments/compare?ids=${encodeURIComponent(`${baseline.id},${current.id}`)}`,
    );
  });

  it("toggles field groups, hides only identical fields, and renders missing values as em dashes", async () => {
    const baseline = row(1, {
      device: "npu:0",
      metrics: { "pass@1": 0.1 },
      resultSummary: "complete",
    });
    const current = row(2, {
      device: "npu:1",
      metrics: {},
      resultSummary: "complete",
    });
    vi.mocked(listExperimentRows).mockResolvedValue([baseline, current]);

    render(
      <ExperimentCompare
        initialSelection={{
          ids: [baseline.id, current.id],
          baselineId: baseline.id,
        }}
      />,
    );

    await screen.findByRole("columnheader", { name: "ModelObject" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Diff only" }));
    expect(screen.queryByRole("columnheader", { name: "ModelObject" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "DevicesEnvironment" }))
      .toBeDefined();
    expect(screen.getByRole("columnheader", { name: "pass@1Result" }))
      .toBeDefined();

    const currentRow = screen.getByRole("row", { name: /EXP-0002/ });
    expect(within(currentRow).getAllByText("—").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("checkbox", { name: "Environment" }));
    expect(screen.queryByRole("columnheader", { name: "DevicesEnvironment" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Data" })).toBeDefined();
    expect(screen.getByRole("checkbox", { name: "Object" })).toBeDefined();
    expect(screen.getByRole("checkbox", { name: "Config" })).toBeDefined();
    expect(screen.getByRole("checkbox", { name: "Result" })).toBeDefined();
    expect(screen.getByRole("checkbox", { name: "Decision & Note" })).toBeDefined();
  });

  it("retains and renders a twenty-first selection without an application cap", async () => {
    const rows = Array.from({ length: 21 }, (_, index) => row(index + 1));
    vi.mocked(listExperimentRows).mockResolvedValue(rows);

    render(
      <ExperimentCompare
        initialSelection={{
          ids: rows.slice(0, 20).map((experiment) => experiment.id),
          baselineId: null,
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Remove EXP-/ })).toHaveLength(20);
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Add experiment" }), {
      target: { value: rows[20].id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("button", { name: "Remove EXP-0021" }))
      .toBeDefined();
    expect(screen.getAllByRole("button", { name: /Remove EXP-/ })).toHaveLength(21);
    expect(selectedIdsFromLastNavigation()).toHaveLength(21);
  });

  it("reconciles back-forward prop changes without URL loops or losing local toggles", async () => {
    const first = row(1, { device: "npu:0" });
    const second = row(2, { device: "npu:1" });
    const third = row(3, { device: "npu:2" });
    vi.mocked(listExperimentRows).mockResolvedValue([first, second, third]);
    const { rerender } = render(
      <ExperimentCompare
        initialSelection={{ ids: [first.id, second.id], baselineId: null }}
      />,
    );
    await screen.findByText("EXP-0001");

    fireEvent.click(screen.getByRole("checkbox", { name: "Diff only" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Data" }));
    routerReplace.mockClear();

    rerender(
      <ExperimentCompare
        initialSelection={{ ids: [second.id, third.id], baselineId: second.id }}
      />,
    );

    expect(await screen.findByText("EXP-0003")).toBeDefined();
    await waitFor(() => expect(screen.queryByText("EXP-0001")).toBeNull());
    expect((screen.getByRole("checkbox", { name: "Diff only" }) as HTMLInputElement).checked)
      .toBe(true);
    expect((screen.getByRole("checkbox", { name: "Data" }) as HTMLInputElement).checked)
      .toBe(false);
    expect(routerReplace).not.toHaveBeenCalled();
    expect(within(screen.getAllByRole("row")[1]).getByText("EXP-0002")).toBeDefined();
  });

  it("ignores an older reload success after a newer Realtime success", async () => {
    const older = deferred<ExperimentListRow[]>();
    let refresh: () => void = () => undefined;
    vi.mocked(listExperimentRows)
      .mockImplementationOnce(() => older.promise)
      .mockResolvedValueOnce([row(2)]);
    vi.mocked(watchExperimentIndex).mockImplementation((onChange) => {
      refresh = onChange;
      return () => undefined;
    });

    render(
      <ExperimentCompare
        initialSelection={{ ids: [id(1), id(2)], baselineId: null }}
      />,
    );
    act(() => refresh());
    expect(await screen.findByText("EXP-0002")).toBeDefined();

    await act(async () => {
      older.resolve([row(1)]);
      await older.promise;
    });
    expect(screen.queryByText("EXP-0001")).toBeNull();
    expect(screen.getByText("EXP-0002")).toBeDefined();
  });

  it("ignores an older reload error after a newer Realtime success", async () => {
    const older = deferred<ExperimentListRow[]>();
    let refresh: () => void = () => undefined;
    vi.mocked(listExperimentRows)
      .mockImplementationOnce(() => older.promise)
      .mockResolvedValueOnce([row(2)]);
    vi.mocked(watchExperimentIndex).mockImplementation((onChange) => {
      refresh = onChange;
      return () => undefined;
    });

    render(
      <ExperimentCompare
        initialSelection={{ ids: [id(2)], baselineId: null }}
      />,
    );
    act(() => refresh());
    expect(await screen.findByText("EXP-0002")).toBeDefined();

    await act(async () => {
      older.reject(new Error("Stale load failed."));
      await Promise.resolve();
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("EXP-0002")).toBeDefined();
  });

  it("shows a retrying state, blocks duplicate retries, and clears a real load error", async () => {
    const retry = deferred<ExperimentListRow[]>();
    vi.mocked(listExperimentRows)
      .mockRejectedValueOnce(new Error("Database offline."))
      .mockImplementationOnce(() => retry.promise);

    render(
      <ExperimentCompare
        initialSelection={{ ids: [id(1)], baselineId: null }}
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load experiments.");
    expect(alert.textContent).toContain("Database offline.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    const retrying = screen.getByRole("button", { name: "Retrying…" });
    expect((retrying as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(retrying);
    expect(listExperimentRows).toHaveBeenCalledTimes(2);

    await act(async () => retry.resolve([row(1)]));
    expect(await screen.findByText("EXP-0001")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not claim the selection is empty when its initial load fails", async () => {
    vi.mocked(listExperimentRows).mockRejectedValue(
      new Error("Database offline."),
    );

    render(
      <ExperimentCompare
        initialSelection={{ ids: [id(1)], baselineId: null }}
      />,
    );

    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.queryByText("Add experiments to build a comparison.")).toBeNull();
    expect(screen.queryByText(/No selected experiments could be found/i)).toBeNull();
  });

  it("retains the last good comparison when a Realtime refresh fails", async () => {
    let refresh: () => void = () => undefined;
    vi.mocked(listExperimentRows)
      .mockResolvedValueOnce([row(1)])
      .mockRejectedValueOnce(new Error("Refresh failed."));
    vi.mocked(watchExperimentIndex).mockImplementation((onChange) => {
      refresh = onChange;
      return () => undefined;
    });
    render(
      <ExperimentCompare
        initialSelection={{ ids: [id(1)], baselineId: null }}
      />,
    );
    await screen.findByText("EXP-0001");

    act(() => refresh());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Refresh failed.");
    expect(screen.getByText("EXP-0001")).toBeDefined();
  });

  it("invalidates pending completions and unsubscribes on unmount", async () => {
    const pending = deferred<ExperimentListRow[]>();
    const unsubscribe = vi.fn();
    vi.mocked(listExperimentRows).mockImplementationOnce(() => pending.promise);
    vi.mocked(watchExperimentIndex).mockReturnValue(unsubscribe);
    const { unmount } = render(
      <ExperimentCompare
        initialSelection={{ ids: [id(1)], baselineId: id(1) }}
      />,
    );

    unmount();
    await act(async () => pending.resolve([]));

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("removes a deleted selected Baseline while preserving the surviving selection and toggles", async () => {
    const baseline = row(1);
    const current = row(2, { device: "npu:1" });
    let refresh: () => void = () => undefined;
    vi.mocked(listExperimentRows)
      .mockResolvedValueOnce([baseline, current])
      .mockResolvedValueOnce([current]);
    vi.mocked(watchExperimentIndex).mockImplementation((onChange) => {
      refresh = onChange;
      return () => undefined;
    });
    render(
      <ExperimentCompare
        initialSelection={{
          ids: [baseline.id, current.id],
          baselineId: baseline.id,
        }}
      />,
    );
    await screen.findByText("EXP-0001");
    fireEvent.click(screen.getByRole("checkbox", { name: "Diff only" }));

    act(() => refresh());
    await waitFor(() => expect(screen.queryByText("EXP-0001")).toBeNull());

    expect(screen.getByText("EXP-0002")).toBeDefined();
    expect(screen.getByText(/selected experiment is no longer available/i)).toBeDefined();
    expect(screen.queryByRole("columnheader", { name: /Δ/ })).toBeNull();
    expect((screen.getByRole("combobox", { name: "Compare Baseline" }) as HTMLSelectElement).value)
      .toBe("");
    expect((screen.getByRole("checkbox", { name: "Diff only" }) as HTMLInputElement).checked)
      .toBe(true);
    expect(routerReplace).toHaveBeenLastCalledWith(
      `/experiments/compare?ids=${current.id}`,
    );
  });

  it("distinguishes an empty selection from selected IDs with no matching records", async () => {
    const available = row(2);
    vi.mocked(listExperimentRows).mockResolvedValue([available]);
    const missing = id(99);
    const { rerender } = render(
      <ExperimentCompare
        initialSelection={{ ids: [], baselineId: null }}
      />,
    );
    expect(await screen.findByText("Add experiments to build a comparison."))
      .toBeDefined();
    expect(screen.getByRole("option", { name: /EXP-0002/ })).toBeDefined();

    routerReplace.mockClear();
    rerender(
      <ExperimentCompare
        initialSelection={{ ids: [missing], baselineId: missing }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/No selected experiments could be found/i)).toBeDefined();
    });
    expect((screen.getByRole("combobox", { name: "Compare Baseline" }) as HTMLSelectElement).value)
      .toBe("");
    expect(document.querySelector(".baseline-chip")).toBeNull();
    expect(routerReplace).toHaveBeenLastCalledWith("/experiments/compare");
  });

  it("renders the existing Decision label while retaining raw compare equality", async () => {
    const accepted = row(1, { decisionOutcome: "accepted" });
    vi.mocked(listExperimentRows).mockResolvedValue([accepted]);

    render(
      <ExperimentCompare
        initialSelection={{ ids: [accepted.id], baselineId: null }}
      />,
    );

    const experimentRow = await screen.findByRole("row", { name: /EXP-0001/ });
    expect(within(experimentRow).getByText("Accepted")).toBeDefined();
    expect(within(experimentRow).queryByText("accepted")).toBeNull();
  });

  it("renders a malformed __proto__ Decision as plain text without crashing", async () => {
    const malformed = row(1, {
      decisionOutcome: "__proto__" as ExperimentListRow["decision_outcome"],
    });
    vi.mocked(listExperimentRows).mockResolvedValue([malformed]);

    render(
      <ExperimentCompare
        initialSelection={{ ids: [malformed.id], baselineId: null }}
      />,
    );

    const experimentRow = await screen.findByRole("row", { name: /EXP-0001/ });
    expect(within(experimentRow).getByText("__proto__")).toBeDefined();
  });

  it("clears a candidate that becomes selected through URL prop reconciliation", async () => {
    const first = row(1);
    const second = row(2);
    vi.mocked(listExperimentRows).mockResolvedValue([first, second]);
    const { rerender } = render(
      <ExperimentCompare
        initialSelection={{ ids: [first.id], baselineId: null }}
      />,
    );
    await screen.findByText("EXP-0001");
    const picker = screen.getByRole("combobox", { name: "Add experiment" });
    fireEvent.change(picker, { target: { value: second.id } });
    expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled)
      .toBe(false);

    rerender(
      <ExperimentCompare
        initialSelection={{ ids: [first.id, second.id], baselineId: null }}
      />,
    );

    await waitFor(() => {
      expect((picker as HTMLSelectElement).value).toBe("");
      expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled)
        .toBe(true);
    });
  });

  it("clears a candidate deleted by a Realtime reload", async () => {
    const first = row(1);
    const candidate = row(2);
    let refresh: () => void = () => undefined;
    vi.mocked(listExperimentRows)
      .mockResolvedValueOnce([first, candidate])
      .mockResolvedValueOnce([first]);
    vi.mocked(watchExperimentIndex).mockImplementation((onChange) => {
      refresh = onChange;
      return () => undefined;
    });
    render(
      <ExperimentCompare
        initialSelection={{ ids: [first.id], baselineId: null }}
      />,
    );
    await screen.findByText("EXP-0001");
    const picker = screen.getByRole("combobox", { name: "Add experiment" });
    fireEvent.change(picker, { target: { value: candidate.id } });

    act(() => refresh());
    await waitFor(() => {
      expect((picker as HTMLSelectElement).value).toBe("");
      expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled)
        .toBe(true);
    });
  });
});
