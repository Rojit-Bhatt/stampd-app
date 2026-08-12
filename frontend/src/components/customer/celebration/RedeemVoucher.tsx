import { motion } from "motion/react";
import { Ticket } from "lucide-react";

import { formatPoints } from "../../../hooks/usePoints";
import { useCountUp } from "../../../hooks/useCountUp";
import { useMotion } from "../../../lib/motion";
import type { RedeemCelebrationData } from "../../../context/CelebrationContext";

// "The ticket." A voucher card pops up from below and settles, with a light
// sweep across it once, then the balance ticks down beneath it. Deliberately
// no rotateY flip (that was the old design) — this rises and lands instead.
export function RedeemVoucher({ data }: { data: RedeemCelebrationData }) {
  const m = useMotion();
  const counted = useCountUp(data.balance, { from: data.balanceBefore ?? data.balance });

  return (
    <div className="flex flex-col items-center text-center">
      <motion.div
        initial={m.pick({ scale: 0.6, y: 24, opacity: 0 }, { opacity: 0 })}
        animate={m.pick({ scale: 1, y: 0, opacity: 1 }, { opacity: 1 })}
        transition={m.spring("ticketPop")}
        className="relative w-[260px] overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)] px-6 py-7 text-center shadow-ambient"
      >
        {/* Notch cutouts read as a ticket edge, not a plain card. */}
        <span className="absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-[var(--bg)]" />
        <span className="absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-[var(--bg)]" />

        {!m.prefersReduced && (
          <motion.span
            initial={{ x: "-120%" }}
            animate={{ x: "220%" }}
            transition={{ duration: 0.9, ease: "easeInOut", delay: 0.25 }}
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent"
          />
        )}

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)]">
          <Ticket className="h-6 w-6 text-[var(--primary-deep)]" strokeWidth={1.75} />
        </div>

        <h2 className="mt-5 font-display text-xl font-bold text-[var(--ink)]">Reward unlocked</h2>

        <p className="mt-1 font-display text-lg font-bold text-[var(--primary-deep)]">
          {data.rewardName}
        </p>

        <div className="mt-4 border-t border-dashed border-[var(--line)] pt-4">
          <p className="text-sm text-[var(--muted)]">{formatPoints(data.points)} points redeemed</p>
        </div>
      </motion.div>

      <motion.div
        initial={m.pick({ opacity: 0, y: 14 }, { opacity: 0 })}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...m.spring("settle"), delay: m.prefersReduced ? 0 : 0.3 }}
        className="mt-5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5 text-center shadow-ambient"
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
          Remaining balance
        </div>
        <p className="mt-1.5 font-numeral text-4xl leading-none text-[var(--ink)]" aria-hidden="true">
          {formatPoints(counted)}
        </p>
        <span className="sr-only" aria-live="polite">
          {data.rewardName} redeemed for {formatPoints(data.points)} points. Remaining balance{" "}
          {formatPoints(data.balance)}.
        </span>
      </motion.div>
    </div>
  );
}

export default RedeemVoucher;
