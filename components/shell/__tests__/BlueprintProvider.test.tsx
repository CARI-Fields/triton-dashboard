import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "@blueprintjs/core";
import { BlueprintProvider } from "@/components/shell/BlueprintProvider";

describe("BlueprintProvider", () => {
  afterEach(cleanup);

  it("renders Blueprint children", () => {
    render(
      <BlueprintProvider>
        <Button text="Hello" />
      </BlueprintProvider>,
    );
    expect(screen.getByText("Hello")).toBeDefined();
  });
});
