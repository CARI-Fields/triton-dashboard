import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Experiment, Member } from "@/lib/types";
import CreateExperimentDialog from "@/components/experiments/CreateExperimentDialog";
import { createExperiment } from "@/lib/experiments/repository";

vi.mock("@/lib/experiments/repository", () => ({
  createExperiment: vi.fn(),
}));

const task = {
  id: "00000000-0000-4000-8000-000000000010",
  title: "Optimize conv2d",
};

const member = {
  id: "00000000-0000-4000-8000-000000000020",
  name: "Bruce",
  initials: "BX",
  position: 0,
  created_at: "2026-07-24T00:00:00.000Z",
} satisfies Member;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function fillAndSubmit(name = "NPU guardrail run") {
  fireEvent.change(screen.getByLabelText("Experiment name"), {
    target: { value: name },
  });
  fireEvent.change(screen.getByLabelText("Task"), { target: { value: task.id } });
  fireEvent.change(screen.getByLabelText("Owner"), { target: { value: member.id } });
  fireEvent.click(screen.getByRole("button", { name: "Create experiment" }));
}

function CreateHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Launch create</button>
      <CreateExperimentDialog
        open={open}
        tasks={[task]}
        members={[member]}
        onClose={() => setOpen(false)}
        onCreated={() => undefined}
      />
    </>
  );
}

describe("CreateExperimentDialog", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("traps keyboard focus, closes with Escape, and restores the launcher", async () => {
    render(<CreateHarness />);
    const launch = screen.getByRole("button", { name: "Launch create" });
    launch.focus();
    fireEvent.click(launch);

    const name = screen.getByLabelText("Experiment name");
    await waitFor(() => expect(document.activeElement).toBe(name));
    const first = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Create experiment" });

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(last, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(launch);
  });

  it("keeps focus and Escape inside while create is pending", async () => {
    const request = deferred<Experiment>();
    vi.mocked(createExperiment).mockReturnValue(request.promise);
    render(<CreateHarness />);
    const launch = screen.getByRole("button", { name: "Launch create" });
    fireEvent.click(launch);
    fillAndSubmit();

    const dialog = screen.getByRole("dialog");
    launch.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBe(dialog);

    await act(async () => request.resolve({ id: "created" } as Experiment));
  });

  it("requires Name, Owner, and Task and creates a planned row", async () => {
    vi.mocked(createExperiment).mockResolvedValue({ id: "new-experiment" } as Experiment);
    const onCreated = vi.fn();
    render(
      <CreateExperimentDialog
        open
        tasks={[task]}
        members={[member]}
        onClose={() => undefined}
        onCreated={onCreated}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create experiment" }));
    expect(screen.getByText("Name, Owner, and Task are required.")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Experiment name"), {
      target: { value: "NPU guardrail run" },
    });
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: task.id } });
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: member.id } });
    fireEvent.click(screen.getByRole("button", { name: "Create experiment" }));

    await waitFor(() => expect(createExperiment).toHaveBeenCalledWith({
      taskId: task.id,
      ownerId: member.id,
      name: "NPU guardrail run",
    }));
    expect(onCreated).toHaveBeenCalledWith({ id: "new-experiment" });
  });

  it("makes user close controls and the backdrop inert while saving", async () => {
    const pending = deferred<Experiment>();
    vi.mocked(createExperiment).mockReturnValue(pending.promise);
    const onClose = vi.fn();
    const onCreated = vi.fn();
    render(
      <CreateExperimentDialog
        open
        tasks={[task]}
        members={[member]}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );

    fillAndSubmit();
    expect((screen.getByRole("button", { name: "Creating…" }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect((screen.getByRole("button", { name: "Close" }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled)
      .toBe(true);
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => pending.resolve({ id: "created" } as Experiment));
    expect(onCreated).toHaveBeenCalledWith({ id: "created" });
  });

  it("suppresses stale success and prevents a second submit after external reopen", async () => {
    const pending = deferred<Experiment>();
    vi.mocked(createExperiment)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ id: "second" } as Experiment);
    const onCreated = vi.fn();
    const props = {
      tasks: [task],
      members: [member],
      onClose: () => undefined,
      onCreated,
    };
    const { rerender } = render(<CreateExperimentDialog open {...props} />);

    fillAndSubmit("First");
    rerender(<CreateExperimentDialog open={false} {...props} />);
    rerender(<CreateExperimentDialog open {...props} />);
    expect((screen.getByRole("button", { name: "Creating…" }) as HTMLButtonElement).disabled)
      .toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Creating…" }));
    expect(createExperiment).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve({ id: "stale" } as Experiment));
    expect(onCreated).not.toHaveBeenCalled();
    fillAndSubmit("Second");
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "second" }));
  });

  it("does not surface a stale failure into a reopened dialog", async () => {
    const pending = deferred<Experiment>();
    vi.mocked(createExperiment).mockReturnValue(pending.promise);
    const props = {
      tasks: [task],
      members: [member],
      onClose: () => undefined,
      onCreated: vi.fn(),
    };
    const { rerender } = render(<CreateExperimentDialog open {...props} />);

    fillAndSubmit();
    rerender(<CreateExperimentDialog open={false} {...props} />);
    rerender(<CreateExperimentDialog open {...props} />);
    await act(async () => {
      pending.reject(new Error("Old request failed."));
      await Promise.resolve();
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "Create experiment" }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it("does not deliver a pending success after unmount", async () => {
    const pending = deferred<Experiment>();
    vi.mocked(createExperiment).mockReturnValue(pending.promise);
    const onCreated = vi.fn();
    const { unmount } = render(
      <CreateExperimentDialog
        open
        tasks={[task]}
        members={[member]}
        onClose={() => undefined}
        onCreated={onCreated}
      />,
    );
    fillAndSubmit();
    unmount();

    await act(async () => pending.resolve({ id: "stale" } as Experiment));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("shows a repository failure and retries in the same open generation", async () => {
    vi.mocked(createExperiment)
      .mockRejectedValueOnce(new Error("Create failed."))
      .mockResolvedValueOnce({ id: "retried" } as Experiment);
    const onCreated = vi.fn();
    render(
      <CreateExperimentDialog
        open
        tasks={[task]}
        members={[member]}
        onClose={() => undefined}
        onCreated={onCreated}
      />,
    );

    fillAndSubmit();
    expect((await screen.findByRole("alert")).textContent).toBe("Create failed.");
    fireEvent.click(screen.getByRole("button", { name: "Create experiment" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "retried" }));
    expect(createExperiment).toHaveBeenCalledTimes(2);
  });
});
