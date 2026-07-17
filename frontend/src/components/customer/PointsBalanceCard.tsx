import { motion, useReducedMotion } from "motion/react";
import { formatPoints } from "../../hooks/usePoints";

interface PointsBalanceCardProps {
  balance: number;
  earnPercent: number;
  /** Null = this outlet's points never expire. */
  expiresAt: string | null;
  businessName?: string;
  isLoading?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Replaces the old punch card as the customer's centrepiece. There is no
// progress bar here on purpose: points have no finish line to fill toward —
// the balance itself is the whole state, and inventing a target would be
// inventing a number the outlet never set.
export function PointsBalanceCard({
  balance,
  earnPercent,
  expiresAt,
  businessName,
  isLoading,
}: PointsBalanceCardProps) {
  const reduceMotion = useReducedMotion();

  // Only warn near the end. A date three months out is noise; the point of
  // rolling expiry is that any visit resets it, so the nudge only matters
  // once doing nothing would actually cost something.
  const daysLeft = expiresAt
    ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS)
    : null;
  const showExpiry = daysLeft !== null && daysLeft <= 30 && balance > 0;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 28, rotate: -4, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 220, damping: 20 }}
      className="shadow-ambient mb-4 overflow-hidden rounded-3xl bg-[var(--surface)] p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {businessName && (
            <div className="truncate font-display text-lg font-bold" style={{ color: "var(--brand)" }}>
              {businessName}
            </div>
          )}
          <div className="text-sm text-[var(--muted)]">Your points</div>
        </div>
        <span className="flex-shrink-0 rounded-full bg-[var(--surface-container)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
          {earnPercent === 100 ? "1 point per Rs 1" : `${earnPercent}% back`}
        </span>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <span className="inline-block h-12 w-32 animate-pulse rounded bg-[var(--line)] align-middle" />
        ) : (
          <motion.div
            key={balance}
            initial={reduceMotion ? false : { scale: 0.92, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 18 }}
            className="font-display text-[52px] font-extrabold leading-none"
            style={{ color: "var(--brand)" }}
          >
            {formatPoints(balance)}
          </motion.div>
        )}
      </div>

      {showExpiry && (
        <div
          className="mt-4 rounded-[14px] px-3.5 py-2.5 text-[13px] font-semibold"
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
