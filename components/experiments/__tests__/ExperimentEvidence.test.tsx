import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  addExperimentTimelineNote,
  deleteExperimentAttachment,
  updateExperimentAttachment,
  uploadExperimentAttachment,
} from "@/lib/experiments/repository";

vi.mock("@/lib/experiments/repository", () => ({
  addExperimentTimelineNote: vi.fn(),
  deleteExperimentAttachment: vi.fn(),
  updateExperimentAttachment: vi.fn(),
  uploadExperimentAttachment: vi.fn(),
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

describe("experiment evidence", () => {
  beforeEach(() => vi.clearAllMocks());
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

  it("prioritizes same-Task Baselines and discloses cross-Task differences", () => {
    const current = row("00000000-0000-4000-8000-000000000002", 0.25, "npu:1");
    const sameTask = row("00000000-0000-4000-8000-000000000003", 0.2, "npu:1");
    const crossTask = row("00000000-0000-4000-8000-000000000004", 0.15, "npu:0");
    crossTask.task_id = "00000000-0000-4000-8000-000000000099";
    crossTask.task = { id: crossTask.task_id, title: "Different Task" };

    render(
      <BaselinePicker
        current={current}
        candidates={[crossTask, sameTask]}
        value={crossTask.id}
        onChange={() => undefined}
      />,
    );

    const options = screen.getAllByRole("option");
    expect(options[1].textContent).toContain("run-3");
    expect(options[2].textContent).toContain("run-4");
    expect(screen.getByText(
      "Cross-Task Baseline: Different Task · 1 context fields differ.",
    )).toBeDefined();
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
    vi.mocked(updateExperimentAttachment).mockRejectedValue(
      new Error("Caption failed."),
    );
    vi.mocked(uploadExperimentAttachment).mockRejectedValue(
      new Error("Upload failed."),
    );
    const { container } = render(
      <AttachmentGallery
        experiment={experiment}
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
    await waitFor(() => expect(uploadExperimentAttachment).toHaveBeenCalledWith(
      experiment,
      file,
      1,
    ));
    expect((await screen.findByRole("alert")).textContent).toBe("Upload failed.");
    expect(screen.getAllByRole("img")).toHaveLength(1);
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
    vi.mocked(deleteExperimentAttachment).mockResolvedValue();

    render(
      <AttachmentGallery
        experiment={experiment}
        attachments={[attachment]}
        onChanged={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete image" }));

    await waitFor(() =>
      expect(deleteExperimentAttachment).toHaveBeenCalledWith(attachment)
    );
    confirm.mockRestore();
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
    vi.mocked(uploadExperimentAttachment).mockReturnValue(upload.promise);
    vi.mocked(addExperimentTimelineNote).mockReturnValue(note.promise);
    const onAttachmentChanged = vi.fn();
    const attachmentRender = render(
      <AttachmentGallery
        experiment={experiment}
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
});
