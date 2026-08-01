import { useRef, type RefObject } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

import { FEATURES } from "./data";

type Block = (typeof FEATURES.blocks)[number];

// How far a card's image travels against the strip, in px. Enough to read as
// depth, small enough that the image never uncovers its frame.
const OFFSET = 36;

function ServiceCard({
  block,
  container,
}: {
  block: Block;
  container: RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

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
  const opacity = useTransform(scrollXProgress, [0, 0.18, 0.82, 1], [0.35, 1, 1, 0.35]);

  return (
    <motion.article
      ref={ref}
      style={reduced ? undefined : { opacity }}
      className="w-[300px] flex-shrink-0 snap-none sm:w-[380px]"
    >
      <div className="overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)]">
        <motion.img
          src={`/landing/services/${block.id}.webp`}
          alt={block.imageAlt}
          width={1200}
          height={800}
          loading="lazy"
          draggable={false}
          style={reduced ? undefined : { x }}
          // Scaled slightly wider than its frame so the offset travel never
          // exposes an edge.
          className="w-[112%] max-w-none -translate-x-[6%]"
        />
      </div>

      <p className="mt-6 font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
        {block.kicker}
      </p>
      <h3 className="mt-3 font-display text-xl text-[var(--lp-ink)]">{block.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--lp-muted)]">{block.body}</p>
    </motion.article>
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
