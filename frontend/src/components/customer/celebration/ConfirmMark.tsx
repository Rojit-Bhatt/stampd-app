import { motion } from "motion/react";

import { useMotion } from "../../../lib/motion";

// The mark at the top of the card: a filled disc that scales in, then a stroke
// that draws itself across it.
//
// The draw is the whole point. A static tick that fades in is a picture of a
// confirmation; a stroke that travels is the confirmation happening, and it is
// where this moment gets its craft — one deliberate detail rather than a spray
// of decoration.
// One mark for both outcomes, the way a payment sheet confirms any completed
// transaction with the same tick. Earning and redeeming are told apart by the
// label and the hero line — "+640" against a reward's name — which is a far
// stronger signal than two similar glyphs would be.
//
// An arrow-into-a-tray was tried for redeem and rejected: it is the download
// icon everywhere else on a phone, and pointing it at a cup of coffee asks the
// customer to translate a metaphor they already know to mean something else.
const PATHS = {
  check: "M6 12.6l4.2 4.2L18.4 8.2",
} as const;

export function ConfirmMark({
  kind,
  delay = 0,
}: {
  kind: keyof typeof PATHS;
  delay?: number;
}) {
  const m = useMotion();

  return (
    <motion.div
      initial={m.pick({ scale: 0.6, opacity: 0 }, { opacity: 0 })}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ ...m.spring("confirmQuick"), delay: m.prefersReduced ? 0 : delay }}
      className="flex h-14 w-14 items-center justify-center rounded-full"
      style={{
        background: "var(--primary)",
        boxShadow: "0 8px 24px -6px color-mix(in srgb, var(--primary) 55%, transparent)",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-7 w-7"
        fill="none"
        stroke="#fff"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <motion.path
          d={PATHS[kind]}
          // Under reduced motion the stroke is simply present — a line drawing
          // itself is exactly the kind of travel that setting asks us to drop.
          initial={m.pick({ pathLength: 0 }, { pathLength: 1 })}
          animate={{ pathLength: 1 }}
          transition={{
            duration: m.prefersReduced ? 0 : 0.42,
            ease: [0.65, 0, 0.35, 1],
            delay: m.prefersReduced ? 0 : delay + 0.12,
          }}
        />
      </svg>
    </motion.div>
  );
}

export default ConfirmMark;
