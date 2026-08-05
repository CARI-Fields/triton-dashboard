import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExperimentsPage from "@/app/experiments/page";

vi.mock("@/components/experiments/ExperimentsDatabase", () => ({
  default: () => <div>Experiment database client</div>,
}));

afterEach(cleanup);

describe("ExperimentsPage", () => {
  it("renders the experiments database client", () => {
    render(<ExperimentsPage />);
    expect(screen.getByText("Experiment database client")).toBeDefined();
  });
});
