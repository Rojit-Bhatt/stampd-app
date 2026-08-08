// Pure-CSS infinite marquee — no JS, no scroll listener. The track is
// duplicated once so the loop is seamless: animating from 0 to -50% moves
// exactly one copy's width, so the second copy lands where the first
// started and the seam never shows.
//
// Our own words, in Stampd's voice — not client logos (we don't have any to
// show yet) and not a generic tech-stack list.
const TAGS = [
  "Points that spend like cash",
  "No app for customers to install",
  "One programme, every branch",
  "Runs from a phone at the counter",
  "Every rupee earns something",
  "Cafés · Bakeries · Kitchens · Salons",
  "Set up in an afternoon",
  "Built for Nepal",
];

function Track() {
  return (
    <div className="track flex flex-shrink-0 items-center gap-10 pr-10">
      {TAGS.map((tag, i) => (
        <span
          key={i}
          className="flex-shrink-0 whitespace-nowrap font-mono text-[13px] tracking-[0.08em] text-[var(--lp-muted)]"
        >
          {tag}
          <span className="ml-10 text-[var(--lp-green)]" aria-hidden="true">
            ·
          </span>
        </span>
      ))}
    </div>
  );
}

export function ServicesMarquee() {
  return (
    <div className="marquee-mask relative mt-16 overflow-hidden border-y border-[var(--lp-line)] py-4">
      <div className="marquee-track flex w-max motion-reduce:animate-none">
        <Track />
        {/* Duplicate for the seamless loop — aria-hidden so a screen reader
            doesn't read the tag list twice. */}
        <div aria-hidden="true">
          <Track />
        </div>
      </div>
    </div>
  );
}
