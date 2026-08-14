import { motion } from "motion/react";

import { formatPoints } from "../../../hooks/usePoints";
import { formatNpr } from "../../../lib/subscription";
import { useCountUp } from "../../../hooks/useCountUp";
import { useMotion } from "../../../lib/motion";
import type { EarnCelebrationData } from "../../../context/CelebrationContext";
import { ConfirmMark } from "./ConfirmMark";
import { LedgerRow } from "./LedgerRow";

// "Confirmed." Earning is the program keeping its promise, so the moment is
// built like a payment confirmation rather than a prize: one mark, one figure,
// one line of context, on a surface that arrives and leaves cleanly.
//
// There are no particles or burst effects. Those read as reward-for-a-child;
// this is the customer's money coming back to them, and it earns its weight
// from the material, the count-up and the settle instead.
export function EarnBurst({ data }: { data: EarnCelebrationData }) {
  const m = useMotion();
  const counted = useCountUp(data.points);
  const hasCampaign = (data.multiplier ?? 1) > 1;

  // Everything on the card lands after the card itself, so the surface reads as
  // arriving first and its contents as settling onto it.
  const step = (delay: number) => ({
    initial: m.pick({ opacity: 0, y: 8 }, { opacity: 0 }),
    animate: { opacity: 1, y: 0 },
    transition: { ...m.spring("confirmQuick"), delay: m.prefersReduced ? 0 : delay },
  });

  return (
    <div className="flex flex-col items-center text-center">
      <ConfirmMark kind="check" delay={0.06} />

      <motion.div
        {...step(0.16)}
        className="mt-5 text-[0.625rem] font-bold uppercase tracking-[0.16em] text-white/55"
      >
        Points earned
      </motion.div>

      {/* Large type wants negative tracking — at this size default spacing
          reads as letters drifting apart. */}
      <motion.div
        {...step(0.19)}
        className="mt-1.5 font-numeral text-[3.5rem] leading-none text-[var(--primary)]"
        style={{ letterSpacing: "-0.02em" }}
        aria-hidden="true"
      >
        +{formatPoints(counted)}
      </motion.div>
      <span className="sr-only" aria-live="polite">
        Earned {formatPoints(data.points)} points on a {formatNpr(data.billAmount)} bill
        {data.outletName ? ` at ${data.outletName}` : ""}. New balance{" "}
        {formatPoints(data.balance)}.
      </span>

      {/* A doubled figure with no reason next to it reads as a bug. */}
      {hasCampaign && (
        <motion.div
          {...step(0.24)}
          className="mt-3 inline-flex items-center rounded-full bg-[var(--primary)]/15 px-3 py-1 text-[0.6875rem] font-bold text-[var(--primary)]"
        >
          {data.multiplier}× {data.campaignName || "campaign"}
        </motion.div>
      )}

      <motion.div {...step(0.28)} className="mt-6 w-full">
        <LedgerRow label="Bill" value={formatNpr(data.billAmount)} />
        <LedgerRow
          label={data.outletName ? `Balance at ${data.outletName}` : "Balance"}
          value={formatPoints(data.balance)}
          emphasis
        />
      </motion.div>
    </div>
  );
}

export default EarnBurst;
