import { useEffect, useRef, useState } from "react";

import { useMotion } from "../lib/motion";

/**
 * Animates a number toward `target` — the odometer behind both celebrations.
 * Earning counts UP from zero; redeeming ticks DOWN from the old balance to
 * the new one, which is why this takes an explicit `from` rather than always
 * starting at 0.
 *
 * Returns the live value. Under reduced motion it returns `target` on the
 * first render and never animates — the figure is information, so it has to
 * be correct immediately, not merely eventually.
 */
export function useCountUp(target: number, options: { from?: number; durationMs?: number } = {}) {
  const { from = 0, durationMs } = options;
  const { countUpMs } = useMotion();
  const duration = durationMs ?? countUpMs;

  const [value, setValue] = useState(duration === 0 ? target : from);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (duration === 0) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const delta = target - from;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      // Ease-out cubic: fast off the mark, settling into the final figure —
      // reads as a value landing rather than a progress bar filling.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + delta * eased);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        // Land exactly on the target: eased arithmetic can leave a
        // fractional cent, and this number is a balance.
        setValue(target);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, from, duration]);

  return value;
}
