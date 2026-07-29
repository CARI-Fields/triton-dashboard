import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import WorkspaceSkeleton from "@/components/ui/WorkspaceSkeleton";

afterEach(cleanup);

describe("WorkspaceSkeleton", () => {
  it("announces the board load while hiding four structural columns", () => {
    render(<WorkspaceSkeleton variant="board" label="Loading Tasks" />);

    expect(screen.getByRole("status", { name: "Loading Tasks" })).toBeDefined();
    expect(document.querySelectorAll(".skeleton-board-column")).toHaveLength(4);
    expect(document.querySelector(".skeleton-visual")?.getAttribute("aria-hidden"))
      .toBe("true");
  });

  it.each([
    ["table", ".skeleton-table > i", 7],
    ["record", ".skeleton-record i", 13],
    ["analytics", ".skeleton-analytics > i", 5],
  ] as const)(
    "keeps the %s variant structurally recognizable",
    (variant, selector, count) => {
      render(
        <WorkspaceSkeleton
          variant={variant}
          label={`Loading ${variant}`}
        />,
      );

      expect(screen.getByRole("status", {
        name: `Loading ${variant}`,
      })).toBeDefined();
      expect(document.querySelectorAll(selector)).toHaveLength(count);
    },
  );
});
