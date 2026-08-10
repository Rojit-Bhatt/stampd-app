import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "stampd-customer-theme";
type Theme = "light" | "dark";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "dark" ? "dark" : "light";
}

// Module-level singleton, not per-component state: GlobalCustomerLayout
// (applies the .dark class) and CustomerProfilePanel (the toggle switch)
// each call this hook independently, and a plain useState in each would give
// them two disconnected copies — flipping the switch would write
// localStorage but the shell's own class would never re-render. A shared
// store plus useSyncExternalStore keeps every call site in lockstep.
let currentTheme: Theme = readStoredTheme();
const listeners = new Set<() => void>();

function setStoredTheme(next: Theme) {
  currentTheme = next;
  window.localStorage.setItem(STORAGE_KEY, next);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Theme {
  return currentTheme;
}

// Light is the default — dark is an explicit opt-in, never inferred from
// prefers-color-scheme.
export function useCustomerTheme(): { theme: Theme; toggleTheme: () => void } {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const toggleTheme = useCallback(() => {
    setStoredTheme(currentTheme === "light" ? "dark" : "light");
  }, []);

  return { theme, toggleTheme };
}
