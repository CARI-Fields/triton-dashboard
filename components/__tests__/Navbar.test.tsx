import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Navbar from "@/components/Navbar";

const pathnameState = vi.hoisted(() => ({ value: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameState.value,
}));

const navigationCases = [
  { pathname: "/", active: "Task Board" },
  { pathname: "/task/123", active: "Task Board" },
  { pathname: "/experiments", active: "Experiments" },
  { pathname: "/experiments/123", active: "Experiments" },
  { pathname: "/experiments/compare", active: "Compare" },
  { pathname: "/analytics", active: "Analytics" },
  { pathname: "/admin/api-keys", active: "API Keys" },
] as const;

describe("Navbar", () => {
  afterEach(cleanup);

  it("renders the Primary landmark, linked brand, and workspace destinations", () => {
    render(<Navbar />);

    expect(screen.getByRole("navigation", { name: "Primary" })).toBeDefined();
    expect(screen.getByRole("link", { name: /Triton Board\s*Team workspace/ })
      .getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Task Board" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Experiments" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Compare" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Analytics" })).toBeDefined();
    expect(screen.getByRole("link", { name: "API Keys" })
      .getAttribute("href")).toBe("/admin/api-keys");
  });

  for (const { pathname, active } of navigationCases) {
    it(`marks only ${active} active at ${pathname}`, () => {
      pathnameState.value = pathname;
      render(<Navbar />);

      const current = screen.getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page");
      expect(current).toHaveLength(1);
      expect(current[0].textContent).toBe(active);
      expect(current[0].classList).toContain("active");
    });
  }
});
