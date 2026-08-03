import { Moon, Sun } from "lucide-react";

import { useTheme } from "../../hooks/useTheme";

interface ThemeToggleProps {
  /**
   * Each of the three console layouts styles this to match its own chrome
   * (AdminLayout/CompanyLayout: sidebar-footer icon button using the ambient
   * theme tokens; PlatformLayout: header icon button, literal hex — see
   * PlatformLayout.tsx for why its header never themes at all).
   */
  className?: string;
}

/**
 * Sun/moon icon button wrapping useTheme(). The icon shown is the
 * DESTINATION, not the current state — a moon while light (tap for dark), a
 * sun while dark (tap for light) — matching how the rest of this console's
 * icon-only affordances describe the action, not the status quo.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className={className}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
