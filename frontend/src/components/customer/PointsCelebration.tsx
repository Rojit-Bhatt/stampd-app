import { Coins, Gift, ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { formatPoints } from "../../hooks/usePoints";
import { formatNpr } from "../../lib/subscription";

interface EarnProps {
  variant: "earn";
  /** Points just added. */
  points: number;
  /** What the customer actually paid — shown alongside, so the maths is visible. */
  billAmount: number;
  balance: number;
}

interface RedeemProps {
  variant: "redeem";
  /** Points just spent (positive magnitude). */
  points: number;
  rewardName: string;
  balance: number;
}

type PointsCelebrationProps = (EarnProps | RedeemProps) & {
  onDone: () => void;
  doneLabel?: string;
  onSecondary?: () => void;
  secondaryLabel?: string;
};

// The one animated moment every customer sees repeatedly, shared by the
// in-app scanner, the QR-link claim page, and the redeem flow. Every earn
// gets this, not just a rare milestone — "stamp-claim physics": the badge
// pops in with a soft overshoot-then-settle bounce, like a coin landing.
//
// The earn view deliberately shows the bill next to the points: the whole
// promise of the program is "you get back a share of what you spend", and
// showing only the points hides the half that makes it feel earned.
export function PointsCelebration(props: PointsCelebrationProps) {
  const { onDone, doneLabel = "Done", onSecondary, secondaryLabel } = props;
  const reduceMotion = useReducedMotion();
  const isEarn = props.variant === "earn";

  const badgeTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 280, damping: 14 };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEarn ? "Points earned" : "Reward redeemed"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#121212]/95 px-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm text-center text-[#EBE6DF]">
        <motion.div
          initial={reduceMotion ? false : { scale: 0 }}
          animate={{ scale: [0, 1.15, 1] }}
          transition={badgeTransition}
          className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full"
          style={{ background: "var(--brand)" }}
        >
          {isEarn ? (
            <Coins className="h-9 w-9 text-white" strokeWidth={1.75} />
          ) : (
            <Gift className="h-9 w-9 text-white" strokeWidth={1.5} />
          )}
        </motion.div>

        <h2 className="mt-6 font-display text-3xl font-normal">
          {isEarn ? "Points earned!" : "Enjoy!"}
        </h2>

        {isEarn ? (
          <>
            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : 0.2 }}
              className="mt-4 font-display text-5xl font-extrabold"
              style={{ color: "var(--inverse-primary,#F4BA9C)" }}
            >
              +{formatPoints(props.points)}
            </motion.p>
            <p className="mt-2 text-sm text-[#A3A3A3]">
              on a {formatNpr(props.billAmount)} bill
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 font-display text-2xl font-bold">{props.rewardName}</p>
            <p className="mt-2 text-sm text-[#A3A3A3]">
              {formatPoints(props.points)} points redeemed
            </p>
          </>
        )}

        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduceMotion ? 0 : 0.35 }}
          className="mt-8 rounded-3xl border border-[#2D2D2D] bg-[#1A1A1A] px-6 py-5"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-[#7A756E]">Your balance</div>
          <p className="mt-1.5 font-display text-3xl font-bold">{formatPoints(props.balance)}</p>
        </motion.div>

        <div className="mt-10 flex flex-col gap-3">
          <button
            onClick={onDone}
            className="stamp-interactive flex w-full items-center justify-center gap-2 rounded-full py-4 text-sm font-bold uppercase tracking-wider text-white"
            style={{ background: "var(--brand)" }}
          >
            {doneLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
          {onSecondary && secondaryLabel && (
            <button
              onClick={onSecondary}
              className="rounded-full border border-[#2D2D2D] bg-[#1A1A1A] py-3 text-xs font-bold uppercase tracking-widest text-[#EBE6DF] transition-colors hover:bg-[#EBE6DF] hover:text-black"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PointsCelebration;
