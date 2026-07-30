import { motion, useReducedMotion } from "motion/react";
import { useCallback, useRef, useState } from "react";

// Technique from motion.dev's "rolling text button" example. Two identical
// copies of the label sit in an overflow-hidden window: on activation the
// outgoing copy translates down and out while the incoming copy translates
// down into its place, so the label reads as a cylinder turning.
const outgoingVariants = {
  rest: { y: "0%" },
  active: { y: "100%" },
};

const incomingVariants = {
  rest: { y: "-100%" },
  active: { y: "0%" },
};

const transition = { duration: 0.3, ease: [0.338, 0.015, 0.395, 0.959] as const };

/**
 * Tracks hover and focus as SEPARATE signals and queues the latest intent
 * while a roll is mid-flight.
 *
 * Both halves matter. Without the queue, a fast hover-out during the 300ms
 * roll leaves the label stranded mid-window. Without separate hover/focus
 * refs, tabbing away while the pointer is still over the button would
 * incorrectly roll the label back.
 */
export function useRollingState() {
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const animating = useRef(false);
  const pending = useRef<boolean | null>(null);
  const hovered = useRef(false);
  const focused = useRef(false);
  const reduceMotion = useReducedMotion();

  const request = useCallback(
    (next: boolean) => {
      if (reduceMotion) return;
      if (next === activeRef.current) {
        pending.current = null;
        return;
      }
      if (animating.current) {
        pending.current = next;
        return;
      }
      animating.current = true;
      activeRef.current = next;
      setActive(next);
    },
    [reduceMotion],
  );

  const onAnimationComplete = useCallback(() => {
    if (!animating.current) return;
    animating.current = false;
    if (pending.current !== null && pending.current !== activeRef.current) {
      const next = pending.current;
      pending.current = null;
      animating.current = true;
      activeRef.current = next;
      setActive(next);
    } else {
      pending.current = null;
    }
  }, []);

  return {
    active,
    onAnimationComplete,
    handlers: {
      onMouseEnter: () => {
        hovered.current = true;
        request(true);
      },
      onMouseLeave: () => {
        hovered.current = false;
        request(focused.current);
      },
      onFocus: () => {
        focused.current = true;
        request(true);
      },
      onBlur: () => {
        focused.current = false;
        request(hovered.current);
      },
    },
  };
}

export function RollingLabel({
  children,
  active,
  onAnimationComplete,
}: {
  children: string;
  active: boolean;
  onAnimationComplete: () => void;
}) {
  return (
    <span className="relative block w-max overflow-hidden" aria-hidden="true">
      <motion.span
        className="block whitespace-nowrap"
        variants={outgoingVariants}
        initial="rest"
        animate={active ? "active" : "rest"}
        transition={transition}
        onAnimationComplete={onAnimationComplete}
      >
        {children}
      </motion.span>
      <motion.span
        className="absolute inset-0 block whitespace-nowrap"
        variants={incomingVariants}
        initial="rest"
        animate={active ? "active" : "rest"}
        transition={transition}
      >
        {children}
      </motion.span>
    </span>
  );
}
