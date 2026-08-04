import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { formatNpr } from "../../lib/subscription";
import { Skeleton } from "../../components/ui/skeleton";
import type { Impact } from "../admin/AdminImpact";

interface OutletImpactRow extends Impact {
  outletId: string;
  slug: string;
  name: string;
  status: string;
}

interface Roi {
  planName: string;
  subscriptionStartedAt: string;
  monthlyCost: number;
  monthsElapsed: number;
  costToDate: number;
  revenueSinceSubscription: number;
  roiMultiple: number | null;
}

interface CompanyImpactData extends Impact {
  outletCount: number;
  roi: Roi | null;
  perOutlet: OutletImpactRow[];
}

// The company owner's value view across every outlet. Company-private: this
// reads from /api/company, so no single outlet's console can reach it.
//
// The ROI block lives here and only here — the subscription is a
// company-level fact, and exposing it to an outlet console would break the
// isolation boundary for nothing.
export default function CompanyImpact() {
  const { data, isLoading } = useQuery<{ success: boolean } & CompanyImpactData>({
    queryKey: ["companyImpact"],
    queryFn: () => apiRequest(`/api/company/impact`, { role: "company" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48 w-full rounded-3xl" />
      </div>
    );
  }

  if (!data || data.customers === 0) {
    return (
      <div>
        <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Impact</h1>
        <p className="mb-6 text-[var(--muted)]">What loyalty is doing across your outlets.</p>
        <div className="rounded-3xl bg-[var(--surface)] p-8 shadow-ambient">
          <p className="text-[var(--ink)]">No visits yet.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            This fills in once your outlets start stamping customers.
          </p>
        </div>
      </div>
    );
  }

  const { roi } = data;

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Impact</h1>
      <p className="mb-6 text-[var(--muted)]">
        What loyalty is doing across your {data.outletCount}{" "}
        {data.outletCount === 1 ? "outlet" : "outlets"}.
      </p>

      <div className="mb-4 rounded-3xl bg-[var(--primary-soft)] p-8 shadow-ambient">
        <p className="text-sm font-semibold text-[var(--primary-deep)]">Customers who came back</p>
        <p className="font-numeral text-[72px] leading-none text-[var(--primary-deep)]">
          {data.retentionPercent ?? "—"}
          <span className="text-[32px]">%</span>
        </p>
        <p className="mt-3 text-[var(--primary-deep)]">
          {data.repeatCustomers} of {data.customers} customers came back
        </p>
        <p className="mt-1 text-sm text-[var(--primary-deep)]">
          Counted per person, not per outlet — one customer at two of your outlets is one customer.
        </p>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Revenue tracked", val: formatNpr(data.revenueTracked) },
          { label: "From repeat customers", val: formatNpr(data.repeatRevenue) },
          { label: "Rewards redeemed", val: String(data.redemptionCount) },
        ].map(({ label, val }) => (
          <div key={label} className="rounded-3xl bg-[var(--surface)] p-5 shadow-ambient">
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="font-numeral text-[28px] text-[var(--ink)]">{val}</p>
          </div>
        ))}
      </div>

      {roi && (
        <div className="mb-4 rounded-3xl bg-[var(--surface)] p-6 shadow-ambient">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--soft)]">
            Return on investment
          </p>
          <dl className="space-y-2">
            {[
              { k: "Revenue tracked since you subscribed", v: formatNpr(roi.revenueSinceSubscription) },
              { k: `${roi.planName} — monthly cost`, v: formatNpr(roi.monthlyCost) },
              {
                k: `Paid so far (${roi.monthsElapsed} ${roi.monthsElapsed === 1 ? "month" : "months"})`,
                v: formatNpr(roi.costToDate),
              },
            ].map(({ k, v }) => (
              <div key={k} className="flex items-baseline justify-between gap-4">
                <dt className="text-[var(--ink)]">{k}</dt>
                <dd className="font-numeral text-[20px] text-[var(--ink)]">{v}</dd>
              </div>
            ))}
          </dl>
          {roi.roiMultiple !== null && (
            <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-[var(--line)] pt-4">
              <span className="text-[var(--ink)]">Return on what you've paid</span>
              <span className="font-numeral text-[28px] text-[var(--primary)]">
                {roi.roiMultiple}×
              </span>
            </div>
          )}
        </div>
      )}

      <div className="rounded-3xl bg-[var(--surface)] p-6 shadow-ambient">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--soft)]">
          By outlet
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-[var(--soft)]">
              <tr>
                <th className="pb-2 font-medium">Outlet</th>
                <th className="pb-2 text-right font-medium">Customers</th>
                <th className="pb-2 text-right font-medium">Came back</th>
                <th className="pb-2 text-right font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.perOutlet.map((o) => (
                <tr key={o.outletId} className="border-t border-[var(--line)]">
                  <td className="py-3 text-[var(--ink)]">{o.name}</td>
                  <td className="py-3 text-right font-numeral text-[var(--ink)]">{o.customers}</td>
                  <td className="py-3 text-right font-numeral text-[var(--ink)]">
                    {o.retentionPercent === null ? "—" : `${o.retentionPercent}%`}
                  </td>
                  <td className="py-3 text-right font-numeral text-[var(--ink)]">
                    {formatNpr(o.revenueTracked)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
