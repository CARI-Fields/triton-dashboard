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
import DuplicateExperimentDialog from "@/components/experiments/DuplicateExperimentDialog";
import { duplicateExperiment } from "@/lib/experiments/repository";

vi.mock("@/lib/experiments/repository", () => ({
  duplicateExperiment: vi.fn(),
}));

const source = {
  id: "00000000-0000-4000-8000-000000000001",
  experiment_no: 9,
  task_id: "00000000-0000-4000-8000-000000000010",
  owner_id: "00000000-0000-4000-8000-000000000020",
  name: "Source run",
  status: "completed",
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
    devices: ["npu:0"],
    hardware: "Ascend910",
    evaluator: "grader",
    revision: "r1",
    precision_policy: "fp32",
  },
  config: { temperature: 0.1 },
  metrics: { "pass@1": 0.2 },
  featured_metric_keys: ["pass@1"],
  result_summary: "result",
  decision_outcome: "accepted",
  decision_notes: "keep",
  notes: "note",
  position: 0,
  started_at: "2026-07-24T00:00:00.000Z",
  completed_at: "2026-07-24T01:00:00.000Z",
  created_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T01:00:00.000Z",
} satisfies Experiment;

const member = {
  id: "00000000-0000-4000-8000-000000000020",
  name: "Bruce",
  initials: "BX",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
} satisfies Member;

const otherMember = {
  id: "00000000-0000-4000-8000-000000000021",
  name: "Diana",
  initials: "DX",
  position: 1,
  created_at: "2026-07-24T00:00:00.000Z",
} satisfies Member;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("DuplicateExperimentDialog", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);

  it("shows the explicit Source Baseline and copy/reset boundary", async () => {
    vi.mocked(duplicateExperiment).mockResolvedValue({ id: "duplicate" } as Experiment);
    const onCreated = vi.fn();
    render(
      <DuplicateExperimentDialog
        open
        source={source}
        members={[member]}
        onClose={() => undefined}
        onCreated={onCreated}
      />,
    );
    expect(screen.getByText("Baseline = EXP-0009 · Source run")).toBeDefined();
    expect(screen.getByText("Copies: Task, Owner, Data, Object, Environment, Config")).toBeDefined();
    expect(screen.getByText("Clears: Result, Decision, Note, attachments, timeline, run times")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate experiment" }));
    await waitFor(() => expect(duplicateExperiment).toHaveBeenCalledWith(source, {
      name: "Source run copy",
      ownerId: member.id,
    }));
    expect(onCreated).toHaveBeenCalledWith({ id: "duplicate" });
  });

  it("allows only one duplicate request while a submission is pending", async () => {
    const request = deferred<Experiment>();
    vi.mocked(duplicateExperiment).mockReturnValue(request.promise);
    render(
      <DuplicateExperimentDialog
        open
        source={source}
        members={[member]}
        onClose={() => undefined}
        onCreated={() => undefined}
      />,
    );

    const submit = screen.getByRole("button", { name: "Duplicate experiment" });
    fireEvent.click(submit);
    fireEvent.submit(submit.closest("form")!);

    expect(duplicateExperiment).toHaveBeenCalledTimes(1);
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    request.resolve({ id: "duplicate" } as Experiment);
  });

  it("does not navigate from a result that resolves after the dialog closes", async () => {
    const request = deferred<Experiment>();
    vi.mocked(duplicateExperiment).mockReturnValue(request.promise);
    const onCreated = vi.fn();
    const { rerender } = render(
      <DuplicateExperimentDialog
        open
        source={source}
        members={[member]}
        onClose={() => undefined}
        onCreated={onCreated}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Duplicate experiment" }));
    rerender(
      <DuplicateExperimentDialog
        open={false}
        source={source}
        members={[member]}
        onClose={() => undefined}
        onCreated={onCreated}
      />,
    );
    request.resolve({ id: "duplicate" } as Experiment);

    await waitFor(() => expect(duplicateExperiment).toHaveBeenCalledTimes(1));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("preserves typed fields when the same source refreshes", () => {
    const { rerender } = render(
      <DuplicateExperimentDialog
        open
        source={source}
        members={[member, otherMember]}
        onClose={() => undefined}
        onCreated={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("Duplicate name"), {
      target: { value: "Custom duplicate" },
    });
    fireEvent.change(screen.getByLabelText("Duplicate Owner"), {
      target: { value: otherMember.id },
    });
    rerender(
      <DuplicateExperimentDialog
        open
        source={{
          ...source,
          name: "Source refreshed",
          owner_id: otherMember.id,
          updated_at: "2026-07-24T02:00:00.000Z",
        }}
        members={[member, otherMember]}
        onClose={() => undefined}
        onCreated={() => undefined}
      />,
    );

    expect((screen.getByLabelText("Duplicate name") as HTMLInputElement).value)
      .toBe("Custom duplicate");
    expect((screen.getByLabelText("Duplicate Owner") as HTMLSelectElement).value)
      .toBe(otherMember.id);
    expect(screen.getByText("Baseline = EXP-0009 · Source run")).toBeDefined();
  });

  it("keeps one pending insert across a same-source refresh", async () => {
    const request = deferred<Experiment>();
    vi.mocked(duplicateExperiment).mockReturnValue(request.promise);
    const onCreated = vi.fn();
    const { rerender } = render(
      <DuplicateExperimentDialog
        open
        source={source}
        members={[member]}
        onClose={() => undefined}
        onCreated={onCreated}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Duplicate experiment" }));
    rerender(
      <DuplicateExperimentDialog
        open
        source={{
          ...source,
          name: "Source refreshed",
          updated_at: "2026-07-24T02:00:00.000Z",
        }}
        members={[member]}
        onClose={() => undefined}
        onCreated={onCreated}
      />,
    );
    const form = screen.getByRole("button", { name: "Duplicating…" }).closest("form")!;
    fireEvent.submit(form);

    expect(duplicateExperiment).toHaveBeenCalledTimes(1);
    expect(duplicateExperiment).toHaveBeenCalledWith(source, {
      name: "Source run copy",
      ownerId: member.id,
    });
    await act(async () => {
      request.resolve({ id: "duplicate" } as Experiment);
    });
    expect(onCreated).toHaveBeenCalledWith({ id: "duplicate" });
  });
});
