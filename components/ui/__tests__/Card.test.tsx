// components/ui/__tests__/Card.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Card, Callout, ProgressBar } from "@/components/ui/Card";

describe("Card primitives", () => {
  afterEach(cleanup);

  it("Card renders title and children", () => {
    render(
      <Card title="Metrics">
        <p>body</p>
      </Card>,
    );
    expect(screen.getByText("Metrics")).toBeDefined();
    expect(screen.getByText("body")).toBeDefined();
  });

  it("Callout renders intent title", () => {
    render(
      <Callout intent="warning" title="Heads up">
        be careful
      </Callout>,
    );
    expect(screen.getByText("Heads up")).toBeDefined();
  });

  it("ProgressBar renders a progressbar role", () => {
    render(<ProgressBar value={0.5} />);
    expect(screen.getByRole("progressbar")).toBeDefined();
  });
});
