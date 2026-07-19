import { ArrowRight, Zap } from "lucide-react";
import { motion } from "motion/react";

import { formatPoints } from "../../hooks/usePoints";
import { formatNpr } from "../../lib/subscription";
import { useCountUp } from "../../hooks/useCountUp";
import { useMotion } from "../../lib/motion";
import { Button } from "@/components/ui/button";

interface EarnCelebrationProps {
  /** Points just added. */
  points: number;
  /** What the customer actually paid. */
  billAmount: number;
  /** Balance AFTER the earn. */
  balance: number;
  /** Outlet name, so the customer knows which balance moved. */
  outletName?: string;
  /** 1 unless a campaign applied. */
  multiplier?: number;
  /** Named when a campaign applied, so a bigger number has a visible reason. */
  campaignName?: string | null;
  onDone: () => void;
  doneLabel?: string;
  onSecondary?: () => void;
  secondaryLabel?: string;
}

// "The coin lands." Earning is the moment the program keeps its promise, so it
// gets a weighted, physical entrance: the coin overshoots and settles, then the
// figure counts up, then the reason (if any), then the new balance.
//
// The order is deliberate — the customer's eye lands on the points first and
// the running total last, which is the order they actually care about.
//
// Deliberately distinct from RedeemCelebration: one is value arriving, the
// other is value being spent, and they should not feel like the same event
// with different words.
export function EarnCelebration({
  points,
  billAmount,
  balance,
  outletName,
  multiplier,
  campaignName,
  onDone,
  doneLabel = "Go to dashboard",
  onSecondary,
  secondaryLabel,
}: EarnCelebrationProps) {
  const m = useMotion();
  const counted = useCountUp(points);
  const hasCampaign = multiplier !== undefined && multiplier > 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Points earned"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[var(--bg)] px-6 py-10"
    >
      <div className="w-full max-w-sm text-center">
        {/* The coin. Scale-only overshoot so it reads as landing weight
            rather than a spin or a slide. */}
        <motion.div
          initial={m.pick({ scale: 0 }, { opacity: 0 })}
          animate={m.pick({ scale: [0, 1.16, 1] }, { opacity: 1 })}
          transition={m.spring("coinPop")}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--primary)] shadow-float"
        >
          <span className="font-numeral text-3xl leading-none text-white">Rs</span>
        </motion.div>

        <div className="mt-7 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
          Points earned
        </div>

        {/* The hero figure. Live count-up value, but aria-live announces the
            final number once rather than every frame. */}
        <div
          className="mt-1 font-numeral text-[64px] leading-none text-[var(--primary)]"
          aria-hidden="true"
        >
          +{formatPoints(counted)}
        </div>
        <span className="sr-only" aria-live="polite">
          Earned {formatPoints(points)} points on a {formatNpr(billAmount)} bill
        </span>

        <p className="mt-2 text-sm text-[var(--muted)]">on a {formatNpr(billAmount)} bill</p>

        {/* A doubled number with no explanation reads as a bug. */}
        {hasCampaign && (
          <motion.div
            initial={m.pick({ opacity: 0, scale: 0.9 }, { opacity: 0 })}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...m.spring("numberChange"), delay: m.prefersReduced ? 0 : 0.3 }}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3.5 py-1.5 text-xs font-bold text-white"
          >
            <Zap className="h-3.5 w-3.5" />
            {multiplier}× — {campaignName || "campaign"}
          </motion.div>
        )}

        <motion.div
          initial={m.pick({ opacity: 0, y: 16 }, { opacity: 0 })}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...m.spring("cardEnter"), delay: m.prefersReduced ? 0 : 0.42 }}
          className="mt-8 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5 shadow-ambient"
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
            {outletName ? `Your balance at ${outletName}` : "Your balance"}
          </div>
          <p className="mt-1.5 font-numeral text-4xl leading-none text-[var(--ink)]">
            {formatPoints(balance)}
          </p>
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

export default EarnCelebration;
