import { motion } from "motion/react";

import { formatPoints } from "../../../hooks/usePoints";
import { useCountUp } from "../../../hooks/useCountUp";
import { useMotion } from "../../../lib/motion";
import type { RedeemCelebrationData } from "../../../context/CelebrationContext";
import { ConfirmMark } from "./ConfirmMark";
import { LedgerRow } from "./LedgerRow";

// The redeem counterpart. Same surface, same springs, same receipt — so the two
// moments are obviously siblings — but the hero is the reward the customer just
// bought, not a number, because that is the thing they actually chose.
//
// The points figure is shown as a debit and the balance ticks DOWN to its new
// value, so spending never wears the same clothes as earning.
export function RedeemLedger({ data }: { data: RedeemCelebrationData }) {
  const m = useMotion();
  // Counts down from the pre-redemption balance when we know it; otherwise it
  // just shows the settled figure rather than counting from an invented one.
  const counted = useCountUp(data.balance, { from: data.balanceBefore ?? data.balance });

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
        Redeemed
      </motion.div>

      <motion.div
        {...step(0.19)}
        className="mt-1.5 font-display text-[1.75rem] font-bold leading-tight text-white"
        style={{ letterSpacing: "-0.01em" }}
      >
        {data.rewardName}
      </motion.div>

      <span className="sr-only" aria-live="polite">
        {data.rewardName} redeemed for {formatPoints(data.points)} points. Remaining balance{" "}
        {formatPoints(data.balance)}.
      </span>

      <motion.div {...step(0.28)} className="mt-6 w-full">
        <LedgerRow label="Points spent" value={`−${formatPoints(data.points)}`} />
        <LedgerRow
          label="Balance remaining"
          value={formatPoints(counted)}
          emphasis
        />
      </motion.div>
    </div>
  );
}

export default RedeemLedger;
