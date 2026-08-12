import { motion, useMotionValue, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { FEATURES } from "./data";
import { FEATURE_ART } from "./graphics/FeatureArt";

const BLOCKS = FEATURES.blocks;
const CARD_COUNT = BLOCKS.length;

type Block = (typeof BLOCKS)[number];

// Track height: one screen holds the first card centred, then one screen of
// scroll drives each subsequent card's entrance. Inline style on purpose —
// Tailwind cannot emit arbitrary vh classes from a runtime constant, and a
// fixed arbitrary value (`h-[700vh]`) would drift every time blocks change.
const TRACK_HEIGHT_VH = (CARD_COUNT + 1) * 100;

/**
 * One card of the pile.
 *
 * All cards share the same absolute full-viewport slot. Each card maps the
 * page scroll into its own 0-1 `sideProgress` window: 0 while still stashed
 * off its side, 1 once it has reached centre, and it STAYS 1 while later
 * cards pile on top — so the entrance reads as a pile-up (new card on top,
 * previous card's edges visible underneath), not a replacement.
 *
 * Even indices enter from the LEFT, odd from the RIGHT — the alternation
 * the spec asks for. The right-side entrances are the ones that "pile on"
 * the previous card, exactly as in the reference video.
 */
function PileCard({
  block,
  index,
  progress,
}: {
  block: Block;
  index: number;
  progress: MotionValue<number>;
}) {
  const fromLeft = index % 2 === 0;

  // This card's entrance window within overall scroll: it slides from its
  // side over progress in [index/CARD_COUNT, (index+1)/CARD_COUNT] and is
  // fully settled at the window's end. Clamped to [0,1] so earlier cards
  // stay centred (s=1) and later cards stay hidden (s=0) until their turn.
  const sideProgress = useTransform(progress, (p) =>
    Math.max(0, Math.min(1, p * CARD_COUNT - index + 1)),
  );

  // Distance per unit: start 115% of the viewport width off its side, end
  // at 0 (centred). motion applies plain numbers as pixels, so this is the
  // (1 - s) fraction multiplied by the live viewport width — tracked as its
  // own MotionValue so the slide-in self-corrects on resize. The stage's
  // overflow-clip guarantees the slide-in never widens the page.
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const vwPx = useMotionValue(vw);
  const x = useTransform([sideProgress, vwPx], (vals: number[]) => {
    const [s, w] = vals;
    return fromLeft ? -115 * (1 - s) * w : 115 * (1 - s) * w;
  });

  // z-index: later cards sit above earlier ones — that is what makes the
  // entrance read as piling ONTO the previous card instead of replacing it.
  const z = useTransform(sideProgress, (s) => Math.round(10 + index * 10 + s * 2));

  // A faint tilt that relaxes as the card settles — the physical "pile"
  // feel from the reference video, kept subtle so the page stays quiet.
  const rotate = useTransform(
    sideProgress,
    (s) => (fromLeft ? -1.4 * (1 - s) : 1.4 * (1 - s)),
  );

  const Art = FEATURE_ART[block.id];

  // When the NEXT card starts sliding on top, this card's caption (kicker,
  // title, body) must give way — otherwise every settled card's copy stacks
  // into an unreadable blob at the bottom of the stage. The art stays visible
  // underneath: that layering IS the pile aesthetic. The last card keeps its
  // copy fully visible (nothing ever piles on it).
  const isLast = index === CARD_COUNT - 1;
  const nextSideProgress = isLast
    ? null
    : useTransform(progress, (p) =>
        Math.max(0, Math.min(1, p * CARD_COUNT - index)),
      );
  const copyOpacity = isLast
    ? 1
    : useTransform(nextSideProgress as MotionValue<number>, (s) => 1 - s);

  return (
    <motion.article
      style={{ x, rotate, zIndex: z }}
      className="absolute inset-0 flex flex-col items-center justify-center px-4"
      aria-label={`${block.title}: ${block.body}`}
    >
      <div className="w-full max-w-[720px] md:max-w-[880px]">
        <div className="overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)]">
          <div className="aspect-[400/280] w-full">{Art ? <Art /> : null}</div>
        </div>
        <motion.div
          style={{ opacity: copyOpacity }}
          aria-hidden={!isLast || undefined}
        >
          <p className="mt-8 font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
            {block.kicker}
          </p>
          <h3 className="mt-3 font-display text-2xl text-[var(--lp-ink)] sm:text-3xl md:text-4xl">
            {block.title}
          </h3>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-[var(--lp-muted)]">
            {block.body}
          </p>
        </motion.div>
      </div>
    </motion.article>
  );
}

export function FeaturePile() {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });

  if (reduced) {
    // Static fallback: all six cards in a column, none hidden — the same
    // treatment HeroStack gives its reduced-motion users.
    return (
      <section className="lp-grid px-6 py-28 md:px-10">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-12">
          {BLOCKS.map((block) => {
            const Art = FEATURE_ART[block.id];
            return (
              <div
                key={block.id}
                className="overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)]"
              >
                <div className="aspect-[400/280] w-full">{Art ? <Art /> : null}</div>
                <div className="p-6 md:p-8">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
                    {block.kicker}
                  </p>
                  <h3 className="mt-3 font-display text-2xl text-[var(--lp-ink)] sm:text-3xl">
                    {block.title}
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-[var(--lp-muted)]">
                    {block.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    // Native CSS sticky pin — the track's height supplies the scroll range,
    // the stage covers the viewport, and nothing below the fold shows through
    // because the page background is opaque (see index.css .landing-dark).
    <div ref={trackRef} style={{ height: `${TRACK_HEIGHT_VH}vh` }} className="relative">
      <section
        className="lp-grid sticky top-0 h-screen overflow-clip"
        aria-label="What you get with Stampd"
      >
        <div className="relative h-full w-full">
          {BLOCKS.map((block, i) => (
            <PileCard key={block.id} block={block} index={i} progress={scrollYProgress} />
          ))}
        </div>
      </section>
    </div>
  );
}
