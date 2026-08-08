import { useRef, type RefObject } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

import { FEATURES } from "./data";
import { FEATURE_ART } from "./graphics/FeatureArt";

type Block = (typeof FEATURES.blocks)[number];

// How far a card's ART travels against the strip, in px — motion.dev's
// react-carousel-item-offset pattern (parallax the media, not the caption).
// Enough to read as depth, small enough the art never uncovers its frame.
const OFFSET = 24;

function ServiceCard({
  block,
  container,
}: {
  block: Block;
  container: RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const Art = FEATURE_ART[block.id];

  // 0 when the card is entering from the right, 1 when it has left to the
  // left. Measured per card against the strip, which is why nothing here
  // depends on the card's index or its width.
  const { scrollXProgress } = useScroll({
    container,
    target: ref,
    axis: "x",
    offset: ["start end", "end start"],
  });

  const x = useTransform(scrollXProgress, [0, 1], [OFFSET, -OFFSET]);

  return (
    <article ref={ref} className="w-[300px] flex-shrink-0 snap-none sm:w-[380px]">
      {/* Only the ART parallaxes — the card frame and everything below it
          (kicker, title, body) stay fully opaque at every scroll position.
          The old version dimmed the whole card to 0.35 opacity at rest and
          faded the strip's edges over the text, which is what made it hard
          to read; neither happens here. */}
      <div className="overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)]">
        <motion.div style={reduced ? undefined : { x }} className="h-[220px] w-[112%] -translate-x-[6%]">
          {Art ? <Art /> : null}
        </motion.div>
      </div>

      <p className="mt-6 font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
        {block.kicker}
      </p>
      <h3 className="mt-3 font-display text-xl text-[var(--lp-ink)]">{block.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--lp-muted)]">{block.body}</p>
    </article>
  );
}

export function ServicesCarousel() {
  const stripRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startScroll: 0 });

  // Mouse only. Touch already has momentum scrolling, and hijacking pointer
  // events there would replace it with something worse.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !stripRef.current) return;
    drag.current = {
      active: true,
      startX: e.clientX,
      startScroll: stripRef.current.scrollLeft,
    };
    stripRef.current.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active || !stripRef.current) return;
    stripRef.current.scrollLeft = drag.current.startScroll - (e.clientX - drag.current.startX);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active || !stripRef.current) return;
    drag.current.active = false;
    stripRef.current.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="relative mt-20">
      <div
        ref={stripRef}
        role="region"
        aria-label="What you get with Stampd"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // No scroll-snap: this is a free-scroll strip, and snap points would
        // fight the offset animation by quantising where cards come to rest.
        // `[scrollbar-width:none]` hides the bar without hiding the overflow.
        className="flex cursor-grab gap-6 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
      >
        {FEATURES.blocks.map((block) => (
          <ServiceCard key={block.id} block={block} container={stripRef} />
        ))}
        {/* Trailing spacer so the last card can clear the right fade. */}
        <div aria-hidden="true" className="w-6 flex-shrink-0" />
      </div>

      {/* Edge fades, so the strip reads as continuing past the viewport rather
          than ending. pointer-events-none keeps them out of the drag. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[var(--lp-bg)] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[var(--lp-bg)] to-transparent" />
    </div>
  );
}
