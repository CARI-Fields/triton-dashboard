// components/ui/__tests__/Toolbar.test.tsx
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toolbar, SearchInput, ToolbarSegmentedControl } from "@/components/ui/Toolbar";

describe("Toolbar primitives", () => {
  afterEach(cleanup);

  it("SearchInput calls onChange", () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} placeholder="Search" />);
    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("abc");
  });

  it("ToolbarSegmentedControl renders the options and selects one", () => {
    const onChange = vi.fn();
    render(
      <ToolbarSegmentedControl
        value="all"
        onChange={onChange}
        options={[
          { label: "All", value: "all" },
          { label: "Running", value: "running" },
        ]}
      />,
    );
    fireEvent.click(screen.getByText("Running"));
    expect(onChange).toHaveBeenCalledWith("running");
  });

  it("Toolbar renders children", () => {
    render(
      <Toolbar>
        <span>x</span>
      </Toolbar>,
    );
    expect(screen.getByText("x")).toBeDefined();
  });
});
