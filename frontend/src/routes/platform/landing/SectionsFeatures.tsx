import { FEATURES } from "./data";
import { Eyebrow } from "./primitives";
import { ServicesCarousel } from "./ServicesCarousel";
import { WordReveal } from "./motion/WordReveal";

export function FeaturesSection() {
  return (
    <section id="services" className="lp-grid px-6 py-28 md:px-10">
      <div className="mx-auto max-w-6xl">
        <Eyebrow>{FEATURES.eyebrow}</Eyebrow>
        {/* The section statement reveals word by word as it crosses the
            viewport. The blocks below use an ordinary stagger — if everything
            used the reveal, the reveal would stop meaning anything. */}
        <WordReveal
          text={FEATURES.statement}
          className="mt-5 max-w-4xl font-display text-3xl leading-[1.15] tracking-[-0.02em] text-[var(--lp-ink)] sm:text-4xl md:text-5xl"
        />

        <ServicesCarousel />
      </div>
    </section>
  );
}
