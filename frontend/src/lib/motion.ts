// The motion vocabulary. Every animation in the app pulls its config from
// here rather than hand-rolling a spring, so the whole product moves with one
// physics.
//
// Reduced motion is not optional: each export has a `reduced` counterpart, and
// `springFor(prefersReduced)` picks between them. Use the hook below and pass
// the result straight into `motion` props — that way a component cannot ship
// an animation that ignores the setting, because there's no path to the spring
// that skips the check.

import type { Transition } from "motion/react";
import { useReducedMotion } from "motion/react";

/** Instant, no travel. What every spring collapses to under reduced motion. */
export const INSTANT: Transition = { duration: 0 };

export const SPRINGS = {
  /** Earn: the coin lands. Overshoots to 1.16 before settling. */
  coinPop: { type: "spring", stiffness: 280, damping: 14 },
  /** Redeem: the exchange. Voucher flips rotateY 90 -> 0. */
  voucherFlip: { type: "spring", stiffness: 220, damping: 18 },
  /** Balance card entrance: rises and settles. */
  cardEnter: { type: "spring", stiffness: 220, damping: 20 },
  /** A number changing in place: scale 0.92 -> 1. */
  numberChange: { type: "spring", stiffness: 300, damping: 18 },
} satisfies Record<string, Transition>;

export const EASES = {
  /** Hover lift, colour shifts, anything non-celebratory. */
  ui: { duration: 0.18, ease: "easeOut" },
  /** Press. Deliberately faster than the release. */
  press: { duration: 0.1, ease: "easeOut" },
} satisfies Record<string, Transition>;

export type SpringName = keyof typeof SPRINGS;
export type EaseName = keyof typeof EASES;

/** How long a value counts up on earn. 0 under reduced motion — it snaps. */
export const COUNT_UP_MS = 600;

/**
 * Motion config resolved against the user's reduced-motion preference.
 *
 * ```tsx
 * const m = useMotion();
 * <motion.div animate={{ scale: 1 }} transition={m.spring("coinPop")} />
 * ```
 */
export function useMotion() {
  const prefersReduced = useReducedMotion() ?? false;
  return {
    prefersReduced,
    spring: (name: SpringName): Transition => (prefersReduced ? INSTANT : SPRINGS[name]),
    ease: (name: EaseName): Transition => (prefersReduced ? INSTANT : EASES[name]),
    /** Count-up duration in ms — 0 means "just show the final value". */
    countUpMs: prefersReduced ? 0 : COUNT_UP_MS,
    /**
     * Picks between a moving variant and a still one. Use for transforms that
     * have no meaningful zero-duration form (a flip, a slide-in from offscreen)
     * — those should crossfade instead of snapping through the motion.
     */
    // Two type parameters, not one: the still variant is often a different
    // shape from the moving one — commonly `false`, motion's "skip the
    // initial state entirely" value, against an object of transforms.
    pick: <T, U>(moving: T, still: U): T | U => (prefersReduced ? still : moving),
  };
}
