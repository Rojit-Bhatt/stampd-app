import { Coffee, Gift, Plus } from "lucide-react";

interface PunchCardProps {
  stampsEarned: number;
  stampsRequired: number;
}

// Stamp cells matching the reference design: filled cells are solid brand-
// colored circles with a coffee-cup mark; the reward cell (last slot) gets a
// gift icon; empty cells are dashed outline placeholders. Count comes from
// the tenant's program.
export function PunchCard({ stampsEarned, stampsRequired }: PunchCardProps) {
  const total = Math.max(1, stampsRequired);

  return (
    <div
      className="grid grid-cols-5 gap-2.5"
      role="list"
      aria-label={`${stampsEarned} of ${total} stamps collected`}
    >
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < stampsEarned;
        const isReward = i === total - 1;
        return (
          <div
            key={i}
            role="listitem"
            className="stamp-interactive flex aspect-square items-center justify-center rounded-full"
            style={
              filled
                ? { background: "var(--brand)", color: "#fff" }
                : {
                    background: "transparent",
                    border: "2px dashed var(--line)",
                    color: "var(--soft)",
                  }
            }
            aria-label={
              filled
                ? `Stamp ${i + 1} collected`
                : isReward
                  ? "Reward slot, not yet earned"
                  : `Stamp ${i + 1} empty`
            }
          >
            {filled ? <Coffee className="h-4 w-4" /> : isReward ? <Gift className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </div>
        );
      })}
    </div>
  );
}
export default PunchCard;
