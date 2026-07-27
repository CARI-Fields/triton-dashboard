import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Navbar from "@/components/Navbar";
import ThemeProvider from "@/components/theme/ThemeProvider";

const pathnameState = vi.hoisted(() => ({ value: "/" }));
const logout = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameState.value,
}));

vi.mock("@/components/AuthGate", () => ({
  useAuthActions: () => ({ logout }),
}));

const navigationCases = [
  { pathname: "/", active: "Task Board" },
  { pathname: "/task/123", active: "Task Board" },
  { pathname: "/experiments", active: "Experiments" },
  { pathname: "/experiments/123", active: "Experiments" },
  { pathname: "/experiments/compare", active: "Compare" },
  { pathname: "/experiments/compare/shared", active: "Compare" },
  { pathname: "/analytics", active: "Analytics" },
] as const;

function renderNavbar() {
  return render(
    <ThemeProvider>
      <Navbar />
    </ThemeProvider>,
  );
}

describe("Navbar", () => {
  afterEach(() => {
    cleanup();
    pathnameState.value = "/";
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    vi.clearAllMocks();
  });

  it("renders icon destinations, project context, theme control, and team actions", () => {
    renderNavbar();

    expect(screen.getByRole("navigation", { name: "Primary" })).toBeDefined();
    expect(screen.getAllByRole("link", { name: "Triton Board" })[0]
      .getAttribute("href")).toBe("/");
    expect(screen.getByText("Triton Kernel Agent")).toBeDefined();
    expect(screen.getByText("Shared team board")).toBeDefined();
    expect(screen.getByRole("button", { name: "Light theme" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Dark theme" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Log out" })).toBeDefined();

    for (const label of ["Task Board", "Experiments", "Compare", "Analytics"]) {
      const link = screen.getByRole("link", { name: label });
      const icon = link.querySelector("svg");
      expect(icon, `${label} should have an icon`).not.toBeNull();
      expect(icon?.getAttribute("stroke")).toBe("currentColor");
    }
  });

  for (const { pathname, active } of navigationCases) {
    it(`marks only ${active} active at ${pathname}`, () => {
      pathnameState.value = pathname;
      renderNavbar();

      const current = screen.getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page");
      expect(current).toHaveLength(1);
      expect(current[0].textContent).toBe(active);
      expect(current[0].classList).toContain("active");
    });
  }

  it("closes the narrow navigation sheet after the route changes", async () => {
    const view = renderNavbar();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(
      screen.getByRole("button", { name: "Close navigation", expanded: true })
        .getAttribute("aria-expanded"),
    ).toBe("true");

    pathnameState.value = "/analytics";
    view.rerender(
      <ThemeProvider>
        <Navbar />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Open navigation", expanded: false })
          .getAttribute("aria-expanded"),
      ).toBe("false");
    });
  });
});
