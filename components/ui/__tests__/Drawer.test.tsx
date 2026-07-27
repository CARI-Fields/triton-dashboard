import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Drawer from "@/components/ui/Drawer";
import OwnerAvatar from "@/components/ui/OwnerAvatar";
import PageHeader from "@/components/ui/PageHeader";
import StatusDot from "@/components/ui/StatusDot";
import Tag from "@/components/ui/Tag";

function DrawerHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open drawer</button>
      <Drawer
        open={open}
        titleId="harness-drawer-title"
        onClose={() => setOpen(false)}
        footer={<button type="button">Save task</button>}
      >
        <h2 id="harness-drawer-title">Create task</h2>
        <input aria-label="Task title" data-modal-initial-focus />
      </Drawer>
    </>
  );
}

describe("Drawer", () => {
  afterEach(() => {
    cleanup();
    document.querySelectorAll("[data-external-trigger]").forEach((element) => {
      element.remove();
    });
  });

  it("is modal, closes on Escape, and exposes its labelled title", () => {
    const close = vi.fn();

    render(
      <Drawer
        open
        titleId="drawer-title"
        onClose={close}
        footer={<button type="button">Save</button>}
      >
        <h2 id="drawer-title">Create task</h2>
        <input aria-label="Title" />
      </Drawer>,
    );

    const dialog = screen.getByRole("dialog", { name: "Create task" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("drawer-title");
    expect(dialog.classList.contains("drawer-panel")).toBe(true);
    expect(dialog.parentElement?.getAttribute("role")).toBe("presentation");
    expect(dialog.parentElement?.classList.contains("drawer-backdrop")).toBe(true);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns no drawer content while closed", () => {
    render(
      <Drawer
        open={false}
        titleId="closed-drawer-title"
        onClose={() => undefined}
        footer={<button type="button">Save</button>}
      >
        <h2 id="closed-drawer-title">Closed drawer</h2>
      </Drawer>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Closed drawer")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("focuses the preferred control and traps Tab in both directions", () => {
    render(
      <Drawer
        open
        titleId="focus-drawer-title"
        onClose={() => undefined}
        footer={<button type="button">Last action</button>}
      >
        <h2 id="focus-drawer-title">Focus drawer</h2>
        <button type="button" data-modal-initial-focus>First action</button>
      </Drawer>,
    );

    const first = screen.getByRole("button", { name: "First action" });
    const last = screen.getByRole("button", { name: "Last action" });
    expect(document.activeElement).toBe(first);

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("closes from the self-backdrop but ignores nested pointer events", () => {
    const close = vi.fn();
    render(
      <Drawer
        open
        titleId="backdrop-drawer-title"
        onClose={close}
        footer={<button type="button">Save</button>}
      >
        <h2 id="backdrop-drawer-title">Backdrop drawer</h2>
        <button type="button">Nested action</button>
      </Drawer>,
    );

    const dialog = screen.getByRole("dialog", { name: "Backdrop drawer" });
    const backdrop = dialog.parentElement!;
    fireEvent.mouseDown(screen.getByRole("button", { name: "Nested action" }));
    fireEvent.mouseDown(dialog);
    expect(close).not.toHaveBeenCalled();

    fireEvent.mouseDown(backdrop);
    expect(close).toHaveBeenCalledOnce();
  });

  it("suppresses Escape and self-backdrop close while blocked", () => {
    const close = vi.fn();
    render(
      <Drawer
        open
        blocked
        titleId="blocked-drawer-title"
        onClose={close}
        footer={<button type="button">Saving</button>}
      >
        <h2 id="blocked-drawer-title">Blocked drawer</h2>
        <input aria-label="Blocked input" data-modal-initial-focus />
      </Drawer>,
    );

    const dialog = screen.getByRole("dialog", { name: "Blocked drawer" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.mouseDown(dialog.parentElement!);
    expect(close).not.toHaveBeenCalled();
  });

  it("restores real trigger focus after state closes", () => {
    render(<DrawerHarness />);
    const trigger = screen.getByRole("button", { name: "Open drawer" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByLabelText("Task title"));

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    const backdrop = screen.getByRole("dialog").parentElement!;
    fireEvent.mouseDown(backdrop);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("restores real trigger focus when an open drawer unmounts", () => {
    const trigger = document.createElement("button");
    trigger.dataset.externalTrigger = "true";
    document.body.append(trigger);
    trigger.focus();

    const { unmount } = render(
      <Drawer
        open
        titleId="unmount-drawer-title"
        onClose={() => undefined}
        footer={<button type="button">Save</button>}
      >
        <h2 id="unmount-drawer-title">Unmount drawer</h2>
        <input aria-label="Unmount input" data-modal-initial-focus />
      </Drawer>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Unmount input"));

    unmount();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("PageHeader", () => {
  afterEach(cleanup);

  it("renders React nodes in every page-header slot", () => {
    render(
      <PageHeader
        eyebrow={<span>Kernel Agent</span>}
        title={<span>Editable task title</span>}
        description={<a href="#details">Task details</a>}
        actions={<button type="button">New task</button>}
      />,
    );

    const heading = screen.getByRole("heading", { level: 1, name: "Editable task title" });
    const header = heading.closest("header")!;
    expect(header.classList.contains("page-header")).toBe(true);
    expect(header.contains(screen.getByText("Kernel Agent"))).toBe(true);
    expect(header.contains(screen.getByRole("link", { name: "Task details" }))).toBe(true);
    expect(header.contains(screen.getByRole("button", { name: "New task" }))).toBe(true);
  });
});

describe("StatusDot", () => {
  afterEach(cleanup);

  it("maps every task and experiment status to semantic classes and visible labels", () => {
    const cases = [
      ["todo", "To do"],
      ["in_progress", "In progress"],
      ["done", "Done"],
      ["blocked", "Task blocked"],
      ["planned", "Planned"],
      ["running", "Running"],
      ["analyzing", "Analyzing"],
      ["completed", "Completed"],
      ["blocked", "Experiment blocked"],
      ["cancelled", "Cancelled"],
    ] as const;

    render(
      <div>
        {cases.map(([status, label]) => (
          <StatusDot key={label} status={status} label={label} />
        ))}
      </div>,
    );

    for (const [status, label] of cases) {
      const statusElement = screen.getByText(label).closest(".status-dot")!;
      expect(statusElement.classList.contains(`status-${status}`)).toBe(true);
      expect(statusElement.getAttribute("style")).toBeNull();
      const dot = statusElement.querySelector("i")!;
      expect(dot.getAttribute("aria-hidden")).toBe("true");
      expect(dot.getAttribute("style")).toBeNull();
    }
  });
});

describe("OwnerAvatar", () => {
  afterEach(cleanup);

  it("derives or accepts initials, names the image, and bounds its size", () => {
    const { rerender } = render(
      <OwnerAvatar name="Yubai Feng" size={4} />,
    );

    let avatar = screen.getByRole("img", { name: "Yubai Feng" });
    expect(avatar.textContent).toBe("YF");
    expect(avatar.style.width).toBe("20px");
    expect(avatar.style.height).toBe("20px");

    rerender(
      <OwnerAvatar name="Yubai Feng" initials="YX" size={96} />,
    );
    avatar = screen.getByRole("img", { name: "Yubai Feng" });
    expect(avatar.textContent).toBe("YX");
    expect(avatar.style.width).toBe("48px");
    expect(avatar.style.height).toBe("48px");
  });
});

describe("Tag", () => {
  afterEach(cleanup);

  it("uses a deterministic tone and a real accessible removal button", () => {
    const remove = vi.fn();
    const { rerender } = render(
      <Tag value="NPU" removable onRemove={remove} />,
    );

    let tag = screen.getByText("NPU").closest(".tag")!;
    expect(tag.getAttribute("data-tone")).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Remove NPU" }));
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith("NPU");

    rerender(<Tag value="Verifier" />);
    tag = screen.getByText("Verifier").closest(".tag")!;
    expect(tag.getAttribute("data-tone")).toBe("3");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
