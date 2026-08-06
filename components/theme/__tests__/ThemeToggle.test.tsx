import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ThemeProvider from "@/components/theme/ThemeProvider";
import ThemeToggle from "@/components/theme/ThemeToggle";

describe("ThemeToggle", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.removeProperty("color-scheme");
    document.documentElement.classList.remove("bp6-dark");
  });

  it("renders an accessible Theme group with Default and Dark options", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    // getByRole throws if missing, so these lookups assert presence.
    expect(screen.getByRole("radiogroup", { name: "Theme" })).not.toBeNull();
    expect(screen.getByRole("radio", { name: "Default" })).not.toBeNull();
    expect(screen.getByRole("radio", { name: "Dark" })).not.toBeNull();
  });

  it("persists dark mode and updates the root semantic theme", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem("triton-theme")).toBe("dark");
    expect(
      screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("radio", { name: "Default" }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("labels light as Default while preserving the light storage contract", () => {
    localStorage.setItem("triton-theme", "dark");
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Default" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(localStorage.getItem("triton-theme")).toBe("light");
    expect(
      screen.getByRole("radio", { name: "Default" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked"),
    ).toBe("false");
  });
});
