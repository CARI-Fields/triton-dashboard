import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Classes } from "@blueprintjs/core";
import { Icons } from "@blueprintjs/icons";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Button, IconButton } from "@/components/ui/blueprint/Button";

// Blueprint loads icon SVG paths lazily; preload them so icons resolve in jsdom.
beforeAll(async () => {
  Icons.setLoaderOptions({ loader: "all" });
  await Icons.loadAll();
});

describe("Button (Blueprint wrapper)", () => {
  afterEach(cleanup);

  it("renders its text", () => {
    render(<Button text="Save" />);
    expect(screen.getByText("Save")).toBeTruthy();
  });

  it("forwards onClick", () => {
    const onClick = vi.fn();
    render(<Button text="Go" onClick={onClick} />);
    fireEvent.click(screen.getByText("Go"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies the intent class for intent=danger", () => {
    const { container } = render(<Button text="Delete" intent="danger" />);
    expect(
      container.querySelector(`button.${Classes.INTENT_DANGER}`),
    ).toBeTruthy();
  });

  it("applies minimal and small classes", () => {
    const { container } = render(<Button text="X" minimal small />);
    expect(container.querySelector(`button.${Classes.MINIMAL}`)).toBeTruthy();
    expect(container.querySelector(`button.${Classes.SMALL}`)).toBeTruthy();
  });
});

describe("IconButton (Blueprint wrapper)", () => {
  afterEach(cleanup);

  it("renders no visible label text but exposes aria-label", () => {
    render(<IconButton icon="more" label="More actions" />);
    const btn = screen.getByLabelText("More actions");
    expect(btn).toBeTruthy();
    // aria-label is set, and the label string is not rendered as visible text
    expect(screen.queryByText("More actions")).toBeNull();
  });

  it("is minimal and small, forwarding onClick", () => {
    const onClick = vi.fn();
    const { container } = render(
      <IconButton icon="plus" label="Add" onClick={onClick} />,
    );
    expect(container.querySelector(`button.${Classes.MINIMAL}`)).toBeTruthy();
    expect(container.querySelector(`button.${Classes.SMALL}`)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Add"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
