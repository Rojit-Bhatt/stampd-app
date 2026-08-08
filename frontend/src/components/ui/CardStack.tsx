import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

import { useMotion } from "../../lib/motion";

// A collapsed pile that expands into a list — the shared shell behind
// motion.dev's stacked-notifications pattern
// (https://motion.dev/examples/js-notifications-stack), adapted to React.
//
// Unlike the reference (which stacks upward), every caller here needs the
// expanded list to grow DOWNWARD from the trigger — a fixed top-right widget
// expanding upward would grow off the top of the viewport.
interface CardStackProps {
  /** The always-visible collapsed trigger — a pill, a badge, an icon+count. */
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  /** Rendered inside the expanded panel, already ordered top (newest) to bottom. */
  children: ReactNode;
  /** Shown in place of `children` when there's nothing to show. */
  empty?: ReactNode;
  isEmpty?: boolean;
  className?: string;
}

export function CardStack({ trigger, children, empty, isEmpty, className }: CardStackProps) {
  const [open, setOpen] = useState(false);
  const m = useMotion();

  return (
    <div className={`relative ${className ?? ""}`}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={m.pick({ opacity: 0, y: -8, scale: 0.97 }, { opacity: 0 })}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={m.pick({ opacity: 0, y: -8, scale: 0.97 }, { opacity: 0 })}
            transition={m.spring("cardEnter")}
            className="absolute right-0 top-full z-30 mt-2 w-[320px] max-w-[90vw] origin-top-right rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-float"
          >
            {isEmpty ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">{empty}</div>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto py-1.5">{children}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
