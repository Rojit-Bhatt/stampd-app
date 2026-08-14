import { motion } from "motion/react";
import type { ReactNode } from "react";

import { useMotion } from "../../../lib/motion";

// Rendered inside the portal its provider owns — deliberately NOT portalling
// itself. AnimatePresence has to be able to see this motion element as a direct
// presence child to know when its exit animation has finished; with a portal
// boundary in between, a stalled exit leaves the overlay on screen forever
// instead of unmounting. The provider portals the whole AnimatePresence tree,
// which keeps that relationship intact.
//
// The provider's portal target also sits outside .customer-shell, where every
// token would resolve against :root — the numeral face would flip to the serif
// and --primary would stay the light-surface green even for a customer in dark
// mode. The scrim is always dark, so the shell's DARK token set is the right one
// in both app themes: the provider pins both classes, which keeps the moment
// identical in light and dark and picks the green tuned for dark surfaces.
export function CelebrationOverlay({ children }: { children: ReactNode }) {
  const m = useMotion();

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: m.prefersReduced ? 0 : 0.32, ease: "easeOut" }}
      className="customer-shell dark fixed inset-0 z-[60] flex items-center justify-center px-6"
      style={{
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      {/* Vignette rather than a flat scrim: the dashboard has to stay
          recognisable through it, so the centre is only lightly dimmed and the
          weight is pushed to the edges, where it buys contrast for the figures
          without turning the whole screen into fog. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(115% 85% at 50% 46%, rgba(10,14,12,0.52) 0%, rgba(10,14,12,0.70) 58%, rgba(6,9,8,0.84) 100%)",
        }}
      />

      <motion.div
        initial={m.pick({ opacity: 0, y: 10 }, { opacity: 0 })}
        animate={{ opacity: 1, y: 0 }}
        // Exit is an explicit tween rather than the entrance spring: a spring
        // settles asymptotically, and AnimatePresence holds the element mounted
        // until it reports done.
        exit={{
          opacity: 0,
          y: m.prefersReduced ? 0 : -8,
          transition: { duration: m.prefersReduced ? 0 : 0.22, ease: "easeIn" },
        }}
        transition={m.spring("settle")}
        className="relative w-full max-w-sm"
        // The backdrop is whatever the dashboard happens to show, so the small
        // labels can't rely on the scrim alone for contrast.
        style={{ textShadow: "0 1px 12px rgba(0,0,0,0.55)" }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export default CelebrationOverlay;
