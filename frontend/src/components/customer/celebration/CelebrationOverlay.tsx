import { motion } from "motion/react";
import type { ReactNode } from "react";

import { useMotion } from "../../../lib/motion";

// The scrim + the card the result sits on.
//
// Rendered inside the portal its provider owns — deliberately NOT portalling
// itself. AnimatePresence has to see this motion element as a direct presence
// child to know when its exit animation has finished; with a portal boundary in
// between, a stalled exit leaves the overlay on screen forever instead of
// unmounting. The provider portals the whole AnimatePresence tree, which keeps
// that relationship intact.
//
// The figures sit on an opaque card rather than floating on the blurred
// dashboard. Translucent-on-translucent is where legibility collapses: the
// backdrop here is whatever the customer's dashboard happens to show — a dark
// balance card, a photo, pale empty space — so text laid straight onto it has
// no guaranteed contrast at all. Dimming the background further would only
// trade one problem for a murkier screen. One solid surface fixes it outright,
// and it's also what makes the moment read as a receipt rather than an effect.
//
// The provider's portal target sits outside .customer-shell, where these tokens
// would otherwise resolve against :root — the numeral face would fall back to
// the serif and --primary would stay the light-surface green even for a
// customer in dark mode. The card is always dark, so the shell's DARK token set
// is the correct one in both app themes: the provider pins both classes, which
// keeps this identical in light and dark and picks the green tuned for dark
// surfaces.
export function CelebrationOverlay({ children }: { children: ReactNode }) {
  const m = useMotion();

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: m.prefersReduced ? 0 : 0.28, ease: "easeOut" }}
      className="fixed inset-0 z-[60] flex items-center justify-center px-6"
      style={{
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        // Dim to focus. The dashboard stays legible underneath as context, but
        // it is unambiguously pushed back behind the task.
        background: "rgba(8,11,10,0.44)",
      }}
    >
      <motion.div
        // Materialises rather than merely fading: scale and blur move together
        // so it reads as a real surface arriving, not a picture being turned up.
        initial={m.pick(
          { opacity: 0, scale: 0.92, filter: "blur(12px)" },
          { opacity: 0 },
        )}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        // Leaves along the path it came in on.
        exit={m.pick(
          {
            opacity: 0,
            scale: 0.96,
            filter: "blur(8px)",
            transition: { duration: 0.2, ease: "easeIn" },
          },
          { opacity: 0, transition: { duration: 0 } },
        )}
        transition={m.spring("confirm")}
        // `celebration-content` is the hook for the short-landscape rule in
        // index.css, which scales the whole composition down rather than
        // reflowing it when the viewport is too short to seat the card.
        className="celebration-content w-full max-w-[19.5rem] overflow-hidden rounded-[1.75rem] px-7 pb-7 pt-8"
        style={{
          // Near-opaque, so the figures never fight the dashboard behind them.
          background: "rgba(24,26,25,0.96)",
          // A bright top edge reads as light catching the lip of the material,
          // which is what separates a card from a flat rectangle.
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.10), 0 24px 60px -12px rgba(0,0,0,0.62), 0 2px 8px rgba(0,0,0,0.34)",
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export default CelebrationOverlay;
