// components/ui/__tests__/Button.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button, IconButton } from "@/components/ui/Button";

describe("Button primitives", () => {
  afterEach(cleanup);

  it("renders a Blueprint button with text", () => {
    render(<Button text="Save" intent="primary" />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
  });

  it("IconButton exposes an accessible label", () => {
    render(<IconButton icon="trash" label="Delete task" />);
    expect(screen.getByRole("button", { name: "Delete task" })).toBeDefined();
  });
});
