import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMotion } from "../../lib/motion";

interface DynamicTextProps {
  /** Cycled through once, quickly, on mount. */
  words: string[];
  /** What it comes to rest on and stays as. */
  settled: string;
  className?: string;
}

/**
 * Runs through a handful of greetings and lands on the real one. The cycle
 * happens once per mount, never loops — a permanently animating greeting is
 * a distraction on a page whose actual job is showing a balance.
 */
export function DynamicText({ words, settled, className }: DynamicTextProps) {
  const m = useMotion();
  const sequence = [...words, settled];
  // A reduced-motion user gets the final text immediately, with no cycle.
  const [index, setIndex] = useState(m.prefersReduced ? sequence.length - 1 : 0);

  useEffect(() => {
    if (m.prefersReduced) return;
    if (index >= sequence.length - 1) return;
    const timer = setTimeout(() => setIndex((i) => i + 1), 300);
    return () => clearTimeout(timer);
  }, [index, sequence.length, m.prefersReduced]);

  return (
    <span className={className}>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={index}
          initial={m.pick({ y: 16, opacity: 0 }, false)}
          animate={{ y: 0, opacity: 1 }}
          exit={m.pick({ y: -16, opacity: 0 }, { opacity: 0 })}
          transition={m.ease("ui")}
          className="inline-block"
        >
          {sequence[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
