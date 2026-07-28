"use client";

import { useTheme, type Theme } from "@/components/theme/ThemeProvider";
import { Icon, type IconName } from "@/components/ui/Icons";

const THEME_OPTIONS = [
  { theme: "light", label: "Default", icon: "sun" },
  { theme: "dark", label: "Dark", icon: "moon" },
] satisfies Array<{ theme: Theme; label: string; icon: IconName }>;

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.theme}
          type="button"
          aria-label={`${option.label} theme`}
          aria-pressed={theme === option.theme}
          onClick={() => setTheme(option.theme)}
        >
          <Icon name={option.icon} size={18} />
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
