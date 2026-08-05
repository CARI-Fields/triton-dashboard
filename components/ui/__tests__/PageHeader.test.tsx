// components/ui/__tests__/PageHeader.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeader, Breadcrumbs } from "@/components/ui/PageHeader";

describe("PageHeader", () => {
  afterEach(cleanup);

  it("renders eyebrow, title, lede, and actions", () => {
    render(
      <PageHeader eyebrow="Research database" title="Experiments" lede="All runs" actions={<button>new</button>} />,
    );
    expect(screen.getByText("Research database")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Experiments", level: 1 })).toBeDefined();
    expect(screen.getByText("All runs")).toBeDefined();
    expect(screen.getByRole("button", { name: "new" })).toBeDefined();
  });

  it("Breadcrumbs renders links in order", () => {
    render(<Breadcrumbs items={[{ text: "Board", href: "/" }, { text: "Task", href: "/task/1" }]} />);
    expect(screen.getByRole("link", { name: "Board" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Task" }).getAttribute("href")).toBe("/task/1");
  });
});
