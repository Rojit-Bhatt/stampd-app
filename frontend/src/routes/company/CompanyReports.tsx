import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { formatNpr } from "../../lib/subscription";
import { Skeleton } from "../../components/ui/skeleton";
import { DateRangeFilter, defaultDateRange, type DateRangeValue } from "../../components/shared/DateRangeFilter";

interface OutletRow {
  outletId: string;
  slug: string;
  name: string;
  status: string;
  customersCount: number;
  transactions: number;
  pointsIssued: number;
  pointsRedeemed: number;
  redemptionCount: number;
  revenue: number;
}

interface Rollup {
  success: boolean;
  range: { start: string; end: string };
  totals: {
    outletCount: number;
    customersCount: number;
    transactions: number;
    pointsIssued: number;
    pointsRedeemed: number;
    redemptionCount: number;
    revenue: number;
  };
  outlets: OutletRow[];
}

// The company owner's cross-outlet view. Deliberately company-private: no
// single outlet's console can see its siblings' numbers, which is why this
// reads from /api/company rather than /api/admin.
export default function CompanyReports() {
  const [range, setRange] = useState<DateRangeValue>(defaultDateRange(30));

  const { data, isLoading } = useQuery<Rollup>({
    queryKey: ["companyRollup", range.startDate, range.endDate],
    queryFn: () =>
      apiRequest<Rollup>(
        `/api/company/reports/rollup?startDate=${range.startDate}&endDate=${range.endDate}`,
        { role: "company" },
      ),
  });

  const totals = data?.totals;
  const tiles = [
    // A snapshot of who exists, not a flow — never affected by the range,
    // so it doesn't belong next to figures that move when the range does.
    { label: "Outlets", val: totals ? String(totals.outletCount) : "—" },
    { label: "Customers", val: totals ? String(totals.customersCount) : "—" },
    { label: "Points issued", val: totals ? String(totals.pointsIssued) : "—" },
    { label: "Revenue", val: totals ? formatNpr(totals.revenue) : "—" },
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Reports</h1>
      <p className="mb-6 mt-1 text-[var(--muted)]">Every outlet you run, side by side. Only you see this.</p>

      <div className="mb-6">
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
            <div className="mb-1.5 text-[13px] text-[var(--muted)]">{t.label}</div>
            {isLoading ? <Skeleton className="h-[26px] w-16" /> : <div className="font-display text-[26px] font-bold">{t.val}</div>}
          </div>
        ))}
      </div>

      <div className="shadow-ambient overflow-x-auto rounded-[var(--radius-card)] bg-[var(--surface)]">
        <div className="min-w-[650px]">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] border-b border-[var(--line)] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">
            <span>Outlet</span>
            <span>Customers</span>
            <span>Points</span>
            <span>Redeemed</span>
            <span>Revenue</span>
          </div>

          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] items-center gap-3 border-b border-[var(--line)] px-5 py-3.5 last:border-b-0">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3.5 w-8" />
                <Skeleton className="h-3.5 w-8" />
                <Skeleton className="h-3.5 w-8" />
                <Skeleton className="h-3.5 w-14" />
              </div>
            ))
          ) : (data?.outlets || []).length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-[var(--muted)]">No outlets yet.</div>
          ) : (
            (data?.outlets || []).map((o) => (
              <div key={o.outletId} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] items-center gap-3 border-b border-[var(--line)] px-5 py-3.5 text-sm last:border-b-0">
                <span className="min-w-0">
                  <span className="block truncate font-bold">{o.name}</span>
                  <span className="block truncate font-mono text-xs text-[var(--soft)]">
                    /{o.slug}
                    {o.status !== "active" ? ` · ${o.status}` : ""}
                  </span>
                </span>
                <span className="font-semibold">{o.customersCount}</span>
                <span className="font-semibold">{o.pointsIssued}</span>
                <span className="font-semibold">{o.redemptionCount}</span>
                <span className="font-semibold">{formatNpr(o.revenue)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {data?.range && (
        <p className="mt-4 text-xs text-[var(--soft)]">
          Showing {new Date(data.range.start).toLocaleDateString()} –{" "}
          {new Date(data.range.end).toLocaleDateString()}.
        </p>
      )}
    </div>
  );
}
