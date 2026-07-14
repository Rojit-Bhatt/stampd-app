interface PunchCardProps {
  stampsEarned: number;
  stampsRequired: number;
}

// Stamp cells rendered on top of the brand-gradient reward card. Filled cells
// are solid white with a star; the next cell gets a brighter ring; the rest
// are faint numbered placeholders. Count comes from the tenant's program.
export function PunchCard({ stampsEarned, stampsRequired }: PunchCardProps) {
  const total = Math.max(1, stampsRequired);

  return (
    <div
      className="flex flex-wrap justify-center gap-2.5 rounded-[18px] p-4"
      style={{ background: "rgba(255,255,255,0.1)" }}
      role="list"
      aria-label={`${stampsEarned} of ${total} stamps collected`}
    >
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < stampsEarned;
        const isNext = i === stampsEarned;
        return (
          <div
            key={i}
            role="listitem"
            className="flex h-[42px] w-[42px] items-center justify-center rounded-full text-[15px] font-extrabold"
            style={{
              background: filled ? "#fff" : "rgba(255,255,255,0.08)",
              border: `2px dashed ${
                filled ? "#fff" : isNext ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)"
              }`,
              color: filled ? "var(--brand)" : "rgba(255,255,255,0.55)",
            }}
            aria-label={filled ? `Stamp ${i + 1} collected` : `Stamp ${i + 1} empty`}
          >
            {filled ? "★" : i + 1}
          </div>
        );
      })}
    </div>
  );
}
export default PunchCard;
