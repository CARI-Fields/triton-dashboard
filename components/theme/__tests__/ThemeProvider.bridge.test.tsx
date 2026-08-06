import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ThemeProvider, { useTheme } from "@/components/theme/ThemeProvider";

function Toggle() {
  const { setTheme } = useTheme();
  return (
    <>
      <button onClick={() => setTheme("dark")}>dark</button>
      <button onClick={() => setTheme("light")}>light</button>
    </>
  );
}

describe("ThemeProvider bp6-dark bridge", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("bp6-dark");
    delete (document.documentElement.dataset as Record<string, string | undefined>).theme;
  });

  it("adds bp6-dark for dark and removes it for light", () => {
    const { getByText } = render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    );
    act(() => getByText("dark").click());
    expect(document.documentElement.classList.contains("bp6-dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => getByText("light").click());
    expect(document.documentElement.classList.contains("bp6-dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
