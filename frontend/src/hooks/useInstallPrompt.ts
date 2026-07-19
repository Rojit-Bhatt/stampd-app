import { useCallback, useEffect, useState } from "react";

// The event Chromium fires when a site meets the installability criteria.
// Not in lib.dom yet, so it's typed here.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "stampd_install_dismissed_at";
// Long enough that a "not now" isn't nagged past, short enough that someone
// who changes their mind in a month gets offered again.
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

// beforeinstallprompt fires once, early — often before React has mounted and
// certainly before a lazily-loaded route renders. Miss it and there is no way
// to ask for it again, so it's captured at module scope the moment this file
// is imported (the customer layouts import it statically, so that's at boot)
// and replayed to whichever component subscribes later.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<(e: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Stop Chrome's own mini-infobar so ours is the only offer on screen.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    subscribers.forEach((fn) => fn(deferredPrompt));
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    subscribers.forEach((fn) => fn(null));
  });
}

/** True when the app is already running from the home screen. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own non-standard flag — the media query alone misses it.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iOS Safari never fires beforeinstallprompt, so it needs manual steps. */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as a Mac; the touch-point check separates it from a
  // real desktop Safari, which has no install flow at all.
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

function snoozed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < SNOOZE_MS;
  } catch {
    // Private mode / storage disabled — treat as "never dismissed" rather
    // than suppressing the prompt outright.
    return false;
  }
}

/**
 * Whether and how to offer installing the app.
 *
 * `canPrompt` — Chromium gave us a real prompt to fire.
 * `needsManualSteps` — iOS: no API, so the UI must show Share → Add to Home
 *   Screen instead of a button that would do nothing.
 */
export function useInstallPrompt({ ignoreDismissed = false }: { ignoreDismissed?: boolean } = {}) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(deferredPrompt);
  const [dismissed, setDismissed] = useState(() => snoozed());
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    const onChange = (e: BeforeInstallPromptEvent | null) => {
      setPrompt(e);
      if (e === null) setInstalled(true);
    };
    subscribers.add(onChange);
    return () => {
      subscribers.delete(onChange);
    };
  }, []);

  const ios = isIos();

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Non-fatal: the prompt just reappears next visit.
    }
    setDismissed(true);
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return "unavailable" as const;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // The event is single-use: once fired it can't be reused, so drop it
    // either way and let `appinstalled` confirm a real install.
    deferredPrompt = null;
    setPrompt(null);
    // Treat a declined native prompt as a snooze, so the banner doesn't
    // reappear on the next page they open having just said no.
    if (outcome === "dismissed") dismiss();
    return outcome;
  }, [prompt, dismiss]);

  return {
    /**
     * Show the offer at all. `ignoreDismissed` is for places the customer
     * went looking for it (Profile) rather than places it interrupts them
     * (Explore) — a snooze should hide the nag, not delete the feature.
     */
    shouldOffer: !installed && (ignoreDismissed || !dismissed) && (Boolean(prompt) || ios),
    canPrompt: Boolean(prompt),
    needsManualSteps: ios && !prompt,
    installed,
    install,
    dismiss,
  };
}
