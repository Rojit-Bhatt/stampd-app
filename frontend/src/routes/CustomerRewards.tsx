import { Gift } from "lucide-react";

import { usePointsBalance, useRewardCatalog, formatPoints } from "../hooks/usePoints";
import { RewardCard } from "../components/customer/RewardCard";
import { Skeleton } from "../components/ui/skeleton";

// The outlet's full redeem catalog. Replaces the "Redeem your points" card
// that used to live inline on the dashboard — it now has its own tab because
// browsing what points buy is a destination, not a footnote.
//
// No self-redeem here on purpose: redemption is staff-initiated (the counter
// puts up a redeem QR, the customer scans it) — see pointsService.redeemPoints.
// This page is for browsing and knowing what to ask for.
export default function CustomerRewards() {
  const { data: points, isLoading: balanceLoading } = usePointsBalance();
  const { data: catalog = [], isLoading: catalogLoading } = useRewardCatalog();

  const balance = points?.balance ?? 0;
  const isLoading = balanceLoading || catalogLoading;

  const affordable = catalog.filter((item) => item.pointsPrice <= balance);
  const rest = catalog.filter((item) => item.pointsPrice > balance).sort((a, b) => a.pointsPrice - b.pointsPrice);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Rewards</h1>
        <p className="mt-0.5 text-sm text-[var(--muted)]">
          {isLoading
            ? "Loading…"
            : `You have ${formatPoints(balance)} points to spend here.`}
        </p>
      </header>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : catalog.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 py-12 text-center shadow-ambient">
          <Gift className="mx-auto h-7 w-7 text-[var(--soft)]" strokeWidth={1.5} />
          <p className="mt-3 text-sm text-[var(--muted)]">
            No rewards set up here yet. Check back soon.
          </p>
        </div>
      ) : (
        <>
          {affordable.length > 0 && (
            <>
              <h2 className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
                Ready to redeem
              </h2>
              <ul className="mb-6 flex flex-col gap-3">
                {affordable.map((item) => (
                  <li key={item.id}>
                    <RewardCard item={item} balance={balance} />
                  </li>
                ))}
              </ul>
            </>
          )}

          {rest.length > 0 && (
            <>
              <h2 className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
                Keep collecting
              </h2>
              <ul className="flex flex-col gap-3">
                {rest.map((item) => (
                  <li key={item.id}>
                    <RewardCard item={item} balance={balance} />
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="mt-5 text-center text-xs text-[var(--muted)]">
            Ask the counter to bring up the redeem code, then scan it.
          </p>
        </>
      )}
    </div>
  );
}
