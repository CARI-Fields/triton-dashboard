"use client";

import { SegmentedControl } from "@blueprintjs/core";

import { useTheme, type Theme } from "@/components/theme/ThemeProvider";

const OPTIONS = [
  { label: "Default", value: "light" as Theme },
  { label: "Dark", value: "dark" as Theme },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <SegmentedControl
      aria-label="Theme"
      small
      options={OPTIONS}
      value={theme}
      onValueChange={(value) => setTheme(value as Theme)}
    />
  );
}
