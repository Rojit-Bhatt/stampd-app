import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";
import { useRef } from "react";

import { usePublicStats } from "../../../hooks/usePublicStats";
import { DotField } from "./DotField";
import { HERO, HERO_CARDS } from "./data";
import { CtaPill, Eyebrow, StatValue } from "./primitives";

const CARD_COUNT = HERO_CARDS.length;

type HeroCard = (typeof HERO_CARDS)[number];

/**
 * One card of the stack.
 *
 * "Stack advance": the front card lifts up and away while the next rises
 * forward through the pile. All four stay on screen, so the sequence reads as
 * one pipeline rather than four unrelated slides.
 *
 * Each card owns a slot index; scroll progress is mapped to a continuous
 * "position in the stack" (0 = front, higher = further back, negative =
 * already advanced past), and every visual property derives from that one
 * number.
 */
function StackCard({
  card,
  index,
  progress,
}: {
  card: HeroCard;
  index: number;
  progress: MotionValue<number>;
}) {
  const position = useTransform(progress, (p) => index - p * (CARD_COUNT - 1));

  const y = useTransform(position, (pos) => (pos < 0 ? pos * 120 : Math.min(pos, 3) * 18));
  const scale = useTransform(position, (pos) =>
    pos < 0 ? 1 + pos * 0.06 : 1 - Math.min(pos, 3) * 0.05,
  );
  const opacity = useTransform(position, (pos) => (pos < -1 ? 0 : pos < 0 ? 1 + pos : 1));
  const rotateX = useTransform(position, (pos) => (pos < 0 ? pos * 14 : 0));
  const zIndex = useTransform(position, (pos) => Math.round(100 - pos * 10));

  return (
    <motion.div
      style={{ y, scale, opacity, rotateX, zIndex }}
      className="absolute inset-x-0 top-0 origin-top rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)] p-6"
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
          {card.kicker}
        </p>
        <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-muted)]">
          {card.tag}
        </p>
      </div>
      <p className="mt-6 font-numeral text-4xl leading-tight text-[var(--lp-ink)]">
        {card.headline}
      </p>
      <p className="mt-2 text-sm text-[var(--lp-muted)]">{card.detail}</p>
    </motion.div>
  );
}

// Extracted rather than inlined in a .map: calling useTransform inside a loop
// body would break the rules of hooks, even though HERO_CARDS is fixed-length.
function Subline({
  text,
  index,
  activeIndex,
}: {
  text: string;
  index: number;
  activeIndex: MotionValue<number>;
}) {
  const opacity = useTransform(activeIndex, (a) => (a === index ? 1 : 0));
  return (
    <motion.p style={{ opacity }} className="absolute inset-0 text-base text-[var(--lp-muted)]">
      {text}
    </motion.p>
  );
}

function StepLabel({
  label,
  index,
  activeIndex,
}: {
  label: string;
  index: number;
  activeIndex: MotionValue<number>;
}) {
  const color = useTransform(activeIndex, (a) =>
    a === index ? "#0FA968" : "rgba(243,236,226,0.35)",
  );
  return (
    <motion.span style={{ color }} className="font-mono text-[10px] tracking-[0.18em]">
      {label}
    </motion.span>
  );
}

function StatRow() {
  const { data } = usePublicStats();
  // Not an error state: the backend hides figures below its threshold, and a
  // pre-launch number is worse than none.
  if (!data || !data.visible) return null;

  return (
    <div className="mt-10 flex flex-wrap gap-10">
      <StatValue value={data.outlets} label={HERO.statLabels.outlets} />
      <StatValue value={data.pointsIssuedMonth} label={HERO.statLabels.pointsIssuedMonth} />
      <StatValue value={data.customers} label={HERO.statLabels.customers} />
    </div>
  );
}

function HeroCopy({ contactHref, children }: { contactHref: string; children?: React.ReactNode }) {
  return (
    <div>
      <Eyebrow>{HERO.eyebrow}</Eyebrow>
      <h1 className="mt-5 font-display text-4xl leading-[1.05] text-[var(--lp-ink)] sm:text-5xl md:text-6xl">
        {HERO.headline[0]}
        <br />
        {HERO.headline[1]}
      </h1>
      {children}
      <div className="mt-6 flex flex-wrap gap-3">
        <CtaPill href={contactHref}>{HERO.primaryCta}</CtaPill>
        <CtaPill href="#product" tone="outline">
          {HERO.secondaryCta}
        </CtaPill>
      </div>
      <StatRow />
    </div>
  );
}

export function HeroStack({ contactHref }: { contactHref: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });

  const activeIndex = useTransform(scrollYProgress, (p) =>
    Math.min(CARD_COUNT - 1, Math.round(p * (CARD_COUNT - 1))),
  );

  if (reduced) {
    // No pin, no track, no advance — a static stack with all copy present.
    return (
      <section className="relative overflow-hidden px-6 pb-24 pt-32 md:px-10">
        <DotField />
        <div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-2">
          <HeroCopy contactHref={contactHref}>
            <div className="mt-6 space-y-2">
              {HERO_CARDS.map((card) => (
                <p key={card.id} className="text-base text-[var(--lp-muted)]">
                  {card.subline}
                </p>
              ))}
            </div>
          </HeroCopy>
          <div className="space-y-4">
            {HERO_CARDS.map((card) => (
              <div
                key={card.id}
                className="rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)] p-6"
              >
                <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
                  {card.kicker}
                </p>
                <p className="mt-4 font-numeral text-3xl leading-tight text-[var(--lp-ink)]">
                  {card.headline}
                </p>
                <p className="mt-2 text-sm text-[var(--lp-muted)]">{card.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    // 1800px of scroll drives four card states. The pin is CSS sticky, not a
    // JS scroll hijack — the native scrollbar and scroll speed are untouched.
    <div ref={trackRef} className="relative h-[1800px]">
      <section className="sticky top-0 h-screen overflow-hidden px-6 pt-28 md:px-10">
        <DotField />
        <div className="relative mx-auto grid h-full max-w-6xl items-center gap-12 lg:grid-cols-2">
          <HeroCopy contactHref={contactHref}>
            {/* The sublines are stacked and cross-faded so the block never
                changes height as the cards advance. */}
            <div className="relative mt-6 h-12">
              {HERO_CARDS.map((card, i) => (
                <Subline
                  key={card.id}
                  text={card.subline}
                  index={i}
                  activeIndex={activeIndex}
                />
              ))}
            </div>
          </HeroCopy>

          <div className="relative">
            <div className="relative h-[260px] [perspective:1400px]">
              {HERO_CARDS.map((card, i) => (
                <StackCard key={card.id} card={card} index={i} progress={scrollYProgress} />
              ))}
            </div>
            <div className="mt-10 flex gap-4">
              {HERO_CARDS.map((card, i) => (
                <StepLabel
                  key={card.id}
                  label={card.step}
                  index={i}
                  activeIndex={activeIndex}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
