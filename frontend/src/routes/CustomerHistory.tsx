import { Coins, Gift, Hourglass } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTenant } from "../context/TenantContext";
import { usePointsBalance, usePointsHistory, formatPoints, type PointsTransaction } from "../hooks/usePoints";
import { formatNpr } from "../lib/subscription";
import { Skeleton } from "../components/ui/skeleton";

// Replaces the old voucher wallet. A wallet listed things you held; a points
// balance is one number, so what's actually worth showing is how it got
// there — the ledger, straight from the server, newest first.

const TYPE_META: Record<PointsTransaction["type"], { label: string; Icon: typeof Coins; tone: string }> = {
  earn: { label: "Earned", Icon: Coins, tone: "var(--ok)" },
  redeem: { label: "Redeemed", Icon: Gift, tone: "var(--brand)" },
  expire: { label: "Expired", Icon: Hourglass, tone: "var(--soft)" },
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function rowSubtitle(txn: PointsTransaction): string {
  if (txn.type === "earn" && txn.billAmount != null) return `on a ${formatNpr(txn.billAmount)} bill`;
  if (txn.type === "redeem" && txn.rewardName) return txn.rewardName;
  if (txn.type === "expire") return "after a long gap between visits";
  return "";
}

export default function CustomerHistory() {
  const reduceMotion = useReducedMotion();
  const { tenant } = useTenant();
  const { data: points } = usePointsBalance();
  const { data: history = [], isLoading } = usePointsHistory();

  return (
    <div className="px-5 py-6">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold leading-tight text-[var(--ink)]">Your points</h1>
        <p className="text-sm text-[var(--muted)]">Everything you've earned and spent at {tenant?.name}.</p>
      </div>

      <div className="shadow-ambient mb-5 rounded-3xl bg-[var(--surface)] p-6 text-center">
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--soft)]">Balance</div>
        <div className="mt-1 font-display text-[44px] font-extrabold leading-none" style={{ color: "var(--brand)" }}>
          {formatPoints(points?.balance ?? 0)}
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-3xl" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="shadow-ambient rounded-3xl bg-[var(--surface)] px-5 py-10 text-center">
          <p className="text-sm text-[var(--muted)]">
            Nothing here yet — scan at the counter on your next visit and it'll show up.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {history.map((txn, i) => {
            const { label, Icon, tone } = TYPE_META[txn.type];
            const subtitle = rowSubtitle(txn);
            return (
              <motion.div
                key={txn.id}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduceMotion ? { duration: 0 } : { delay: Math.min(i * 0.04, 0.3) }}
                className="shadow-ambient flex items-center gap-3 rounded-3xl bg-[var(--surface)] px-4 py-3.5"
              >
                <span
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                  style={{ background: "var(--surface-container)", color: tone }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-[var(--ink)]">{label}</div>
                  <div className="truncate text-[13px] text-[var(--muted)]">
                    {formatWhen(txn.createdAt)}
                    {subtitle ? ` · ${subtitle}` : ""}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  {/* Signed straight from the ledger — no per-type branching
                      to get a sign wrong. */}
                  <div className="font-display text-base font-bold" style={{ color: tone }}>
                    {txn.points > 0 ? "+" : ""}
                    {formatPoints(txn.points)}
                  </div>
                  <div className="text-[11px] text-[var(--soft)]">{formatPoints(txn.balanceAfter)} left</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
