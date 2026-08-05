// components/ui/__tests__/Tag.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusTag, StatusDot, decisionIntent } from "@/components/ui/Tag";

describe("Tag primitives", () => {
  afterEach(cleanup);

  it("StatusTag renders the label text", () => {
    render(<StatusTag intent="success">Done</StatusTag>);
    expect(screen.getByText("Done")).toBeDefined();
  });

  it("StatusDot renders an element with the status class", () => {
    const { container } = render(<StatusDot status="done" />);
    expect(container.querySelector(".dot.done")).not.toBeNull();
  });

  it("decisionIntent maps accepted to success", () => {
    expect(decisionIntent("accepted")).toBe("success");
  });
});
