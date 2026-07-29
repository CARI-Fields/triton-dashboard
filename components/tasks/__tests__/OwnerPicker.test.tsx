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
  onPendingChange,
}: {
  initialOwners?: string[];
  onCreateOwner?: (name: string) => Promise<Member>;
  onChange?: (owners: string[]) => void;
  onPendingChange?: (pending: boolean) => void;
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
      onPendingChange={onPendingChange}
    />
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function testRect({
  top,
  bottom,
  left = 0,
  right = 100,
}: {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
}): DOMRect {
  return {
    x: left,
    y: top,
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  };
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

    const trigger = screen.getByRole("button", { name: "Add owner" });
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Add owner" });
    expect(trigger.parentElement?.classList.contains("owner-picker-anchor"))
      .toBe(true);
    expect(panel.parentElement).toBe(trigger.parentElement);
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

  it("selects a created Owner against the latest controlled Owners", async () => {
    const nova: Member = {
      ...theo,
      id: "member-nova",
      name: "Nova",
      initials: "N",
    };
    const ownerWrite = deferred<Member>();
    const onChange = vi.fn();
    render(
      <Harness
        onCreateOwner={() => ownerWrite.promise}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.change(screen.getByLabelText("New owner name"), {
      target: { value: "Nova" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Maya" }));
    expect(onChange).toHaveBeenLastCalledWith([]);

    ownerWrite.resolve(nova);

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(["Nova"]));
    expect(screen.queryByRole("button", { name: "Remove Maya" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Nova" })).toBeDefined();
  });

  it("notifies synchronously before creation and clears after success", async () => {
    const nova: Member = {
      ...theo,
      id: "member-nova",
      name: "Nova",
      initials: "N",
    };
    const ownerWrite = deferred<Member>();
    const events: string[] = [];
    render(
      <Harness
        initialOwners={[]}
        onPendingChange={(nextPending) => {
          events.push(`pending:${nextPending}`);
        }}
        onCreateOwner={() => {
          events.push("create");
          return ownerWrite.promise;
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.change(screen.getByLabelText("New owner name"), {
      target: { value: "Nova" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create owner" }));

    expect(events).toEqual(["pending:true", "create"]);
    ownerWrite.resolve(nova);
    await waitFor(() => expect(events).toEqual([
      "pending:true",
      "create",
      "pending:false",
    ]));
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

  it("restores the enabled input focus after a deferred rejection", async () => {
    const ownerWrite = deferred<Member>();
    const onCreateOwner = vi.fn(() => ownerWrite.promise);
    const onChange = vi.fn();
    const pendingChanges: boolean[] = [];
    render(
      <Harness
        initialOwners={[]}
        onCreateOwner={onCreateOwner}
        onChange={onChange}
        onPendingChange={(nextPending) => pendingChanges.push(nextPending)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    const input = screen.getByLabelText("New owner name");
    fireEvent.change(input, {
      target: { value: "Nova" },
    });
    const createButton = screen.getByRole("button", { name: "Create owner" });
    createButton.focus();
    fireEvent.click(createButton);

    expect(input).toHaveProperty("disabled", true);
    expect(pendingChanges).toEqual([true]);
    ownerWrite.reject(new Error("Save failed."));

    await waitFor(() => expect(input).toHaveProperty("disabled", false));
    expect(screen.getByRole("dialog", { name: "Add owner" })).toBeDefined();
    expect(input).toHaveProperty("value", "Nova");
    expect(document.activeElement).toBe(input);
    expect(pendingChanges).toEqual([true, false]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders a selected Owner missing from members with fallback initials", () => {
    const missingOwner = "Alexandria Montgomery";
    render(<Harness initialOwners={[missingOwner]} />);

    const avatar = screen.getByRole("img", { name: missingOwner });
    expect(avatar.textContent).toBe("AM");
    expect(screen.getByText(missingOwner).getAttribute("title"))
      .toBe(missingOwner);
  });

  it.each([
    ["above", 738],
    ["below", 838],
  ])(
    "places the panel %s when measuring its drawer boundary",
    (expectedPlacement, boundaryBottom) => {
      const rectSpy = vi.spyOn(
        HTMLElement.prototype,
        "getBoundingClientRect",
      ).mockImplementation(function () {
        if (this.classList.contains("drawer-body")) {
          return testRect({ top: 0, bottom: boundaryBottom });
        }
        if (this.classList.contains("owner-picker-trigger")) {
          return testRect({ top: 411, bottom: 445 });
        }
        if (this.classList.contains("owner-picker-panel")) {
          return testRect({ top: 451, bottom: 804 });
        }
        return testRect({ top: 0, bottom: 0 });
      });

      try {
        render(
          <div className="drawer-body">
            <Harness />
          </div>,
        );
        fireEvent.click(screen.getByRole("button", { name: "Add owner" }));

        expect(
          screen.getByRole("dialog", { name: "Add owner" }).getAttribute(
            "data-placement",
          ),
        ).toBe(expectedPlacement);
      } finally {
        rectSpy.mockRestore();
      }
    },
  );

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
