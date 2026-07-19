import { useState } from "react";
import { X, Share, Plus, Download } from "lucide-react";
import { motion } from "motion/react";

import { useInstallPrompt } from "../../hooks/useInstallPrompt";
import { useMotion } from "../../lib/motion";
import { PLATFORM_NAME } from "../../lib/platform";
import { StampdLogo } from "../shared/StampdLogo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// Offers "add to home screen" once the browser says the app is installable.
//
// Two genuinely different paths, because the platforms differ:
//   Chromium — a real beforeinstallprompt we can fire on a tap, so this is
//     one button and the OS takes over.
//   iOS Safari — no API at all. A button would do nothing, so instead it
//     shows the actual steps, with the real Share icon the user is looking
//     for. Promising a one-tap install there and delivering nothing would be
//     worse than not offering.
//
// Deliberately a dismissible inline card, not an interstitial: this is a
// loyalty app someone opened to check a balance, and blocking that behind an
// install ask would be the app serving itself.
export function InstallAppPrompt({
  className = "",
  persistent = false,
}: {
  className?: string;
  /** Ignore a previous dismissal — for Profile, where it's sought out. */
  persistent?: boolean;
}) {
  const { shouldOffer, canPrompt, needsManualSteps, install, dismiss } = useInstallPrompt({
    ignoreDismissed: persistent,
  });
  const [showIosSteps, setShowIosSteps] = useState(false);
  const m = useMotion();

  if (!shouldOffer) return null;

  return (
    <>
      <motion.div
        initial={m.pick({ opacity: 0, y: 8 }, { opacity: 0 })}
        animate={{ opacity: 1, y: 0 }}
        transition={m.spring("cardEnter")}
        className={`flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-ambient ${className}`}
      >
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[var(--radius-field)] bg-[var(--surface-2)]">
          <StampdLogo size={24} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-[var(--ink)]">Add {PLATFORM_NAME} to your phone</div>
          <p className="mt-0.5 text-[13px] leading-snug text-[var(--muted)]">
            Opens straight to your points — no app store, nothing to download.
          </p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <Button
            size="sm"
            onClick={() => (canPrompt ? install() : setShowIosSteps(true))}
          >
            {canPrompt ? <Download /> : <Share />}
            {canPrompt ? "Install" : "How"}
          </Button>
          {!persistent && (
            <button
              onClick={dismiss}
              aria-label="Not now"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--soft)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </motion.div>

      {/* iOS only — the steps, since Safari gives no programmatic install. */}
      <Dialog open={showIosSteps && needsManualSteps} onOpenChange={setShowIosSteps}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">
              Add to Home Screen
            </DialogTitle>
            <DialogDescription>
              Safari can't do this for you, but it's two taps.
            </DialogDescription>
          </DialogHeader>

          <ol className="my-1 flex flex-col gap-3">
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-numeral text-sm text-[var(--muted)]">
                1
              </span>
              <span className="flex items-center gap-1.5 text-sm text-[var(--ink)]">
                Tap
                <Share className="h-4 w-4 text-[var(--primary-deep)]" />
                <b>Share</b> in the toolbar
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-numeral text-sm text-[var(--muted)]">
                2
              </span>
              <span className="flex items-center gap-1.5 text-sm text-[var(--ink)]">
                Choose
                <Plus className="h-4 w-4 text-[var(--primary-deep)]" />
                <b>Add to Home Screen</b>
              </span>
            </li>
          </ol>

          <Button variant="ghost" className="w-full" onClick={() => setShowIosSteps(false)}>
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default InstallAppPrompt;
