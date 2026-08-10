import { useState } from "react";

function storageKey(key: string): string {
  return `stampd-tip-seen:${key}`;
}

// One-way, unlike useCustomerTheme: once shown and dismissed, a tip never
// comes back. `key` scopes it — e.g. per outlet, so a customer with
// memberships at two outlets sees each outlet's tip once, not just the
// first one they ever visited.
export function useFirstVisitTip(key: string): { show: boolean; dismiss: () => void } {
  const [show, setShow] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(storageKey(key)) !== "1";
  });

  const dismiss = () => {
    window.localStorage.setItem(storageKey(key), "1");
    setShow(false);
  };

  return { show, dismiss };
}
