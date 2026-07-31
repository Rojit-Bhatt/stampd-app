import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMotion } from "../../lib/motion";

interface DynamicTextProps {
  /** Cycled through on a loop, ahead of the real text. */
  words: string[];
  /** What it comes to rest on and stays as. */
  settled: string;
  className?: string;
}

/** How long each word holds before advancing to the next. */
const HOLD_MS = 1600;

/**
 * Cycles through a handful of greetings, then the real one, on a loop.
 * Reduced motion gets the final text with no cycle at all.
 */
export function DynamicText({ words, settled, className }: DynamicTextProps) {
  const m = useMotion();
  const sequence = [...words, settled];
  const settledIndex = sequence.length - 1;
  const [index, setIndex] = useState(m.prefersReduced ? settledIndex : 0);

  useEffect(() => {
    if (m.prefersReduced) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % sequence.length), HOLD_MS);
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
