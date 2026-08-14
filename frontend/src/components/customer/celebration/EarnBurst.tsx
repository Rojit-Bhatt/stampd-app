import { motion } from "motion/react";

import { formatPoints } from "../../../hooks/usePoints";
import { useCountUp } from "../../../hooks/useCountUp";
import { useMotion } from "../../../lib/motion";
import { formatNpr } from "../../../lib/subscription";
import type { EarnCelebrationData } from "../../../context/CelebrationContext";

// Ledger ticks — thin marks that flick up past the rule as the entry posts.
// Uneven offsets and lengths on purpose: a row of identical dots reads as a
// loading spinner, a scatter of rules reads as writing.
const TICKS = [
  { x: -132, h: 22, delay: 0.06 },
  { x: -94, h: 13, delay: 0.16 },
  { x: -58, h: 30, delay: 0.02 },
  { x: 62, h: 17, delay: 0.1 },
  { x: 98, h: 27, delay: 0.04 },
  { x: 136, h: 12, delay: 0.19 },
];

// A big bill can post six figures, which at the headline size overruns the
// rule and clips on a narrow phone. Step down by length, then cap against the
// viewport too: the px ladder alone still overflows once a figure gets long
// enough, and the layout should hold at any digit count rather than at the
// ones we thought to enumerate.
function figureSize(value: number): string {
  const digits = Math.round(Math.abs(value)).toString().length;
  const px = digits >= 7 ? 44 : digits === 6 ? 54 : digits === 5 ? 64 : 76;
  // Inter's digits run ~0.6em wide; 130/digits vw keeps the figure plus its
  // sign inside the gutters even on the narrowest phone.
  return `min(${px}px, ${(130 / digits).toFixed(1)}vw)`;
}

export function EarnBurst({ data }: { data: EarnCelebrationData }) {
  const m = useMotion();
  const counted = useCountUp(data.points);
  const hasCampaign = (data.multiplier ?? 1) > 1;
  const size = figureSize(data.points);

  return (
    <div className="flex flex-col items-center text-center">
      {data.outletName && (
        <motion.div
          initial={m.pick({ opacity: 0, y: -6 }, { opacity: 0 })}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...m.spring("settle"), delay: m.prefersReduced ? 0 : 0.5 }}
          className="mb-7 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--ink)]/75"
        >
          {data.outletName}
        </motion.div>
      )}

      <div className="relative">
        {/* Bloom. Carries the depth so the figure doesn't sit flat on the
            blur — scales past its resting size once, then holds. */}
        {!m.prefersReduced && (
          <motion.div
            initial={{ opacity: 0, scale: 0.45 }}
            animate={{ opacity: [0, 0.55, 0.3], scale: [0.45, 1.3, 1.05] }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            className="pointer-events-none absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(circle, color-mix(in srgb, var(--primary) 34%, transparent) 0%, transparent 70%)",
            }}
          />
        )}

        {!m.prefersReduced &&
          TICKS.map((tick) => (
            <motion.span
              key={tick.x}
              initial={{ opacity: 0, y: 10, scaleY: 0.3 }}
              animate={{ opacity: [0, 1, 0], y: -34, scaleY: 1 }}
              transition={{ duration: 0.85, ease: "easeOut", delay: tick.delay }}
              className="pointer-events-none absolute bottom-0 w-px origin-bottom bg-[var(--primary)]"
              style={{ left: "50%", height: tick.h, marginLeft: tick.x }}
            />
          ))}

        {/* The figure rises from behind the rule — value arriving. The mask is
            the whole gesture, so reduced motion just shows the number. */}
        <div className="relative overflow-hidden px-2 pb-1">
          <motion.div
            initial={m.pick({ y: "108%" }, { opacity: 0 })}
            animate={m.pick({ y: "0%" }, { opacity: 1 })}
            transition={m.spring("ledgerRise")}
            className="flex items-baseline justify-center gap-1"
          >
            <span
              className="font-numeral leading-none text-[var(--primary)]/70"
              style={{ fontSize: `calc(${size} * 0.45)` }}
            >
              +
            </span>
            <span
              className="font-numeral font-numeral-lg leading-[0.9] text-[var(--primary)]"
              aria-hidden="true"
              style={{
                fontSize: size,
                textShadow: "0 2px 24px color-mix(in srgb, var(--primary) 28%, transparent)",
              }}
            >
              {formatPoints(counted)}
            </span>
          </motion.div>
        </div>

        {/* The rule itself. Draws outward from the centre after the figure
            lands, so it reads as the entry being ruled in. */}
        <motion.div
          initial={m.pick({ scaleX: 0 }, { opacity: 0 })}
          animate={m.pick({ scaleX: 1 }, { opacity: 1 })}
          transition={{ duration: m.prefersReduced ? 0 : 0.55, ease: [0.16, 1, 0.3, 1], delay: m.prefersReduced ? 0 : 0.18 }}
          className="mt-3.5 h-px w-[300px] max-w-[78vw] origin-center bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent"
        />
      </div>

      <span className="sr-only" aria-live="polite">
        Earned {formatPoints(data.points)} points on a {formatNpr(data.billAmount)} bill
        {data.outletName ? ` at ${data.outletName}` : ""}. Balance {formatPoints(data.balance)}.
      </span>

      <motion.div
        initial={m.pick({ opacity: 0, y: 12 }, { opacity: 0 })}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...m.spring("settle"), delay: m.prefersReduced ? 0 : 0.34 }}
        className="mt-5 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]/90"
      >
        Points earned
      </motion.div>

      {/* A doubled figure with no stated reason reads as a bug. */}
      {hasCampaign && (
        <motion.div
          initial={m.pick({ opacity: 0, y: 8 }, { opacity: 0 })}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...m.spring("settle"), delay: m.prefersReduced ? 0 : 0.42 }}
          className="mt-3 text-[11px] font-semibold tracking-[0.06em] text-[var(--primary)]"
        >
          {data.multiplier}× {data.campaignName || "campaign"}
        </motion.div>
      )}

      <motion.div
        initial={m.pick({ opacity: 0, y: 12 }, { opacity: 0 })}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...m.spring("settle"), delay: m.prefersReduced ? 0 : 0.46 }}
        className="mt-9 flex items-baseline gap-2.5"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]/65">
          Balance
        </span>
        <span className="font-numeral text-[26px] leading-none text-[var(--ink)]">
          {formatPoints(data.balance)}
        </span>
      </motion.div>
    </div>
  );
}

export default EarnBurst;
