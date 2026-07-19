import { motion } from "motion/react";

import { formatPoints } from "../../hooks/usePoints";
import { useMotion } from "../../lib/motion";
import { Skeleton } from "../ui/skeleton";

interface PointsBalanceCardProps {
  balance: number;
  /** Null = this outlet's points never expire. */
  expiresAt: string | null;
  businessName?: string;
  isLoading?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// The customer's centrepiece. There is no progress bar here on purpose:
// points have no finish line to fill toward — the balance itself is the whole
// state, and inventing a target would be inventing a number the outlet never
// set.
//
// The colour split is load-bearing on this card specifically. The outlet's
// name and the accent bar carry the tenant hue (identity); the figure is
// always green (value). If the two swapped, a cafe with an unfortunate brand
// colour could leave a customer unable to find "how much can I spend" — which
// is the only question this card exists to answer.
export function PointsBalanceCard({
  balance,
  expiresAt,
  businessName,
  isLoading,
}: PointsBalanceCardProps) {
  const m = useMotion();

  // Only warn near the end. A date three months out is noise; the point of
  // rolling expiry is that any visit resets it, so the nudge only matters
  // once doing nothing would actually cost something.
  const daysLeft = expiresAt
    ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS)
    : null;
  const showExpiry = daysLeft !== null && daysLeft <= 30 && balance > 0;

  return (
    <motion.div
      initial={m.pick({ opacity: 0, y: 24 }, { opacity: 0 })}
      animate={{ opacity: 1, y: 0 }}
      transition={m.spring("cardEnter")}
      className="relative mb-4 overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient"
    >
      {/* The one piece of tenant colour on this card. --brand-accent, not
          --brand: it steps aside to the ink when the outlet's own brand is
          green, so this bar can never be mistaken for the value figure. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: "var(--brand-accent)" }}
      />

      <div className="min-w-0">
        {businessName && (
          <div
            className="truncate font-display text-base font-bold"
            style={{ color: "var(--brand-ink)" }}
          >
            {businessName}
          </div>
        )}
        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
          Your points
        </div>
      </div>

      <div className="mt-3">
        {isLoading ? (
          <Skeleton className="h-14 w-36" />
        ) : (
          <motion.div
            key={balance}
            initial={m.pick({ scale: 0.92, opacity: 0.6 }, false)}
            animate={{ scale: 1, opacity: 1 }}
            transition={m.spring("numberChange")}
            className="origin-left font-numeral text-[56px] leading-none text-[var(--primary)]"
          >
            {formatPoints(balance)}
          </motion.div>
        )}
      </div>

      {showExpiry && (
        <div
          className="mt-4 rounded-[var(--radius-btn)] px-3.5 py-2.5 text-[13px] font-semibold"
          style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
        >
          {daysLeft <= 0
            ? "These points have expired."
            : `Expiring in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — any visit resets the clock.`}
        </div>
      )}
    </motion.div>
  );
}

export default PointsBalanceCard;
