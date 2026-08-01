import { motion, useReducedMotion } from "motion/react";

import { FEATURES } from "./data";
import { Eyebrow } from "./primitives";
import { WordReveal } from "./motion/WordReveal";

export function FeaturesSection() {
  const reduced = useReducedMotion();

  return (
    <section id="services" className="lp-grid px-6 py-28 md:px-10">
      <div className="mx-auto max-w-6xl">
        <Eyebrow>{FEATURES.eyebrow}</Eyebrow>
        {/* The section statement reveals word by word as it crosses the
            viewport. The blocks below use an ordinary stagger — if everything
            used the reveal, the reveal would stop meaning anything. */}
        <WordReveal
          text={FEATURES.statement}
          className="mt-5 max-w-4xl font-display text-3xl leading-[1.15] text-[var(--lp-ink)] sm:text-4xl md:text-5xl"
        />

        <div className="mt-20 grid gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.blocks.map((block, i) => (
            <motion.div
              key={block.id}
              id={block.id}
              initial={reduced ? false : { opacity: 0, y: 24 }}
              whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: reduced ? 0 : i * 0.06 }}
            >
              <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
                {block.kicker}
              </p>
              <h3 className="mt-3 font-display text-xl text-[var(--lp-ink)]">
                {block.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lp-muted)]">
                {block.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
