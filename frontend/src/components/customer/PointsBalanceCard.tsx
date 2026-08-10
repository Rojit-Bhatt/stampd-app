import { motion } from "motion/react";

import { formatPoints } from "../../hooks/usePoints";
import { useMotion } from "../../lib/motion";
import { Skeleton } from "../ui/skeleton";
import { Badge } from "../ui/badge";

interface PointsBalanceCardProps {
  balance: number;
  /** Null = this outlet's points never expire. */
  expiresAt: string | null;
  businessName?: string;
  isLoading?: boolean;
  /** Null when the outlet has no tier thresholds configured, or none are met. */
  tier?: string | null;
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
  tier,
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
      transition={m.spring("settle")}
      className="relative mb-4 overflow-hidden rounded-[var(--radius-card)] border border-white/12 p-6"
      style={{
        backgroundImage: `linear-gradient(148deg,
          color-mix(in srgb, var(--brand) 34%, #0A1411) 0%,
          color-mix(in srgb, var(--brand) 20%, #0A1411) 52%,
          color-mix(in srgb, var(--brand) 8%, #05100D) 100%)`,
        boxShadow: `0 24px 48px -24px color-mix(in srgb, var(--brand) 45%, rgba(5,16,13,0.85)),
          0 8px 20px -12px rgba(5,16,13,0.45),
          inset 0 1px 0 0 rgba(255,255,255,0.16)`,
      }}
    >
      {/* Brand identity now lives in the whole card's gradient, not a thin
          accent bar — same technique OutletCardStack uses. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(125deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.06) 28%, rgba(255,255,255,0) 48%),
            radial-gradient(120% 95% at 88% 106%, color-mix(in srgb, var(--brand) 55%, transparent) 0%, transparent 62%)`,
        }}
      />

      <div className="relative z-10 min-w-0">
        {businessName && (
          <div className="flex items-center gap-2">
            <div className="min-w-0 truncate text-headline text-[#F4F8F6]">
              {businessName}
            </div>
            {tier && <Badge className="bg-white/15 text-[#F4F8F6]">{tier}</Badge>}
          </div>
        )}
        <div className="mt-0.5 text-caption text-white/40">Your points</div>
      </div>

      <div className="relative z-10 mt-3">
        {isLoading ? (
          <Skeleton className="h-14 w-36" />
        ) : (
          <motion.div
            key={balance}
            initial={m.pick({ scale: 0.92, opacity: 0.6 }, false)}
            animate={{ scale: 1, opacity: 1 }}
            transition={m.spring("settle")}
            className="origin-left font-numeral font-numeral-lg text-[56px] leading-none text-[var(--primary)]"
          >
            {formatPoints(balance)}
          </motion.div>
        )}
      </div>

      {showExpiry && (
        <div
          className="relative z-10 mt-4 rounded-[var(--radius-btn)] px-3.5 py-2.5 text-[13px] font-semibold"
          style={{ background: "#332405", color: "#FF9F0A" }}
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
