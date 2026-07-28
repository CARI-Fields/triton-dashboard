import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Navbar from "@/components/Navbar";
import ThemeProvider from "@/components/theme/ThemeProvider";

const pathnameState = vi.hoisted(() => ({ value: "/" }));
const logout = vi.hoisted(() => vi.fn());
const NARROW_NAVIGATION_QUERY = "(max-width: 767px)";

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

function installMatchMedia(initiallyNarrow = true) {
  let narrow = initiallyNarrow;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  vi.stubGlobal("matchMedia", vi.fn((query: string) => {
    const isNarrowNavigationQuery = query === NARROW_NAVIGATION_QUERY;
    return {
      get matches() {
        return isNarrowNavigationQuery ? narrow : false;
      },
      media: query,
      onchange: null,
      addEventListener: (
        type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        if (isNarrowNavigationQuery && type === "change") {
          listeners.add(listener);
        }
      },
      removeEventListener: (
        type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        if (isNarrowNavigationQuery && type === "change") {
          listeners.delete(listener);
        }
      },
      addListener: (listener: (event: MediaQueryListEvent) => void) => {
        if (isNarrowNavigationQuery) listeners.add(listener);
      },
      removeListener: (listener: (event: MediaQueryListEvent) => void) => {
        if (isNarrowNavigationQuery) listeners.delete(listener);
      },
      dispatchEvent: () => true,
    } as MediaQueryList;
  }));

  return {
    setNarrow(nextNarrow: boolean) {
      narrow = nextNarrow;
      const event = {
        matches: narrow,
        media: NARROW_NAVIGATION_QUERY,
      } as MediaQueryListEvent;
      for (const listener of listeners) listener(event);
    },
  };
}

describe("Navbar", () => {
  let viewport: ReturnType<typeof installMatchMedia>;

  beforeEach(() => {
    viewport = installMatchMedia();
  });

  afterEach(() => {
    cleanup();
    pathnameState.value = "/";
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    vi.clearAllMocks();
    vi.unstubAllGlobals();
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

  it("moves focus to the labelled modal sheet close control when opened", async () => {
    renderNavbar();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    const sheet = screen.getByRole("dialog", { name: "Navigation" });
    const closeButton = within(sheet).getByRole("button", {
      name: "Close navigation",
    });
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    await waitFor(() => {
      expect(document.activeElement).toBe(closeButton);
    });
  });

  it("closes the navigation sheet with Escape and returns focus to its trigger", async () => {
    renderNavbar();
    const trigger = screen.getByRole("button", { name: "Open navigation" });

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("closes from the in-sheet control or backdrop and returns focus to its trigger", async () => {
    renderNavbar();
    const trigger = screen.getByRole("button", { name: "Open navigation" });

    fireEvent.click(trigger);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Navigation" })).getByRole(
        "button",
        { name: "Close navigation" },
      ),
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });

    fireEvent.click(trigger);
    const backdrop = document.querySelector<HTMLButtonElement>(".nav-backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as HTMLButtonElement);
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("traps forward and reverse Tab focus inside the open navigation sheet", async () => {
    renderNavbar();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const sheet = screen.getByRole("dialog", { name: "Navigation" });
    const first = within(sheet).getByRole("button", { name: "Close navigation" });
    const last = within(sheet).getByRole("button", { name: "Log out" });

    await waitFor(() => {
      expect(document.activeElement).toBe(first);
    });

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("demotes an open sheet at desktop and keeps it closed after shrinking again", async () => {
    renderNavbar();
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    const logoutButton = screen.getByRole("button", { name: "Log out" });

    fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Navigation" })).toBeDefined();
    });

    act(() => viewport.setNarrow(false));

    await waitFor(() => {
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull();
      expect(document.querySelector(".app-sidebar")?.classList)
        .not.toContain("is-open");
      expect(document.querySelector(".nav-backdrop")).toBeNull();
      expect(document.activeElement).not.toBe(trigger);
    });

    logoutButton.focus();
    const desktopTab = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
    });
    document.dispatchEvent(desktopTab);
    expect(desktopTab.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(logoutButton);

    act(() => viewport.setNarrow(true));

    await waitFor(() => {
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull();
      expect(document.querySelector(".app-sidebar")?.classList)
        .not.toContain("is-open");
      expect(document.querySelector(".nav-backdrop")).toBeNull();
    });
  });

  it("closes the narrow navigation sheet after the route changes", async () => {
    const view = renderNavbar();
    const trigger = screen.getByRole("button", { name: "Open navigation" });

    fireEvent.click(trigger);
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
      expect(document.activeElement).toBe(trigger);
    });
  });
});
