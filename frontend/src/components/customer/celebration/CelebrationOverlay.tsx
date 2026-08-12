import { createPortal } from "react-dom";
import { motion } from "motion/react";
import type { ReactNode } from "react";

import { useMotion } from "../../../lib/motion";

// Portals to document.body so this sits above whatever route is mounted
// underneath (the real dashboard), rather than being clipped by any
// scrolling/overflow ancestor in the current route's markup.
export function CelebrationOverlay({ children }: { children: ReactNode }) {
  const m = useMotion();

  return createPortal(
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={m.ease("ui")}
      className="fixed inset-0 z-[60] flex items-center justify-center px-6"
      style={{
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        background: "rgba(10,10,10,0.35)",
      }}
    >
      <motion.div
        initial={m.pick({ opacity: 0, scale: 0.96 }, { opacity: 0 })}
        animate={{ opacity: 1, scale: 1 }}
        exit={m.pick({ opacity: 0, scale: 0.96 }, { opacity: 0 })}
        transition={m.spring("settle")}
        className="w-full max-w-sm"
      >
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default CelebrationOverlay;
