import { cleanup, render } from "@testing-library/react";
import { Icons } from "@blueprintjs/icons";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Icon, type IconName } from "@/components/ui/Icons";

const NAMES: IconName[] = [
  "board", "experiment", "compare", "template", "activity", "analytics",
  "key", "sun", "moon", "logout", "users", "plus", "filter", "more",
  "menu", "close", "search", "chevron-left", "chevron-right",
];

// Blueprint loads icon SVG paths lazily via dynamic import. Preload the full
// bundle so that paths resolve synchronously at first render in jsdom.
beforeAll(async () => {
  Icons.setLoaderOptions({ loader: "all" });
  await Icons.loadAll();
});

describe("Icon (Blueprint-backed)", () => {
  afterEach(cleanup);

  it("renders an SVG for every IconName with no missing-icon fallback", () => {
    for (const name of NAMES) {
      const { container } = render(<Icon name={name} size={18} />);
      // Blueprint <Icon> renders an <svg data-icon>...; a missing icon renders nothing/placeholder.
      const svg = container.querySelector("svg");
      expect(svg, `no svg rendered for ${name}`).not.toBeNull();
      // Blueprint tags its icon svg with the icon name in data-icon
      expect(svg?.getAttribute("data-icon"), `${name} not a real Blueprint icon`).toBeTruthy();
    }
  });

  it("defaults size to 20 when no size is provided", () => {
    const { container } = render(<Icon name="board" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("height")).toBe("20");
  });
});
