import { Gift } from "lucide-react";
import { Progress } from "../ui/progress";
import { formatPoints, type RewardItem } from "../../hooks/usePoints";
import { resolveImageUrl } from "../../lib/images";

interface RewardCardProps {
  item: Pick<RewardItem, "id" | "name" | "description" | "imageUrl" | "imageId" | "pointsPrice">;
  /** The customer's balance, in points. */
  balance: number;
  disabled?: boolean;
  onSelect?: () => void;
}

// Poster layout — image on top, details below — matching EventCard so
// rewards and events read as one visual system across /explore and here.
export function RewardCard({ item, balance, disabled, onSelect }: RewardCardProps) {
  const canAfford = item.pointsPrice <= balance;
  const short = item.pointsPrice - balance;
  const imageUrl = resolveImageUrl(item.imageId, item.imageUrl);

  return (
    <button
      onClick={onSelect}
      disabled={!canAfford || disabled}
      className="stamp-interactive w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] text-left shadow-ambient disabled:cursor-not-allowed disabled:opacity-70"
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-36 w-full object-cover" />
      ) : (
        <div
          className="flex h-36 w-full items-center justify-center"
          style={{ background: canAfford ? "var(--primary-soft)" : "var(--surface-2)" }}
        >
          <Gift
            className="h-8 w-8"
            strokeWidth={1.5}
            style={{ color: canAfford ? "var(--primary-deep)" : "var(--soft)" }}
          />
        </div>
      )}

      <div className="flex items-center gap-3.5 p-4">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-[var(--ink)]">{item.name}</span>
          {/* No truncate on the description — a long one wraps instead of
              being clipped, same fix as CustomerMenu's item rows. */}
          <span className="block text-[13px] leading-relaxed text-[var(--muted)]">
            {canAfford ? item.description || "Ready to redeem" : `${formatPoints(short)} more points needed`}
          </span>
          {/* How close they are, for anything they can't afford yet. An
              out-of-reach reward is a reason to come back, not a dead row — but
              it must never look redeemable. */}
          {!canAfford && <Progress value={(balance / item.pointsPrice) * 100} className="mt-2 h-1.5" />}
        </span>

        <span
          className="flex-shrink-0 font-numeral text-2xl leading-none"
          style={{ color: canAfford ? "var(--primary)" : "var(--soft)" }}
        >
          {formatPoints(item.pointsPrice)}
        </span>
      </div>
    </button>
  );
}
