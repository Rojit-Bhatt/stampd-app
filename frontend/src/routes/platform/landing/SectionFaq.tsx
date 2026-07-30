import { useCallback, useEffect, useRef, useState } from "react";

import { FAQ } from "./data";
import { SectionHead } from "./primitives";

/**
 * Horizontal snap rail.
 *
 * Every answer is rendered in full and always present — this is not a
 * disclosure widget. Nothing is hidden from a screen reader or from search,
 * and vertical page scroll is never intercepted: the rail only owns its own
 * horizontal overflow.
 */
export function FaqSection() {
  const railRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const syncBounds = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    syncBounds();
    window.addEventListener("resize", syncBounds);
    return () => window.removeEventListener("resize", syncBounds);
  }, [syncBounds]);

  const scrollBy = (direction: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    const card = el.querySelector("article");
    const step = card ? card.clientWidth + 24 : el.clientWidth * 0.8;
    el.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  return (
    <section id="faq" className="lp-grid px-6 py-28 md:px-10">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow={FAQ.eyebrow} title={FAQ.title} subtitle={FAQ.subtitle} />

        <div
          ref={railRef}
          onScroll={syncBounds}
          className="hide-scrollbar mt-12 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4"
        >
          {FAQ.items.map((item, i) => (
            <article
              key={item.q}
              className="flex min-h-[260px] w-[300px] flex-shrink-0 snap-start flex-col rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)] p-7 sm:w-[360px]"
            >
              <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-4 font-display text-lg leading-snug text-[var(--lp-ink)]">
                {item.q}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--lp-muted)]">
                {item.a}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            disabled={atStart}
            aria-label="Previous question"
            className="rounded-[74px] border border-[var(--lp-line)] px-5 py-2.5 text-sm text-[var(--lp-ink)] transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            disabled={atEnd}
            aria-label="Next question"
            className="rounded-[74px] border border-[var(--lp-line)] px-5 py-2.5 text-sm text-[var(--lp-ink)] transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
