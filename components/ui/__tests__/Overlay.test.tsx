// components/ui/__tests__/Overlay.test.tsx
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Drawer, Dialog } from "@/components/ui/Overlay";

describe("Overlay primitives", () => {
  afterEach(cleanup);

  it("Drawer renders title and calls onClose on its button", () => {
    const onClose = vi.fn();
    render(
      <Drawer isOpen title="Edit" onClose={onClose}>
        body
      </Drawer>,
    );
    expect(screen.getByText("Edit")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Dialog is closed when isOpen is false", () => {
    render(
      <Dialog isOpen={false} title="X" onClose={vi.fn()}>
        hidden
      </Dialog>,
    );
    expect(screen.queryByText("hidden")).toBeNull();
  });
});
