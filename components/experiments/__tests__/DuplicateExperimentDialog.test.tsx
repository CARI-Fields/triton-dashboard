import {
  useState,
} from "react";
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
  template_id: null,
  archived_at: null,
  core_revision: 1,
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

function DuplicateHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Launch duplicate</button>
      <DuplicateExperimentDialog
        open={open}
        source={source}
        members={[member]}
        onClose={() => setOpen(false)}
        onCreated={() => undefined}
      />
    </>
  );
}

describe("DuplicateExperimentDialog", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);

  it("traps keyboard focus, closes with Escape, and restores the launcher", async () => {
    render(<DuplicateHarness />);
    const launch = screen.getByRole("button", { name: "Launch duplicate" });
    launch.focus();
    fireEvent.click(launch);

    const name = screen.getByLabelText("Duplicate name");
    await waitFor(() => expect(document.activeElement).toBe(name));
    const first = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Duplicate experiment" });

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

  it("keeps focus and Escape inside while duplication is pending", async () => {
    const request = deferred<Experiment>();
    vi.mocked(duplicateExperiment).mockReturnValue(request.promise);
    render(<DuplicateHarness />);
    const launch = screen.getByRole("button", { name: "Launch duplicate" });
    fireEvent.click(launch);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate experiment" }));

    const dialog = screen.getByRole("dialog");
    launch.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBe(dialog);

    await act(async () => request.resolve({ id: "duplicate" } as Experiment));
  });

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
    expect(screen.getByText(
      "Does not copy: Result, Decision, Note, attachments, source timeline, run times",
    )).toBeDefined();
    expect(screen.getByText(
      "The duplicate starts a new timeline with an automatic duplication event.",
    )).toBeDefined();
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

  it("preserves typed fields but submits the latest same-ID source revision", async () => {
    vi.mocked(duplicateExperiment).mockResolvedValue({
      id: "duplicate",
    } as Experiment);
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
    const refreshed = {
      ...source,
      name: "Source refreshed",
      owner_id: otherMember.id,
      config: { temperature: 0.2 },
      updated_at: "2026-07-24T02:00:00.000Z",
    };
    rerender(
      <DuplicateExperimentDialog
        open
        source={refreshed}
        members={[member, otherMember]}
        onClose={() => undefined}
        onCreated={() => undefined}
      />,
    );

    expect((screen.getByLabelText("Duplicate name") as HTMLInputElement).value)
      .toBe("Custom duplicate");
    expect((screen.getByLabelText("Duplicate Owner") as HTMLSelectElement).value)
      .toBe(otherMember.id);
    expect(screen.getByText("Baseline = EXP-0009 · Source refreshed")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Duplicate experiment" }));
    await waitFor(() => expect(duplicateExperiment).toHaveBeenCalledWith(
      refreshed,
      {
        name: "Custom duplicate",
        ownerId: otherMember.id,
      },
    ));
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
