// components/ui/__tests__/Feedback.test.tsx
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorBanner, SaveBar } from "@/components/ui/Feedback";

describe("Feedback primitives", () => {
  afterEach(cleanup);

  it("EmptyState renders title and action", () => {
    render(<EmptyState title="No experiments" action={<button>Add</button>} />);
    expect(screen.getByText("No experiments")).toBeDefined();
    expect(screen.getByRole("button", { name: "Add" })).toBeDefined();
  });

  it("ErrorBanner calls onRetry", () => {
    const onRetry = vi.fn();
    render(<ErrorBanner message="Failed to load" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("SaveBar shows unsaved state with Save", () => {
    const onSave = vi.fn();
    render(<SaveBar state="unsaved" onSave={onSave} onDiscard={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalled();
  });
});
