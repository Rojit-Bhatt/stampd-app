import { Coins, Gift, Hourglass } from "lucide-react";
import { motion } from "motion/react";

import { useTenant } from "../context/TenantContext";
import { usePointsBalance, usePointsHistory, formatPoints, type PointsTransaction } from "../hooks/usePoints";
import { formatNpr } from "../lib/subscription";
import { useMotion } from "../lib/motion";
import { Skeleton } from "../components/ui/skeleton";

// A points balance is one number, so what's actually worth showing is how it
// got there — the ledger, straight from the server, newest first.
//
// Rendered as hairline-separated rows rather than a stack of floating cards:
// this is a statement, and a statement reads as one continuous document.

const TYPE_META: Record<
  PointsTransaction["type"],
  { label: string; Icon: typeof Coins; tone: string; wash: string }
> = {
  // Earning is the only thing here that ADDS value, so it's the only row that
  // gets the value green.
  earn: { label: "Earned", Icon: Coins, tone: "var(--primary-deep)", wash: "var(--primary-soft)" },
  redeem: { label: "Redeemed", Icon: Gift, tone: "var(--ink)", wash: "var(--surface-2)" },
  expire: { label: "Expired", Icon: Hourglass, tone: "var(--soft)", wash: "var(--surface-2)" },
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
  if (txn.type === "earn" && txn.billAmount != null) {
    const base = `on a ${formatNpr(txn.billAmount)} bill`;
    return txn.campaignName ? `${base} · ${txn.campaignName} (${txn.multiplier}×)` : base;
  }
  if (txn.type === "redeem" && txn.rewardName) return txn.rewardName;
  if (txn.type === "expire") return "after a long gap between visits";
  return "";
}

export default function CustomerHistory() {
  const m = useMotion();
  const { tenant } = useTenant();
  const { data: points } = usePointsBalance();
  const { data: history = [], isLoading } = usePointsHistory();

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold leading-tight text-[var(--ink)]">
          Your points
        </h1>
        <p className="mt-0.5 text-sm text-[var(--muted)]">
          Everything earned and spent at {tenant?.name}.
        </p>
      </header>

      <div className="mb-5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 text-center shadow-ambient">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
          Balance
        </div>
        <div className="mt-1 font-numeral text-[48px] leading-none text-[var(--primary)]">
          {formatPoints(points?.balance ?? 0)}
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-[var(--line)] py-4 last:border-0">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-5 w-14" />
            </div>
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 py-12 text-center shadow-ambient">
          <Coins className="mx-auto h-7 w-7 text-[var(--soft)]" strokeWidth={1.5} />
          <p className="mt-3 text-sm text-[var(--muted)]">
            Nothing here yet — scan at the counter on your next visit and it'll show up.
          </p>
        </div>
      ) : (
        <>
          <ul className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 shadow-ambient">
            {history.map((txn, i) => {
              const { label, Icon, tone, wash } = TYPE_META[txn.type];
              const subtitle = rowSubtitle(txn);
              return (
                <motion.li
                  key={txn.id}
                  initial={m.pick({ opacity: 0, y: 8 }, { opacity: 0 })}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: m.prefersReduced ? 0 : Math.min(i * 0.035, 0.28) }}
                  className="flex items-center gap-3 border-b border-[var(--line)] py-4 last:border-0"
                >
                  <span
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ background: wash, color: tone }}
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
                        that could get a sign wrong. */}
                    <div className="font-numeral text-xl leading-none" style={{ color: tone }}>
                      {txn.points > 0 ? "+" : ""}
                      {formatPoints(txn.points)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--soft)]">
                      {formatPoints(txn.balanceAfter)} left
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </ul>

          {/* Says why a correction shows up as its own row rather than the
              original one changing — the balance always equals the sum of
              what's listed here. */}
          <p className="mt-4 text-center text-xs text-[var(--soft)]">
            Append-only — corrections are new rows, never edits.
          </p>
        </>
      )}
    </div>
  );
}
