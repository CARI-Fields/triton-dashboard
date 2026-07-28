import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  startTransition,
  Suspense,
  useLayoutEffect,
  useState,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Activity,
  Attachment,
  ExperimentListRow,
} from "@/lib/types";
import MarkdownField from "@/components/MarkdownField";
import AttachmentGallery from "@/components/experiments/AttachmentGallery";
import BaselinePicker from "@/components/experiments/BaselinePicker";
import BaselineSummary from "@/components/experiments/BaselineSummary";
import DecisionEditor from "@/components/experiments/DecisionEditor";
import ExperimentTimeline from "@/components/experiments/ExperimentTimeline";
import ResultEditor from "@/components/experiments/ResultEditor";
import {
  deleteAttachment,
  updateAttachmentCaption,
  uploadAttachment,
} from "@/lib/attachments/repository";
import {
  addExperimentTimelineNote,
} from "@/lib/experiments/repository";

vi.mock("@/lib/attachments/repository", () => ({
  deleteAttachment: vi.fn(),
  updateAttachmentCaption: vi.fn(),
  uploadAttachment: vi.fn(),
}));

vi.mock("@/lib/experiments/repository", () => ({
  addExperimentTimelineNote: vi.fn(),
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

function row(id: string, passAt1: number, device: string): ExperimentListRow {
  return {
    id,
    experiment_no: Number(id.slice(-1)),
    task_id: "00000000-0000-4000-8000-000000000010",
    owner_id: null,
    name: `run-${id.slice(-1)}`,
    status: "analyzing",
    baseline_experiment_id: null,
    data_spec: { datasets: [] },
    object_spec: {
      model: "Qwen",
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
      devices: [device],
      hardware: "Ascend910",
      evaluator: "grader",
      revision: "r1",
      precision_policy: "fp32",
    },
    config: { temperature: 0.1 },
    metrics: { "pass@1": passAt1 },
    featured_metric_keys: ["pass@1"],
    result_summary: "",
    decision_outcome: null,
    decision_notes: "",
    notes: "",
    position: 0,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-24T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
    task: {
      id: "00000000-0000-4000-8000-000000000010",
      title: "Optimize conv2d",
    },
    owner: null,
  };
}

function galleryProps(experiment: ExperimentListRow) {
  return {
    scope: {
      taskId: experiment.task_id,
      experimentId: experiment.id,
    },
    visitKey: `experiment:${experiment.id}`,
    title: "Plots & images",
    emptyMessage: "No plots or images attached.",
    altFallback: "Experiment plot",
  };
}

describe("experiment evidence", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);

  it("marks an existing numeric metric as featured", () => {
    const onChange = vi.fn();
    render(
      <ResultEditor
        metrics={{ "pass@1": 0.2 }}
        featuredMetricKeys={[]}
        resultSummary=""
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Feature pass@1" }));

    expect(onChange).toHaveBeenCalledWith({
      metrics: { "pass@1": 0.2 },
      featuredMetricKeys: ["pass@1"],
      resultSummary: "",
    });
  });

  it("renders neutral current-minus-baseline Delta and context differences", () => {
    const baseline = row("00000000-0000-4000-8000-000000000001", 0.1, "npu:0");
    const current = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");

    render(<BaselineSummary current={current} baseline={baseline} />);

    expect(screen.getByText("EXP-0001 · run-1")).toBeDefined();
    expect(screen.getByText("+0.15")).toBeDefined();
    expect(screen.getByText("Devices")).toBeDefined();
    expect(screen.getByText("npu:0")).toBeDefined();
    expect(screen.getByText("npu:1")).toBeDefined();
  });

  it("renames featured metrics and removes stale featured references", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ResultEditor
        metrics={{ "pass@1": 0.2, latency: 12 }}
        featuredMetricKeys={["pass@1"]}
        resultSummary=""
        onChange={onChange}
      />,
    );

    const name = screen.getByLabelText("pass@1 metric name");
    fireEvent.change(name, { target: { value: "accuracy" } });
    fireEvent.blur(name);
    expect(onChange).toHaveBeenLastCalledWith({
      metrics: { accuracy: 0.2, latency: 12 },
      featuredMetricKeys: ["accuracy"],
      resultSummary: "",
    });
    expect((name as HTMLInputElement).value).toBe("pass@1");

    rerender(
      <ResultEditor
        metrics={{ accuracy: 0.2, latency: 12 }}
        featuredMetricKeys={["accuracy"]}
        resultSummary=""
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove accuracy" }));
    expect(onChange).toHaveBeenLastCalledWith({
      metrics: { latency: 12 },
      featuredMetricKeys: [],
      resultSummary: "",
    });
  });

  it("reconciles metric values to authoritative props on reject and accept", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ResultEditor
        metrics={{ latency: 12 }}
        featuredMetricKeys={[]}
        resultSummary=""
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("latency metric value") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "10" } });
    expect(onChange).toHaveBeenLastCalledWith({
      metrics: { latency: 10 },
      featuredMetricKeys: [],
      resultSummary: "",
    });
    expect(input.value).toBe("12");

    rerender(
      <ResultEditor
        metrics={{ latency: 10 }}
        featuredMetricKeys={[]}
        resultSummary=""
        onChange={onChange}
      />,
    );
    expect((screen.getByLabelText("latency metric value") as HTMLInputElement).value)
      .toBe("10");
  });

  it("never displays or emits non-finite metrics", () => {
    const onChange = vi.fn();
    render(
      <ResultEditor
        metrics={{ invalid: Number.NaN, infinite: Number.POSITIVE_INFINITY, valid: 3 }}
        featuredMetricKeys={["invalid", "valid"]}
        resultSummary=""
        onChange={onChange}
      />,
    );

    expect(screen.queryByLabelText("invalid metric value")).toBeNull();
    expect(screen.queryByLabelText("infinite metric value")).toBeNull();
    fireEvent.change(screen.getByLabelText("Result Summary"), {
      target: { value: "Measured result" },
    });
    expect(onChange).toHaveBeenCalledWith({
      metrics: { valid: 3 },
      featuredMetricKeys: ["valid"],
      resultSummary: "Measured result",
    });
  });

  it("does not derive a Delta from missing or non-finite metric values", () => {
    const baseline = row("00000000-0000-4000-8000-000000000001", 0.1, "npu:0");
    const current = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:0");
    baseline.metrics = {
      invalid: Number.NaN,
      baselineOnly: 5,
      overflow: -1e308,
    };
    current.metrics = { invalid: 4, currentOnly: 8, overflow: 1e308 };

    render(<BaselineSummary current={current} baseline={baseline} />);

    expect(screen.queryByText("NaN")).toBeNull();
    expect(screen.queryByText("+4")).toBeNull();
    expect(screen.queryByText("+Infinity")).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders every collision-prone context difference without duplicate React keys", () => {
    const baseline = row("00000000-0000-4000-8000-000000000001", 0.1, "npu:0");
    const current = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:0");
    baseline.config = {
      "a.b": 1,
      a: { b: 2 },
      "items[0]": "literal baseline",
      items: ["array baseline"],
    } as unknown as ExperimentListRow["config"];
    current.config = {
      "a.b": 3,
      a: { b: 4 },
      "items[0]": "literal current",
      items: ["array current"],
    } as unknown as ExperimentListRow["config"];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const { container } = render(
        <BaselineSummary current={current} baseline={baseline} />,
      );

      expect(container.querySelectorAll(".context-difference-list > div"))
        .toHaveLength(4);
      for (const value of [
        "1",
        "2",
        "3",
        "4",
        "literal baseline",
        "literal current",
        "array baseline",
        "array current",
      ]) {
        expect(screen.getByText(value)).toBeDefined();
      }
      expect(consoleError.mock.calls.flat().join(" "))
        .not.toContain("same key");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("treats inherited prototype metric names as unavailable", () => {
    const baseline = row("00000000-0000-4000-8000-000000000001", 0.1, "npu:0");
    const current = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:0");
    baseline.metrics = Object.fromEntries([
      ["constructor", 0.5],
      ["__proto__", 0.7],
    ]);
    current.metrics = { toString: 0.9 };

    render(<BaselineSummary current={current} baseline={baseline} />);

    for (const [key, baselineValue, currentValue] of [
      ["constructor", "0.5", "—"],
      ["__proto__", "0.7", "—"],
      ["toString", "—", "0.9"],
    ]) {
      const metricRow = screen.getByText(key, { selector: "strong" })
        .parentElement!;
      const values = [...metricRow.querySelectorAll("span")]
        .map((element) => element.textContent);
      expect(values).toEqual([baselineValue, currentValue, "—"]);
    }
    expect(screen.queryByText(/function Object/)).toBeNull();
    expect(screen.queryByText("[object Object]")).toBeNull();
  });

  it("reports Markdown editing transitions including Escape", () => {
    const onEditingChange = vi.fn();
    render(
      <MarkdownField
        value="Decision note"
        onSave={() => undefined}
        onEditingChange={onEditingChange}
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it("publishes active Markdown drafts and restores the original value on Escape", () => {
    const onDraftChange = vi.fn();
    const onSave = vi.fn();
    render(
      <MarkdownField
        value="Original"
        onSave={onSave}
        onDraftChange={onDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Unsaved Markdown" },
    });
    expect(onDraftChange).toHaveBeenLastCalledWith("Unsaved Markdown");

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onDraftChange).toHaveBeenLastCalledWith("Original");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("closes active Markdown editing once on unmount without idle churn", () => {
    const idleChange = vi.fn();
    const idle = render(
      <MarkdownField
        value=""
        onSave={() => undefined}
        onEditingChange={idleChange}
      />,
    );
    idle.unmount();
    expect(idleChange).not.toHaveBeenCalled();

    const activeChange = vi.fn();
    const active = render(
      <MarkdownField
        value=""
        onSave={() => undefined}
        onEditingChange={activeChange}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    active.unmount();
    expect(activeChange.mock.calls).toEqual([[true], [false]]);
  });

  it("emits only exact Decision outcomes and saved notes", () => {
    const onChange = vi.fn();
    render(
      <DecisionEditor
        outcome={null}
        notes=""
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Decision Outcome"), {
      target: { value: "accepted" },
    });
    expect(onChange).toHaveBeenLastCalledWith("accepted", "");

    fireEvent.click(screen.getByRole("button", {
      name: "Why this outcome was chosen and what happens next",
    }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Ship this result" },
    });
    fireEvent.blur(screen.getByRole("textbox"));
    expect(onChange).toHaveBeenLastCalledWith(null, "Ship this result");
  });

  it("shows same-Task plus selected cross-Task Baselines until cross-Task search is nonblank", () => {
    const current = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");
    const sameTask = row("00000000-0000-4000-8000-000000000003", 0.2, "npu:1");
    const selectedCrossTask = row("00000000-0000-4000-8000-000000000004", 0.15, "npu:0");
    selectedCrossTask.task_id = "00000000-0000-4000-8000-000000000099";
    selectedCrossTask.task = { id: selectedCrossTask.task_id, title: "Different Task" };
    const searchedCrossTask = row("00000000-0000-4000-8000-000000000005", 0.1, "npu:2");
    searchedCrossTask.task_id = selectedCrossTask.task_id;
    searchedCrossTask.task = selectedCrossTask.task;

    const view = render(
      <BaselinePicker
        current={current}
        candidates={[current, searchedCrossTask, selectedCrossTask, sameTask]}
        value={selectedCrossTask.id}
        onChange={() => undefined}
      />,
    );

    const options = screen.getAllByRole("option");
    expect(options[1].textContent).toContain("run-3");
    expect(options[2].textContent).toContain("run-4");
    expect(options).toHaveLength(3);
    expect(screen.queryByRole("option", { name: /run-2/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /run-5/ })).toBeNull();
    expect(screen.getByText(
      "Cross-Task Baseline: Different Task · 1 context fields differ.",
    )).toBeDefined();

    fireEvent.change(screen.getByLabelText("Search Baseline experiments"), {
      target: { value: "run-5" },
    });
    const select = screen.getByLabelText("Baseline") as HTMLSelectElement;
    expect(select.value).toBe(selectedCrossTask.id);
    expect(screen.getAllByRole("option", { name: /run-4/ })).toHaveLength(1);
    expect(screen.getAllByRole("option", { name: /run-5/ })).toHaveLength(1);
    expect(screen.getByText(
      "Cross-Task Baseline: Different Task · 1 context fields differ.",
    )).toBeDefined();

    view.rerender(
      <BaselinePicker
        current={current}
        candidates={[current, searchedCrossTask, selectedCrossTask, sameTask]}
        value={null}
        onChange={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText("Search Baseline experiments"), {
      target: { value: "" },
    });
    expect(screen.getByRole("option", { name: /run-3/ })).toBeDefined();
    expect(screen.queryByRole("option", { name: /run-4/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /run-5/ })).toBeNull();
  });

  it("does not re-add the current experiment from a corrupted self-selected value", () => {
    const current = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");
    const sameTask = row("00000000-0000-4000-8000-000000000003", 0.2, "npu:1");

    render(
      <BaselinePicker
        current={current}
        candidates={[current, sameTask]}
        value={current.id}
        onChange={() => undefined}
      />,
    );

    expect(screen.queryByRole("option", { name: /run-2/ })).toBeNull();
    expect((screen.getByLabelText("Baseline") as HTMLSelectElement).value).toBe("");
    expect(screen.queryByText(/Cross-Task Baseline:/)).toBeNull();
  });

  it("surfaces attachment caption and upload failures without fabricating plots", async () => {
    const experiment = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");
    const attachment = {
      id: "attachment-1",
      task_id: experiment.task_id,
      experiment_id: experiment.id,
      url: "https://example.test/plot.png",
      path: "plots/plot.png",
      caption: "Latency plot",
      position: 0,
      created_at: "2026-07-24T00:00:00.000Z",
    } satisfies Attachment;
    vi.mocked(updateAttachmentCaption).mockRejectedValue(
      new Error("Caption failed."),
    );
    vi.mocked(uploadAttachment).mockRejectedValue(
      new Error("Upload failed."),
    );
    const { container } = render(
      <AttachmentGallery
        {...galleryProps(experiment)}
        attachments={[attachment]}
        onChanged={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("Caption for Latency plot"), {
      target: { value: "Updated caption" },
    });
    fireEvent.blur(screen.getByLabelText("Caption for Latency plot"));
    expect((await screen.findByRole("alert")).textContent)
      .toBe("Caption failed.");

    const file = new File(["plot"], "new-plot.png", { type: "image/png" });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledWith(
      galleryProps(experiment).scope,
      file,
      1,
    ));
    expect((await screen.findByRole("alert")).textContent).toBe("Upload failed.");
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("resynchronizes once when a later file in an upload batch fails", async () => {
    const experiment = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");
    const nextExperiment = row(
      "00000000-0000-4000-8000-000000000003",
      0.3,
      "npu:2",
    );
    vi.mocked(uploadAttachment)
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("Second upload failed."));
    const onChanged = vi.fn();
    const view = render(
      <AttachmentGallery
        {...galleryProps(experiment)}
        attachments={[]}
        onChanged={onChanged}
      />,
    );
    const persistedAttachment = {
      id: "attachment-first",
      task_id: experiment.task_id,
      experiment_id: experiment.id,
      url: "https://example.test/first.png",
      path: "plots/first.png",
      caption: "",
      position: 0,
      created_at: "2026-07-24T00:00:00.000Z",
    } satisfies Attachment;
    const first = new File(["first"], "first.png", { type: "image/png" });
    const second = new File(["second"], "second.png", { type: "image/png" });

    fireEvent.change(view.container.querySelector('input[type="file"]')!, {
      target: { files: [first, second] },
    });

    expect((await screen.findByRole("alert")).textContent)
      .toBe("Second upload failed.");
    expect(uploadAttachment).toHaveBeenNthCalledWith(
      1,
      galleryProps(experiment).scope,
      first,
      0,
    );
    expect(uploadAttachment).toHaveBeenNthCalledWith(
      2,
      galleryProps(experiment).scope,
      second,
      1,
    );
    expect(onChanged).toHaveBeenCalledTimes(1);

    view.rerender(
      <AttachmentGallery
        {...galleryProps(experiment)}
        attachments={[persistedAttachment]}
        onChanged={onChanged}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("Second upload failed.");
    expect(onChanged).toHaveBeenCalledTimes(1);

    view.rerender(
      <AttachmentGallery
        {...galleryProps(nextExperiment)}
        attachments={[]}
        onChanged={onChanged}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("deletes a confirmed real attachment through the repository", async () => {
    const experiment = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");
    const attachment = {
      id: "attachment-1",
      task_id: experiment.task_id,
      experiment_id: experiment.id,
      url: "https://example.test/plot.png",
      path: "plots/plot.png",
      caption: "",
      position: 0,
      created_at: "2026-07-24T00:00:00.000Z",
    } satisfies Attachment;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteAttachment).mockResolvedValue();

    render(
      <AttachmentGallery
        {...galleryProps(experiment)}
        attachments={[attachment]}
        onChanged={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete image" }));

    await waitFor(() =>
      expect(deleteAttachment).toHaveBeenCalledWith(attachment)
    );
    confirm.mockRestore();
  });

  it("resynchronizes once when delete reports Storage cleanup failure", async () => {
    const experiment = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");
    const attachment = {
      id: "attachment-1",
      task_id: experiment.task_id,
      experiment_id: experiment.id,
      url: "https://example.test/plot.png",
      path: "plots/plot.png",
      caption: "",
      position: 0,
      created_at: "2026-07-24T00:00:00.000Z",
    } satisfies Attachment;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteAttachment).mockRejectedValue(
      new Error("Attachment record was deleted, but Storage cleanup failed."),
    );
    const onChanged = vi.fn();
    render(
      <AttachmentGallery
        {...galleryProps(experiment)}
        attachments={[attachment]}
        onChanged={onChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete image" }));

    expect((await screen.findByRole("alert")).textContent)
      .toBe("Attachment record was deleted, but Storage cleanup failed.");
    expect(onChanged).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it("ignores a stale caption completion across committed A to B to A visits", async () => {
    const experimentA = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");
    const experimentB = row("00000000-0000-4000-8000-000000000003", 0.3, "npu:2");
    const attachmentA = {
      id: "attachment-a",
      task_id: experimentA.task_id,
      experiment_id: experimentA.id,
      url: "https://example.test/a.png",
      path: "plots/a.png",
      caption: "A caption",
      position: 0,
      created_at: "2026-07-24T00:00:00.000Z",
    } satisfies Attachment;
    const attachmentB = {
      ...attachmentA,
      id: "attachment-b",
      experiment_id: experimentB.id,
      url: "https://example.test/b.png",
      path: "plots/b.png",
      caption: "B caption",
    } satisfies Attachment;
    const captionSave = deferred<void>();
    vi.mocked(updateAttachmentCaption).mockReturnValue(captionSave.promise);
    const onChangedA = vi.fn();
    const onChangedB = vi.fn();
    const onChangedA2 = vi.fn();
    const view = render(
      <AttachmentGallery
        {...galleryProps(experimentA)}
        attachments={[attachmentA]}
        onChanged={onChangedA}
      />,
    );
    fireEvent.change(screen.getByLabelText("Caption for A caption"), {
      target: { value: "Old A update" },
    });
    fireEvent.blur(screen.getByLabelText("Caption for A caption"));

    view.rerender(
      <AttachmentGallery
        {...galleryProps(experimentB)}
        attachments={[attachmentB]}
        onChanged={onChangedB}
      />,
    );
    view.rerender(
      <AttachmentGallery
        {...galleryProps(experimentA)}
        attachments={[attachmentA]}
        onChanged={onChangedA2}
      />,
    );
    const currentCaption = screen.getByLabelText(
      "Caption for A caption",
    ) as HTMLInputElement;
    fireEvent.change(currentCaption, { target: { value: "Fresh A draft" } });

    await act(async () => {
      captionSave.resolve();
      await captionSave.promise;
    });
    expect(onChangedA).not.toHaveBeenCalled();
    expect(onChangedB).not.toHaveBeenCalled();
    expect(onChangedA2).not.toHaveBeenCalled();
    expect(currentCaption.value).toBe("Fresh A draft");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("suppresses a stale caption error before passive unmount cleanup", async () => {
    const experimentA = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");
    const experimentB = row("00000000-0000-4000-8000-000000000003", 0.3, "npu:2");
    const attachmentA = {
      id: "attachment-a",
      task_id: experimentA.task_id,
      experiment_id: experimentA.id,
      url: "https://example.test/a.png",
      path: "plots/a.png",
      caption: "A caption",
      position: 0,
      created_at: "2026-07-24T00:00:00.000Z",
    } satisfies Attachment;
    const captionSave = deferred<void>();
    vi.mocked(updateAttachmentCaption)
      .mockReturnValueOnce(captionSave.promise)
      .mockResolvedValueOnce();
    const onChanged = vi.fn();
    let showExperimentB!: () => void;

    function Harness() {
      const [experiment, setExperiment] = useState(experimentA);
      showExperimentB = () => setExperiment(experimentB);
      useLayoutEffect(() => {
        if (experiment.id === experimentB.id) {
          captionSave.reject(new Error("Old caption failed."));
        }
      }, [experiment.id]);
      return (
        <AttachmentGallery
          {...galleryProps(experiment)}
          attachments={[attachmentA]}
          onChanged={onChanged}
        />
      );
    }

    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Caption for A caption"), {
      target: { value: "Old A update" },
    });
    fireEvent.blur(screen.getByLabelText("Caption for A caption"));

    act(() => showExperimentB());
    await act(async () => {
      await captionSave.promise.catch(() => undefined);
    });

    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    const currentCaption = screen.getByLabelText(
      "Caption for A caption",
    ) as HTMLInputElement;
    expect(currentCaption.disabled).toBe(false);
    expect(currentCaption.value).toBe("A caption");

    fireEvent.change(currentCaption, { target: { value: "Fresh B update" } });
    fireEvent.blur(currentCaption);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(updateAttachmentCaption).toHaveBeenCalledTimes(2);
  });

  it("adds only an explicit manual note and renders trigger-owned Activity", async () => {
    const experiment = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");
    const activity = [{
      id: "activity-1",
      task_id: experiment.task_id,
      experiment_id: experiment.id,
      text: "Status changed to Analyzing",
      kind: "status",
      created_at: "2026-07-24T00:00:00.000Z",
    }] satisfies Activity[];
    vi.mocked(addExperimentTimelineNote).mockResolvedValue();
    const onChanged = vi.fn();

    render(
      <ExperimentTimeline
        experiment={experiment}
        activity={activity}
        onChanged={onChanged}
      />,
    );
    expect(screen.getByText("Status changed to Analyzing")).toBeDefined();
    fireEvent.change(screen.getByLabelText("Experiment timeline note"), {
      target: { value: "Observed a stable run" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    await waitFor(() => expect(addExperimentTimelineNote).toHaveBeenCalledWith(
      experiment,
      "Observed a stable run",
    ));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Observed a stable run")).toBeNull();
  });

  it("suppresses stale attachment and timeline callbacks after unmount", async () => {
    const experiment = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");
    const upload = deferred<void>();
    const note = deferred<void>();
    vi.mocked(uploadAttachment).mockReturnValue(upload.promise);
    vi.mocked(addExperimentTimelineNote).mockReturnValue(note.promise);
    const onAttachmentChanged = vi.fn();
    const attachmentRender = render(
      <AttachmentGallery
        {...galleryProps(experiment)}
        attachments={[]}
        onChanged={onAttachmentChanged}
      />,
    );
    const file = new File(["plot"], "plot.png", { type: "image/png" });
    fireEvent.change(
      attachmentRender.container.querySelector('input[type="file"]')!,
      { target: { files: [file] } },
    );
    attachmentRender.unmount();

    const onTimelineChanged = vi.fn();
    const timelineRender = render(
      <ExperimentTimeline
        experiment={experiment}
        activity={[]}
        onChanged={onTimelineChanged}
      />,
    );
    fireEvent.change(screen.getByLabelText("Experiment timeline note"), {
      target: { value: "Pending note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    timelineRender.unmount();

    await act(async () => {
      upload.resolve();
      note.resolve();
      await Promise.all([upload.promise, note.promise]);
    });
    expect(onAttachmentChanged).not.toHaveBeenCalled();
    expect(onTimelineChanged).not.toHaveBeenCalled();
  });

  it("isolates pending async work when the controlled experiment identity changes", async () => {
    const experimentA = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");
    const experimentB = row("00000000-0000-4000-8000-000000000003", 0.3, "npu:2");
    const oldUpload = deferred<void>();
    const newUpload = deferred<void>();
    const oldNote = deferred<void>();
    const newNote = deferred<void>();
    vi.mocked(uploadAttachment)
      .mockReturnValueOnce(oldUpload.promise)
      .mockReturnValueOnce(newUpload.promise);
    vi.mocked(addExperimentTimelineNote)
      .mockReturnValueOnce(oldNote.promise)
      .mockReturnValueOnce(newNote.promise);
    const onAttachmentA = vi.fn();
    const onAttachmentB = vi.fn();
    const onAttachmentA2 = vi.fn();
    const attachmentRender = render(
      <AttachmentGallery
        {...galleryProps(experimentA)}
        attachments={[]}
        onChanged={onAttachmentA}
      />,
    );
    fireEvent.change(
      attachmentRender.container.querySelector('input[type="file"]')!,
      {
        target: {
          files: [new File(["plot"], "plot.png", { type: "image/png" })],
        },
      },
    );
    attachmentRender.rerender(
      <AttachmentGallery
        {...galleryProps(experimentB)}
        attachments={[]}
        onChanged={onAttachmentB}
      />,
    );
    expect((screen.getByRole("button", { name: "Upload images" }) as HTMLButtonElement).disabled)
      .toBe(false);
    attachmentRender.rerender(
      <AttachmentGallery
        {...galleryProps(experimentA)}
        attachments={[]}
        onChanged={onAttachmentA2}
      />,
    );
    fireEvent.change(
      attachmentRender.container.querySelector('input[type="file"]')!,
      {
        target: {
          files: [new File(["new plot"], "new-plot.png", { type: "image/png" })],
        },
      },
    );

    const onTimelineA = vi.fn();
    const onTimelineB = vi.fn();
    const onTimelineA2 = vi.fn();
    const timelineRender = render(
      <ExperimentTimeline
        experiment={experimentA}
        activity={[]}
        onChanged={onTimelineA}
      />,
    );
    fireEvent.change(screen.getByLabelText("Experiment timeline note"), {
      target: { value: "A note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    timelineRender.rerender(
      <ExperimentTimeline
        experiment={experimentB}
        activity={[]}
        onChanged={onTimelineB}
      />,
    );
    const noteInput = screen.getByLabelText(
      "Experiment timeline note",
    ) as HTMLTextAreaElement;
    fireEvent.change(noteInput, { target: { value: "B draft" } });
    timelineRender.rerender(
      <ExperimentTimeline
        experiment={experimentA}
        activity={[]}
        onChanged={onTimelineA2}
      />,
    );
    fireEvent.change(noteInput, { target: { value: "Fresh A note" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    await act(async () => {
      oldUpload.resolve();
      oldNote.resolve();
      await Promise.all([oldUpload.promise, oldNote.promise]);
    });
    expect(onAttachmentA).not.toHaveBeenCalled();
    expect(onAttachmentB).not.toHaveBeenCalled();
    expect(onAttachmentA2).not.toHaveBeenCalled();
    expect(onTimelineA).not.toHaveBeenCalled();
    expect(onTimelineB).not.toHaveBeenCalled();
    expect(onTimelineA2).not.toHaveBeenCalled();
    expect(noteInput.value).toBe("Fresh A note");
    expect(screen.getByRole("button", { name: "Uploading…" })).toBeDefined();

    await act(async () => {
      newUpload.resolve();
      newNote.resolve();
      await Promise.all([newUpload.promise, newNote.promise]);
    });
    expect(onAttachmentA2).toHaveBeenCalledTimes(1);
    expect(onTimelineA2).toHaveBeenCalledTimes(1);
  });

  it("does not invalidate committed work when a new identity render is discarded", async () => {
    const experimentA = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");
    const experimentB = row("00000000-0000-4000-8000-000000000003", 0.3, "npu:2");
    const upload = deferred<void>();
    const note = deferred<void>();
    const never = new Promise<void>(() => undefined);
    vi.mocked(uploadAttachment).mockReturnValue(upload.promise);
    vi.mocked(addExperimentTimelineNote).mockReturnValue(note.promise);
    const onAttachmentChanged = vi.fn();
    const onTimelineChanged = vi.fn();
    let showExperiment!: (experiment: ExperimentListRow) => void;

    function SuspendForB({ id }: { id: string }) {
      if (id === experimentB.id) throw never;
      return null;
    }

    function Harness() {
      const [experiment, setExperiment] = useState(experimentA);
      showExperiment = setExperiment;
      return (
        <Suspense fallback={<p>Loading experiment</p>}>
          <AttachmentGallery
            {...galleryProps(experiment)}
            attachments={[]}
            onChanged={onAttachmentChanged}
          />
          <ExperimentTimeline
            experiment={experiment}
            activity={[]}
            onChanged={onTimelineChanged}
          />
          <SuspendForB id={experiment.id} />
        </Suspense>
      );
    }

    const view = render(<Harness />);
    fireEvent.change(view.container.querySelector('input[type="file"]')!, {
      target: {
        files: [new File(["plot"], "plot.png", { type: "image/png" })],
      },
    });
    fireEvent.change(screen.getByLabelText("Experiment timeline note"), {
      target: { value: "Committed A note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    act(() => {
      startTransition(() => showExperiment(experimentB));
    });
    expect(screen.queryByText("Loading experiment")).toBeNull();
    expect(screen.getByRole("button", { name: "Uploading…" })).toBeDefined();

    await act(async () => {
      upload.resolve();
      note.resolve();
      await Promise.all([upload.promise, note.promise]);
    });
    expect(onAttachmentChanged).toHaveBeenCalledTimes(1);
    expect(onTimelineChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Upload images" })).toBeDefined();
  });
});
