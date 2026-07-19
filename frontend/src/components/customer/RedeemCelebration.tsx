import { ArrowRight, Ticket } from "lucide-react";
import { motion } from "motion/react";

import { formatPoints } from "../../hooks/usePoints";
import { useCountUp } from "../../hooks/useCountUp";
import { useMotion } from "../../lib/motion";
import { Button } from "@/components/ui/button";

interface RedeemCelebrationProps {
  /** Points just spent (positive magnitude). */
  points: number;
  rewardName: string;
  /** Balance AFTER the redemption. */
  balance: number;
  /** Balance BEFORE — the figure the counter ticks down FROM. */
  balanceBefore?: number;
  onDone: () => void;
  doneLabel?: string;
  onSecondary?: () => void;
  secondaryLabel?: string;
}

// "The exchange." Redeeming is deliberately a different physical event from
// earning: a voucher flips into existence and the balance ticks DOWN to its
// new figure, rather than a coin landing and a number counting up.
//
// The dashed border is doing a job, not decoration — this screen is what the
// customer holds up to staff, so it has to read as a thing to be handed over.
export function RedeemCelebration({
  points,
  rewardName,
  balance,
  balanceBefore,
  onDone,
  doneLabel = "Back to my points",
  onSecondary,
  secondaryLabel,
}: RedeemCelebrationProps) {
  const m = useMotion();
  // Ticks down from the pre-redemption balance when we know it; otherwise it
  // just shows the settled figure rather than counting from a made-up number.
  const counted = useCountUp(balance, { from: balanceBefore ?? balance });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reward redeemed"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[var(--bg)] px-6 py-10"
    >
      <div className="w-full max-w-sm">
        {/* The voucher. Flips in on Y — under reduced motion it crossfades
            instead, since a half-rotated card at duration 0 is meaningless. */}
        <motion.div
          initial={m.pick({ rotateY: 90, opacity: 0 }, { opacity: 0 })}
          animate={m.pick({ rotateY: 0, opacity: 1 }, { opacity: 1 })}
          transition={m.spring("voucherFlip")}
          style={{ transformPerspective: 1000 }}
          className="rounded-[var(--radius-card)] border-2 border-dashed border-[var(--primary)] bg-[var(--surface)] px-6 py-8 text-center shadow-ambient"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)]">
            <Ticket className="h-6 w-6 text-[var(--primary-deep)]" strokeWidth={1.75} />
          </div>

          <h2 className="mt-5 font-display text-2xl font-bold text-[var(--ink)]">Enjoy!</h2>

          <motion.p
            initial={m.pick({ opacity: 0, y: 10 }, { opacity: 0 })}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...m.spring("cardEnter"), delay: m.prefersReduced ? 0 : 0.18 }}
            className="mt-2 font-display text-lg font-bold text-[var(--ink)]"
          >
            {rewardName}
          </motion.p>

          <p className="mt-3 text-sm text-[var(--muted)]">
            {formatPoints(points)} points redeemed
          </p>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
            Show this to staff
          </p>
        </motion.div>

        <motion.div
          initial={m.pick({ opacity: 0, y: 14 }, { opacity: 0 })}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...m.spring("cardEnter"), delay: m.prefersReduced ? 0 : 0.3 }}
          className="mt-5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5 text-center shadow-ambient"
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
            Remaining balance
          </div>
          <p
            className="mt-1.5 font-numeral text-4xl leading-none text-[var(--ink)]"
            aria-hidden="true"
          >
            {formatPoints(counted)}
          </p>
          <span className="sr-only" aria-live="polite">
            {rewardName} redeemed for {formatPoints(points)} points. Remaining balance{" "}
            {formatPoints(balance)}.
          </span>
        </motion.div>

        <div className="mt-8 flex flex-col gap-2.5">
          <Button onClick={onDone} size="lg" className="w-full">
            {doneLabel}
            <ArrowRight />
          </Button>
          {onSecondary && secondaryLabel && (
            <Button onClick={onSecondary} variant="ghost">
              {secondaryLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default RedeemCelebration;
