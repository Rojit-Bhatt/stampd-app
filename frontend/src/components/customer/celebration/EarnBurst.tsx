import { motion } from "motion/react";

import { formatPoints } from "../../../hooks/usePoints";
import { useCountUp } from "../../../hooks/useCountUp";
import { useMotion } from "../../../lib/motion";
import type { EarnCelebrationData } from "../../../context/CelebrationContext";

// Eight particles flung out from the coin at fixed compass angles — evenly
// spaced so the burst reads as a deliberate shape, not random scatter.
const PARTICLE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
const PARTICLE_DISTANCE = 64;

export function EarnBurst({ data }: { data: EarnCelebrationData }) {
  const m = useMotion();
  const counted = useCountUp(data.points);
  const hasCampaign = (data.multiplier ?? 1) > 1;

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative flex h-24 w-24 items-center justify-center">
        {/* Particles are pure decoration with no informational content, so
            reduced motion drops them entirely rather than crossfading. */}
        {!m.prefersReduced &&
          PARTICLE_ANGLES.map((angle) => {
            const rad = (angle * Math.PI) / 180;
            const dx = Math.cos(rad) * PARTICLE_DISTANCE;
            const dy = Math.sin(rad) * PARTICLE_DISTANCE;
            return (
              <motion.span
                key={angle}
                initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
                animate={{ x: dx, y: dy, opacity: [0, 1, 0], scale: 0.4 }}
                transition={{ duration: 0.7, ease: "easeOut", delay: 0.05 }}
                className="pointer-events-none absolute h-2.5 w-2.5 rounded-full bg-[var(--primary)]"
              />
            );
          })}

        <motion.div
          initial={m.pick({ scale: 0 }, { opacity: 0 })}
          animate={m.pick({ scale: [0, 1.22, 1] }, { opacity: 1 })}
          transition={m.spring("coinBurst")}
          className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[var(--primary)] shadow-float"
        >
          <span className="font-numeral text-3xl leading-none text-white">Rs</span>
        </motion.div>
      </div>

      <div className="mt-6 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
        Points earned
      </div>

      <div
        className="mt-1 font-numeral font-numeral-lg text-[64px] leading-none text-[var(--primary)]"
        aria-hidden="true"
      >
        +{formatPoints(counted)}
      </div>
      <span className="sr-only" aria-live="polite">
        Earned {formatPoints(data.points)} points
        {data.outletName ? ` at ${data.outletName}` : ""}
      </span>

      {/* A doubled number with no explanation reads as a bug. */}
      {hasCampaign && (
        <motion.div
          initial={m.pick({ opacity: 0, scale: 0.9 }, { opacity: 0 })}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...m.spring("settle"), delay: m.prefersReduced ? 0 : 0.35 }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3.5 py-1.5 text-xs font-bold text-white"
        >
          {data.multiplier}× — {data.campaignName || "campaign"}
        </motion.div>
      )}

      {data.outletName && (
        <motion.p
          initial={m.pick({ opacity: 0, y: 10 }, { opacity: 0 })}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...m.spring("settle"), delay: m.prefersReduced ? 0 : 0.45 }}
          className="mt-4 text-sm text-[var(--muted)]"
        >
          at {data.outletName}
        </motion.p>
      )}
    </div>
  );
}

export default EarnBurst;
