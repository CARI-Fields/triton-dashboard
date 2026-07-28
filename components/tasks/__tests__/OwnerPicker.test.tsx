import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OwnerPicker from "@/components/tasks/OwnerPicker";
import {
  findMemberByName,
  initialsFromName,
  memberNameKey,
} from "@/lib/members";
import type { Member } from "@/lib/types";

const maya: Member = {
  id: "member-maya",
  name: "Maya",
  initials: "MY",
  position: 0,
  created_at: "2026-07-28T00:00:00.000Z",
};
const theo: Member = {
  ...maya,
  id: "member-theo",
  name: "Theo",
  initials: "TK",
  position: 1,
};

function Harness({
  initialOwners = ["Maya"],
  onCreateOwner = vi.fn().mockResolvedValue({
    ...theo,
    id: "member-nova",
    name: "Nova",
    initials: "N",
  }),
  onChange = vi.fn(),
}: {
  initialOwners?: string[];
  onCreateOwner?: (name: string) => Promise<Member>;
  onChange?: (owners: string[]) => void;
}) {
  const [owners, setOwners] = useState(initialOwners);
  return (
    <OwnerPicker
      members={[maya, theo]}
      owners={owners}
      onCreateOwner={onCreateOwner}
      onChange={(next) => {
        onChange(next);
        setOwners(next);
      }}
    />
  );
}

afterEach(cleanup);

describe("member identity helpers", () => {
  it("normalizes names without changing display copy", () => {
    expect(memberNameKey("  MAYA  ")).toBe("maya");
    expect(findMemberByName([maya], " maya ")).toBe(maya);
    expect(initialsFromName("Alexandria Montgomery")).toBe("AM");
  });
});

describe("OwnerPicker", () => {
  it("creates with Enter inside an ancestor form without submitting it", async () => {
    const nova: Member = {
      ...theo,
      id: "member-nova",
      name: "Nova",
      initials: "N",
    };
    const onCreateOwner = vi.fn().mockResolvedValue(nova);
    const onSubmit = vi.fn();
    const { container } = render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Harness
          initialOwners={[]}
          onCreateOwner={onCreateOwner}
        />
      </form>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    expect(container.querySelectorAll("form")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("New owner name"), {
      target: { value: "Nova" },
    });
    fireEvent.keyDown(screen.getByLabelText("New owner name"), {
      key: "Enter",
    });

    await waitFor(() => expect(onCreateOwner).toHaveBeenCalledOnce());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove Nova" })).toBeDefined();
  });

  it("shows selected Owners only until Add owner opens", () => {
    render(<Harness />);
    expect(screen.getByText("Maya")).toBeDefined();
    expect(screen.queryByText("Theo")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    const panel = screen.getByRole("dialog", { name: "Add owner" });
    expect(within(panel).getByRole("button", { name: "Add Theo" }))
      .toBeDefined();
    expect(within(panel).queryByRole("button", { name: "Add Maya" }))
      .toBeNull();
  });

  it("removes a selected Owner and adds an existing member", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Maya" }));
    expect(onChange).toHaveBeenLastCalledWith([]);

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Theo" }));
    expect(onChange).toHaveBeenLastCalledWith(["Theo"]);
    expect(screen.queryByRole("dialog", { name: "Add owner" })).toBeNull();
  });

  it("creates a unique member and immediately selects the returned row", async () => {
    const nova: Member = {
      ...theo,
      id: "member-nova",
      name: "Nova",
      initials: "N",
    };
    const onCreateOwner = vi.fn().mockResolvedValue(nova);
    const onChange = vi.fn();
    render(
      <Harness
        initialOwners={[]}
        onCreateOwner={onCreateOwner}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.change(screen.getByLabelText("New owner name"), {
      target: { value: "  Nova  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create owner" }));

    await waitFor(() => expect(onCreateOwner).toHaveBeenCalledWith("Nova"));
    expect(onChange).toHaveBeenLastCalledWith(["Nova"]);
    expect(screen.getByText("Nova")).toBeDefined();
  });

  it("reuses a case-insensitive existing member without inserting", () => {
    const onCreateOwner = vi.fn();
    const onChange = vi.fn();
    render(
      <Harness
        initialOwners={[]}
        onCreateOwner={onCreateOwner}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.change(screen.getByLabelText("New owner name"), {
      target: { value: " tHeO " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create owner" }));

    expect(onCreateOwner).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(["Theo"]);
  });

  it("retains a failed create draft and leaves selection unchanged", async () => {
    const onCreateOwner = vi.fn().mockRejectedValue(new Error("Save failed."));
    const onChange = vi.fn();
    render(
      <Harness
        initialOwners={[]}
        onCreateOwner={onCreateOwner}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.change(screen.getByLabelText("New owner name"), {
      target: { value: "Nova" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create owner" }));

    await waitFor(() => expect(onCreateOwner).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog", { name: "Add owner" })).toBeDefined();
    expect(screen.getByLabelText("New owner name")).toHaveProperty(
      "value",
      "Nova",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes on Escape or outside pointer input and restores trigger focus", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Add owner" });
    fireEvent.click(trigger);
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByLabelText("New owner name"),
    ));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Add owner" })).toBeNull();
  });
});
