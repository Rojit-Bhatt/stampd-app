import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Users, Repeat, Gift, TrendingUp } from "lucide-react";
import { apiRequest } from "../../lib/api";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { formatNpr } from "../../lib/subscription";
import { useMotion } from "../../lib/motion";
import { Skeleton } from "../../components/ui/skeleton";

export interface Milestone {
  key: string;
  label: string;
  sublabel: string;
  achieved: boolean;
}

export interface Impact {
  customers: number;
  repeatCustomers: number;
  retentionPercent: number | null;
  revenueTracked: number;
  repeatRevenue: number;
  repeatRevenuePercent: number | null;
  avgSpendPerRepeatCustomer: number | null;
  redemptionCount: number;
  rewardValueRedeemed: number;
  rewardValueCoverage: { valued: number; total: number };
  firstActivityAt: string | null;
  milestones: Milestone[];
}

const DISCOUNT_RATES = [5, 10, 15, 20];

const since = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

// The value view: has this programme been worth running? Every figure comes
// from the ledger — there are deliberately no "estimated staff hours saved"
// or "operations cost avoided" tiles, because no data behind them exists.
export default function AdminImpact() {
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  const [rate, setRate] = useState(10);
  const m = useMotion();

  const { data, isLoading } = useQuery<{ success: boolean } & Impact>({
    queryKey: ["adminImpact", orgId],
    queryFn: () => apiRequest(`/api/admin/impact`, { role: "admin" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }

  // Nothing has happened yet. A 0% hero would read as a failure rather than
  // an absence, so the whole page collapses to one explanatory card.
  if (!data || data.customers === 0) {
    return (
      <div>
        <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Impact</h1>
        <p className="mb-6 text-[var(--muted)]">What your loyalty programme is doing for the business.</p>
        <div className="rounded-3xl bg-[var(--surface)] p-8 shadow-ambient">
          <p className="text-[var(--ink)]">No visits yet.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Once customers start earning, this page will show how many come back, how much of your
            revenue they bring, and what your rewards actually cost.
          </p>
        </div>
      </div>
    );
  }

  const startedOn = since(data.firstActivityAt);
  const coverage = data.rewardValueCoverage;
  const hasRewardValue = coverage.valued > 0;
  const wouldHaveCost = Math.round(data.revenueTracked * (rate / 100));

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Impact</h1>
      <p className="mb-6 text-[var(--muted)]">
        What your loyalty programme is doing for the business
        {startedOn ? ` — since ${startedOn}` : ""}.
      </p>

      {/* Retention hero. --primary green: this is value, not tenant identity. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={m.spring("settle")}
        className="mb-4 rounded-3xl bg-[var(--primary-soft)] p-8 shadow-ambient"
      >
        <p className="text-sm font-semibold text-[var(--primary-deep)]">Customers who came back</p>
        <p className="font-numeral text-[72px] leading-none text-[var(--primary-deep)]">
          {data.retentionPercent ?? "—"}
          <span className="text-[32px]">%</span>
        </p>
        <p className="mt-3 text-[var(--primary-deep)]">
          {data.repeatCustomers} of {data.customers}{" "}
          {data.customers === 1 ? "customer" : "customers"} came back for another visit
        </p>
        {data.customers < 5 && (
          // Full-strength, not dimmed: --primary-deep on --primary-soft is
          // ~5.5:1, and knocking it back with opacity drops small text under
          // the 4.5:1 floor.
          <p className="mt-1 text-sm text-[var(--primary-deep)]">
            Still early — this will settle as more people visit.
          </p>
        )}
      </motion.div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Customers", val: String(data.customers), Icon: Users },
          { label: "Repeat customers", val: String(data.repeatCustomers), Icon: Repeat },
          { label: "Revenue tracked", val: formatNpr(data.revenueTracked), Icon: TrendingUp },
          { label: "Rewards redeemed", val: String(data.redemptionCount), Icon: Gift },
        ].map(({ label, val, Icon }) => (
          <div key={label} className="rounded-3xl bg-[var(--surface)] p-5 shadow-ambient">
            <Icon className="mb-3 h-5 w-5 text-[var(--soft)]" />
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="font-numeral text-[28px] text-[var(--ink)]">{val}</p>
          </div>
        ))}
      </div>

      {/* Repeat revenue */}
      <div className="mb-4 rounded-3xl bg-[var(--surface)] p-6 shadow-ambient">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--soft)]">
          Repeat revenue
        </p>
        <dl className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-[var(--ink)]">Revenue from repeat customers</dt>
            <dd className="font-numeral text-[22px] text-[var(--primary)]">
              {formatNpr(data.repeatRevenue)}
            </dd>
          </div>
          {data.repeatRevenuePercent !== null && (
            <p className="text-sm text-[var(--muted)]">
              {data.repeatRevenuePercent}% of all revenue tracked
            </p>
          )}
          {data.avgSpendPerRepeatCustomer !== null && (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[var(--ink)]">Avg spend per repeat customer</dt>
              <dd className="font-numeral text-[22px] text-[var(--ink)]">
                {formatNpr(data.avgSpendPerRepeatCustomer)}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Reward cost control */}
      <div className="mb-4 rounded-3xl bg-[var(--surface)] p-6 shadow-ambient">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--soft)]">
          Reward cost control
        </p>
        {!hasRewardValue ? (
          <p className="text-sm text-[var(--muted)]">
            This fills in as menu items get redeemed — that's where a rupee value comes from.
            Points-only rewards don't carry one.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[var(--ink)]">Rewards actually given away</span>
              <span className="font-numeral text-[22px] text-[var(--ink)]">
                {formatNpr(data.rewardValueRedeemed)}
              </span>
            </div>
            {coverage.valued < coverage.total && (
              <p className="mt-1 text-sm text-[var(--muted)]">
                Based on {coverage.valued} of {coverage.total} redemptions — the rest were
                points-only rewards with no rupee price.
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
              <span className="text-sm text-[var(--muted)]">Compare: a flat discount instead</span>
              <div className="flex gap-1">
                {DISCOUNT_RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRate(r)}
                    className={`stamp-interactive rounded-lg px-3 py-1 text-sm ${
                      r === rate
                        ? "bg-[var(--primary-soft)] font-semibold text-[var(--primary-deep)]"
                        : "text-[var(--soft)]"
                    }`}
                  >
                    {r}%
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-4">
              <span className="text-[var(--ink)]">A flat {rate}% on all sales would have cost</span>
              <span className="font-numeral text-[22px] text-[var(--ink)]">
                {formatNpr(wouldHaveCost)}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-4">
              <span className="text-[var(--ink)]">With rewards, you gave away</span>
              <span className="font-numeral text-[22px] text-[var(--primary)]">
                {formatNpr(data.rewardValueRedeemed)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Milestones */}
      <div className="rounded-3xl bg-[var(--surface-2)] p-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--soft)]">
          Milestones
        </p>
        <div className="flex gap-6 overflow-x-auto pb-2">
          {data.milestones.map((ms) => (
            <div key={ms.key} className="min-w-[110px] shrink-0 text-center">
              <span
                className={`mx-auto mb-2 block h-3 w-3 rounded-full ${
                  ms.achieved ? "bg-[var(--primary)]" : "border border-[var(--line)] bg-transparent"
                }`}
              />
              <p
                className={`text-sm ${
                  ms.achieved ? "font-semibold text-[var(--ink)]" : "text-[var(--soft)]"
                }`}
              >
                {ms.label}
              </p>
              <p className="text-xs text-[var(--soft)]">{ms.sublabel}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
