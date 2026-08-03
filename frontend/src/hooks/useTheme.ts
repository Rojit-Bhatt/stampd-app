import { useCallback, useLayoutEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme_preference";

function readStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    // Private mode / storage disabled — fall through to system preference.
    return null;
  }
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches === true
  );
}

/**
 * Wires the `.dark` token block in index.css to a real toggle. Used by all
 * three staff console layouts (AdminLayout, CompanyLayout, PlatformLayout —
 * the only three call sites) and nowhere else: the customer console and the
 * public landing page never call this hook.
 *
 * The `.dark` class lives on `document.documentElement` (every token in
 * index.css is written against `:root`/`.dark`), but it is applied AND
 * REMOVED by this hook's own effect cleanup — not once globally from
 * App.tsx. That means dark mode is live exactly while one of the three
 * console layouts is mounted, and disappears the instant the user navigates
 * to a customer or public route. Since the three console layouts are
 * mutually exclusive route subtrees, only one instance of this hook is ever
 * "in charge" of the class at a time.
 *
 * Preference is one shared localStorage key across all three consoles — one
 * person is behind all of them, so toggling in the admin console and later
 * opening the platform console remembers the choice. No stored preference
 * falls back to the OS-level `prefers-color-scheme`.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => readStoredTheme() ?? (systemPrefersDark() ? "dark" : "light"),
  );

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");

    // Cleanup runs on every re-run of this effect (toggling) AND on unmount
    // (navigating away). Removing the class unconditionally here — rather
    // than only on unmount — is safe: on a toggle, the effect body that
    // follows immediately re-adds it if the new theme is dark, and both
    // happen synchronously before the browser paints (useLayoutEffect), so
    // there's no flash. On a true unmount, nothing follows, so the class is
    // left off — which is the whole point: dark mode must not leak into
    // whatever route is mounted next.
    return () => {
      root.classList.remove("dark");
    };
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Non-fatal: the toggle still works for the life of the tab.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
