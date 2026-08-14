import { motion } from "motion/react";

import { formatPoints } from "../../../hooks/usePoints";
import { useCountUp } from "../../../hooks/useCountUp";
import { useMotion } from "../../../lib/motion";
import type { RedeemCelebrationData } from "../../../context/CelebrationContext";

// The debit entry. Same instrument as the earn moment — one hairline rule and
// one large figure — run backwards: the figure settles DOWN onto the rule
// instead of rising out from behind it, and the balance ticks down rather
// than up. Spending should feel like weight coming to rest, not a pop.
// Matches EarnBurst: step the headline figure down by length, then cap against
// the viewport so it holds at any digit count rather than only the enumerated
// ones.
function figureSize(value: number): string {
  const digits = Math.round(Math.abs(value)).toString().length;
  const px = digits >= 7 ? 40 : digits === 6 ? 50 : digits === 5 ? 58 : 68;
  return `min(${px}px, ${(130 / digits).toFixed(1)}vw)`;
}

export function RedeemLedger({ data }: { data: RedeemCelebrationData }) {
  const m = useMotion();
  const counted = useCountUp(data.balance, { from: data.balanceBefore ?? data.balance });
  const size = figureSize(data.points);

  return (
    <div className="flex flex-col items-center text-center">
      <motion.div
        initial={m.pick({ opacity: 0, y: -6 }, { opacity: 0 })}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...m.spring("settle"), delay: m.prefersReduced ? 0 : 0.44 }}
        className="mb-4 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--ink)]/75"
      >
        Redeemed
      </motion.div>

      <motion.h2
        initial={m.pick({ opacity: 0, y: 10 }, { opacity: 0 })}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...m.spring("settle"), delay: m.prefersReduced ? 0 : 0.1 }}
        className="max-w-[300px] font-display text-[26px] font-bold leading-tight text-[var(--ink)]"
      >
        {data.rewardName}
      </motion.h2>

      <div className="relative mt-7">
        {!m.prefersReduced && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 0.5, 0.28], scale: [0.5, 1.25, 1.05] }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(255,255,255,0.38) 0%, transparent 68%)",
            }}
          />
        )}

        {/* Descends from above and comes to rest on the rule. */}
        <div className="relative overflow-hidden px-2 pb-1">
          <motion.div
            initial={m.pick({ y: "-108%" }, { opacity: 0 })}
            animate={m.pick({ y: "0%" }, { opacity: 1 })}
            transition={m.spring("ledgerSettle")}
            className="flex items-baseline justify-center gap-1"
          >
            <span
              className="font-numeral leading-none text-[var(--muted)]"
              style={{ fontSize: `calc(${size} * 0.45)` }}
            >
              −
            </span>
            <span
              className="font-numeral font-numeral-lg leading-[0.9] text-[var(--ink)]"
              aria-hidden="true"
              style={{ fontSize: size }}
            >
              {formatPoints(data.points)}
            </span>
          </motion.div>
        </div>

        <motion.div
          initial={m.pick({ scaleX: 0 }, { opacity: 0 })}
          animate={m.pick({ scaleX: 1 }, { opacity: 1 })}
          transition={{
            duration: m.prefersReduced ? 0 : 0.55,
            ease: [0.16, 1, 0.3, 1],
            delay: m.prefersReduced ? 0 : 0.22,
          }}
          className="mt-3.5 h-px w-[300px] max-w-[78vw] origin-center bg-gradient-to-r from-transparent via-[var(--ink)]/70 to-transparent"
        />
      </div>

      <span className="sr-only" aria-live="polite">
        {data.rewardName} redeemed for {formatPoints(data.points)} points. Remaining balance{" "}
        {formatPoints(data.balance)}.
      </span>

      <motion.div
        initial={m.pick({ opacity: 0, y: 12 }, { opacity: 0 })}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...m.spring("settle"), delay: m.prefersReduced ? 0 : 0.4 }}
        className="mt-9 flex items-baseline gap-2.5"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]/65">
          Balance
        </span>
        {/* The one green figure on this screen: what's left to spend. */}
        <span className="font-numeral text-[26px] leading-none text-[var(--primary)]">
          {formatPoints(counted)}
        </span>
      </motion.div>

      <motion.p
        initial={m.pick({ opacity: 0 }, { opacity: 0 })}
        animate={{ opacity: 1 }}
        transition={{ ...m.spring("settle"), delay: m.prefersReduced ? 0 : 0.56 }}
        className="mt-5 text-[11px] tracking-[0.04em] text-[var(--ink)]/70"
      >
        Collect it at the counter
      </motion.p>
    </div>
  );
}

export default RedeemLedger;
