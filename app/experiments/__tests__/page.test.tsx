import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import ExperimentsPage from "@/app/experiments/page";

vi.mock("@/components/AuthGate", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="auth-gate">{children}</div>
  ),
}));

vi.mock("@/components/experiments/ExperimentsDatabase", () => ({
  default: () => <div>Experiment database client</div>,
}));

afterEach(cleanup);

describe("ExperimentsPage", () => {
  it("keeps the route thin and preserves AuthGate", () => {
    render(<ExperimentsPage />);
    expect(screen.getByTestId("auth-gate")).toBeDefined();
    expect(screen.getByText("Experiment database client")).toBeDefined();
  });
});
