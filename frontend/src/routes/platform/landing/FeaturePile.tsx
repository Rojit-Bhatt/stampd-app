import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import type { MotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { FEATURES } from "./data";
import { FEATURE_ART } from "./graphics/FeatureArt";

const BLOCKS = FEATURES.blocks;
const CARD_COUNT = BLOCKS.length;

type Block = (typeof BLOCKS)[number];

// Scroll range per card entrance, in viewport-height units. Each card's
// eased slide-in plays over this much scroll, so the decelerating move stays
// visible at normal scroll speed (the v1 flick-read-as-a-pop came from a
// range that was tiny compared to the page's scroll budget).
const ENTRANCE_VH = 2.25;

/** The track's height, computed in px so it is independent of CSS vh quirks.
 *  Mirrors HeroStack's fixed-pixel track pattern. */
function trackHeightPx() {
  return Math.round((CARD_COUNT + 1) * ENTRANCE_VH * window.innerHeight);
}

/** Cubic ease-out: the video's slides visibly decelerate as they settle. */
function easeOut(p: number) {
  return 1 - Math.pow(1 - p, 3);
}

/**
 * One card of the pile.
 *
 * The card is ONE self-contained rounded panel — art on top, kicker/title/
 * body inside the panel at the bottom — exactly like the reference video's
 * testimonial cards. It starts off its side (left when its index is even,
 * right when odd) and eases into a settled position with a slight deck
 * offset, so after all six pile up the result is a fanned deck with every
 * card's edges visible. The incoming card covers the previous card's panel
 * entirely, so nothing needs manual caption fading: cards stay fully opaque.
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

  // This card's raw 0-1 entrance window within overall scroll: 0 while
  // stashed off its side, 1 once settled, and it stays 1 while later cards
  // pile on top. Clamped so earlier cards hold position and later cards
  // wait off-screen until their turn.
  const rawSide = useTransform(progress, (p) =>
    Math.max(0, Math.min(1, p * CARD_COUNT - index + 1)),
  );
  const eased = useTransform(rawSide, (s) => easeOut(s));

  // Settled resting place in the fanned deck: alternating ±8% of the card
  // width horizontally and a ±1.4° tilt. Card width is 56vw → 8% ≈ 4.5vw.
  const settledXVw = index % 2 === 0 ? -4.5 : 4.5;
  const settledRotate = index % 2 === 0 ? -1.4 : 1.4;
  const startVw = fromLeft ? -110 : 110;

  // Live viewport dimensions so the slide self-corrects on resize.
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const vwPx = useMotionValue(vw);

  // x in px: from ±110vw off-screen to the settled deck offset, eased.
  const x = useTransform([eased, vwPx], (vals: number[]) => {
    const [e, w] = vals;
    const startPx = startVw * 0.01 * w;
    const endPx = settledXVw * 0.01 * w;
    return startPx + (endPx - startPx) * e;
  });

  const rotate = useTransform(eased, (e) => {
    const startRot = fromLeft ? 8 : -8;
    return startRot + (settledRotate - startRot) * e;
  });

  const scale = useTransform(eased, (e) => 0.97 + 0.03 * e);

  // Later cards sit above earlier ones — the pile reads as piling ONTO the
  // previous card, never replacing it.
  const z = useTransform(eased, (e) => Math.round(10 + index * 10 + e * 2));

  const Art = FEATURE_ART[block.id];

  return (
    <motion.article
      style={{ x, rotate, scale, zIndex: z }}
      className="absolute inset-0 flex items-center justify-center"
      aria-label={`${block.title}: ${block.body}`}
    >
      {/* One self-contained panel: art on top, copy inside at the bottom. */}
      <div className="flex h-[44vh] w-[min(56vw,820px)] flex-col overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)] shadow-[0_28px_70px_-28px_rgba(0,0,0,0.55)]">
        <div className="min-h-0 flex-1 w-full">{Art ? <Art /> : null}</div>
        <div className="px-5 pb-6 pt-4 md:px-7 md:pb-7">
          <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
            {block.kicker}
          </p>
          <h3 className="mt-2 font-display text-xl text-[var(--lp-ink)] sm:text-2xl">
            {block.title}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--lp-muted)]">
            {block.body}
          </p>
        </div>
      </div>
    </motion.article>
  );
}

export function FeaturePile() {
  const reduced = useReducedMotion();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });

  if (reduced) {
    // Static fallback: all six self-contained cards in a column, none hidden.
    return (
      <section className="lp-grid px-6 py-28 md:px-10">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-12">
          {BLOCKS.map((block) => {
            const Art = FEATURE_ART[block.id];
            return (
              <div
                key={block.id}
                className="flex flex-col overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)]"
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
    // the stage covers the viewport, and the opaque page background keeps
    // nothing visible behind the stage (see index.css .landing-dark).
    <div ref={trackRef} style={{ height: trackHeightPx() }} className="relative">
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
