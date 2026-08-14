// One line of the little receipt at the foot of the card.
//
// Label left, figure right, hairline between — the arrangement people already
// read as a statement line, so it needs no explaining. Adding this context
// makes the card simpler to understand, not busier: without it the headline
// figure is a number with nothing to sit against.
export function LedgerRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-white/[0.08] py-2.5 first:border-t-0">
      {/* Small text over a translucent-adjacent surface wants slightly positive
          tracking and real weight, or it turns to mush. */}
      <span className="text-[0.6875rem] font-semibold tracking-[0.02em] text-white/50">
        {label}
      </span>
      <span
        className={
          emphasis
            ? "font-numeral text-lg leading-none text-white"
            : "font-numeral text-sm leading-none text-white/75"
        }
      >
        {value}
      </span>
    </div>
  );
}

export default LedgerRow;
