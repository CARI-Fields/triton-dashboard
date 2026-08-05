import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarNav } from "@/components/shell/SidebarNav";

const pathnameState = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathnameState.value }));

const cases = [
  { pathname: "/", active: "Task Board" },
  { pathname: "/task/123", active: "Task Board" },
  { pathname: "/experiments", active: "Experiments" },
  { pathname: "/experiments/123", active: "Experiments" },
  { pathname: "/experiments/compare", active: "Compare" },
  { pathname: "/analytics", active: "Analytics" },
] as const;

describe("SidebarNav", () => {
  afterEach(cleanup);

  it("renders the brand and the workspace destinations", () => {
    render(<SidebarNav onLogout={vi.fn()} />);
    expect(screen.getByRole("link", { name: /Triton Board/ }).getAttribute("href")).toBe("/");
    for (const label of ["Task Board", "Experiments", "Compare", "Analytics"]) {
      expect(screen.getByRole("link", { name: label })).toBeDefined();
    }
    expect(screen.getByRole("button", { name: /Log out/i })).toBeDefined();
  });

  for (const { pathname, active } of cases) {
    it(`marks only ${active} active at ${pathname}`, () => {
      pathnameState.value = pathname;
      render(<SidebarNav onLogout={vi.fn()} />);
      const current = screen
        .getAllByRole("link")
        .filter((l) => l.getAttribute("aria-current") === "page");
      expect(current).toHaveLength(1);
      expect(current[0].textContent).toBe(active);
    });
  }
});
