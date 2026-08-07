import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Icons } from "@blueprintjs/icons";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Checkbox, HTMLSelect } from "@/components/ui/blueprint/Inputs";

beforeAll(async () => {
  Icons.setLoaderOptions({ loader: "all" });
  await Icons.loadAll();
});

describe("HTMLSelect (Blueprint wrapper)", () => {
  afterEach(cleanup);

  it("renders the supplied options", () => {
    render(
      <HTMLSelect
        value="a"
        onChange={() => {}}
        options={[
          { label: "Alpha", value: "a" },
          { label: "Beta", value: "b" },
        ]}
      />,
    );
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
  });

  it("reflects the controlled value on the underlying select", () => {
    render(
      <HTMLSelect
        value="b"
        onChange={() => {}}
        options={[
          { label: "Alpha", value: "a" },
          { label: "Beta", value: "b" },
        ]}
      />,
    );
    const select = screen.getByDisplayValue("Beta") as HTMLSelectElement;
    expect(select.value).toBe("b");
  });

  it("calls onChange with the new string value when selection changes", () => {
    const onChange = vi.fn();
    render(
      <HTMLSelect
        value="a"
        onChange={onChange}
        options={[
          { label: "Alpha", value: "a" },
          { label: "Beta", value: "b" },
        ]}
      />,
    );
    fireEvent.change(screen.getByDisplayValue("Alpha"), {
      target: { value: "b" },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("Checkbox (Blueprint wrapper)", () => {
  afterEach(cleanup);

  it("renders the label", () => {
    render(
      <Checkbox checked={false} onChange={() => {}} label="Subscribe" />,
    );
    expect(screen.getByText("Subscribe")).toBeTruthy();
  });

  it("reflects the controlled checked state", () => {
    const { container } = render(
      <Checkbox checked onChange={() => {}} label="Agree" />,
    );
    const input = container.querySelector(
      "input[type=checkbox]",
    ) as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it("calls onChange with the new boolean when toggled", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Checkbox checked={false} onChange={onChange} label="Agree" />,
    );
    const input = container.querySelector(
      "input[type=checkbox]",
    ) as HTMLInputElement;
    fireEvent.click(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
