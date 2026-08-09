import { CTA } from "./data";
import { CtaPill, Eyebrow } from "./primitives";

export function CtaSection({ contactHref }: { contactHref: string }) {
  return (
    <section className="lp-grid px-6 pb-40 pt-28 md:px-10">
      <div className="mx-auto max-w-3xl text-center">
        <Eyebrow>{CTA.eyebrow}</Eyebrow>
        <h2 className="mt-5 font-display text-3xl leading-[1.12] tracking-[-0.02em] text-[var(--lp-ink)] sm:text-4xl md:text-5xl">
          {CTA.title}
        </h2>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <CtaPill href={contactHref}>{CTA.primary}</CtaPill>
          <CtaPill href="#pricing" tone="outline">
            {CTA.secondary}
          </CtaPill>
        </div>
        <p className="mt-6 text-sm text-[var(--lp-muted)]">{CTA.footnote}</p>
      </div>
    </section>
  );
}
