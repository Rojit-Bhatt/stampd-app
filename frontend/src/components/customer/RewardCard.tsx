import { Gift } from "lucide-react";
import { Progress } from "../ui/progress";
import { formatPoints, type RewardItem } from "../../hooks/usePoints";

interface RewardCardProps {
  item: Pick<RewardItem, "id" | "name" | "description" | "imageUrl" | "pointsPrice">;
  /** The customer's balance, in points. */
  balance: number;
  disabled?: boolean;
  onSelect?: () => void;
}

export function RewardCard({ item, balance, disabled, onSelect }: RewardCardProps) {
  const canAfford = item.pointsPrice <= balance;
  const short = item.pointsPrice - balance;
  return (
    <button
      onClick={onSelect}
      disabled={!canAfford || disabled}
      className="stamp-interactive flex items-center gap-3.5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 text-left disabled:cursor-not-allowed disabled:opacity-70"
    >
      {item.imageUrl ? (
        <img src={item.imageUrl} alt={item.name} className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
      ) : (
        <span
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
          style={{
            background: canAfford ? "var(--primary-soft)" : "var(--surface-2)",
            color: canAfford ? "var(--primary-deep)" : "var(--soft)",
          }}
        >
          <Gift className="h-4.5 w-4.5" />
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[var(--ink)]">{item.name}</span>
        <span className="block truncate text-[13px] text-[var(--muted)]">
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
    </button>
  );
}
